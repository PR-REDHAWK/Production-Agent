"""Change triggers (deploy webhook, JS bundle diff watcher, log delta watcher, DNS/cert watcher)."""

from __future__ import annotations

import hashlib
import json
import re
import socket
import ssl
from pathlib import Path
from typing import Literal

import httpx
from pydantic import BaseModel, Field

from recon.crawler import (
    extract_api_paths_from_js,
    extract_script_urls_from_html,
    normalize_path,
    parse_traffic_records,
)
from safety.gateway import SafeAsyncClient, SafetyGateway

_PATH_HINT_RE = re.compile(r"(/[A-Za-z0-9_./{}-]+)")


class DeployWebhookEvent(BaseModel):
    commit: str
    changed_services: list[str] = Field(default_factory=list)
    release_notes: str = ""
    environment: str = "staging"
    is_fix_deploy: bool = False


class ChangeEvent(BaseModel):
    trigger_type: Literal["deploy_webhook", "bundle_diff", "log_delta", "dns_cert", "manual"]
    summary: str
    delta_paths: list[str] = Field(default_factory=list)
    is_fix_deploy: bool = False
    commit: str | None = None


def extract_delta_paths_from_deploy(event: DeployWebhookEvent) -> list[str]:
    """Normalize explicit paths or map service hints from a deploy webhook."""
    paths: list[str] = []
    for svc in event.changed_services:
        if svc.startswith("/"):
            norm = normalize_path(svc)
            if norm not in paths:
                paths.append(norm)
        else:
            lower = svc.lower().strip()
            service_map = {
                "bookings": ["/api/v3/bookings", "/api/v3/bookings/{id}", "/api/v3/bookings/{id}/confirm", "/api/v3/bookings/{id}/refund"],
                "holds": ["/api/v3/holds"],
                "pricing": ["/api/v3/coupons/apply"],
                "coupons": ["/api/v3/coupons/apply"],
                "suppliers": ["/api/v3/suppliers/webhook-test"],
                "users": ["/api/v3/users/me"],
                "iam": ["/api/v3/users/me"],
                "legacy": ["/api/v1/bookings/{id}"],
            }
            for mapped in service_map.get(lower, []):
                if mapped not in paths:
                    paths.append(mapped)

    for match in _PATH_HINT_RE.finditer(event.release_notes):
        candidate = match.group(1)
        if candidate.startswith(("/api/", "/internal/")):
            norm = normalize_path(candidate)
            if norm not in paths:
                paths.append(norm)
    return paths


class BundleSnapshot(BaseModel):
    hashes: dict[str, str] = Field(default_factory=dict)
    routes: list[str] = Field(default_factory=list)


class BundleWatcher:
    """Fetches portal JS assets via SafetyGateway, hashes bundles, and diffs extracted API routes."""

    def __init__(
        self,
        gateway: SafetyGateway,
        base_url: str = "http://127.0.0.1:8001",
        async_transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.gateway = gateway
        self.base_url = base_url.rstrip("/")
        self._async_transport = async_transport
        self._last_snapshot: BundleSnapshot | None = None

    async def poll_once(self) -> ChangeEvent | None:
        async with SafeAsyncClient(
            self.gateway,
            agent="trigger_bundle_watcher",
            actor="unauthenticated",
            pace=True,
            inner_transport=self._async_transport,
        ) as client:
            idx_resp = await client.get(f"{self.base_url}/")
            if idx_resp.status_code != 200:
                return None
            script_urls = extract_script_urls_from_html(idx_resp.text, f"{self.base_url}/")
            hashes: dict[str, str] = {}
            routes: list[str] = []
            for js_url in script_urls:
                js_resp = await client.get(js_url)
                if js_resp.status_code != 200:
                    continue
                hashes[js_url] = hashlib.sha256(js_resp.content).hexdigest()
                for route in extract_api_paths_from_js(js_resp.text):
                    if route not in routes:
                        routes.append(route)

        current = BundleSnapshot(hashes=hashes, routes=routes)
        prev = self._last_snapshot
        self._last_snapshot = current

        if prev is None:
            return ChangeEvent(
                trigger_type="bundle_diff",
                summary=f"Initial JS bundle baseline ({len(routes)} routes)",
                delta_paths=routes,
            )

        if current.hashes == prev.hashes:
            return None

        new_routes = [r for r in current.routes if r not in prev.routes]
        changed_routes = new_routes if new_routes else current.routes
        return ChangeEvent(
            trigger_type="bundle_diff",
            summary=f"JS bundle hash changed; {len(changed_routes)} delta/affected routes",
            delta_paths=changed_routes,
        )


class LogDeltaWatcher:
    """Watches HAR, JSONL, or NGINX access logs incrementally and emits delta paths (ignoring 404 noise)."""

    def __init__(self, logs_path: Path) -> None:
        self.logs_path = Path(logs_path)
        self._seen_records = 0
        self._known_paths: set[str] = set()

    def poll_once(self) -> ChangeEvent | None:
        records = parse_traffic_records(self.logs_path)
        if len(records) <= self._seen_records:
            return None

        new_records = records[self._seen_records :]
        self._seen_records = len(records)

        delta: list[str] = []
        for rec in new_records:
            if rec.canonical_path not in self._known_paths:
                self._known_paths.add(rec.canonical_path)
                delta.append(rec.canonical_path)

        if not delta:
            return None
        return ChangeEvent(
            trigger_type="log_delta",
            summary=f"Observed {len(delta)} unseen endpoint(s) in gateway logs",
            delta_paths=delta,
        )


class DNSCertWatcher:
    """Monitors approved hosts, DNS A/AAAA resolution records, and TLS cert serials for drift."""

    def __init__(
        self,
        gateway: SafetyGateway,
        *,
        probe_network: bool = False,
        tls_timeout: float = 2.0,
    ) -> None:
        self.gateway = gateway
        self.probe_network = probe_network
        self._tls_timeout = tls_timeout
        self._known_hosts: set[str] = set()

    def _resolve_host_state(self, host: str, ports: list[int]) -> str:
        """Resolve DNS records and optional TLS certificate serial for an approved host."""
        if not self.probe_network:
            return "static"
        port_hint = ports[0] if ports else 443
        ips: set[str] = set()
        try:
            for _, _, _, _, sockaddr in socket.getaddrinfo(host, port_hint, type=socket.SOCK_STREAM):
                if sockaddr:
                    ips.add(str(sockaddr[0]))
        except OSError:
            ips.add("unresolved")

        cert_tag = "tls_none"
        if 443 in ports:
            try:
                ctx = ssl.create_default_context()
                with socket.create_connection((host, 443), timeout=self._tls_timeout) as raw_sock:
                    with ctx.wrap_socket(raw_sock, server_hostname=host) as tls_sock:
                        cert = tls_sock.getpeercert() or {}
                        cert_tag = str(cert.get("serialNumber") or "tls_present")
            except OSError:
                cert_tag = "tls_unavailable"
            except ssl.SSLError:
                cert_tag = "tls_error"

        return f"{','.join(sorted(ips))}|{cert_tag}"

    def poll_once(self) -> ChangeEvent | None:
        current_hosts = {
            f"{t.name}:{h}:{self._resolve_host_state(h, t.ports)}"
            for t in self.gateway.scope_config.approved_targets
            for h in t.hosts
        }
        if not self._known_hosts:
            self._known_hosts = current_hosts
            return None
        added = sorted(current_hosts - self._known_hosts)
        self._known_hosts = current_hosts
        if not added:
            return None
        return ChangeEvent(
            trigger_type="dns_cert",
            summary=f"Approved host/DNS/TLS changes observed: {', '.join(added)}",
            delta_paths=[],
        )
