"""Pydantic schemas for the App Knowledge Graph (per rules.md §5)."""

from __future__ import annotations

from typing import Any, Literal
from pydantic import BaseModel, Field

NodeType = Literal["Endpoint", "Parameter", "Role", "BusinessFlow", "AssetOwner"]
EdgeType = Literal["ACCEPTS_PARAM", "ACCESSIBLE_BY_ROLE", "FLOW_STEP", "OWNED_BY"]
SensitivityTag = Literal[
    "PAYMENTS_CREDIT",
    "BOOKINGS",
    "PII_TRAVELLER",
    "SUPPLIER_ADMIN",
    "PUBLIC_SEARCH",
]
BusinessFlowName = Literal["search", "hold", "book", "pay", "cancel", "refund"]


class EndpointRecord(BaseModel):
    method: str
    canonical_path: str
    sample_paths: list[str] = Field(default_factory=list)
    role_sample_paths: dict[str, list[str]] = Field(default_factory=dict)
    sources: list[str] = Field(default_factory=list)
    roles: list[str] = Field(default_factory=list)
    params: list[str] = Field(default_factory=list)
    param_locations: dict[str, str] = Field(default_factory=dict)
    sensitivity_tags: list[SensitivityTag] = Field(default_factory=list)
    business_flow: BusinessFlowName | None = None
    owner_team: str | None = None
    observed_statuses: list[int] = Field(default_factory=list)
    response_fields: list[str] = Field(default_factory=list)
    sample_response_schema: dict[str, Any] = Field(default_factory=dict)


class GraphSummary(BaseModel):
    total_nodes: int
    total_edges: int
    endpoints_count: int
    roles_count: int
    params_count: int
    flows_count: int
    owners_count: int
