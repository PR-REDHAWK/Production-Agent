"""Pydantic schemas and fail-closed exceptions for the Safety Layer."""

from __future__ import annotations

from typing import Any, Literal
from pydantic import BaseModel, Field, field_validator

RiskLevel = Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]


class SafetyError(RuntimeError):
    """Base error raised when the Safety Gateway blocks an action."""


class SafetyConfigError(SafetyError):
    """Raised when scope, rate-limit, or vault config cannot be loaded/validated."""


class ScopeViolationError(SafetyError):
    """Raised when a target URL or redirect falls outside approved scope."""


class DestructiveActionError(SafetyError):
    """Raised when a request violates destructive-action guards."""


class RateLimitBlockedError(SafetyError):
    """Raised when host or endpoint rate-limit burst capacity is exceeded."""


class CircuitBreakerOpenError(SafetyError):
    """Raised when the target health circuit breaker is in EMERGENCY_PAUSE."""


class SafetyCredentialError(SafetyError):
    """Raised when an actor is unknown or credential resolution fails."""


class HITLApprovalRequiredError(SafetyError):
    """Raised when a HIGH/CRITICAL action lacks human approval."""


class ApprovedTarget(BaseModel):
    name: str
    schemes: list[str] = Field(min_length=1)
    hosts: list[str] = Field(min_length=1)
    ports: list[int] = Field(min_length=1)
    allowed_path_prefixes: list[str] = Field(min_length=1)
    blocked_path_patterns: list[str] = Field(default_factory=list)

    @field_validator("schemes")
    @classmethod
    def _lower_schemes(cls, values: list[str]) -> list[str]:
        return [v.lower() for v in values]

    @field_validator("hosts")
    @classmethod
    def _lower_hosts(cls, values: list[str]) -> list[str]:
        return [v.lower() for v in values]


class RateLimitsConfig(BaseModel):
    global_rps: float = Field(gt=0.0, le=20.0)
    per_endpoint_rps: float = Field(gt=0.0, le=20.0)
    burst_capacity: int = Field(ge=1, le=25)
    micro_burst_max_concurrent: int = Field(default=4, ge=1, le=10)


class CircuitBreakerConfig(BaseModel):
    max_p95_latency_ms: float = Field(gt=0.0)
    max_5xx_ratio: float = Field(gt=0.0, le=1.0)
    min_sample_window: int = Field(ge=1)
    cooldown_seconds: float = Field(gt=0.0)


class SafetyGuardsConfig(BaseModel):
    block_external_redirects: bool = True
    block_global_delete: bool = True
    max_payload_iterations_per_param: int = Field(default=12, ge=1, le=100)
    hitl_required_risk_levels: list[RiskLevel] = Field(default_factory=lambda: ["HIGH", "CRITICAL"])


class AuditLogConfig(BaseModel):
    jsonl_path: str
    sqlite_path: str
    max_body_excerpt_chars: int = Field(default=512, ge=64, le=4096)


class TargetScopeConfig(BaseModel):
    environment: str
    approved_targets: list[ApprovedTarget] = Field(min_length=1)
    rate_limits: RateLimitsConfig
    circuit_breaker: CircuitBreakerConfig
    safety_guards: SafetyGuardsConfig
    audit_log: AuditLogConfig


class AuditRecord(BaseModel):
    trace_id: str
    timestamp: str
    agent: str
    actor: str
    method: str
    url: str
    sanitized_headers: dict[str, str]
    body: str
    status: int
    latency_ms: float
    body_excerpt: str
    decision: str = "ALLOWED"
    metadata: dict[str, Any] = Field(default_factory=dict)
