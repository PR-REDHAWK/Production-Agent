"""Unit tests for change triggers (deploy webhooks, JS bundle watcher, log delta watcher)."""

from __future__ import annotations

import json
from pathlib import Path

import httpx

from mock_tbo_target.app import create_app
from safety.audit import AuditLogger
from safety.gateway import SafetyGateway, load_scope_config
from safety.vault import TestCredentialVault
from triggers.watchers import (
    BundleWatcher,
    DNSCertWatcher,
    DeployWebhookEvent,
    LogDeltaWatcher,
    extract_delta_paths_from_deploy,
)

BASE_DIR = Path(__file__).resolve().parent.parent
CONFIGS_DIR = BASE_DIR / "configs"


def test_deploy_webhook_path_normalization() -> None:
    ev = DeployWebhookEvent(
        commit="abc1234",
        changed_services=["bookings", "/api/v3/bookings/88412/pay"],
        release_notes="Updated /api/v3/suppliers/webhook-test handler",
        environment="staging",
    )
    paths = extract_delta_paths_from_deploy(ev)
    assert "/api/v3/bookings/{id}/pay" in paths
    assert "/api/v3/suppliers/webhook-test" in paths
    assert "/api/v3/bookings" in paths


async def test_bundle_watcher_detects_v10_to_v11_diff(tmp_path: Path) -> None:
    app = create_app("v1.0")
    asgi = httpx.ASGITransport(app=app)
    gw = SafetyGateway(
        load_scope_config(CONFIGS_DIR / "target_scope.yaml"),
        TestCredentialVault(CONFIGS_DIR / "credentials.vault.json"),
        AuditLogger(tmp_path / "audit.jsonl", tmp_path / "audit.db"),
        async_login_transport=asgi,
    )
    watcher = BundleWatcher(gw, async_transport=asgi)

    first = await watcher.poll_once()
    assert first is not None and first.trigger_type == "bundle_diff"

    # No change -> None
    assert await watcher.poll_once() is None

    # Switch mock target to v1.1 -> JS bundle hash changes
    app.state.sim.version = "v1.1"
    changed = await watcher.poll_once()
    assert changed is not None
    assert "JS bundle hash changed" in changed.summary


def test_log_delta_and_dns_watchers(tmp_path: Path) -> None:
    log_file = tmp_path / "gw.jsonl"
    log_file.write_text(
        json.dumps({"method": "GET", "path": "/api/v3/search", "status": 200}) + "\n",
        encoding="utf-8",
    )
    watcher = LogDeltaWatcher(log_file)
    ev1 = watcher.poll_once()
    assert ev1 is not None and ev1.delta_paths == ["/api/v3/search"]

    with log_file.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps({"method": "GET", "path": "/wp-login.php", "status": 404}) + "\n")
        fh.write(json.dumps({"method": "GET", "path": "/internal/shadow-export", "status": 200}) + "\n")

    ev2 = watcher.poll_once()
    assert ev2 is not None
    assert ev2.delta_paths == ["/internal/shadow-export"]

    gw = SafetyGateway(
        load_scope_config(CONFIGS_DIR / "target_scope.yaml"),
        TestCredentialVault(CONFIGS_DIR / "credentials.vault.json"),
        AuditLogger(tmp_path / "audit.jsonl", tmp_path / "audit.db"),
    )
    dns = DNSCertWatcher(gw)
    assert dns.poll_once() is None


def test_dns_cert_watcher_detects_resolution_change(tmp_path: Path, monkeypatch) -> None:
    gw = SafetyGateway(
        load_scope_config(CONFIGS_DIR / "target_scope.yaml"),
        TestCredentialVault(CONFIGS_DIR / "credentials.vault.json"),
        AuditLogger(tmp_path / "audit.jsonl", tmp_path / "audit.db"),
    )
    watcher = DNSCertWatcher(gw, probe_network=True)

    current_ip = ["127.0.0.1"]

    def _fake_getaddrinfo(host: str, port: int, type: int = 0):
        return [(2, 1, 6, "", (current_ip[0], port))]

    monkeypatch.setattr("triggers.watchers.socket.getaddrinfo", _fake_getaddrinfo)
    # Baseline poll establishes snapshot
    assert watcher.poll_once() is None
    assert watcher.poll_once() is None

    # DNS IP shift triggers ChangeEvent
    current_ip[0] = "127.0.0.2"
    ev = watcher.poll_once()
    assert ev is not None
    assert ev.trigger_type == "dns_cert"
    assert "127.0.0.2" in ev.summary
