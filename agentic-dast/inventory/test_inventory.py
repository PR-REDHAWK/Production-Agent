"""Unit & integration tests for Active / Zombie / Shadow InventoryAgent (Phase 2)."""

from __future__ import annotations

from pathlib import Path

import httpx

from graph.knowledge_graph import AppKnowledgeGraph
from inventory.classifier import InventoryAgent
from mock_tbo_target.app import create_app
from recon.crawler import ReconAgent
from safety.audit import AuditLogger
from safety.gateway import SafetyGateway, load_scope_config
from safety.vault import TestCredentialVault

BASE_DIR = Path(__file__).resolve().parent.parent
CONFIGS_DIR = BASE_DIR / "configs"
OWNERSHIP_PATH = CONFIGS_DIR / "ownership.json"
LOGS_PATH = BASE_DIR / "mock_tbo_target" / "sample_gateway_logs.jsonl"


async def test_inventory_classifies_active_zombie_and_shadow(tmp_path: Path) -> None:
    app = create_app("v1.1")
    asgi = httpx.ASGITransport(app=app)
    gw = SafetyGateway(
        load_scope_config(CONFIGS_DIR / "target_scope.yaml"),
        TestCredentialVault(CONFIGS_DIR / "credentials.vault.json"),
        AuditLogger(tmp_path / "audit.jsonl", tmp_path / "audit.db"),
        async_login_transport=asgi,
    )
    kg = AppKnowledgeGraph(OWNERSHIP_PATH)
    recon = ReconAgent(gateway=gw, graph=kg, async_transport=asgi)
    await recon.run_full_discovery(use_playwright=False, gateway_logs_path=LOGS_PATH)

    inv = InventoryAgent(
        gateway=gw,
        graph=kg,
        ownership_path=OWNERSHIP_PATH,
        async_transport=asgi,
    )
    report = await inv.classify(LOGS_PATH)

    assert report.active_count >= 8
    assert report.zombie_count >= 1
    assert report.shadow_count >= 1

    by_path = {(e.method, e.canonical_path): e for e in report.entries}

    zombie = by_path[("GET", "/api/v1/bookings/{id}")]
    assert zombie.classification == "Zombie"
    assert zombie.hit_count_90d == 0
    assert zombie.last_seen_timestamp is None
    assert zombie.reachable_without_auth is True
    assert "passport" in zombie.pii_exposed
    assert zombie.security_regression is not None
    assert zombie.likely_owner == "legacy-bookings-team"
    assert zombie.recommendation == "DECOMMISSION"

    shadow = by_path[("GET", "/internal/shadow-export")]
    assert shadow.classification == "Shadow"
    assert shadow.hit_count_90d > 0
    assert shadow.last_seen_timestamp is not None
    assert shadow.reachable_without_auth is True
    assert "passport" in shadow.pii_exposed
    assert shadow.recommendation == "RESTRICT"

    active = by_path[("GET", "/api/v3/search")]
    assert active.classification == "Active"
    assert active.hit_count_90d == 90


async def test_inventory_supports_har_traffic_logs(tmp_path: Path) -> None:
    import json

    app = create_app("v1.1")
    asgi = httpx.ASGITransport(app=app)
    gw = SafetyGateway(
        load_scope_config(CONFIGS_DIR / "target_scope.yaml"),
        TestCredentialVault(CONFIGS_DIR / "credentials.vault.json"),
        AuditLogger(tmp_path / "audit.jsonl", tmp_path / "audit.db"),
        async_login_transport=asgi,
    )
    har_path = tmp_path / "staging.har"
    har_path.write_text(
        json.dumps(
            {
                "log": {
                    "version": "1.2",
                    "entries": [
                        {
                            "startedDateTime": "2026-11-11T11:00:00Z",
                            "request": {
                                "method": "GET",
                                "url": "http://127.0.0.1:8001/internal/shadow-export",
                                "headers": [{"name": "User-Agent", "value": "har-cron/1.0"}],
                            },
                            "response": {"status": 200},
                        }
                    ],
                }
            }
        ),
        encoding="utf-8",
    )
    kg = AppKnowledgeGraph(OWNERSHIP_PATH)
    recon = ReconAgent(gateway=gw, graph=kg, async_transport=asgi)
    recon.ingest_har_or_gateway_logs(har_path)

    inv = InventoryAgent(gateway=gw, graph=kg, ownership_path=OWNERSHIP_PATH, async_transport=asgi)
    report = await inv.classify(har_path)
    shadow = next(e for e in report.entries if e.canonical_path == "/internal/shadow-export")
    assert shadow.classification == "Shadow"
    assert shadow.last_seen_timestamp == "2026-11-11T11:00:00Z"
    assert shadow.reachable_without_auth is True
