"""Retest Agent: replays exact verified PoCs after fix deploys and updates ticket state."""

from __future__ import annotations

import asyncio

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

    async def retest_all(
        self,
        tickets: list[TriagedTicket],
        max_concurrency: int = 4,
    ) -> RetestBatchSummary:
        eligible = [t for t in tickets if t.status != "REJECTED"]
        sem = asyncio.Semaphore(max_concurrency)

        async def _retest_one(ticket: TriagedTicket) -> RetestOutcome:
            async with sem:
                return await self.retest_ticket(ticket)

        outcomes = await asyncio.gather(*[_retest_one(t) for t in eligible])
        fixed = sum(1 for o in outcomes if o.fixed)
        still_vuln = sum(1 for o in outcomes if not o.fixed)
        return RetestBatchSummary(
            retested_count=len(outcomes),
            fixed_count=fixed,
            still_vulnerable_count=still_vuln,
            outcomes=list(outcomes),
        )
