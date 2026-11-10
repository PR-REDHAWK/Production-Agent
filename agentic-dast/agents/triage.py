"""Triage, Business-Severity Scoring, Deduplication, and HITL Approval Queue."""

from __future__ import annotations

import uuid
from typing import Literal
from pydantic import BaseModel, Field

from agents.llm_adapter import LLMAdapter, RemediationNarrative
from agents.verifier import VerifiedFinding
from graph.knowledge_graph import AppKnowledgeGraph
from safety.gateway import SafetyGateway
from safety.models import RiskLevel

TicketStatus = Literal["PENDING_HUMAN_REVIEW", "OPEN", "REJECTED", "VERIFIED_FIXED", "STILL_VULNERABLE"]


class TriagedTicket(BaseModel):
    ticket_id: str
    dedupe_key: str
    finding: VerifiedFinding
    severity: RiskLevel
    owner_team: str
    owner_contact: str
    business_impact: str
    code_fix_suggestion: str
    status: TicketStatus
    hitl_required: bool = False


class HITLActionRequest(BaseModel):
    approval_id: str
    kind: Literal["RISKY_TEST_EXECUTION", "HIGH_SEVERITY_TICKET"]
    description: str
    risk_level: RiskLevel
    target_ref: str
    decision: Literal["PENDING", "APPROVED", "REJECTED"] = "PENDING"


class HITLQueue:
    """Human-in-the-loop approval registry bridging SafetyGateway and Triage tickets."""

    def __init__(self, gateway: SafetyGateway | None = None) -> None:
        self._gateway = gateway
        self._items: dict[str, HITLActionRequest] = {}

    def submit_execution_request(
        self,
        *,
        description: str,
        target_ref: str,
        risk_level: RiskLevel = "HIGH",
    ) -> HITLActionRequest:
        approval_id = f"HITL-EXEC-{uuid.uuid4().hex[:6].upper()}"
        req = HITLActionRequest(
            approval_id=approval_id,
            kind="RISKY_TEST_EXECUTION",
            description=description,
            risk_level=risk_level,
            target_ref=target_ref,
        )
        self._items[approval_id] = req
        return req

    def submit_ticket_review(self, ticket: TriagedTicket) -> HITLActionRequest:
        approval_id = f"HITL-TKT-{ticket.ticket_id}"
        req = HITLActionRequest(
            approval_id=approval_id,
            kind="HIGH_SEVERITY_TICKET",
            description=f"{ticket.severity} finding on {ticket.finding.canonical_endpoint}: {ticket.finding.title}",
            risk_level=ticket.severity,
            target_ref=ticket.ticket_id,
        )
        self._items[approval_id] = req
        return req

    def approve(self, approval_id: str) -> HITLActionRequest:
        item = self._items[approval_id]
        item.decision = "APPROVED"
        if self._gateway is not None and item.kind == "RISKY_TEST_EXECUTION":
            self._gateway.approve_hitl(approval_id)
        return item

    def reject(self, approval_id: str) -> HITLActionRequest:
        item = self._items[approval_id]
        item.decision = "REJECTED"
        if self._gateway is not None and item.kind == "RISKY_TEST_EXECUTION":
            self._gateway.revoke_hitl(approval_id)
        return item

    def list_pending(self) -> list[HITLActionRequest]:
        return [item for item in self._items.values() if item.decision == "PENDING"]

    def list_all(self) -> list[HITLActionRequest]:
        return list(self._items.values())


class TriageAgent:
    """Deduplicates verified findings, scores business severity, maps owners, and queues HITL."""

    def __init__(
        self,
        graph: AppKnowledgeGraph,
        hitl_queue: HITLQueue | None = None,
        llm: LLMAdapter | None = None,
    ) -> None:
        self.graph = graph
        self.hitl_queue = hitl_queue or HITLQueue()
        self.llm = llm or LLMAdapter(provider="deterministic")

    @staticmethod
    def dedupe_key(finding: VerifiedFinding) -> str:
        return f"{finding.canonical_endpoint}|{finding.vuln_class}|{finding.affected_parameter}"

    def score_severity(self, finding: VerifiedFinding) -> RiskLevel:
        tags: list[str] = []
        for ep in self.graph.list_endpoints():
            if ep.canonical_path == finding.canonical_endpoint and ep.method == finding.method:
                tags = list(ep.sensitivity_tags)
                break

        vc = finding.vuln_class.lower()
        ep_lower = finding.canonical_endpoint.lower()

        if "PAYMENTS_CREDIT" in tags or any(k in ep_lower for k in ("/refund", "/confirm", "/coupons", "/bookings")):
            if vc in ("business logic", "access control", "authentication and sessions"):
                if "PAYMENTS_CREDIT" in tags or any(k in ep_lower for k in ("/refund", "/confirm", "/coupons")):
                    return "CRITICAL"
                if vc == "access control":
                    return "CRITICAL"

        if "PII_TRAVELLER" in tags or "BOOKINGS" in tags or vc in ("data exposure", "server-side risks"):
            return "HIGH"

        if "zombie" in vc or "shadow" in vc:
            return "HIGH" if finding.minimal_evidence.get("pii_match") else "MEDIUM"

        return "MEDIUM"

    @staticmethod
    def _default_remediation(finding: VerifiedFinding) -> RemediationNarrative:
        vc = finding.vuln_class.lower()
        ep = finding.canonical_endpoint
        if vc == "access control":
            return RemediationNarrative(
                business_impact="Unauthorized cross-agency booking/PII exposure or admin privilege escalation.",
                code_fix_suggestion=(
                    f"Enforce tenant isolation (`resource.agency_id == current_user.agency_id`) "
                    f"and explicit Pydantic update schemas on {ep}."
                ),
            )
        if vc == "business logic":
            return RemediationNarrative(
                business_impact="Direct financial loss from fare tampering, unpaid confirmations, or double refunds.",
                code_fix_suggestion=(
                    f"Compute fare server-side from hold quote, enforce `payment_status == 'PAID'` before confirm, "
                    f"and enforce idempotency / `refunded_amount < paid_amount` on {ep}."
                ),
            )
        if vc == "server-side risks":
            return RemediationNarrative(
                business_impact="Server-side request forgery exposing internal services/metadata via webhook callbacks.",
                code_fix_suggestion=f"Restrict callback_url on {ep} to an explicit HTTPS supplier host allowlist.",
            )
        if vc in ("zombie and shadow apis", "data exposure"):
            return RemediationNarrative(
                business_impact="Legacy or undocumented API exposes traveller PII without modern auth controls.",
                code_fix_suggestion=f"Decommission or require strict gateway authentication and tenant checks on {ep}.",
            )
        return RemediationNarrative(
            business_impact="Security control bypass impacting B2B travel API integrity.",
            code_fix_suggestion=f"Enforce strict authentication, input validation, and allowlist checks on {ep}.",
        )

    async def triage_findings(self, findings: list[VerifiedFinding]) -> list[TriagedTicket]:
        deduped: dict[str, VerifiedFinding] = {}
        for f in findings:
            key = self.dedupe_key(f)
            if key not in deduped:
                deduped[key] = f

        tickets: list[TriagedTicket] = []
        for dedupe_k, finding in deduped.items():
            severity = self.score_severity(finding)
            owner_team, owner_contact = self.graph.resolve_owner(finding.canonical_endpoint)
            default_narr = self._default_remediation(finding)
            narrative = await self.llm.generate_structured(
                system_prompt="Write concise business impact and code-level remediation for a verified API finding.",
                untrusted_context={
                    "endpoint": finding.canonical_endpoint,
                    "method": finding.method,
                    "vuln_class": finding.vuln_class,
                    "parameter": finding.affected_parameter,
                    "severity": severity,
                },
                response_model=RemediationNarrative,
                deterministic_fallback=default_narr,
            )

            hitl_needed = severity in ("HIGH", "CRITICAL")
            ticket = TriagedTicket(
                ticket_id=f"TKT-{uuid.uuid4().hex[:6].upper()}",
                dedupe_key=dedupe_k,
                finding=finding,
                severity=severity,
                owner_team=owner_team,
                owner_contact=owner_contact or "#sec-triage",
                business_impact=narrative.business_impact,
                code_fix_suggestion=narrative.code_fix_suggestion,
                status="PENDING_HUMAN_REVIEW" if hitl_needed else "OPEN",
                hitl_required=hitl_needed,
            )
            if hitl_needed:
                self.hitl_queue.submit_ticket_review(ticket)
            tickets.append(ticket)

        sev_order = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
        tickets.sort(key=lambda t: (sev_order[t.severity], t.finding.canonical_endpoint))
        return tickets

    def apply_hitl_decision(self, ticket: TriagedTicket, approve: bool) -> TriagedTicket:
        approval_id = f"HITL-TKT-{ticket.ticket_id}"
        if approval_id in {r.approval_id for r in self.hitl_queue.list_all()}:
            if approve:
                self.hitl_queue.approve(approval_id)
                ticket.status = "OPEN"
            else:
                self.hitl_queue.reject(approval_id)
                ticket.status = "REJECTED"
        else:
            ticket.status = "OPEN" if approve else "REJECTED"
        return ticket
