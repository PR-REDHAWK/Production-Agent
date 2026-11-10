"""API Hygiene & Data Exposure Executor: PII leak checks, mass assignment, stack traces."""

from __future__ import annotations

import re
import uuid

import httpx

from agents.planner import AssertionOracle, AttackTask, CandidateFinding, HttpStepSpec
from safety.gateway import SafeAsyncClient, SafetyGateway

_PII_RE = re.compile(r"(traveller_passport|SYNTH-PASS|@synthetic-traveller\.test)", re.IGNORECASE)
_STACK_TRACE_RE = re.compile(r"(Traceback \(most recent call last\)|File \"[^\"]+\", line \d+)", re.IGNORECASE)


class HygieneExecutor:
    """Detects PII exposure, mass assignment, and error stack traces safely."""

    name = "hygiene"

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

        # 1. Mass assignment on credit_limit via PATCH /api/v3/users/me
        if path == "/api/v3/users/me" and task.method == "PATCH":
            async with SafeAsyncClient(
                self.gateway,
                agent="executor_hygiene",
                actor="agency_a_subagent",
                pace=True,
                inner_transport=self._async_transport,
            ) as client:
                self.gateway.validator.check_payload_budget("credit_limit", 1)
                resp = await client.patch(
                    f"{self.base_url}/api/v3/users/me",
                    json={"credit_limit": 999999.0},
                )
                if resp.status_code == 200 and float(resp.json().get("credit_limit", 0.0)) >= 999999.0:
                    candidates.append(
                        CandidateFinding(
                            candidate_id=f"CAND-{uuid.uuid4().hex[:8].upper()}",
                            vuln_class="API hygiene",
                            executor="hygiene",
                            canonical_endpoint=path,
                            method="PATCH",
                            affected_parameter="credit_limit",
                            title="Mass Assignment Allows Sub-Agent to Inflate Credit Limit",
                            summary="PATCH /api/v3/users/me accepted credit_limit=999999.0.",
                            exploit_step=HttpStepSpec(
                                method="PATCH",
                                path="/api/v3/users/me",
                                actor="agency_a_subagent",
                                json_body={"credit_limit": 999999.0},
                            ),
                            oracle=AssertionOracle(
                                oracle_type="mass_assignment",
                                target_field="credit_limit",
                                forbidden_value=999999.0,
                            ),
                        )
                    )

        # 2. Unauthenticated PII / excessive data exposure on GET endpoints
        if task.method == "GET" and ("/v1/" in path or "/internal/" in path):
            async with SafeAsyncClient(
                self.gateway,
                agent="executor_hygiene",
                actor="unauthenticated",
                pace=True,
                inner_transport=self._async_transport,
            ) as client:
                resp = await client.get(f"{self.base_url}{sample_path}")
                if resp.status_code == 200 and _PII_RE.search(resp.text):
                    candidates.append(
                        CandidateFinding(
                            candidate_id=f"CAND-{uuid.uuid4().hex[:8].upper()}",
                            vuln_class="Data exposure",
                            executor="hygiene",
                            canonical_endpoint=path,
                            method="GET",
                            affected_parameter="response_body",
                            title=f"Unauthenticated Traveller PII Exposure on {path}",
                            summary=f"{sample_path} leaks synthetic passport/traveller fields without auth.",
                            exploit_step=HttpStepSpec(method="GET", path=sample_path, actor="unauthenticated"),
                            oracle=AssertionOracle(oracle_type="pii_exposure"),
                        )
                    )
                if _STACK_TRACE_RE.search(resp.text):
                    candidates.append(
                        CandidateFinding(
                            candidate_id=f"CAND-{uuid.uuid4().hex[:8].upper()}",
                            vuln_class="Data exposure",
                            executor="hygiene",
                            canonical_endpoint=path,
                            method="GET",
                            affected_parameter="error_response",
                            title=f"Stack Trace Disclosure on {path}",
                            summary="Endpoint leaked raw stack trace in response.",
                            exploit_step=HttpStepSpec(method="GET", path=sample_path, actor="unauthenticated"),
                            oracle=AssertionOracle(oracle_type="pii_exposure"),
                        )
                    )

        return candidates
