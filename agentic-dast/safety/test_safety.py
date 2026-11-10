"""Unit and integration tests for SafetyGateway (Phase 1, Step 2).

Proves fail-closed config, out-of-scope & redirect blocking, rate burst blocking,
circuit breaker EMERGENCY_PAUSE, destructive action guards, HITL gates,
credential vault isolation, and immutable JSONL + SQLite audit logging.
"""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

import httpx
import pytest

from mock_tbo_target.app import create_app
from safety.audit import AuditLogger
from safety.gateway import (
    SafeAsyncClient,
    SafeClient,
    SafetyGateway,
    create_playwright_route_handler,
    load_scope_config,
)
from safety.models import (
    CircuitBreakerOpenError,
    DestructiveActionError,
    HITLApprovalRequiredError,
    RateLimitBlockedError,
    SafetyConfigError,
    SafetyCredentialError,
    ScopeViolationError,
)
from safety.vault import TestCredentialVault

CONFIGS_DIR = Path(__file__).resolve().parent.parent / "configs"


def _make_gateway(
    tmp_path: Path,
    mock_handler: httpx.MockTransport | None = None,
    async_transport: httpx.AsyncBaseTransport | None = None,
) -> SafetyGateway:
    scope_cfg = load_scope_config(CONFIGS_DIR / "target_scope.yaml")
    vault = TestCredentialVault(CONFIGS_DIR / "credentials.vault.json")
    audit = AuditLogger(
        jsonl_path=tmp_path / "audit_log.jsonl",
        sqlite_path=tmp_path / "audit_log.db",
    )
    return SafetyGateway(
        scope_config=scope_cfg,
        vault=vault,
        audit_logger=audit,
        login_transport=mock_handler,
        async_login_transport=async_transport,
    )


def test_fail_closed_invalid_configs(tmp_path: Path) -> None:
    with pytest.raises(SafetyConfigError):
        load_scope_config(tmp_path / "nonexistent.yaml")

    bad_yaml = tmp_path / "bad_scope.yaml"
    bad_yaml.write_text("environment: test\napproved_targets: []\n", encoding="utf-8")
    with pytest.raises(SafetyConfigError):
        load_scope_config(bad_yaml)

    with pytest.raises(SafetyConfigError):
        TestCredentialVault(tmp_path / "missing_vault.json")


def test_out_of_scope_urls_and_external_redirects_blocked(tmp_path: Path) -> None:
    def _handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/v3/redirect-evil":
            return httpx.Response(302, headers={"Location": "https://evil.example.com/steal"})
        return httpx.Response(200, json={"ok": True})

    gw = _make_gateway(tmp_path, mock_handler=httpx.MockTransport(_handler))
    client = SafeClient(gw, agent="test_agent", actor="unauthenticated", inner_transport=httpx.MockTransport(_handler))

    blocked_urls = [
        "https://evil.example.com/api/v3/search",
        "http://127.0.0.1:9999/api/v3/search",
        "http://127.0.0.1:8001/api/../etc/passwd",
        "http://127.0.0.1:8001/unexpected-admin",
        "http://user:pass@127.0.0.1:8001/api/v3/search",
        "http://127.0.0.1:8001/admin/destroy",
    ]
    for url in blocked_urls:
        with pytest.raises(ScopeViolationError):
            client.get(url)

    # Local OOB canary allowed
    canary_resp = client.get("http://127.0.0.1:8002/canary/probe-1")
    assert canary_resp.status_code == 200

    # External 302 redirect blocked
    with pytest.raises(ScopeViolationError):
        client.get("http://127.0.0.1:8001/api/v3/redirect-evil")

    assert gw.metrics()["blocked_requests"] == len(blocked_urls) + 1


def test_rate_bursts_blocked_per_host_and_canonical_endpoint(tmp_path: Path) -> None:
    mock = httpx.MockTransport(lambda req: httpx.Response(200, json={"ok": True}))
    gw = _make_gateway(tmp_path, mock_handler=mock)
    client = SafeClient(gw, agent="burst_agent", actor="unauthenticated", inner_transport=mock)

    # burst_capacity in target_scope.yaml is 10 -> 11th instantaneous call to same canonical endpoint must block
    for idx in range(10):
        resp = client.get(f"http://127.0.0.1:8001/api/v3/bookings/{1000 + idx}")
        assert resp.status_code == 200

    with pytest.raises(RateLimitBlockedError):
        client.get("http://127.0.0.1:8001/api/v3/bookings/9999")

    assert gw.metrics()["blocked_requests"] >= 1


def test_circuit_breaker_trips_on_5xx_and_latency_spike(tmp_path: Path) -> None:
    mock_500 = httpx.MockTransport(lambda req: httpx.Response(503, text="overloaded"))
    gw = _make_gateway(tmp_path, mock_handler=mock_500)
    client = SafeClient(gw, agent="cb_agent", actor="unauthenticated", pace=True, inner_transport=mock_500)

    # min_sample_window is 10, max_5xx_ratio is 0.25 -> after 10 503s, breaker opens
    for idx in range(10):
        resp = client.get(f"http://127.0.0.1:8001/api/v3/search?q={idx}")
        assert resp.status_code == 503

    assert gw.circuit_breaker.status_snapshot()["state"] == "EMERGENCY_PAUSE"
    with pytest.raises(CircuitBreakerOpenError):
        client.get("http://127.0.0.1:8001/api/v3/search?q=after")

    gw.circuit_breaker.reset()
    # Latency spike directly recorded
    for _ in range(10):
        gw.circuit_breaker.record(latency_ms=2500.0, status_code=200)
    assert gw.circuit_breaker.status_snapshot()["state"] == "EMERGENCY_PAUSE"


def test_destructive_guard_and_hitl_gate(tmp_path: Path) -> None:
    mock = httpx.MockTransport(lambda req: httpx.Response(200, json={"ok": True}))
    gw = _make_gateway(tmp_path, mock_handler=mock)
    client = SafeClient(gw, agent="guard_agent", actor="unauthenticated", inner_transport=mock)

    with pytest.raises(DestructiveActionError):
        client.delete("http://127.0.0.1:8001/api/v3/bookings")

    with pytest.raises(DestructiveActionError):
        gw.validator.check_payload_budget("fare", 99)

    # Specific resource ID delete allowed past destructive check
    assert client.delete("http://127.0.0.1:8001/api/v3/bookings/1001").status_code == 200

    # HIGH risk blocked without HITL approval
    with pytest.raises(HITLApprovalRequiredError):
        client.post(
            "http://127.0.0.1:8001/api/v3/bookings/1001/refund",
            headers={"X-DAST-Risk-Level": "HIGH"},
        )

    gw.approve_hitl("HITL-42")
    ok = client.post(
        "http://127.0.0.1:8001/api/v3/bookings/1001/refund",
        headers={"X-DAST-Risk-Level": "HIGH", "X-DAST-HITL-ID": "HITL-42"},
    )
    assert ok.status_code == 200


async def test_credential_vault_isolation_and_audit_log_with_mock_target(tmp_path: Path) -> None:
    app = create_app("v1.0")
    asgi = httpx.ASGITransport(app=app)
    gw = _make_gateway(tmp_path, async_transport=asgi)

    # Unknown actor fails closed
    bad_client = SafeAsyncClient(gw, agent="recon", actor="unknown_actor", inner_transport=asgi)
    with pytest.raises(SafetyCredentialError):
        await bad_client.get("http://127.0.0.1:8001/api/v3/bookings/1001")
    await bad_client.aclose()

    # Valid symbolic actor resolves token via gateway login and scrubs secrets from audit logs
    alpha_client = SafeAsyncClient(gw, agent="idor_tester", actor="agency_a_admin", inner_transport=asgi)
    resp = await alpha_client.get("http://127.0.0.1:8001/api/v3/bookings/1001")
    assert resp.status_code == 200
    assert resp.json()["agency_id"] == "AGENCY_ALPHA"
    await alpha_client.aclose()

    jsonl_text = (tmp_path / "audit_log.jsonl").read_text(encoding="utf-8")
    assert "synth-alpha-admin-pass" not in jsonl_text
    assert "eyJ" not in jsonl_text

    records = [json.loads(line) for line in jsonl_text.splitlines()]
    allowed_booking_logs = [r for r in records if r["url"].endswith("/bookings/1001") and r["decision"] == "ALLOWED"]
    assert len(allowed_booking_logs) == 1
    assert allowed_booking_logs[0]["sanitized_headers"]["Authorization"] == "<REDACTED>"

    # SQLite WAL table matches JSONL record count
    with sqlite3.connect(str(tmp_path / "audit_log.db")) as conn:
        db_count = conn.execute("SELECT COUNT(*) FROM audit_logs;").fetchone()[0]
    assert db_count == len(records)


async def test_playwright_route_handler_enforces_scope_and_auth(tmp_path: Path) -> None:
    gw = _make_gateway(tmp_path)
    gw.vault.set_token("agency_a_admin", "synthetic-pw-token-123")
    handler = create_playwright_route_handler(gw, agent="recon_playwright", actor="agency_a_admin")

    class _FakeReq:
        def __init__(self, url: str) -> None:
            self.url = url
            self.method = "GET"
            self.headers = {"Accept": "application/json"}
            self.post_data = None

    class _FakeRoute:
        def __init__(self, url: str) -> None:
            self.request = _FakeReq(url)
            self.aborted: str | None = None
            self.continued_headers: dict[str, str] | None = None

        async def abort(self, code: str) -> None:
            self.aborted = code

        async def continue_(self, headers: dict[str, str]) -> None:
            self.continued_headers = headers

    evil_route = _FakeRoute("https://analytics.thirdparty.invalid/collect.js")
    await handler(evil_route)
    assert evil_route.aborted == "blockedbyclient"
    assert evil_route.continued_headers is None

    valid_route = _FakeRoute("http://127.0.0.1:8001/api/v3/search")
    await handler(valid_route)
    assert valid_route.aborted is None
    assert valid_route.continued_headers is not None
    assert valid_route.continued_headers["Authorization"] == "Bearer synthetic-pw-token-123"
