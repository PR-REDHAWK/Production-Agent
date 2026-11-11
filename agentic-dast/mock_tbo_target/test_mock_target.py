"""Unit tests for mock_tbo_target (Phase 1, Step 1)."""

from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from mock_tbo_target.app import create_app
from mock_tbo_target.logs_generator import generate_gateway_logs


def _login(client: TestClient, username: str, password: str) -> str:
    resp = client.post("/api/v3/auth/login", json={"username": username, "password": password})
    assert resp.status_code == 200
    return resp.json()["access_token"]


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_v10_full_travel_lifecycle() -> None:
    app = create_app("v1.0")
    client = TestClient(app)

    alpha_token = _login(client, "alpha_admin@synthetic-travel.test", "synth-alpha-admin-pass")

    search = client.get("/api/v3/search", headers=_auth(alpha_token))
    assert search.status_code == 200
    assert len(search.json()["results"]) >= 2

    hold = client.post("/api/v3/holds", json={"item_id": "INV-DEL-101", "quantity": 2}, headers=_auth(alpha_token))
    assert hold.status_code == 200
    hold_id = hold.json()["hold_id"]
    assert hold.json()["quoted_fare"] == 300.0

    coupon = client.post("/api/v3/coupons/apply", json={"hold_id": hold_id, "code": "SAVE20"}, headers=_auth(alpha_token))
    assert coupon.status_code == 200
    assert coupon.json()["quoted_fare"] == 280.0

    # Reuse blocked in v1.0
    coupon_dup = client.post(
        "/api/v3/coupons/apply", json={"hold_id": hold_id, "code": "SAVE20"}, headers=_auth(alpha_token)
    )
    assert coupon_dup.status_code == 409

    booking = client.post(
        "/api/v3/bookings",
        json={
            "hold_id": hold_id,
            "traveller_name": "Test Traveller",
            "traveller_passport": "SYNTH-PASS-999",
            "traveller_email": "test@synthetic-traveller.test",
        },
        headers=_auth(alpha_token),
    )
    assert booking.status_code == 200
    bk_id = booking.json()["booking_id"]

    # Skip payment blocked in v1.0
    skip_confirm = client.post(f"/api/v3/bookings/{bk_id}/confirm", headers=_auth(alpha_token))
    assert skip_confirm.status_code == 402

    pay = client.post(f"/api/v3/bookings/{bk_id}/pay", json={"amount": 280.0}, headers=_auth(alpha_token))
    assert pay.status_code == 200
    assert pay.json()["payment_status"] == "PAID"

    confirm = client.post(f"/api/v3/bookings/{bk_id}/confirm", headers=_auth(alpha_token))
    assert confirm.status_code == 200
    assert confirm.json()["status"] == "CONFIRMED"

    cancel = client.post(f"/api/v3/bookings/{bk_id}/cancel", headers=_auth(alpha_token))
    assert cancel.status_code == 200

    refund1 = client.post(f"/api/v3/bookings/{bk_id}/refund", headers=_auth(alpha_token))
    assert refund1.status_code == 200
    assert refund1.json()["refunded_amount"] == 280.0

    refund2 = client.post(f"/api/v3/bookings/{bk_id}/refund", headers=_auth(alpha_token))
    assert refund2.status_code == 409


def test_v11_planted_flaws_and_v12_remediation() -> None:
    app = create_app("v1.1")
    client = TestClient(app)

    alpha_token = _login(client, "alpha_admin@synthetic-travel.test", "synth-alpha-admin-pass")
    alpha_sub_token = _login(client, "alpha_sub@synthetic-travel.test", "synth-alpha-sub-pass")
    beta_token = _login(client, "beta_admin@synthetic-travel.test", "synth-beta-admin-pass")

    # 1. Cross-agency IDOR in v1.1
    idor_resp = client.get("/api/v3/bookings/1001", headers=_auth(beta_token))
    assert idor_resp.status_code == 200
    assert idor_resp.json()["traveller_passport"] == "SYNTH-PASS-ALPHA-001"

    # 2. Sub-agent privilege escalation via mass assignment in v1.1
    privesc = client.patch("/api/v3/users/me", json={"role": "admin"}, headers=_auth(alpha_sub_token))
    assert privesc.status_code == 200
    assert privesc.json()["role"] == "admin"

    # 3. Fare tampering + negative qty + skip-payment + double-refund in v1.1
    hold = client.post("/api/v3/holds", json={"item_id": "INV-DEL-101", "quantity": 2}, headers=_auth(alpha_token))
    hold_id = hold.json()["hold_id"]
    tampered = client.post(
        "/api/v3/bookings",
        json={
            "hold_id": hold_id,
            "quantity": -1,
            "total_fare": 1.0,
            "traveller_name": "Tamper User",
            "traveller_passport": "SYNTH-PASS-888",
            "traveller_email": "tamper@synthetic-traveller.test",
        },
        headers=_auth(alpha_token),
    )
    assert tampered.status_code == 200
    assert tampered.json()["total_fare"] == 1.0
    assert tampered.json()["quantity"] == -1

    bk_id = tampered.json()["booking_id"]
    skipped = client.post(f"/api/v3/bookings/{bk_id}/confirm", headers=_auth(alpha_token))
    assert skipped.status_code == 200
    assert skipped.json()["status"] == "CONFIRMED"

    client.post(f"/api/v3/bookings/{bk_id}/pay", json={"amount": 1.0}, headers=_auth(alpha_token))
    client.post(f"/api/v3/bookings/{bk_id}/cancel", headers=_auth(alpha_token))
    r1 = client.post(f"/api/v3/bookings/{bk_id}/refund", headers=_auth(alpha_token))
    r2 = client.post(f"/api/v3/bookings/{bk_id}/refund", headers=_auth(alpha_token))
    assert r1.status_code == 200 and r2.status_code == 200
    assert r2.json()["refunded_amount"] == 2.0

    # 4. Zombie & Shadow endpoints alive in v1.1
    assert client.get("/api/v1/bookings/1001").status_code == 200
    assert client.get("/internal/shadow-export").status_code == 200

    # 5. Switch to v1.2 (fixed) + reset state -> all flaws blocked
    assert client.post("/__sim/reset", json={"version": "v1.2"}).status_code == 200

    assert client.get("/api/v3/bookings/1001", headers=_auth(beta_token)).status_code == 403
    assert (
        client.patch("/api/v3/users/me", json={"role": "admin"}, headers=_auth(alpha_sub_token)).json()["role"]
        == "subagent"
    )
    assert (
        client.post(
            "/api/v3/suppliers/webhook-test",
            json={"callback_url": "http://127.0.0.1:8002/canary/test"},
            headers=_auth(alpha_token),
        ).status_code
        == 400
    )
    assert client.get("/api/v1/bookings/1001").status_code == 410
    assert client.get("/internal/shadow-export").status_code == 404


def test_gateway_log_generator(tmp_path: Path) -> None:
    out = tmp_path / "gateway_logs.jsonl"
    count = generate_gateway_logs(out, days=90)
    assert count > 1000

    lines = [json.loads(line) for line in out.read_text(encoding="utf-8").splitlines()]
    paths = {entry["path"] for entry in lines}
    assert "/api/v3/search" in paths
    assert "/internal/shadow-export" in paths
    assert not any(p.startswith("/api/v1/") for p in paths)


def test_sqlite_persistence_across_restarts(tmp_path: Path) -> None:
    db_file = tmp_path / "target.db"
    app1 = create_app("v1.0", db_path=db_file)
    client1 = TestClient(app1)
    token = _login(client1, "alpha_admin@synthetic-travel.test", "synth-alpha-admin-pass")

    hold = client1.post("/api/v3/holds", json={"item_id": "INV-SIN-303", "quantity": 2}, headers=_auth(token))
    assert hold.status_code == 200
    bk = client1.post(
        "/api/v3/bookings",
        json={
            "hold_id": hold.json()["hold_id"],
            "traveller_name": "Persist Guest",
            "traveller_passport": "SYNTH-PERSIST-01",
            "traveller_email": "persist@synthetic-traveller.test",
        },
        headers=_auth(token),
    )
    assert bk.status_code == 200
    bk_id = bk.json()["booking_id"]
    app1.state.sim.db.close()

    # Recreate app from the exact same SQLite DB file -> booking survives restart
    app2 = create_app(db_path=db_file)
    client2 = TestClient(app2)
    token2 = _login(client2, "alpha_admin@synthetic-travel.test", "synth-alpha-admin-pass")
    listed = client2.get("/api/v3/bookings", headers=_auth(token2))
    assert listed.status_code == 200
    assert any(b["booking_id"] == bk_id for b in listed.json()["bookings"])
    app2.state.sim.db.close()
