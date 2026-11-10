"""Delta-first Attack Planner Agent and shared executor/candidate schemas (Phase 3)."""

from __future__ import annotations

from typing import Any, Literal
from pydantic import BaseModel, Field

from agents.llm_adapter import BusinessLogicHypotheses, LLMAdapter
from graph.knowledge_graph import AppKnowledgeGraph
from graph.models import EndpointRecord
from inventory.models import InventoryReport
from safety.models import RiskLevel

ExecutorName = Literal["idor", "business_logic", "auth", "hygiene", "injection_ssrf"]


class HttpStepSpec(BaseModel):
    method: str
    path: str
    actor: str = "unauthenticated"
    params: dict[str, Any] = Field(default_factory=dict)
    json_body: dict[str, Any] | None = None
    headers: dict[str, str] = Field(default_factory=dict)
    risk_level: RiskLevel = "LOW"


class AssertionOracle(BaseModel):
    oracle_type: Literal[
        "cross_agency_leak",
        "role_escalation",
        "fare_tamper",
        "skip_payment",
        "double_refund",
        "coupon_reuse",
        "unauth_access",
        "jwt_tamper",
        "token_reuse",
        "mass_assignment",
        "pii_exposure",
        "ssrf_canary",
        "injection_reflection",
        "zombie_unauth",
    ]
    expected_secure_statuses: list[int] = Field(default_factory=lambda: [400, 401, 402, 403, 404, 409, 410])
    vuln_statuses: list[int] = Field(default_factory=lambda: [200, 201])
    target_field: str | None = None
    forbidden_value: Any = None
    expected_min_value: float | None = None
    canary_id: str | None = None


class CandidateFinding(BaseModel):
    """Unconfirmed finding emitted by an executor; requires VerifierAgent confirmation."""

    candidate_id: str
    vuln_class: str
    executor: ExecutorName
    canonical_endpoint: str
    method: str
    affected_parameter: str
    title: str
    summary: str
    baseline_step: HttpStepSpec | None = None
    exploit_step: HttpStepSpec
    oracle: AssertionOracle
    setup_context: dict[str, Any] = Field(default_factory=dict)
    confirmed: Literal[False] = False


class AttackTask(BaseModel):
    task_id: str
    method: str
    canonical_path: str
    executors: list[ExecutorName]
    priority: int
    is_delta: bool = False
    sensitivity_tags: list[str] = Field(default_factory=list)
    hypotheses: list[str] = Field(default_factory=list)


class AttackPlan(BaseModel):
    delta_only: bool
    total_endpoints_considered: int
    tasks: list[AttackTask] = Field(default_factory=list)


class AttackPlannerAgent:
    """Selects targeted executors per endpoint prioritizing delta changes and high-risk flows."""

    def __init__(self, llm: LLMAdapter | None = None) -> None:
        self.llm = llm or LLMAdapter(provider="deterministic")

    @staticmethod
    def _select_executors(ep: EndpointRecord) -> list[ExecutorName]:
        path = ep.canonical_path.lower()
        selected: list[ExecutorName] = []

        if "/bookings/{id}" in path and ep.method == "GET":
            selected.extend(["idor", "auth", "hygiene"])
        elif "/users/me" in path:
            selected.extend(["idor", "hygiene", "auth"])
        elif any(k in path for k in ("/bookings", "/holds", "/coupons", "/confirm", "/refund", "/pay")):
            selected.extend(["business_logic", "auth", "hygiene"])
        elif "/suppliers/" in path or "/search" in path:
            selected.extend(["injection_ssrf", "auth", "hygiene"])
        elif "/internal/" in path or "/v1/" in path:
            selected.extend(["auth", "hygiene"])
        else:
            selected.append("hygiene")

        # Deduplicate while preserving order
        seen: set[ExecutorName] = set()
        return [ex for ex in selected if not (ex in seen or seen.add(ex))]

    @staticmethod
    def _compute_priority(ep: EndpointRecord, is_delta: bool, zombie_shadow_paths: set[str]) -> int:
        score = 50 if is_delta else 10
        if "PAYMENTS_CREDIT" in ep.sensitivity_tags:
            score += 40
        if "PII_TRAVELLER" in ep.sensitivity_tags:
            score += 30
        if "BOOKINGS" in ep.sensitivity_tags:
            score += 20
        if "SUPPLIER_ADMIN" in ep.sensitivity_tags:
            score += 20
        if ep.canonical_path in zombie_shadow_paths:
            score += 25
        return score

    @staticmethod
    def _default_hypotheses(ep: EndpointRecord) -> list[str]:
        path = ep.canonical_path.lower()
        hyps: list[str] = []
        if "/bookings" in path and ep.method == "POST":
            hyps.append("Test client-supplied total_fare and negative quantity tampering")
        if "/confirm" in path:
            hyps.append("Test confirming an unpaid booking to bypass payment step")
        if "/refund" in path:
            hyps.append("Test double-refund idempotency on cancelled booking")
        if "/coupons" in path:
            hyps.append("Test repeated coupon application on same hold")
        if "/bookings/{id}" in path and ep.method == "GET":
            hyps.append("Test cross-agency IDOR replay across Agency Alpha and Agency Beta")
        if "/users/me" in path:
            hyps.append("Test subagent-to-admin privilege escalation via mass assignment")
        if "/webhook" in path:
            hyps.append("Test supplier callback SSRF against local OOB canary")
        return hyps

    async def build_plan(
        self,
        graph: AppKnowledgeGraph,
        *,
        delta_paths: list[str] | None = None,
        inventory: InventoryReport | None = None,
        delta_only: bool = False,
    ) -> AttackPlan:
        delta_set = set(delta_paths or [])
        zs_paths = {
            e.canonical_path
            for e in (inventory.entries if inventory else [])
            if e.classification in ("Zombie", "Shadow")
        }
        endpoints = graph.list_endpoints()
        tasks: list[AttackTask] = []

        for idx, ep in enumerate(endpoints, start=1):
            if ep.canonical_path.startswith("/api/v3/auth/login"):
                continue
            is_delta = ep.canonical_path in delta_set or ep.canonical_path in zs_paths
            if delta_only and delta_set and not is_delta:
                continue

            executors = self._select_executors(ep)
            priority = self._compute_priority(ep, is_delta=is_delta, zombie_shadow_paths=zs_paths)
            default_hyps = self._default_hypotheses(ep)

            if "business_logic" in executors and (is_delta or "PAYMENTS_CREDIT" in ep.sensitivity_tags):
                llm_out = await self.llm.generate_structured(
                    system_prompt=(
                        "You are an AppSec attack planner for a B2B travel API. "
                        "Suggest targeted business-logic test hypotheses for this endpoint."
                    ),
                    untrusted_context={
                        "method": ep.method,
                        "path": ep.canonical_path,
                        "params": ep.params,
                        "tags": ep.sensitivity_tags,
                        "flow": ep.business_flow,
                    },
                    response_model=BusinessLogicHypotheses,
                    deterministic_fallback=BusinessLogicHypotheses(
                        endpoint=ep.canonical_path,
                        hypotheses=default_hyps,
                        rationale="Deterministic travel business-logic heuristics",
                    ),
                )
                hypotheses = llm_out.hypotheses or default_hyps
            else:
                hypotheses = default_hyps

            tasks.append(
                AttackTask(
                    task_id=f"TASK-{idx:03d}",
                    method=ep.method,
                    canonical_path=ep.canonical_path,
                    executors=executors,
                    priority=priority,
                    is_delta=is_delta,
                    sensitivity_tags=list(ep.sensitivity_tags),
                    hypotheses=hypotheses,
                )
            )

        tasks.sort(key=lambda t: (-t.priority, t.canonical_path, t.method))
        return AttackPlan(
            delta_only=delta_only,
            total_endpoints_considered=len(endpoints),
            tasks=tasks,
        )
