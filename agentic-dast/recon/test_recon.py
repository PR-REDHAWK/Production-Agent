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
        assert gw.metrics()["allowed_requests"] >= 2
    finally:
        server.should_exit = True
        thread.join(timeout=3.0)
