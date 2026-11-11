"""Unit & integration tests for ReconAgent (Phase 2)."""

from __future__ import annotations

import socket
import threading
import time
from pathlib import Path

import httpx
import uvicorn

from graph.knowledge_graph import AppKnowledgeGraph
from mock_tbo_target.app import create_app
from recon.crawler import ReconAgent, extract_api_paths_from_js, normalize_path
from safety.audit import AuditLogger
from safety.gateway import SafetyGateway, load_scope_config
from safety.vault import TestCredentialVault

BASE_DIR = Path(__file__).resolve().parent.parent
CONFIGS_DIR = BASE_DIR / "configs"
LOGS_PATH = BASE_DIR / "mock_tbo_target" / "sample_gateway_logs.jsonl"


def _make_gateway(tmp_path: Path, app: object | None = None) -> tuple[SafetyGateway, httpx.AsyncBaseTransport | None]:
    scope_cfg = load_scope_config(CONFIGS_DIR / "target_scope.yaml")
    vault = TestCredentialVault(CONFIGS_DIR / "credentials.vault.json")
    audit = AuditLogger(tmp_path / "audit.jsonl", tmp_path / "audit.db")
    asgi = httpx.ASGITransport(app=app) if app is not None else None
    gw = SafetyGateway(scope_cfg, vault, audit, async_login_transport=asgi)
    return gw, asgi


def test_js_extraction_and_path_normalization() -> None:
    js_sample = """
    const url1 = "/api/v3/bookings/88412";
    fetch(`/api/v3/bookings/${bookingId}/pay`);
    // comment ignored
    const legacy = '/api/v1/bookings/1001';
    """
    routes = extract_api_paths_from_js(js_sample)
    assert "/api/v3/bookings/{id}" in routes
    assert "/api/v3/bookings/{id}/pay" in routes
    assert "/api/v1/bookings/{id}" in routes
    assert normalize_path("/api/v3/bookings/88412") == "/api/v3/bookings/{id}"


async def test_recon_full_discovery_against_mock_target(tmp_path: Path) -> None:
    app = create_app("v1.1")
    gw, asgi = _make_gateway(tmp_path, app=app)
    kg = AppKnowledgeGraph(CONFIGS_DIR / "ownership.json")
    recon = ReconAgent(gateway=gw, graph=kg, async_transport=asgi)

    result = await recon.run_full_discovery(use_playwright=False, gateway_logs_path=LOGS_PATH)
    assert result.discovered_endpoints >= 10
    assert set(result.crawled_roles) == {"agency_a_admin", "agency_a_subagent", "agency_b_admin"}
    assert "/api/v1/bookings/{id}" in result.probed_legacy_hits

    endpoints = {(ep.method, ep.canonical_path): ep for ep in kg.list_endpoints()}
    assert ("GET", "/api/v3/search") in endpoints
    assert ("POST", "/api/v3/bookings") in endpoints
    assert ("GET", "/api/v1/bookings/{id}") in endpoints
    assert ("GET", "/internal/shadow-export") in endpoints
    # 404 scanner noise must NOT enter Knowledge Graph
    assert ("GET", "/wp-login.php") not in endpoints
    assert ("GET", "/.env") not in endpoints


async def test_recon_playwright_real_chromium_crawl(tmp_path: Path) -> None:
    # Check port 8001 availability; skip cleanly only if already bound externally
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        if s.connect_ex(("127.0.0.1", 8001)) == 0:
            return

    app = create_app("v1.1")
    config = uvicorn.Config(app, host="127.0.0.1", port=8001, log_level="error")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    for _ in range(40):
        if server.started:
            break
        time.sleep(0.05)

    try:
        gw, _ = _make_gateway(tmp_path, app=None)
        kg = AppKnowledgeGraph(CONFIGS_DIR / "ownership.json")
        recon = ReconAgent(gateway=gw, graph=kg, base_url="http://127.0.0.1:8001")

        crawled = await recon.discover_from_ui_playwright(roles=["agency_a_admin"])
        assert crawled == ["agency_a_admin"]
        assert gw.metrics()["allowed_requests"] >= 6

        endpoints = kg.list_endpoints()
        pw_paths = {(ep.method, ep.canonical_path) for ep in endpoints if "playwright_ui" in ep.sources}
        assert ("POST", "/api/v3/auth/login") in pw_paths
        assert ("GET", "/api/v3/search") in pw_paths
        assert ("GET", "/api/v3/bookings") in pw_paths
        assert ("GET", "/api/v3/users/me") in pw_paths

        search_ep = kg.get_endpoint("GET", "/api/v3/search")
        assert search_ep is not None
        assert search_ep.params.get("city") == "query"
        assert "results" in search_ep.response_fields

        hold_ep = kg.get_endpoint("POST", "/api/v3/holds")
        assert hold_ep is not None
        assert hold_ep.params.get("item_id") == "body"
        assert "hold_id" in hold_ep.response_fields
    finally:
        server.should_exit = True
        thread.join(timeout=3.0)


def test_har_and_nginx_access_log_ingestion(tmp_path: Path) -> None:
    import json

    har_file = tmp_path / "journey.har"
    har_doc = {
        "log": {
            "version": "1.2",
            "entries": [
                {
                    "startedDateTime": "2026-11-11T10:00:00Z",
                    "request": {
                        "method": "POST",
                        "url": "https://staging.example.test/api/v3/bookings?currency=USD",
                        "headers": [{"name": "User-Agent", "value": "Mozilla/5.0"}],
                        "queryString": [{"name": "currency", "value": "USD"}],
                        "postData": {"text": json.dumps({"hold_id": "H1", "traveller_name": "Test"})},
                    },
                    "response": {
                        "status": 200,
                        "content": {"text": json.dumps({"booking_id": "BK-9", "total_fare": 150.0})},
                    },
                },
                {
                    "startedDateTime": "2026-11-11T10:00:01Z",
                    "request": {"method": "GET", "url": "https://staging.example.test/assets/app.js"},
                    "response": {"status": 200},
                },
                {
                    "startedDateTime": "2026-11-11T10:00:02Z",
                    "request": {"method": "GET", "url": "https://staging.example.test/wp-login.php"},
                    "response": {"status": 404},
                },
            ],
        }
    }
    har_file.write_text(json.dumps(har_doc), encoding="utf-8")

    kg = AppKnowledgeGraph(CONFIGS_DIR / "ownership.json")
    gw, _ = _make_gateway(tmp_path, app=None)
    recon = ReconAgent(gateway=gw, graph=kg)
    count = recon.ingest_har_or_gateway_logs(har_file)
    assert count == 1

    ep = next(e for e in kg.list_endpoints() if e.canonical_path == "/api/v3/bookings")
    assert set(ep.params) == {"currency", "hold_id", "traveller_name"}
    assert set(ep.response_fields) == {"booking_id", "total_fare"}

    nginx_file = tmp_path / "access.log"
    nginx_file.write_text(
        '10.0.0.1 - - [11/Nov/2026:10:05:00 +0000] "GET /internal/partner-sync?page=2 HTTP/1.1" 200 128 "-" "partner-cron/2.1"\n'
        '10.0.0.2 - - [11/Nov/2026:10:05:05 +0000] "GET /.env HTTP/1.1" 404 19 "-" "bot/1.0"\n',
        encoding="utf-8",
    )
    nginx_count = recon.ingest_har_or_gateway_logs(nginx_file)
    assert nginx_count == 1
    assert any(e.canonical_path == "/internal/partner-sync" for e in kg.list_endpoints())
