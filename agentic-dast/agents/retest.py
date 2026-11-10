"""Retest Agent: replays exact verified PoCs after fix deploys and updates ticket state."""

from __future__ import annotations

from pydantic import BaseModel, Field

from agents.triage import TriagedTicket
from agents.verifier import VerifierAgent


class RetestOutcome(BaseModel):
    ticket_id: str
    previous_status: str
    new_status: str
    fixed: bool


class RetestBatchSummary(BaseModel):
    retested_count: int
    fixed_count: int
    still_vulnerable_count: int
    outcomes: list[RetestOutcome] = Field(default_factory=list)


class RetestAgent:
    """Reruns verified PoCs deterministically and transitions OPEN -> VERIFIED_FIXED / STILL_VULNERABLE."""

    def __init__(self, verifier: VerifierAgent) -> None:
        self.verifier = verifier

    async def retest_ticket(self, ticket: TriagedTicket) -> RetestOutcome:
        prev = ticket.status
        still_vuln = await self.verifier.verify_one(ticket.finding.candidate)
        if still_vuln is None:
            ticket.status = "VERIFIED_FIXED"
            return RetestOutcome(
                ticket_id=ticket.ticket_id,
                previous_status=prev,
                new_status=ticket.status,
                fixed=True,
            )
        ticket.status = "STILL_VULNERABLE"
        return RetestOutcome(
            ticket_id=ticket.ticket_id,
            previous_status=prev,
            new_status=ticket.status,
            fixed=False,
        )

    async def retest_all(self, tickets: list[TriagedTicket]) -> RetestBatchSummary:
        outcomes: list[RetestOutcome] = []
        fixed = 0
        still_vuln = 0
        for ticket in tickets:
            if ticket.status == "REJECTED":
                continue
            res = await self.retest_ticket(ticket)
            outcomes.append(res)
            if res.fixed:
                fixed += 1
            else:
                still_vuln += 1
        return RetestBatchSummary(
            retested_count=len(outcomes),
            fixed_count=fixed,
            still_vulnerable_count=still_vuln,
            outcomes=outcomes,
        )
