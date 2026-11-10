"""Change triggers (deploy webhook, JS bundle diff watcher, log delta watcher, DNS/cert watcher)."""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Literal

import httpx
from pydantic import BaseModel, Field

from recon.crawler import extract_api_paths_from_js, extract_script_urls_from_html, normalize_path
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
    """Watches gateway access logs incrementally and emits delta paths (ignoring 404 noise)."""

    def __init__(self, logs_path: Path) -> None:
        self.logs_path = Path(logs_path)
        self._seen_lines = 0
        self._known_paths: set[str] = set()

    def poll_once(self) -> ChangeEvent | None:
        if not self.logs_path.exists():
            return None
        lines = self.logs_path.read_text(encoding="utf-8").splitlines()
        if len(lines) <= self._seen_lines:
            return None

        new_lines = lines[self._seen_lines :]
        self._seen_lines = len(lines)

        delta: list[str] = []
        for raw in new_lines:
            if not raw.strip():
                continue
            row = json.loads(raw)
            if int(row.get("status", 0)) == 404:
                continue
            norm = normalize_path(str(row.get("path", "/")))
            if norm not in self._known_paths:
                self._known_paths.add(norm)
                delta.append(norm)

        if not delta:
            return None
        return ChangeEvent(
            trigger_type="log_delta",
            summary=f"Observed {len(delta)} unseen endpoint(s) in gateway logs",
            delta_paths=delta,
        )


class DNSCertWatcher:
    """Monitors approved host/port scope snapshot for newly introduced hosts/subdomains."""

    def __init__(self, gateway: SafetyGateway) -> None:
        self.gateway = gateway
        self._known_hosts: set[str] = set()

    def poll_once(self) -> ChangeEvent | None:
        current_hosts = {
            f"{t.name}:{h}"
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
            summary=f"New approved host entries observed: {', '.join(added)}",
            delta_paths=[],
        )
