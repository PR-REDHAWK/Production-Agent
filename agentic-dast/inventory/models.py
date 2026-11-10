"""Pydantic models for API Inventory (Active / Zombie / Shadow)."""

from __future__ import annotations

from typing import Literal
from pydantic import BaseModel, Field

InventoryClassification = Literal["Active", "Zombie", "Shadow"]
Recommendation = Literal["DECOMMISSION", "RESTRICT", "UPDATE"]


class InventoryEntry(BaseModel):
    method: str
    canonical_path: str
    classification: InventoryClassification
    hit_count_90d: int = 0
    last_seen_timestamp: str | None = None
    reachable_without_auth: bool | None = None
    pii_exposed: list[str] = Field(default_factory=list)
    security_regression: str | None = None
    likely_owner: str
    recommendation: Recommendation | None = None


class InventoryReport(BaseModel):
    total_endpoints: int
    active_count: int
    zombie_count: int
    shadow_count: int
    entries: list[InventoryEntry] = Field(default_factory=list)
