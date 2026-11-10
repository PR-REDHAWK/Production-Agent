"""Safety Layer: fail-closed scope allowlist, rate limiter, circuit breaker, vault, and audit log."""

from safety.audit import AuditLogger
from safety.gateway import (
    CircuitBreaker,
    SafeAsyncClient,
    SafeAsyncTransport,
    SafeClient,
    SafeTransport,
    SafetyGateway,
    ScopeValidator,
    TokenBucketRateLimiter,
    canonicalize_path,
    create_playwright_route_handler,
    load_scope_config,
)
from safety.models import (
    AuditRecord,
    CircuitBreakerOpenError,
    DestructiveActionError,
    HITLApprovalRequiredError,
    RateLimitBlockedError,
    RiskLevel,
    SafetyConfigError,
    SafetyCredentialError,
    SafetyError,
    ScopeViolationError,
    TargetScopeConfig,
)
from safety.vault import TestCredentialVault

__all__ = [
    "AuditLogger",
    "AuditRecord",
    "CircuitBreaker",
    "CircuitBreakerOpenError",
    "DestructiveActionError",
    "HITLApprovalRequiredError",
    "RateLimitBlockedError",
    "RiskLevel",
    "SafeAsyncClient",
    "SafeAsyncTransport",
    "SafeClient",
    "SafeTransport",
    "SafetyConfigError",
    "SafetyCredentialError",
    "SafetyError",
    "SafetyGateway",
    "ScopeValidator",
    "ScopeViolationError",
    "TargetScopeConfig",
    "TestCredentialVault",
    "TokenBucketRateLimiter",
    "canonicalize_path",
    "create_playwright_route_handler",
    "load_scope_config",
]
