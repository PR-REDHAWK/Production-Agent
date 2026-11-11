"""Active / Zombie / Shadow API classifier comparing Knowledge Graph vs 30-90d traffic logs."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import httpx

from graph.knowledge_graph import AppKnowledgeGraph
from inventory.models import InventoryEntry, InventoryReport, Recommendation
from recon.crawler import parse_traffic_records
from safety.gateway import SafeAsyncClient, SafetyGateway

_PII_PATTERNS: dict[str, re.Pattern[str]] = {
    "passport": re.compile(r"(?:traveller_passport|passport|SYNTH-PASS)", re.IGNORECASE),
    "email": re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"),
    "card": re.compile(r"\b(?:\d[ -]*?){13,16}\b"),
    "traveller_name": re.compile(r"traveller_name", re.IGNORECASE),
}


@dataclass
class _LogStats:
    hit_count: int = 0
    last_seen: str | None = None
    sample_path: str | None = None
    user_agents: set[str] = field(default_factory=set)


class InventoryAgent:
    """Classifies endpoints as Active, Zombie, or Shadow per rules.md §5."""

    def __init__(
        self,
        gateway: SafetyGateway,
        graph: AppKnowledgeGraph,
        ownership_path: Path,
        base_url: str = "http://127.0.0.1:8001",
        async_transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.gateway = gateway
        self.graph = graph
        self.ownership = json.loads(Path(ownership_path).read_text(encoding="utf-8"))
        self.base_url = base_url.rstrip("/")
        self._async_transport = async_transport

    def _has_explicit_owner(self, canonical_path: str) -> tuple[bool, str]:
        best_prefix = ""
        matched_team: str | None = None
        for route in self.ownership.get("routes", []):
            prefix = str(route.get("path_prefix", ""))
            if canonical_path.startswith(prefix) and len(prefix) > len(best_prefix):
                best_prefix = prefix
                matched_team = str(route.get("team", "unowned"))
        if matched_team:
            return True, matched_team
        return False, "unowned"

    @staticmethod
    def _parse_gateway_logs(logs_path: Path) -> dict[tuple[str, str], _LogStats]:
        stats: dict[tuple[str, str], _LogStats] = {}
        for rec in parse_traffic_records(logs_path):
            key = (rec.method, rec.canonical_path)
            entry = stats.setdefault(key, _LogStats())
            entry.hit_count += 1
            if rec.timestamp and (entry.last_seen is None or rec.timestamp > entry.last_seen):
                entry.last_seen = rec.timestamp
            if entry.sample_path is None:
                entry.sample_path = rec.raw_path
            if rec.user_agent:
                entry.user_agents.add(rec.user_agent)
        return stats

    @staticmethod
    def _scan_pii(body_text: str) -> list[str]:
        found: list[str] = []
        for label, pat in _PII_PATTERNS.items():
            if pat.search(body_text):
                found.append(label)
        return found

    async def _safe_unauth_probe(self, method: str, sample_path: str) -> tuple[bool, list[str]]:
        """Check reachability strictly with safe unauthenticated GET/HEAD through SafetyGateway."""
        probe_method = "GET" if method == "GET" else "HEAD"
        async with SafeAsyncClient(
            self.gateway,
            agent="inventory_unauth_probe",
            actor="unauthenticated",
            pace=True,
            inner_transport=self._async_transport,
        ) as client:
            resp = await client.request(probe_method, f"{self.base_url}{sample_path}")
        reachable = 200 <= resp.status_code < 300
        pii = self._scan_pii(resp.text) if (reachable and probe_method == "GET") else []
        return reachable, pii

    def _detect_regression(
        self,
        canonical_path: str,
        reachable_without_auth: bool,
        pii: list[str],
        current_endpoints: dict[str, list[int]],
    ) -> str | None:
        if "/v1/" in canonical_path or "/old/" in canonical_path:
            v3_equiv = canonical_path.replace("/v1/", "/v3/").replace("/old/", "/v3/")
            if v3_equiv in current_endpoints and reachable_without_auth:
                return (
                    f"Unauthenticated access & data exposure ({', '.join(pii) or 'data'}) "
                    f"unlike current {v3_equiv} which enforces authentication/tenant checks"
                )
            if reachable_without_auth:
                return f"Legacy endpoint reachable without authentication (exposes: {', '.join(pii) or 'data'})"
        if reachable_without_auth and pii:
            return f"Undocumented endpoint reachable without auth exposing PII ({', '.join(pii)})"
        if reachable_without_auth:
            return "Undocumented endpoint reachable without authentication"
        return None

    async def classify(self, logs_path: Path) -> InventoryReport:
        log_stats = self._parse_gateway_logs(logs_path)
        endpoints = self.graph.list_endpoints()

        current_statuses: dict[str, list[int]] = {
            ep.canonical_path: ep.observed_statuses for ep in endpoints if "/v3/" in ep.canonical_path
        }

        entries: list[InventoryEntry] = []
        active_count = 0
        zombie_count = 0
        shadow_count = 0

        for ep in endpoints:
            key = (ep.method, ep.canonical_path)
            stats = log_stats.get(key)
            has_traffic = stats is not None and stats.hit_count > 0
            in_ui_or_js = any(s in ("js_bundle", "role_crawl", "playwright_ui") for s in ep.sources)
            has_owner, owner_team = self._has_explicit_owner(ep.canonical_path)

            is_legacy_pattern = any(tok in ep.canonical_path for tok in ("/v1/", "/v2/", "/old/", "/test/", "/beta/"))
            sample_path = (ep.sample_paths[0] if ep.sample_paths else None) or (stats.sample_path if stats else None) or ep.canonical_path
            if "{id}" in sample_path:
                sample_path = sample_path.replace("{id}", "1001")

            if has_traffic and not in_ui_or_js and not has_owner:
                classification = "Shadow"
                shadow_count += 1
            elif not has_traffic and (is_legacy_pattern or "legacy_probe" in ep.sources):
                classification = "Zombie"
                zombie_count += 1
            else:
                classification = "Active"
                active_count += 1

            if classification in ("Zombie", "Shadow"):
                reachable, pii = await self._safe_unauth_probe(ep.method, sample_path)
                regression = self._detect_regression(ep.canonical_path, reachable, pii, current_statuses)
                likely_owner = owner_team if has_owner else (
                    f"inferred:{','.join(sorted(stats.user_agents))}" if (stats and stats.user_agents) else "unowned"
                )
                rec: Recommendation = "DECOMMISSION" if classification == "Zombie" else (
                    "RESTRICT" if reachable else "UPDATE"
                )
                entries.append(
                    InventoryEntry(
                        method=ep.method,
                        canonical_path=ep.canonical_path,
                        classification=classification,
                        hit_count_90d=stats.hit_count if stats else 0,
                        last_seen_timestamp=stats.last_seen if stats else None,
                        reachable_without_auth=reachable,
                        pii_exposed=pii,
                        security_regression=regression,
                        likely_owner=likely_owner,
                        recommendation=rec,
                    )
                )
            else:
                entries.append(
                    InventoryEntry(
                        method=ep.method,
                        canonical_path=ep.canonical_path,
                        classification="Active",
                        hit_count_90d=stats.hit_count if stats else 0,
                        last_seen_timestamp=stats.last_seen if stats else None,
                        likely_owner=owner_team,
                    )
                )

        return InventoryReport(
            total_endpoints=len(entries),
            active_count=active_count,
            zombie_count=zombie_count,
            shadow_count=shadow_count,
            entries=entries,
        )
