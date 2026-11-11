"""Code-based Verifier Agent (zero-false-positive deterministic replay gate).

Per rules.md §5: The verifier must be code-based. Never let an LLM decide 'confirmed'.
"""

from __future__ import annotations

import asyncio
import json
import re
import shlex
import uuid
from typing import Any

import httpx
from pydantic import BaseModel, Field

from agents.planner import CandidateFinding, HttpStepSpec
from safety.gateway import SafeAsyncClient, SafetyGateway

_PII_RE = re.compile(r"(traveller_passport|SYNTH-PASS|@synthetic-traveller\.test)", re.IGNORECASE)


class VerifiedFinding(BaseModel):
    finding_id: str
    candidate: CandidateFinding
    canonical_endpoint: str
    method: str
    vuln_class: str
    affected_parameter: str
    title: str
    minimal_evidence: dict[str, Any] = Field(default_factory=dict)
    repro_curl: str
    verified: bool = True


class VerificationSummary(BaseModel):
    total_candidates: int
    verified_count: int
    suppressed_count: int
    findings: list[VerifiedFinding] = Field(default_factory=list)


class VerifierAgent:
    """Confirms candidate findings via deterministic baseline + exploit PoC replay."""

    def __init__(
        self,
        gateway: SafetyGateway,
        base_url: str = "http://127.0.0.1:8001",
        canary_base_url: str = "http://127.0.0.1:8002",
        async_transport: httpx.AsyncBaseTransport | None = None,
        hitl_approval_id: str | None = None,
    ) -> None:
        self.gateway = gateway
        self.base_url = base_url.rstrip("/")
        self.canary_base_url = canary_base_url.rstrip("/")
        self._async_transport = async_transport
        self.hitl_approval_id = hitl_approval_id

    @staticmethod
    def _replace_canary_id(step: HttpStepSpec, old_id: str, new_id: str) -> HttpStepSpec:
        if not old_id or old_id == new_id:
            return step
        new_path = step.path.replace(old_id, new_id)
        new_params = {k: v.replace(old_id, new_id) for k, v in step.params.items()}
        new_body = None
        if step.json_body is not None:
            new_body = {
                k: (v.replace(old_id, new_id) if isinstance(v, str) else v)
                for k, v in step.json_body.items()
            }
        return step.model_copy(update={"path": new_path, "params": new_params, "json_body": new_body})

    async def _query_canary_hits(self, canary_id: str) -> int | None:
        """Query the OOB canary listener via SafetyGateway for a fresh replay canary token."""
        async with SafeAsyncClient(
            self.gateway,
            agent="verifier_canary",
            actor="unauthenticated",
            pace=False,
            inner_transport=None,
        ) as canary_client:
            for attempt in range(2):
                try:
                    resp = await canary_client.get(f"{self.canary_base_url}/canary/__hits/{canary_id}")
                    if resp.status_code == 200:
                        data = resp.json()
                        if isinstance(data, dict) and "hit_count" in data:
                            count = int(data["hit_count"])
                            if count > 0 or attempt == 1:
                                return count
                            await asyncio.sleep(0.05)
                except Exception:  # noqa: BLE001
                    return None
        return None

    @staticmethod
    def _build_repro_curl(base_url: str, step: HttpStepSpec) -> str:
        url = f"{base_url}{step.path}"
        if step.params:
            qs = "&".join(f"{k}={v}" for k, v in step.params.items())
            url = f"{url}?{qs}"
        parts = ["curl", "-i", "-X", step.method.upper(), shlex.quote(url)]
        if step.actor != "unauthenticated":
            parts.extend(["-H", shlex.quote("Authorization: Bearer $ACTOR_TOKEN")])
        if step.json_body is not None:
            parts.extend(["-H", shlex.quote("Content-Type: application/json")])
            parts.extend(["-d", shlex.quote(json.dumps(step.json_body))])
        return " ".join(parts)

    async def _provision_fixture(self, flow: str) -> dict[str, str]:
        """Provision isolated synthetic travel fixtures so stateful verification is deterministic."""
        vars_map: dict[str, str] = {}
        async with SafeAsyncClient(
            self.gateway,
            agent="verifier_fixture",
            actor="agency_a_admin",
            pace=True,
            inner_transport=self._async_transport,
        ) as client:
            if flow in ("fresh_hold", "fresh_hold_coupon_once", "unpaid_booking", "refunded_once_booking"):
                hold_resp = await client.post(
                    f"{self.base_url}/api/v3/holds",
                    json={"item_id": "INV-DEL-101", "quantity": 2 if flow == "fresh_hold" else 1},
                )
                if hold_resp.status_code != 200:
                    return vars_map
                hold = hold_resp.json()
                hold_id = hold["hold_id"]
                vars_map["hold_id"] = hold_id

                if flow == "fresh_hold_coupon_once":
                    await client.post(
                        f"{self.base_url}/api/v3/coupons/apply",
                        json={"hold_id": hold_id, "code": "SAVE20"},
                    )
                if flow in ("unpaid_booking", "refunded_once_booking"):
                    bk_resp = await client.post(
                        f"{self.base_url}/api/v3/bookings",
                        json={
                            "hold_id": hold_id,
                            "traveller_name": "Verifier Fixture",
                            "traveller_passport": "SYNTH-VER-01",
                            "traveller_email": "verify@synthetic-traveller.test",
                        },
                    )
                    if bk_resp.status_code == 200:
                        bk_id = bk_resp.json()["booking_id"]
                        vars_map["booking_id"] = bk_id
                        if flow == "refunded_once_booking":
                            fare = hold["quoted_fare"]
                            await client.post(f"{self.base_url}/api/v3/bookings/{bk_id}/pay", json={"amount": fare})
                            await client.post(f"{self.base_url}/api/v3/bookings/{bk_id}/cancel")
                            await client.post(f"{self.base_url}/api/v3/bookings/{bk_id}/refund")
        return vars_map

    @staticmethod
    def _substitute_step(step: HttpStepSpec, vars_map: dict[str, str]) -> HttpStepSpec:
        if not vars_map:
            return step
        new_path = step.path
        for k, v in vars_map.items():
            new_path = new_path.replace(f"{{{k}}}", v)
        new_body = None
        if step.json_body is not None:
            new_body = {
                k: (v.format(**vars_map) if isinstance(v, str) and "{" in v else v)
                for k, v in step.json_body.items()
            }
        return step.model_copy(update={"path": new_path, "json_body": new_body})

    async def _send_step(self, step: HttpStepSpec) -> httpx.Response:
        headers = dict(step.headers)
        if step.risk_level in ("HIGH", "CRITICAL"):
            headers["X-DAST-Risk-Level"] = step.risk_level
            if self.hitl_approval_id:
                headers["X-DAST-HITL-ID"] = self.hitl_approval_id

        async with SafeAsyncClient(
            self.gateway,
            agent="verifier",
            actor=step.actor,
            pace=True,
            inner_transport=self._async_transport,
        ) as client:
            return await client.request(
                step.method.upper(),
                f"{self.base_url}{step.path}",
                params=step.params or None,
                json=step.json_body,
                headers=headers or None,
            )

    def _evaluate_oracle(self, candidate: CandidateFinding, resp: httpx.Response) -> tuple[bool, dict[str, Any]]:
        oracle = candidate.oracle
        otype = oracle.oracle_type
        status_code = resp.status_code

        try:
            body_json = resp.json()
        except Exception:  # noqa: BLE001
            body_json = {}

        if otype in ("cross_agency_leak", "role_escalation", "mass_assignment", "ssrf_canary"):
            if status_code != 200 or not isinstance(body_json, dict):
                return False, {}
            actual = body_json.get(oracle.target_field or "")
            if otype == "mass_assignment":
                matched = float(actual or 0.0) >= float(oracle.forbidden_value)
            else:
                matched = actual == oracle.forbidden_value
            if matched:
                return True, {"status": status_code, oracle.target_field or "value": actual}
            return False, {}

        if otype == "fare_tamper":
            if status_code != 200 or not isinstance(body_json, dict):
                return False, {}
            fare = float(body_json.get("total_fare", 999999.0))
            qty = int(body_json.get("quantity", 1))
            if (oracle.expected_min_value and fare < oracle.expected_min_value) or qty <= 0:
                return True, {"status": status_code, "total_fare": fare, "quantity": qty}
            return False, {}

        if otype == "skip_payment":
            if status_code == 200 and isinstance(body_json, dict):
                if body_json.get("status") == "CONFIRMED" and float(body_json.get("paid_amount", 0.0)) == 0.0:
                    return True, {
                        "status": status_code,
                        "booking_status": body_json.get("status"),
                        "paid_amount": body_json.get("paid_amount"),
                    }
            return False, {}

        if otype == "double_refund":
            if status_code == 200 and isinstance(body_json, dict):
                refunded = float(body_json.get("refunded_amount", 0.0))
                paid = float(body_json.get("paid_amount", 0.0))
                if refunded > paid:
                    return True, {"status": status_code, "paid_amount": paid, "refunded_amount": refunded}
            return False, {}

        if otype == "coupon_reuse":
            if status_code == 200 and isinstance(body_json, dict):
                disc = float(body_json.get("discount_applied", 0.0))
                if disc > float(oracle.expected_min_value or 20.0):
                    return True, {"status": status_code, "discount_applied": disc}
            return False, {}

        if otype in ("unauth_access", "zombie_unauth", "jwt_tamper", "token_reuse"):
            if status_code == 200:
                redacted = self.gateway.vault.scrub_all(resp.text[:240])
                return True, {"status": status_code, "excerpt": redacted}
            return False, {}

        if otype == "pii_exposure":
            if status_code == 200 and _PII_RE.search(resp.text):
                return True, {"status": status_code, "pii_match": True}
            return False, {}

        if otype == "injection_reflection":
            if status_code == 200 and ("sql syntax" in resp.text.lower() or "49" in resp.text):
                return True, {"status": status_code}
            return False, {}

        return False, {}

    async def verify_one(self, candidate: CandidateFinding) -> VerifiedFinding | None:
        flow = str(candidate.setup_context.get("flow", ""))

        # Special deterministic flow for revoked token replay
        if flow == "revoked_token_replay":
            async with SafeAsyncClient(
                self.gateway,
                agent="verifier",
                actor="agency_a_subagent",
                pace=True,
                inner_transport=self._async_transport,
            ) as sub_client:
                await sub_client.post(f"{self.base_url}/api/v3/auth/logout")
                exploit_resp = await sub_client.get(f"{self.base_url}/api/v3/bookings/1001")
                self.gateway.vault.clear_token("agency_a_subagent")
            ok, evidence = self._evaluate_oracle(candidate, exploit_resp)
            if not ok:
                return None
            return VerifiedFinding(
                finding_id=f"VFD-{uuid.uuid4().hex[:8].upper()}",
                candidate=candidate,
                canonical_endpoint=candidate.canonical_endpoint,
                method=candidate.method,
                vuln_class=candidate.vuln_class,
                affected_parameter=candidate.affected_parameter,
                title=candidate.title,
                minimal_evidence=evidence,
                repro_curl=self._build_repro_curl(self.base_url, candidate.exploit_step),
            )

        vars_map = await self._provision_fixture(flow) if flow else {}

        # Step 1: Baseline control check
        if candidate.baseline_step is not None:
            base_step = self._substitute_step(candidate.baseline_step, vars_map)
            base_resp = await self._send_step(base_step)
            if candidate.oracle.oracle_type == "jwt_tamper":
                if base_resp.status_code not in (401, 403):
                    return None
            elif base_resp.status_code not in (200, 400):
                return None

        # Step 2: Exploit replay & deterministic oracle
        exploit_step = self._substitute_step(candidate.exploit_step, vars_map)
        replay_canary_id: str | None = None
        if candidate.oracle.oracle_type == "ssrf_canary" and candidate.oracle.canary_id:
            replay_canary_id = uuid.uuid4().hex[:8]
            exploit_step = self._replace_canary_id(exploit_step, candidate.oracle.canary_id, replay_canary_id)

        exploit_resp = await self._send_step(exploit_step)
        if candidate.oracle.oracle_type == "ssrf_canary" and replay_canary_id:
            hit_count = await self._query_canary_hits(replay_canary_id)
            if hit_count is not None:
                if hit_count > 0 and exploit_resp.status_code in (200, 202):
                    confirmed = True
                    evidence: dict[str, Any] = {
                        "status": exploit_resp.status_code,
                        "oob_canary_id": replay_canary_id,
                        "oob_hit_count": hit_count,
                        "oob_confirmed": True,
                    }
                else:
                    confirmed = False
                    evidence = {}
            else:
                confirmed, evidence = self._evaluate_oracle(candidate, exploit_resp)
        else:
            confirmed, evidence = self._evaluate_oracle(candidate, exploit_resp)
        if not confirmed:
            return None

        return VerifiedFinding(
            finding_id=f"VFD-{uuid.uuid4().hex[:8].upper()}",
            candidate=candidate,
            canonical_endpoint=candidate.canonical_endpoint,
            method=candidate.method,
            vuln_class=candidate.vuln_class,
            affected_parameter=candidate.affected_parameter,
            title=candidate.title,
            minimal_evidence=evidence,
            repro_curl=self._build_repro_curl(self.base_url, exploit_step),
        )

    async def verify_batch(self, candidates: list[CandidateFinding]) -> VerificationSummary:
        verified: list[VerifiedFinding] = []
        suppressed = 0
        for cand in candidates:
            res = await self.verify_one(cand)
            if res is None:
                suppressed += 1
            else:
                verified.append(res)
        return VerificationSummary(
            total_candidates=len(candidates),
            verified_count=len(verified),
            suppressed_count=suppressed,
            findings=verified,
        )
