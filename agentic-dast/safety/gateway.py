"""Mandatory Safety Gateway & httpx Transports.

All outbound HTTP traffic (agents, recon, executors, verifier, retest, vault login,
and Playwright route interception) MUST pass through SafetyGateway.
"""

from __future__ import annotations

import asyncio
import json
import math
import posixpath
import re
import threading
import time
import uuid
from collections import deque
from collections.abc import Awaitable, Callable
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse

import httpx
import yaml

from safety.audit import AuditLogger
from safety.models import (
    AuditRecord,
    CircuitBreakerConfig,
    CircuitBreakerOpenError,
    DestructiveActionError,
    HITLApprovalRequiredError,
    RateLimitBlockedError,
    RateLimitsConfig,
    RiskLevel,
    SafetyConfigError,
    SafetyGuardsConfig,
    ScopeViolationError,
    TargetScopeConfig,
)
from safety.vault import ActorConfig, TestCredentialVault

_DESTRUCTIVE_PATH_KEYWORDS = ("drop", "truncate", "shutdown", "destroy", "wipe")
_ID_SEGMENT_RE = re.compile(
    r"^(?:\d+|[0-9a-fA-F]{8}-[0-9a-fA-F-]{27}|[0-9a-fA-F]{16,}|(?:BK|HOLD|USR|INV|VCH)-[A-Za-z0-9_-]+)$"
)
_GLOBAL_COLLECTION_PATHS = frozenset(
    {
        "/",
        "/api",
        "/api/v1/bookings",
        "/api/v3/bookings",
        "/api/v3/holds",
        "/api/v3/users",
        "/api/v3/coupons",
        "/api/v3/suppliers",
        "/internal",
    }
)


def canonicalize_path(path: str) -> str:
    """Normalize resource IDs in URL paths so per-endpoint rate buckets share a key."""
    if not path:
        return "/"
    parts = [part for part in path.split("/") if part]
    normalized: list[str] = []
    for part in parts:
        if _ID_SEGMENT_RE.match(part):
            normalized.append("{id}")
        else:
            normalized.append(part)
    return "/" + "/".join(normalized)


def load_scope_config(scope_path: Path) -> TargetScopeConfig:
    """Load and strictly validate configs/target_scope.yaml (fail-closed)."""
    try:
        raw_text = Path(scope_path).read_text(encoding="utf-8")
        data = yaml.safe_load(raw_text)
        if not isinstance(data, dict):
            raise ValueError("Scope config root must be a YAML mapping")
        return TargetScopeConfig.model_validate(data)
    except Exception as exc:  # noqa: BLE001
        raise SafetyConfigError(f"Failed to load scope config {scope_path}: {exc}") from exc


class ScopeValidator:
    """Fail-closed URL scope & destructive-action validator."""

    def __init__(self, config: TargetScopeConfig) -> None:
        self.config = config
        self._blocked_patterns: dict[str, list[re.Pattern[str]]] = {
            target.name: [re.compile(p) for p in target.blocked_path_patterns]
            for target in config.approved_targets
        }

    def validate_url(self, url: str) -> tuple[str, str, int, str]:
        parsed = urlparse(url)
        if parsed.username or parsed.password:
            raise ScopeViolationError(f"Credentials embedded in URL are forbidden: {url}")

        scheme = (parsed.scheme or "").lower()
        host = (parsed.hostname or "").lower()
        if not scheme or not host:
            raise ScopeViolationError(f"Missing scheme or host in URL: {url}")

        port = parsed.port or (443 if scheme == "https" else 80 if scheme == "http" else -1)
        raw_path = parsed.path or "/"
        norm_path = posixpath.normpath(raw_path)
        if raw_path.endswith("/") and norm_path != "/":
            norm_path += "/"
        if not norm_path.startswith("/"):
            norm_path = "/" + norm_path

        for target in self.config.approved_targets:
            if scheme not in target.schemes:
                continue
            if host not in target.hosts:
                continue
            if port not in target.ports:
                continue
            path_allowed = any(
                (norm_path == "/" if prefix == "/" else norm_path.startswith(prefix))
                for prefix in target.allowed_path_prefixes
            )
            if not path_allowed:
                continue
            if any(pat.search(norm_path) for pat in self._blocked_patterns[target.name]):
                raise ScopeViolationError(f"Blocked path pattern matched for URL: {url}")
            return scheme, host, port, norm_path

        raise ScopeViolationError(f"Out-of-scope target blocked: {url}")

    def validate_redirect(self, base_url: str, location: str) -> str:
        resolved = urljoin(base_url, location)
        if self.config.safety_guards.block_external_redirects:
            self.validate_url(resolved)
        return resolved

    def validate_method_and_path(self, method: str, norm_path: str) -> None:
        upper_method = method.upper()
        lower_path = norm_path.lower()
        for kw in _DESTRUCTIVE_PATH_KEYWORDS:
            if f"/{kw}" in lower_path:
                raise DestructiveActionError(f"Destructive path keyword '{kw}' blocked: {norm_path}")

        if self.config.safety_guards.block_global_delete and upper_method == "DELETE":
            if norm_path.rstrip("/") in _GLOBAL_COLLECTION_PATHS or not norm_path.rstrip("/").endswith(
                tuple("0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_")
            ):
                raise DestructiveActionError(f"Global DELETE blocked: {norm_path}")
            # Require the final path segment to look like a specific synthetic resource ID
            last_seg = norm_path.rstrip("/").split("/")[-1]
            if not _ID_SEGMENT_RE.match(last_seg):
                raise DestructiveActionError(f"DELETE on non-resource collection path blocked: {norm_path}")

    def check_payload_budget(self, param_name: str, iteration_count: int) -> None:
        limit = self.config.safety_guards.max_payload_iterations_per_param
        if iteration_count > limit:
            raise DestructiveActionError(
                f"Payload budget exceeded for '{param_name}': {iteration_count} > {limit}"
            )


class _Bucket:
    def __init__(self, rate_rps: float, capacity: int) -> None:
        self.rate_rps = rate_rps
        self.capacity = float(capacity)
        self.tokens = float(capacity)
        self.last_refill = time.monotonic()

    def _refill(self, now: float) -> None:
        elapsed = max(0.0, now - self.last_refill)
        self.tokens = min(self.capacity, self.tokens + elapsed * self.rate_rps)
        self.last_refill = now

    def can_consume(self, now: float) -> bool:
        self._refill(now)
        return self.tokens >= 1.0

    def consume(self, now: float) -> None:
        self._refill(now)
        self.tokens = max(0.0, self.tokens - 1.0)


class TokenBucketRateLimiter:
    """Token-bucket rate limiter enforced per host and per canonical endpoint."""

    def __init__(self, config: RateLimitsConfig) -> None:
        self.config = config
        self._lock = threading.Lock()
        self._host_buckets: dict[str, _Bucket] = {}
        self._endpoint_buckets: dict[str, _Bucket] = {}

    def acquire(self, host: str, canonical_endpoint: str, pace: bool = False) -> None:
        endpoint_key = f"{host}:{canonical_endpoint}"
        while True:
            wait_seconds = 0.0
            with self._lock:
                now = time.monotonic()
                host_bucket = self._host_buckets.setdefault(
                    host, _Bucket(self.config.global_rps, self.config.burst_capacity)
                )
                ep_bucket = self._endpoint_buckets.setdefault(
                    endpoint_key, _Bucket(self.config.per_endpoint_rps, self.config.burst_capacity)
                )
                if host_bucket.can_consume(now) and ep_bucket.can_consume(now):
                    host_bucket.consume(now)
                    ep_bucket.consume(now)
                    return

                if not pace:
                    raise RateLimitBlockedError(
                        f"Rate limit burst blocked for host='{host}' endpoint='{canonical_endpoint}'"
                    )

                need_host = (1.0 - host_bucket.tokens) / host_bucket.rate_rps if host_bucket.tokens < 1.0 else 0.0
                need_ep = (1.0 - ep_bucket.tokens) / ep_bucket.rate_rps if ep_bucket.tokens < 1.0 else 0.0
                wait_seconds = min(1.0, max(0.01, max(need_host, need_ep)))
            time.sleep(wait_seconds)

    async def acquire_async(self, host: str, canonical_endpoint: str, pace: bool = False) -> None:
        endpoint_key = f"{host}:{canonical_endpoint}"
        while True:
            wait_seconds = 0.0
            with self._lock:
                now = time.monotonic()
                host_bucket = self._host_buckets.setdefault(
                    host, _Bucket(self.config.global_rps, self.config.burst_capacity)
                )
                ep_bucket = self._endpoint_buckets.setdefault(
                    endpoint_key, _Bucket(self.config.per_endpoint_rps, self.config.burst_capacity)
                )
                if host_bucket.can_consume(now) and ep_bucket.can_consume(now):
                    host_bucket.consume(now)
                    ep_bucket.consume(now)
                    return

                if not pace:
                    raise RateLimitBlockedError(
                        f"Rate limit burst blocked for host='{host}' endpoint='{canonical_endpoint}'"
                    )

                need_host = (1.0 - host_bucket.tokens) / host_bucket.rate_rps if host_bucket.tokens < 1.0 else 0.0
                need_ep = (1.0 - ep_bucket.tokens) / ep_bucket.rate_rps if ep_bucket.tokens < 1.0 else 0.0
                wait_seconds = min(1.0, max(0.01, max(need_host, need_ep)))
            await asyncio.sleep(wait_seconds)


class CircuitBreaker:
    """Tracks target p95 latency and 5xx ratio; trips EMERGENCY_PAUSE on strain."""

    def __init__(self, config: CircuitBreakerConfig) -> None:
        self.config = config
        self._lock = threading.Lock()
        self._samples: deque[tuple[float, bool]] = deque(maxlen=50)
        self._paused_until: float = 0.0
        self._trip_reason: str | None = None

    def check_ready(self) -> None:
        with self._lock:
            now = time.monotonic()
            if self._paused_until > now:
                remaining = round(self._paused_until - now, 2)
                raise CircuitBreakerOpenError(
                    f"EMERGENCY_PAUSE active ({self._trip_reason}); {remaining}s cooldown remaining"
                )
            if self._paused_until > 0.0 and now >= self._paused_until:
                # Auto-recover after cooldown with cleared window
                self._paused_until = 0.0
                self._trip_reason = None
                self._samples.clear()

    def record(self, latency_ms: float, status_code: int) -> None:
        with self._lock:
            self._samples.append((latency_ms, 500 <= status_code < 600))
            if len(self._samples) < self.config.min_sample_window:
                return
            latencies = sorted(item[0] for item in self._samples)
            p95_idx = max(0, math.ceil(0.95 * len(latencies)) - 1)
            p95_ms = latencies[p95_idx]
            err_ratio = sum(1 for item in self._samples if item[1]) / len(self._samples)

            if err_ratio >= self.config.max_5xx_ratio:
                self._paused_until = time.monotonic() + self.config.cooldown_seconds
                self._trip_reason = f"5xx ratio {err_ratio:.2f} >= {self.config.max_5xx_ratio:.2f}"
            elif p95_ms >= self.config.max_p95_latency_ms:
                self._paused_until = time.monotonic() + self.config.cooldown_seconds
                self._trip_reason = f"p95 latency {p95_ms:.1f}ms >= {self.config.max_p95_latency_ms:.1f}ms"

    def force_pause(self, reason: str, duration_seconds: float | None = None) -> None:
        with self._lock:
            dur = duration_seconds if duration_seconds is not None else self.config.cooldown_seconds
            self._paused_until = time.monotonic() + dur
            self._trip_reason = reason

    def reset(self) -> None:
        with self._lock:
            self._paused_until = 0.0
            self._trip_reason = None
            self._samples.clear()

    def status_snapshot(self) -> dict[str, Any]:
        with self._lock:
            now = time.monotonic()
            paused = self._paused_until > now
            latencies = sorted(item[0] for item in self._samples)
            p95_ms = latencies[max(0, math.ceil(0.95 * len(latencies)) - 1)] if latencies else 0.0
            err_ratio = (sum(1 for item in self._samples if item[1]) / len(self._samples)) if self._samples else 0.0
            return {
                "state": "EMERGENCY_PAUSE" if paused else "CLOSED",
                "trip_reason": self._trip_reason if paused else None,
                "sample_count": len(self._samples),
                "p95_latency_ms": round(p95_ms, 2),
                "five_xx_ratio": round(err_ratio, 3),
            }


class SafetyGateway:
    """Central deterministic policy, vault, rate-limit, circuit-breaker, and audit gate."""

    def __init__(
        self,
        scope_config: TargetScopeConfig,
        vault: TestCredentialVault,
        audit_logger: AuditLogger,
        login_transport: httpx.BaseTransport | None = None,
        async_login_transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.scope_config = scope_config
        self.validator = ScopeValidator(scope_config)
        self.rate_limiter = TokenBucketRateLimiter(scope_config.rate_limits)
        self.circuit_breaker = CircuitBreaker(scope_config.circuit_breaker)
        self.vault = vault
        self.audit = audit_logger
        self._login_transport = login_transport
        self._async_login_transport = async_login_transport
        self._metrics_lock = threading.Lock()
        self._allowed_count = 0
        self._blocked_count = 0
        self._approved_hitl_ids: set[str] = set()

    @classmethod
    def from_config_dir(
        cls,
        configs_dir: Path,
        base_dir: Path | None = None,
        login_transport: httpx.BaseTransport | None = None,
        async_login_transport: httpx.AsyncBaseTransport | None = None,
    ) -> SafetyGateway:
        root = base_dir or configs_dir.parent
        scope_cfg = load_scope_config(configs_dir / "target_scope.yaml")
        vault = TestCredentialVault(configs_dir / "credentials.vault.json")
        jsonl_path = root / scope_cfg.audit_log.jsonl_path
        sqlite_path = root / scope_cfg.audit_log.sqlite_path
        audit_logger = AuditLogger(jsonl_path=jsonl_path, sqlite_path=sqlite_path)
        return cls(
            scope_config=scope_cfg,
            vault=vault,
            audit_logger=audit_logger,
            login_transport=login_transport,
            async_login_transport=async_login_transport,
        )

    def approve_hitl(self, approval_id: str) -> None:
        with self._metrics_lock:
            self._approved_hitl_ids.add(approval_id)

    def revoke_hitl(self, approval_id: str) -> None:
        with self._metrics_lock:
            self._approved_hitl_ids.discard(approval_id)

    def _record_block(
        self,
        *,
        agent: str,
        actor: str,
        method: str,
        url: str,
        headers: dict[str, str],
        body: str,
        reason: str,
    ) -> None:
        with self._metrics_lock:
            self._blocked_count += 1
        rec = AuditRecord(
            trace_id=uuid.uuid4().hex,
            timestamp=datetime.now(timezone.utc).isoformat(),
            agent=agent,
            actor=actor,
            method=method.upper(),
            url=self.vault.scrub_all(url),
            sanitized_headers=self.vault.sanitize_headers(headers),
            body=self.vault.scrub_all(body),
            status=0,
            latency_ms=0.0,
            body_excerpt=self.vault.scrub_all(reason)[: self.scope_config.audit_log.max_body_excerpt_chars],
            decision=f"BLOCKED:{reason}",
        )
        self.audit.append(rec)

    def _login_via_gateway(self, cfg: ActorConfig, password: str, pace: bool = False) -> str:
        """Perform test-account login strictly through this SafetyGateway."""
        if not cfg.login_url or not cfg.username:
            raise ValueError("ActorConfig missing login_url or username")
        transport = SafeTransport(
            gateway=self,
            agent="credential_vault",
            actor="unauthenticated",
            pace=pace,
            inner_transport=self._login_transport,
        )
        with httpx.Client(transport=transport, follow_redirects=False, timeout=5.0) as client:
            resp = client.post(cfg.login_url, json={"username": cfg.username, "password": password})
        if resp.status_code != 200:
            raise RuntimeError(f"Vault login failed for '{cfg.username}' with status {resp.status_code}")
        data = resp.json()
        return str(data["access_token"])

    async def _login_via_gateway_async(self, cfg: ActorConfig, password: str, pace: bool = False) -> str:
        """Async test-account login strictly through this SafetyGateway."""
        if not cfg.login_url or not cfg.username:
            raise ValueError("ActorConfig missing login_url or username")
        transport = SafeAsyncTransport(
            gateway=self,
            agent="credential_vault",
            actor="unauthenticated",
            pace=pace,
            inner_transport=self._async_login_transport,
        )
        async with httpx.AsyncClient(transport=transport, follow_redirects=False, timeout=5.0) as client:
            resp = await client.post(cfg.login_url, json={"username": cfg.username, "password": password})
        if resp.status_code != 200:
            raise RuntimeError(f"Vault login failed for '{cfg.username}' with status {resp.status_code}")
        data = resp.json()
        return str(data["access_token"])

    def _validate_policy_only(
        self,
        *,
        method: str,
        url: str,
        risk_level: RiskLevel,
        hitl_approval_id: str | None,
    ) -> tuple[str, str]:
        self.circuit_breaker.check_ready()
        if risk_level in self.scope_config.safety_guards.hitl_required_risk_levels:
            with self._metrics_lock:
                approved = bool(hitl_approval_id and hitl_approval_id in self._approved_hitl_ids)
            if not approved:
                raise HITLApprovalRequiredError(
                    f"HITL approval required for risk_level='{risk_level}' on {method} {url}"
                )

        _, host, _, norm_path = self.validator.validate_url(url)
        self.validator.validate_method_and_path(method, norm_path)
        return host, canonicalize_path(norm_path)

    def _validate_pre_flight(
        self,
        *,
        method: str,
        url: str,
        risk_level: RiskLevel,
        hitl_approval_id: str | None,
        pace: bool,
    ) -> None:
        host, canonical = self._validate_policy_only(
            method=method, url=url, risk_level=risk_level, hitl_approval_id=hitl_approval_id
        )
        self.rate_limiter.acquire(host=host, canonical_endpoint=canonical, pace=pace)

    async def _validate_pre_flight_async(
        self,
        *,
        method: str,
        url: str,
        risk_level: RiskLevel,
        hitl_approval_id: str | None,
        pace: bool,
    ) -> None:
        host, canonical = self._validate_policy_only(
            method=method, url=url, risk_level=risk_level, hitl_approval_id=hitl_approval_id
        )
        await self.rate_limiter.acquire_async(host=host, canonical_endpoint=canonical, pace=pace)

    def prepare_request(
        self,
        *,
        method: str,
        url: str,
        headers: dict[str, str],
        body_text: str,
        agent: str,
        actor: str,
        risk_level: RiskLevel = "LOW",
        hitl_approval_id: str | None = None,
        pace: bool = False,
        inject_auth: bool = True,
    ) -> dict[str, str]:
        """Validate scope, HITL, destructive rules, circuit breaker, rate limit, and inject auth."""
        try:
            self._validate_pre_flight(
                method=method,
                url=url,
                risk_level=risk_level,
                hitl_approval_id=hitl_approval_id,
                pace=pace,
            )
            final_headers = dict(headers)
            if inject_auth:
                auth_headers = self.vault.resolve_auth_headers(
                    actor, login_fetcher=lambda cfg, pw: self._login_via_gateway(cfg, pw, pace=pace)
                )
                for k, v in auth_headers.items():
                    final_headers.setdefault(k, v)
            return final_headers
        except Exception as exc:
            self._record_block(
                agent=agent,
                actor=actor,
                method=method,
                url=url,
                headers=headers,
                body=body_text,
                reason=str(exc),
            )
            raise

    async def prepare_request_async(
        self,
        *,
        method: str,
        url: str,
        headers: dict[str, str],
        body_text: str,
        agent: str,
        actor: str,
        risk_level: RiskLevel = "LOW",
        hitl_approval_id: str | None = None,
        pace: bool = False,
        inject_auth: bool = True,
    ) -> dict[str, str]:
        """Async pre-flight validation and symbolic actor token injection."""
        try:
            await self._validate_pre_flight_async(
                method=method,
                url=url,
                risk_level=risk_level,
                hitl_approval_id=hitl_approval_id,
                pace=pace,
            )
            final_headers = dict(headers)
            if inject_auth:
                async def _fetch(cfg: ActorConfig, pw: str) -> str:
                    return await self._login_via_gateway_async(cfg, pw, pace=pace)

                auth_headers = await self.vault.resolve_auth_headers_async(
                    actor, login_fetcher=_fetch
                )
                for k, v in auth_headers.items():
                    final_headers.setdefault(k, v)
            return final_headers
        except Exception as exc:
            self._record_block(
                agent=agent,
                actor=actor,
                method=method,
                url=url,
                headers=headers,
                body=body_text,
                reason=str(exc),
            )
            raise

    def finalize_response(
        self,
        *,
        agent: str,
        actor: str,
        method: str,
        url: str,
        req_headers: dict[str, str],
        req_body_text: str,
        status_code: int,
        resp_headers: dict[str, str],
        resp_body_text: str,
        latency_ms: float,
    ) -> None:
        self.circuit_breaker.record(latency_ms=latency_ms, status_code=status_code)

        if 300 <= status_code < 400 and "location" in {k.lower(): v for k, v in resp_headers.items()}:
            location = next(v for k, v in resp_headers.items() if k.lower() == "location")
            try:
                self.validator.validate_redirect(url, location)
            except ScopeViolationError as exc:
                self._record_block(
                    agent=agent,
                    actor=actor,
                    method=method,
                    url=url,
                    headers=req_headers,
                    body=req_body_text,
                    reason=f"Redirect blocked -> {exc}",
                )
                raise

        with self._metrics_lock:
            self._allowed_count += 1

        max_chars = self.scope_config.audit_log.max_body_excerpt_chars
        rec = AuditRecord(
            trace_id=uuid.uuid4().hex,
            timestamp=datetime.now(timezone.utc).isoformat(),
            agent=agent,
            actor=actor,
            method=method.upper(),
            url=self.vault.scrub_all(url),
            sanitized_headers=self.vault.sanitize_headers(req_headers),
            body=self.vault.scrub_all(req_body_text)[:max_chars],
            status=status_code,
            latency_ms=round(latency_ms, 2),
            body_excerpt=self.vault.scrub_all(resp_body_text)[:max_chars],
            decision="ALLOWED",
        )
        self.audit.append(rec)

    def metrics(self) -> dict[str, Any]:
        with self._metrics_lock:
            allowed = self._allowed_count
            blocked = self._blocked_count
        return {
            "allowed_requests": allowed,
            "blocked_requests": blocked,
            "audit_total": self.audit.count_entries(),
            "circuit_breaker": self.circuit_breaker.status_snapshot(),
            "rate_limits": self.scope_config.rate_limits.model_dump(),
        }


def _extract_body_text(request: httpx.Request) -> str:
    try:
        raw = request.content
        return raw.decode("utf-8", errors="replace") if raw else ""
    except Exception:  # noqa: BLE001
        return "<streaming-body>"


def _extract_context_headers(
    headers: httpx.Headers,
    default_agent: str,
    default_actor: str,
    default_risk: RiskLevel,
    default_pace: bool,
) -> tuple[str, str, RiskLevel, str | None, bool, dict[str, str]]:
    clean: dict[str, str] = {}
    agent = default_agent
    actor = default_actor
    risk: RiskLevel = default_risk
    hitl_id: str | None = None
    pace = default_pace

    for k, v in headers.items():
        lk = k.lower()
        if lk == "x-dast-agent":
            agent = v
        elif lk == "x-dast-actor":
            actor = v
        elif lk == "x-dast-risk-level" and v in ("LOW", "MEDIUM", "HIGH", "CRITICAL"):
            risk = v  # type: ignore[assignment]
        elif lk == "x-dast-hitl-id":
            hitl_id = v
        elif lk == "x-dast-pace":
            pace = v.lower() == "true"
        else:
            clean[k] = v
    return agent, actor, risk, hitl_id, pace, clean


class SafeTransport(httpx.BaseTransport):
    """Synchronous httpx transport enforcing SafetyGateway on every request."""

    def __init__(
        self,
        gateway: SafetyGateway,
        agent: str = "dast_agent",
        actor: str = "unauthenticated",
        risk_level: RiskLevel = "LOW",
        pace: bool = False,
        inner_transport: httpx.BaseTransport | None = None,
    ) -> None:
        self.gateway = gateway
        self.agent = agent
        self.actor = actor
        self.risk_level: RiskLevel = risk_level
        self.pace = pace
        self._inner = inner_transport or httpx.HTTPTransport()

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        agent, actor, risk, hitl_id, pace, clean_headers = _extract_context_headers(
            request.headers, self.agent, self.actor, self.risk_level, self.pace
        )
        body_text = _extract_body_text(request)
        final_headers = self.gateway.prepare_request(
            method=request.method,
            url=str(request.url),
            headers=clean_headers,
            body_text=body_text,
            agent=agent,
            actor=actor,
            risk_level=risk,
            hitl_approval_id=hitl_id,
            pace=pace,
        )
        forwarded = httpx.Request(
            method=request.method,
            url=request.url,
            headers=final_headers,
            content=request.content,
        )
        t0 = time.perf_counter()
        response = self._inner.handle_request(forwarded)
        latency_ms = (time.perf_counter() - t0) * 1000.0
        resp_bytes = response.read()
        resp_text = resp_bytes.decode("utf-8", errors="replace")

        self.gateway.finalize_response(
            agent=agent,
            actor=actor,
            method=request.method,
            url=str(request.url),
            req_headers=final_headers,
            req_body_text=body_text,
            status_code=response.status_code,
            resp_headers=dict(response.headers),
            resp_body_text=resp_text,
            latency_ms=latency_ms,
        )
        return httpx.Response(
            status_code=response.status_code,
            headers=response.headers,
            content=resp_bytes,
            request=forwarded,
        )

    def close(self) -> None:
        self._inner.close()


class SafeAsyncTransport(httpx.AsyncBaseTransport):
    """Asynchronous httpx transport enforcing SafetyGateway on every request."""

    def __init__(
        self,
        gateway: SafetyGateway,
        agent: str = "dast_agent",
        actor: str = "unauthenticated",
        risk_level: RiskLevel = "LOW",
        pace: bool = False,
        inner_transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.gateway = gateway
        self.agent = agent
        self.actor = actor
        self.risk_level: RiskLevel = risk_level
        self.pace = pace
        self._inner = inner_transport or httpx.AsyncHTTPTransport()

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        agent, actor, risk, hitl_id, pace, clean_headers = _extract_context_headers(
            request.headers, self.agent, self.actor, self.risk_level, self.pace
        )
        body_text = _extract_body_text(request)
        final_headers = await self.gateway.prepare_request_async(
            method=request.method,
            url=str(request.url),
            headers=clean_headers,
            body_text=body_text,
            agent=agent,
            actor=actor,
            risk_level=risk,
            hitl_approval_id=hitl_id,
            pace=pace,
        )
        forwarded = httpx.Request(
            method=request.method,
            url=request.url,
            headers=final_headers,
            content=request.content,
        )
        t0 = time.perf_counter()
        response = await self._inner.handle_async_request(forwarded)
        latency_ms = (time.perf_counter() - t0) * 1000.0
        resp_bytes = await response.aread()
        resp_text = resp_bytes.decode("utf-8", errors="replace")

        self.gateway.finalize_response(
            agent=agent,
            actor=actor,
            method=request.method,
            url=str(request.url),
            req_headers=final_headers,
            req_body_text=body_text,
            status_code=response.status_code,
            resp_headers=dict(response.headers),
            resp_body_text=resp_text,
            latency_ms=latency_ms,
        )
        return httpx.Response(
            status_code=response.status_code,
            headers=response.headers,
            content=resp_bytes,
            request=forwarded,
        )

    async def aclose(self) -> None:
        await self._inner.aclose()


class SafeClient(httpx.Client):
    """Sync httpx.Client locked to SafeTransport with auto-redirects disabled."""

    def __init__(
        self,
        gateway: SafetyGateway,
        agent: str = "dast_agent",
        actor: str = "unauthenticated",
        risk_level: RiskLevel = "LOW",
        pace: bool = False,
        inner_transport: httpx.BaseTransport | None = None,
        **kwargs: Any,
    ) -> None:
        kwargs["follow_redirects"] = False
        transport = SafeTransport(
            gateway=gateway,
            agent=agent,
            actor=actor,
            risk_level=risk_level,
            pace=pace,
            inner_transport=inner_transport,
        )
        super().__init__(transport=transport, **kwargs)


class SafeAsyncClient(httpx.AsyncClient):
    """Async httpx.Client locked to SafeAsyncTransport with auto-redirects disabled."""

    def __init__(
        self,
        gateway: SafetyGateway,
        agent: str = "dast_agent",
        actor: str = "unauthenticated",
        risk_level: RiskLevel = "LOW",
        pace: bool = False,
        inner_transport: httpx.AsyncBaseTransport | None = None,
        **kwargs: Any,
    ) -> None:
        kwargs["follow_redirects"] = False
        transport = SafeAsyncTransport(
            gateway=gateway,
            agent=agent,
            actor=actor,
            risk_level=risk_level,
            pace=pace,
            inner_transport=inner_transport,
        )
        super().__init__(transport=transport, **kwargs)


def create_playwright_route_handler(
    gateway: SafetyGateway,
    agent: str = "recon_playwright",
    actor: str = "unauthenticated",
) -> Callable[[Any], Awaitable[None]]:
    """Build a Playwright page.route('**/*', ...) handler enforced by SafetyGateway."""

    async def _handle_route(route: Any) -> None:
        req = route.request
        url = str(req.url)
        method = str(req.method)
        headers = dict(req.headers)
        body_text = str(req.post_data or "")
        try:
            final_headers = await gateway.prepare_request_async(
                method=method,
                url=url,
                headers=headers,
                body_text=body_text,
                agent=agent,
                actor=actor,
                pace=True,
                inject_auth=True,
            )
        except Exception:  # noqa: BLE001
            await route.abort("blockedbyclient")
            return

        if hasattr(route, "fetch") and hasattr(route, "fulfill"):
            t0 = time.perf_counter()
            api_resp = await route.fetch(headers=final_headers, max_redirects=0)
            latency_ms = (time.perf_counter() - t0) * 1000.0
            resp_text = await api_resp.text()
            try:
                gateway.finalize_response(
                    agent=agent,
                    actor=actor,
                    method=method,
                    url=url,
                    req_headers=final_headers,
                    req_body_text=body_text,
                    status_code=int(api_resp.status),
                    resp_headers=dict(api_resp.headers),
                    resp_body_text=resp_text,
                    latency_ms=latency_ms,
                )
            except ScopeViolationError:
                await route.abort("blockedbyclient")
                return
            await route.fulfill(response=api_resp)
            return

        await route.continue_(headers=final_headers)

    return _handle_route
