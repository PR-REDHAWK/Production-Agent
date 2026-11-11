"""Orchestrator Agent: runs the 8-stage real-time DAST loop end-to-end."""

from __future__ import annotations

import time
from collections.abc import Callable
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
from pydantic import BaseModel, Field

from agents.executors.auth import AuthExecutor
from agents.executors.business_logic import BusinessLogicExecutor
from agents.executors.hygiene import HygieneExecutor
from agents.executors.idor import IDORExecutor
from agents.executors.injection_ssrf import InjectionSSRFExecutor
from agents.llm_adapter import LLMAdapter
from agents.planner import AttackPlan, AttackPlannerAgent, CandidateFinding
from agents.retest import RetestAgent, RetestBatchSummary
from agents.triage import HITLActionRequest, HITLQueue, TriageAgent, TriagedTicket
from agents.verifier import VerificationSummary, VerifierAgent
from graph.knowledge_graph import AppKnowledgeGraph
from graph.models import GraphSummary
from inventory.classifier import InventoryAgent
from inventory.models import InventoryReport
from recon.crawler import DiscoveryResult, ReconAgent
from safety.gateway import SafetyGateway
from triggers.watchers import ChangeEvent, DeployWebhookEvent, extract_delta_paths_from_deploy


class StageEvent(BaseModel):
    timestamp: str
    stage: str
    message: str
    details: dict[str, Any] = Field(default_factory=dict)


class OrchestratorRunReport(BaseModel):
    run_id: str
    trigger: ChangeEvent
    elapsed_ms: float
    discovery: DiscoveryResult
    graph_summary: GraphSummary
    inventory: InventoryReport
    attack_plan: AttackPlan
    candidate_count: int
    verification: VerificationSummary
    tickets: list[TriagedTicket] = Field(default_factory=list)
    pending_hitl: list[HITLActionRequest] = Field(default_factory=list)
    retest: RetestBatchSummary | None = None
    gateway_metrics: dict[str, Any] = Field(default_factory=dict)
    timeline: list[StageEvent] = Field(default_factory=list)


class OrchestratorAgent:
    """Coordinates triggers -> recon -> inventory -> plan -> execute -> verify -> triage -> retest."""

    def __init__(
        self,
        *,
        gateway: SafetyGateway,
        ownership_path: Path,
        logs_path: Path | None = None,
        base_url: str = "http://127.0.0.1:8001",
        canary_base_url: str = "http://127.0.0.1:8002",
        async_transport: httpx.AsyncBaseTransport | None = None,
        llm: LLMAdapter | None = None,
        on_event: Callable[[StageEvent], None] | None = None,
    ) -> None:
        self.gateway = gateway
        self.ownership_path = Path(ownership_path)
        self.logs_path = Path(logs_path) if logs_path else None
        self.base_url = base_url.rstrip("/")
        self.canary_base_url = canary_base_url.rstrip("/")
        self._async_transport = async_transport
        self.llm = llm or LLMAdapter()
        self._on_event = on_event

        self.graph = AppKnowledgeGraph(self.ownership_path)
        self.hitl_queue = HITLQueue(gateway=self.gateway)
        self.tickets: list[TriagedTicket] = []
        self.latest_inventory: InventoryReport | None = None
        self.latest_openapi: dict[str, Any] | None = None
        self.timeline: list[StageEvent] = []

    def _emit(self, stage: str, message: str, **details: Any) -> None:
        ev = StageEvent(
            timestamp=datetime.now(timezone.utc).isoformat(),
            stage=stage,
            message=message,
            details=details,
        )
        self.timeline.append(ev)
        if self._on_event is not None:
            self._on_event(ev)

    async def run_cycle(
        self,
        *,
        change_event: ChangeEvent | None = None,
        use_playwright: bool = False,
        delta_only: bool = False,
        auto_approve_hitl_execution: bool = False,
    ) -> OrchestratorRunReport:
        t0 = time.perf_counter()
        trigger = change_event or ChangeEvent(trigger_type="manual", summary="Manual baseline scan", delta_paths=[])
        self._emit("detect_change", trigger.summary, trigger_type=trigger.trigger_type, delta_paths=trigger.delta_paths)

        # Stage 2: Recon & Knowledge Graph
        recon = ReconAgent(
            gateway=self.gateway,
            graph=self.graph,
            base_url=self.base_url,
            async_transport=self._async_transport,
        )
        discovery = await recon.run_full_discovery(
            use_playwright=use_playwright,
            gateway_logs_path=self.logs_path,
        )
        self.latest_openapi = self.graph.export_openapi_31(server_url=self.base_url)
        self._emit(
            "recon",
            f"Mapped {discovery.discovered_endpoints} endpoints and exported OpenAPI 3.1",
            endpoints=discovery.discovered_endpoints,
        )

        # Stage 3: Zombie / Shadow Inventory
        inv_agent = InventoryAgent(
            gateway=self.gateway,
            graph=self.graph,
            ownership_path=self.ownership_path,
            base_url=self.base_url,
            async_transport=self._async_transport,
        )
        if self.logs_path and self.logs_path.exists():
            inventory = await inv_agent.classify(self.logs_path)
        else:
            inventory = InventoryReport(total_endpoints=0, active_count=0, zombie_count=0, shadow_count=0)
        self.latest_inventory = inventory
        self._emit(
            "inventory",
            f"Inventory: {inventory.active_count} active, {inventory.zombie_count} zombie, {inventory.shadow_count} shadow",
            active=inventory.active_count,
            zombie=inventory.zombie_count,
            shadow=inventory.shadow_count,
        )

        # Stage 4: Attack Planning
        planner = AttackPlannerAgent(llm=self.llm)
        plan = await planner.build_plan(
            self.graph,
            delta_paths=trigger.delta_paths,
            inventory=inventory,
            delta_only=delta_only,
        )
        self._emit("plan_attacks", f"Planned {len(plan.tasks)} targeted attack tasks", tasks=len(plan.tasks))

        # HITL pre-execution gate for risky state-mutating refund tests
        exec_approval_id: str | None = None
        if any("/refund" in t.canonical_path for t in plan.tasks):
            hitl_req = self.hitl_queue.submit_execution_request(
                description="Allow bounded double-refund idempotency verification on synthetic booking",
                target_ref="/api/v3/bookings/{id}/refund",
                risk_level="HIGH",
            )
            if auto_approve_hitl_execution:
                self.hitl_queue.approve(hitl_req.approval_id)
                exec_approval_id = hitl_req.approval_id
                self._emit("hitl_exec", f"Approved risky execution {hitl_req.approval_id}")
            else:
                self._emit("hitl_exec", f"Awaiting HITL approval {hitl_req.approval_id} for double-refund test")

        # Stage 5: Safe Execution (candidates only)
        executors = {
            "idor": IDORExecutor(self.gateway, base_url=self.base_url, async_transport=self._async_transport),
            "business_logic": BusinessLogicExecutor(
                self.gateway,
                base_url=self.base_url,
                async_transport=self._async_transport,
                hitl_approval_id=exec_approval_id,
            ),
            "auth": AuthExecutor(self.gateway, base_url=self.base_url, async_transport=self._async_transport),
            "hygiene": HygieneExecutor(self.gateway, base_url=self.base_url, async_transport=self._async_transport),
            "injection_ssrf": InjectionSSRFExecutor(
                self.gateway,
                base_url=self.base_url,
                canary_base_url=self.canary_base_url,
                async_transport=self._async_transport,
            ),
        }

        candidates: list[CandidateFinding] = []
        for task in plan.tasks:
            for ex_name in task.executors:
                if ex_name == "business_logic" and "/refund" in task.canonical_path and exec_approval_id is None:
                    # Respect HITL gate: skip HIGH-risk refund test if not yet human-approved
                    continue
                found = await executors[ex_name].execute(task)
                candidates.extend(found)
        self._emit("execute_safely", f"Collected {len(candidates)} candidate findings", candidates=len(candidates))

        # Stage 6: Deterministic Verification
        verifier = VerifierAgent(
            self.gateway,
            base_url=self.base_url,
            canary_base_url=self.canary_base_url,
            async_transport=self._async_transport,
            hitl_approval_id=exec_approval_id,
        )
        verification = await verifier.verify_batch(candidates)
        self._emit(
            "verify",
            f"Verified {verification.verified_count} findings ({verification.suppressed_count} suppressed)",
            verified=verification.verified_count,
            suppressed=verification.suppressed_count,
        )

        # Stage 7: Triage & Report
        triage = TriageAgent(self.graph, hitl_queue=self.hitl_queue, llm=self.llm)
        new_tickets = await triage.triage_findings(verification.findings)
        existing_keys = {t.dedupe_key: t for t in self.tickets}
        for t in new_tickets:
            existing_keys[t.dedupe_key] = t
        self.tickets = list(existing_keys.values())
        self._emit(
            "triage_report",
            f"Triaged {len(new_tickets)} unique tickets; {len(self.hitl_queue.list_pending())} pending HITL",
            tickets=len(new_tickets),
        )

        elapsed_ms = round((time.perf_counter() - t0) * 1000.0, 2)
        return OrchestratorRunReport(
            run_id=f"RUN-{int(time.time())}",
            trigger=trigger,
            elapsed_ms=elapsed_ms,
            discovery=discovery,
            graph_summary=self.graph.summary(),
            inventory=inventory,
            attack_plan=plan,
            candidate_count=len(candidates),
            verification=verification,
            tickets=self.tickets,
            pending_hitl=self.hitl_queue.list_pending(),
            gateway_metrics=self.gateway.metrics(),
            timeline=list(self.timeline),
        )

    async def handle_deploy_webhook(
        self,
        event: DeployWebhookEvent,
        *,
        auto_approve_hitl_execution: bool = True,
    ) -> OrchestratorRunReport | RetestBatchSummary:
        delta_paths = extract_delta_paths_from_deploy(event)
        if event.is_fix_deploy and self.tickets:
            self._emit("retest_trigger", f"Fix deploy {event.commit}: retesting {len(self.tickets)} tickets")
            exec_req = self.hitl_queue.submit_execution_request(
                description=f"Retest verified PoCs after fix deploy {event.commit}",
                target_ref="open_tickets",
                risk_level="HIGH",
            )
            self.hitl_queue.approve(exec_req.approval_id)
            verifier = VerifierAgent(
                self.gateway,
                base_url=self.base_url,
                canary_base_url=self.canary_base_url,
                async_transport=self._async_transport,
                hitl_approval_id=exec_req.approval_id,
            )
            retest = RetestAgent(verifier)
            summary = await retest.retest_all(self.tickets)
            self._emit(
                "retest",
                f"Retest finished: {summary.fixed_count} VERIFIED_FIXED, {summary.still_vulnerable_count} STILL_VULNERABLE",
            )
            return summary

        change = ChangeEvent(
            trigger_type="deploy_webhook",
            summary=f"Deploy {event.commit} ({event.environment}): {', '.join(event.changed_services)}",
            delta_paths=delta_paths,
            is_fix_deploy=event.is_fix_deploy,
            commit=event.commit,
        )
        return await self.run_cycle(
            change_event=change,
            delta_only=bool(delta_paths),
            auto_approve_hitl_execution=auto_approve_hitl_execution,
        )
