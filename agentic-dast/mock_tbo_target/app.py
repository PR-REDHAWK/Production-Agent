"""Simulated B2B Travel Platform (Agency Alpha & Agency Beta).

Implements the travel lifecycle (search -> hold -> book -> pay -> confirm -> cancel -> refund)
with toggleable deployment versions:
  - v1.0: Baseline secure platform
  - v1.1: Vulnerable release with planted flaws (IDOR, privesc/mass-assignment,
          fare tampering, skip-payment, double-refund, coupon reuse, SSRF callback,
          /v1/ zombie endpoint, /internal/shadow-export shadow endpoint)
  - v1.2: Remediated release verifying auto-retest closure

Synthetic data only. Planted flaws live strictly inside mock_tbo_target/.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal
from urllib.parse import urlparse

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response, status
from fastapi.responses import HTMLResponse, PlainTextResponse
from pydantic import BaseModel, Field

VersionLiteral = Literal["v1.0", "v1.1", "v1.2"]


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    padding = "=" * ((4 - len(data) % 4) % 4)
    return base64.urlsafe_b64decode(data + padding)


def _get_jwt_secret() -> str:
    # Synthetic dev-only fallback when MOCK_TBO_JWT_SECRET is unset
    return os.environ.get("MOCK_TBO_JWT_SECRET", "synthetic-mock-tbo-target-secret-only")


def create_jwt(payload: dict[str, Any], secret: str | None = None) -> str:
    key = (secret or _get_jwt_secret()).encode("utf-8")
    header_b64 = _b64url_encode(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode("utf-8"))
    body_b64 = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signing_input = f"{header_b64}.{body_b64}".encode("ascii")
    sig_b64 = _b64url_encode(hmac.new(key, signing_input, hashlib.sha256).digest())
    return f"{header_b64}.{body_b64}.{sig_b64}"


def decode_jwt(token: str, secret: str | None = None) -> dict[str, Any]:
    parts = token.split(".")
    if len(parts) != 3:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Malformed JWT")
    header_b64, body_b64, sig_b64 = parts
    try:
        header = json.loads(_b64url_decode(header_b64).decode("utf-8"))
        payload = json.loads(_b64url_decode(body_b64).decode("utf-8"))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid JWT encoding") from exc

    if header.get("alg") != "HS256":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unsupported JWT alg")

    key = (secret or _get_jwt_secret()).encode("utf-8")
    signing_input = f"{header_b64}.{body_b64}".encode("ascii")
    expected_sig = _b64url_encode(hmac.new(key, signing_input, hashlib.sha256).digest())
    if not hmac.compare_digest(sig_b64, expected_sig):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid JWT signature")

    if payload.get("exp", 0) < time.time():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Expired JWT")

    return payload


def _load_synthetic_users() -> dict[str, dict[str, Any]]:
    vault_path = Path(__file__).resolve().parent.parent / "configs" / "credentials.vault.json"
    default_users: dict[str, dict[str, Any]] = {
        "alpha_admin@synthetic-travel.test": {
            "user_id": "USR-ALPHA-1",
            "username": "alpha_admin@synthetic-travel.test",
            "password": os.environ.get("MOCK_ALPHA_ADMIN_PASS", "synth-alpha-admin-pass"),
            "agency_id": "AGENCY_ALPHA",
            "role": "admin",
            "display_name": "Alpha Lead Admin",
            "credit_limit": 50000.0,
        },
        "alpha_sub@synthetic-travel.test": {
            "user_id": "USR-ALPHA-2",
            "username": "alpha_sub@synthetic-travel.test",
            "password": os.environ.get("MOCK_ALPHA_SUB_PASS", "synth-alpha-sub-pass"),
            "agency_id": "AGENCY_ALPHA",
            "role": "subagent",
            "display_name": "Alpha Sub Agent",
            "credit_limit": 5000.0,
        },
        "beta_admin@synthetic-travel.test": {
            "user_id": "USR-BETA-1",
            "username": "beta_admin@synthetic-travel.test",
            "password": os.environ.get("MOCK_BETA_ADMIN_PASS", "synth-beta-admin-pass"),
            "agency_id": "AGENCY_BETA",
            "role": "admin",
            "display_name": "Beta Lead Admin",
            "credit_limit": 45000.0,
        },
    }
    if vault_path.exists():
        raw = json.loads(vault_path.read_text(encoding="utf-8"))
        for actor in raw.get("actors", {}).values():
            uname = actor.get("username")
            if uname and uname in default_users:
                env_key = actor.get("password_env", "")
                default_users[uname]["password"] = os.environ.get(
                    env_key, actor.get("default_synthetic_password", default_users[uname]["password"])
                )
    return default_users


@dataclass
class TargetState:
    version: VersionLiteral = "v1.0"
    users: dict[str, dict[str, Any]] = field(default_factory=dict)
    revoked_tokens: set[str] = field(default_factory=set)
    inventory: dict[str, dict[str, Any]] = field(default_factory=dict)
    holds: dict[str, dict[str, Any]] = field(default_factory=dict)
    bookings: dict[str, dict[str, Any]] = field(default_factory=dict)
    coupons: dict[str, dict[str, Any]] = field(default_factory=dict)

    def reset(self, version: VersionLiteral | None = None) -> None:
        if version is not None:
            self.version = version
        self.users = _load_synthetic_users()
        self.revoked_tokens = set()
        self.inventory = {
            "INV-DEL-101": {
                "item_id": "INV-DEL-101",
                "type": "hotel",
                "city": "New Delhi",
                "title": "Grand Synthetic Residency",
                "unit_fare": 150.0,
                "currency": "USD",
            },
            "INV-DXB-202": {
                "item_id": "INV-DXB-202",
                "type": "flight",
                "city": "Dubai",
                "title": "Synthetic Air DEL-DXB",
                "unit_fare": 320.0,
                "currency": "USD",
            },
        }
        self.coupons = {
            "SAVE20": {"code": "SAVE20", "discount_amount": 20.0},
            "CORP50": {"code": "CORP50", "discount_amount": 50.0},
        }
        self.holds = {
            "HOLD-ALPHA-1": {
                "hold_id": "HOLD-ALPHA-1",
                "agency_id": "AGENCY_ALPHA",
                "item_id": "INV-DEL-101",
                "quantity": 2,
                "quoted_fare": 300.0,
                "discount_applied": 0.0,
                "applied_coupons": [],
            },
            "HOLD-BETA-1": {
                "hold_id": "HOLD-BETA-1",
                "agency_id": "AGENCY_BETA",
                "item_id": "INV-DXB-202",
                "quantity": 1,
                "quoted_fare": 320.0,
                "discount_applied": 0.0,
                "applied_coupons": [],
            },
        }
        self.bookings = {
            "1001": {
                "booking_id": "1001",
                "agency_id": "AGENCY_ALPHA",
                "created_by": "USR-ALPHA-1",
                "hold_id": "HOLD-ALPHA-1",
                "item_id": "INV-DEL-101",
                "quantity": 2,
                "total_fare": 300.0,
                "paid_amount": 300.0,
                "refunded_amount": 0.0,
                "payment_status": "PAID",
                "status": "CONFIRMED",
                "voucher_code": "VCH-ALPHA-1001",
                "traveller_name": "Aarav Synthetic",
                "traveller_passport": "SYNTH-PASS-ALPHA-001",
                "traveller_email": "aarav.synth@synthetic-traveller.test",
            },
            "2001": {
                "booking_id": "2001",
                "agency_id": "AGENCY_BETA",
                "created_by": "USR-BETA-1",
                "hold_id": "HOLD-BETA-1",
                "item_id": "INV-DXB-202",
                "quantity": 1,
                "total_fare": 320.0,
                "paid_amount": 320.0,
                "refunded_amount": 0.0,
                "payment_status": "PAID",
                "status": "CONFIRMED",
                "voucher_code": "VCH-BETA-2001",
                "traveller_name": "Mira Synthetic",
                "traveller_passport": "SYNTH-PASS-BETA-001",
                "traveller_email": "mira.synth@synthetic-traveller.test",
            },
        }


class SimVersionRequest(BaseModel):
    version: VersionLiteral


class LoginRequest(BaseModel):
    username: str
    password: str


class HoldRequest(BaseModel):
    item_id: str
    quantity: int = 1


class BookingCreateRequest(BaseModel):
    hold_id: str
    traveller_name: str
    traveller_passport: str
    traveller_email: str
    quantity: int | None = None
    total_fare: float | None = None


class PayRequest(BaseModel):
    amount: float


class CouponApplyRequest(BaseModel):
    hold_id: str
    code: str


class WebhookTestRequest(BaseModel):
    callback_url: str
    event_type: str = "booking.confirmed"


def create_app(initial_version: VersionLiteral | None = None) -> FastAPI:
    state = TargetState()
    env_ver = os.environ.get("MOCK_TBO_VERSION", "v1.0")
    chosen_ver: VersionLiteral = initial_version or (env_ver if env_ver in ("v1.0", "v1.1", "v1.2") else "v1.0")
    state.reset(version=chosen_ver)

    app = FastAPI(title="Mock TBO B2B Staging Target", version="1.0.0")
    app.state.sim = state

    def get_current_user(authorization: str | None = Header(default=None)) -> dict[str, Any]:
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")
        token = authorization.removeprefix("Bearer ").strip()
        if state.version != "v1.1" and token in state.revoked_tokens:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token revoked")
        claims = decode_jwt(token)
        user = state.users.get(claims.get("sub", ""))
        if not user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unknown user")
        return {**user, "_token": token, "_claims": claims}

    # --- Simulation Control Endpoints ---
    @app.get("/__sim/version")
    def get_sim_version() -> dict[str, str]:
        return {"version": state.version}

    @app.post("/__sim/version")
    def set_sim_version(req: SimVersionRequest) -> dict[str, str]:
        state.version = req.version
        return {"version": state.version}

    @app.post("/__sim/reset")
    def reset_sim(req: SimVersionRequest | None = None) -> dict[str, str]:
        state.reset(version=req.version if req else state.version)
        return {"status": "reset", "version": state.version}

    # --- Portal UI & Versioned JS Bundle (for Recon & Bundle Watcher) ---
    @app.get("/", response_class=HTMLResponse)
    def portal_index() -> str:
        return (
            "<!DOCTYPE html><html><head><title>TBO B2B Agent Portal (Mock)</title></head>"
            f"<body><h1>TBO B2B Partner Portal ({state.version})</h1>"
            "<div id='app'>Search, Hold, Book, Pay, Cancel, Refund</div>"
            "<script src='/static/app.js'></script></body></html>"
        )

    @app.get("/static/app.js")
    def portal_bundle() -> Response:
        extra_v11 = ""
        if state.version == "v1.1":
            extra_v11 = "\nconst fastBookingPayload = { hold_id: '', total_fare: 0, quantity: 1 };"
        js = f"""// Mock TBO Portal Bundle {state.version}
const API_ENDPOINTS = [
  "/api/v3/auth/login",
  "/api/v3/search",
  "/api/v3/holds",
  "/api/v3/bookings",
  "/api/v3/bookings/{{id}}",
  "/api/v3/bookings/{{id}}/pay",
  "/api/v3/bookings/{{id}}/confirm",
  "/api/v3/bookings/{{id}}/cancel",
  "/api/v3/bookings/{{id}}/refund",
  "/api/v3/coupons/apply",
  "/api/v3/users/me",
  "/api/v3/suppliers/webhook-test"
];{extra_v11}
"""
        return PlainTextResponse(content=js, media_type="application/javascript")

    # --- Auth Endpoints ---
    @app.post("/api/v3/auth/login")
    def login(req: LoginRequest) -> dict[str, Any]:
        user = state.users.get(req.username)
        if not user or not hmac.compare_digest(user["password"], req.password):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
        token = create_jwt(
            {
                "sub": user["username"],
                "user_id": user["user_id"],
                "agency_id": user["agency_id"],
                "role": user["role"],
                "exp": int(time.time()) + 3600,
            }
        )
        return {"access_token": token, "token_type": "bearer", "agency_id": user["agency_id"], "role": user["role"]}

    @app.post("/api/v3/auth/logout")
    def logout(user: dict[str, Any] = Depends(get_current_user)) -> dict[str, str]:
        state.revoked_tokens.add(user["_token"])
        return {"status": "logged_out"}

    @app.patch("/api/v3/users/me")
    async def update_profile(request: Request, user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
        body = await request.json()
        target_user = state.users[user["username"]]
        if state.version == "v1.1":
            # Planted mass-assignment privilege escalation
            for k, v in body.items():
                if k in ("display_name", "role", "credit_limit"):
                    target_user[k] = v
        else:
            if "display_name" in body and isinstance(body["display_name"], str):
                target_user["display_name"] = body["display_name"]
        return {
            "user_id": target_user["user_id"],
            "agency_id": target_user["agency_id"],
            "role": target_user["role"],
            "display_name": target_user["display_name"],
            "credit_limit": target_user["credit_limit"],
        }

    # --- Core Travel Flow ---
    @app.get("/api/v3/search")
    def search_inventory(city: str | None = None, user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
        items = list(state.inventory.values())
        if city:
            items = [i for i in items if city.lower() in i["city"].lower()]
        return {"results": items, "agency_id": user["agency_id"]}

    @app.post("/api/v3/holds")
    def create_hold(req: HoldRequest, user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
        item = state.inventory.get(req.item_id)
        if not item:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory not found")
        if req.quantity <= 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Quantity must be positive")
        hold_id = f"HOLD-{uuid.uuid4().hex[:8].upper()}"
        hold = {
            "hold_id": hold_id,
            "agency_id": user["agency_id"],
            "item_id": item["item_id"],
            "quantity": req.quantity,
            "quoted_fare": round(item["unit_fare"] * req.quantity, 2),
            "discount_applied": 0.0,
            "applied_coupons": [],
        }
        state.holds[hold_id] = hold
        return hold

    @app.post("/api/v3/coupons/apply")
    def apply_coupon(req: CouponApplyRequest, user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
        hold = state.holds.get(req.hold_id)
        if not hold or hold["agency_id"] != user["agency_id"]:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Hold not found")
        coupon = state.coupons.get(req.code)
        if not coupon:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid coupon")

        if state.version != "v1.1" and req.code in hold["applied_coupons"]:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Coupon already applied")

        hold["applied_coupons"].append(req.code)
        hold["discount_applied"] += coupon["discount_amount"]
        hold["quoted_fare"] = max(0.0, round(hold["quoted_fare"] - coupon["discount_amount"], 2))
        if state.version != "v1.1":
            hold["quoted_fare"] = max(10.0, hold["quoted_fare"])
        return hold

    @app.post("/api/v3/bookings")
    def create_booking(req: BookingCreateRequest, user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
        hold = state.holds.get(req.hold_id)
        if not hold or hold["agency_id"] != user["agency_id"]:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Hold not found")

        if state.version == "v1.1":
            # Planted fare tampering & negative quantity vulnerability
            qty = req.quantity if req.quantity is not None else hold["quantity"]
            fare = req.total_fare if req.total_fare is not None else hold["quoted_fare"]
        else:
            if req.quantity is not None and req.quantity <= 0:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Quantity must be positive")
            if req.total_fare is not None and req.total_fare < hold["quoted_fare"]:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Fare tampering rejected")
            qty = hold["quantity"]
            fare = hold["quoted_fare"]

        booking_id = f"BK-{uuid.uuid4().hex[:6].upper()}"
        booking = {
            "booking_id": booking_id,
            "agency_id": user["agency_id"],
            "created_by": user["user_id"],
            "hold_id": hold["hold_id"],
            "item_id": hold["item_id"],
            "quantity": qty,
            "total_fare": round(fare, 2),
            "paid_amount": 0.0,
            "refunded_amount": 0.0,
            "payment_status": "UNPAID",
            "status": "HELD",
            "voucher_code": None,
            "traveller_name": req.traveller_name,
            "traveller_passport": req.traveller_passport,
            "traveller_email": req.traveller_email,
        }
        state.bookings[booking_id] = booking
        return booking

    @app.get("/api/v3/bookings/{booking_id}")
    def get_booking(booking_id: str, user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
        booking = state.bookings.get(booking_id)
        if not booking:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")
        if state.version != "v1.1" and booking["agency_id"] != user["agency_id"]:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cross-agency access denied")
        return booking

    @app.post("/api/v3/bookings/{booking_id}/pay")
    def pay_booking(booking_id: str, req: PayRequest, user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
        booking = state.bookings.get(booking_id)
        if not booking or booking["agency_id"] != user["agency_id"]:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")
        if req.amount <= 0 or req.amount < booking["total_fare"]:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Insufficient payment amount")
        booking["paid_amount"] = round(req.amount, 2)
        booking["payment_status"] = "PAID"
        return booking

    @app.post("/api/v3/bookings/{booking_id}/confirm")
    def confirm_booking(booking_id: str, user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
        booking = state.bookings.get(booking_id)
        if not booking or booking["agency_id"] != user["agency_id"]:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")
        if state.version != "v1.1" and booking["payment_status"] != "PAID":
            raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail="Payment required before confirm")
        booking["status"] = "CONFIRMED"
        booking["voucher_code"] = f"VCH-{booking_id}"
        return booking

    @app.post("/api/v3/bookings/{booking_id}/cancel")
    def cancel_booking(booking_id: str, user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
        booking = state.bookings.get(booking_id)
        if not booking or booking["agency_id"] != user["agency_id"]:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")
        booking["status"] = "CANCELLED"
        return booking

    @app.post("/api/v3/bookings/{booking_id}/refund")
    def refund_booking(booking_id: str, user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
        booking = state.bookings.get(booking_id)
        if not booking or booking["agency_id"] != user["agency_id"]:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")
        if booking["status"] != "CANCELLED":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cancel booking before refund")
        if state.version != "v1.1" and booking["refunded_amount"] >= booking["paid_amount"]:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Booking already refunded")
        booking["refunded_amount"] = round(booking["refunded_amount"] + booking["paid_amount"], 2)
        booking["payment_status"] = "REFUNDED"
        return booking

    @app.post("/api/v3/suppliers/webhook-test")
    async def test_supplier_webhook(
        req: WebhookTestRequest, user: dict[str, Any] = Depends(get_current_user)
    ) -> dict[str, Any]:
        parsed = urlparse(req.callback_url)
        if state.version != "v1.1":
            # Strict allowlist: only approved supplier domain
            if parsed.scheme != "https" or parsed.hostname != "approved-supplier.internal":
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unapproved webhook host")
            return {"status": "validated", "callback_url": req.callback_url}

        # Planted SSRF in v1.1 (restricted inside simulator to loopback canary ports for local safety)
        if parsed.hostname not in ("127.0.0.1", "localhost"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Simulator safety guard: external SSRF targets blocked outside local canary",
            )
        async with httpx.AsyncClient(timeout=2.0) as client:
            resp = await client.post(
                req.callback_url,
                json={"event": req.event_type, "agency_id": user["agency_id"], "canary": "ssrf-triggered"},
            )
        return {"status": "dispatched", "callback_status": resp.status_code}

    # --- Planted Zombie (/v1/) and Shadow (/internal/) APIs ---
    @app.get("/api/v1/bookings/{booking_id}")
    def legacy_v1_get_booking(booking_id: str) -> dict[str, Any]:
        if state.version == "v1.2":
            raise HTTPException(status_code=status.HTTP_410_GONE, detail="Legacy v1 API decommissioned")
        booking = state.bookings.get(booking_id)
        if not booking:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")
        # Zombie API lacks auth and leaks PII in v1.0/v1.1
        return {"legacy_v1": True, **booking}

    @app.get("/internal/shadow-export")
    def internal_shadow_export() -> dict[str, Any]:
        if state.version == "v1.2":
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Endpoint removed")
        # Shadow API: active in gateway logs, undocumented in UI/ownership
        return {
            "shadow": True,
            "count": len(state.bookings),
            "sample": [
                {
                    "booking_id": b["booking_id"],
                    "agency_id": b["agency_id"],
                    "traveller_passport": b["traveller_passport"],
                }
                for b in list(state.bookings.values())[:2]
            ],
        }

    return app


app = create_app()
