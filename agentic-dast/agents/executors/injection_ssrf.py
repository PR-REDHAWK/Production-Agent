"""Injection & SSRF Executor: local OOB canary SSRF, safe SQLi syntax, SSTI {{7*7}}."""

from __future__ import annotations

import shutil
import subprocess
import uuid

import httpx

from agents.planner import AssertionOracle, AttackTask, CandidateFinding, HttpStepSpec
from safety.gateway import SafeAsyncClient, SafetyGateway


class InjectionSSRFExecutor:
    """Executes safe injection probes and local OOB canary SSRF tests through SafetyGateway."""

    name = "injection_ssrf"

    def __init__(
        self,
        gateway: SafetyGateway,
        base_url: str = "http://127.0.0.1:8001",
        canary_base_url: str = "http://127.0.0.1:8002",
        async_transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.gateway = gateway
        self.base_url = base_url.rstrip("/")
        self.canary_base_url = canary_base_url.rstrip("/")
        self._async_transport = async_transport

    async def execute(self, task: AttackTask) -> list[CandidateFinding]:
        candidates: list[CandidateFinding] = []
        path = task.canonical_path

        async with SafeAsyncClient(
            self.gateway,
            agent="executor_injection_ssrf",
            actor="agency_a_admin",
            pace=True,
            inner_transport=self._async_transport,
        ) as client:
            # 1. Safe SSRF check via local canary listener on POST /api/v3/suppliers/webhook-test
            if "/suppliers/webhook-test" in path and task.method == "POST":
                canary_id = uuid.uuid4().hex[:8]
                canary_url = f"{self.canary_base_url}/canary/{canary_id}"
                self.gateway.validator.check_payload_budget("callback_url", 1)
                resp = await client.post(
                    f"{self.base_url}{path}",
                    json={"callback_url": canary_url, "event_type": "booking.confirmed"},
                )
                if resp.status_code == 200 and resp.json().get("status") == "dispatched":
                    candidates.append(
                        CandidateFinding(
                            candidate_id=f"CAND-{uuid.uuid4().hex[:8].upper()}",
                            vuln_class="Server-side risks",
                            executor="injection_ssrf",
                            canonical_endpoint=path,
                            method="POST",
                            affected_parameter="callback_url",
                            title="SSRF via Unvalidated Supplier Webhook Callback URL",
                            summary=f"Supplier webhook endpoint dispatched server-side callback to {canary_url}.",
                            baseline_step=HttpStepSpec(
                                method="POST",
                                path=path,
                                actor="agency_a_admin",
                                json_body={
                                    "callback_url": "https://approved-supplier.internal/hook",
                                    "event_type": "booking.confirmed",
                                },
                            ),
                            exploit_step=HttpStepSpec(
                                method="POST",
                                path=path,
                                actor="agency_a_admin",
                                json_body={"callback_url": canary_url, "event_type": "booking.confirmed"},
                            ),
                            oracle=AssertionOracle(
                                oracle_type="ssrf_canary",
                                target_field="status",
                                forbidden_value="dispatched",
                                canary_id=canary_id,
                            ),
                        )
                    )

            # 2. Safe SQLi syntax-error & SSTI {{7*7}} probe on GET /api/v3/search
            if "/search" in path and task.method == "GET":
                for idx, (probe_name, payload) in enumerate(
                    [("sqli_syntax", "' OR '1'='1"), ("ssti_math", "{{7*7}}")], start=1
                ):
                    self.gateway.validator.check_payload_budget("city", idx)
                    resp = await client.get(f"{self.base_url}{path}", params={"city": payload})
                    text_lower = resp.text.lower()
                    if (probe_name == "sqli_syntax" and "sql syntax" in text_lower) or (
                        probe_name == "ssti_math" and "49" in resp.text and "{{7*7}}" not in resp.text
                    ):
                        candidates.append(
                            CandidateFinding(
                                candidate_id=f"CAND-{uuid.uuid4().hex[:8].upper()}",
                                vuln_class="Injection",
                                executor="injection_ssrf",
                                canonical_endpoint=path,
                                method="GET",
                                affected_parameter="city",
                                title=f"Potential {probe_name} Injection on {path}",
                                summary=f"Safe probe '{payload}' triggered indicator response.",
                                exploit_step=HttpStepSpec(
                                    method="GET",
                                    path=path,
                                    actor="agency_a_admin",
                                    params={"city": payload},
                                ),
                                oracle=AssertionOracle(oracle_type="injection_reflection"),
                            )
                        )

        return candidates

    @staticmethod
    def run_nuclei_via_gateway(target_url: str, proxy_url: str) -> list[str]:
        """Optional Nuclei wrapper strictly pinned to an active SafetyGateway proxy."""
        nuclei_bin = shutil.which("nuclei")
        if not nuclei_bin:
            return []
        proc = subprocess.run(
            [nuclei_bin, "-u", target_url, "-proxy", proxy_url, "-rl", "5", "-silent", "-jsonl"],
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
        return [line for line in proc.stdout.splitlines() if line.strip()]
