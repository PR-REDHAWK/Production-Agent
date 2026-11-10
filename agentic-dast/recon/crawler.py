"""Zero-spec discovery & App Knowledge Graph population (Phase 2).

All HTTP and Playwright traffic goes strictly through SafetyGateway.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse

import httpx
from pydantic import BaseModel, Field

from graph.knowledge_graph import AppKnowledgeGraph
from safety.gateway import (
    SafeAsyncClient,
    SafetyGateway,
    canonicalize_path,
    create_playwright_route_handler,
)

_SCRIPT_SRC_RE = re.compile(r"""<script[^>]+src=["']([^"']+)["']""", re.IGNORECASE)
_QUOTED_ROUTE_RE = re.compile(r"""["'`](/(?:api|internal|v\d+)/[A-Za-z0-9_./{}$:-]*)["'`]""")
_TEMPLATE_VAR_RE = re.compile(r"\$\{[^}]+\}")
_LEGACY_PROBE_PATHS = (
    "/api/v1/bookings/1001",
    "/api/v2/bookings/1001",
    "/api/old/bookings",
    "/api/test/health",
    "/api/beta/search",
)


def normalize_path(raw_path: str) -> str:
    """Normalize concrete resource IDs and JS template expressions into canonical paths."""
    cleaned = _TEMPLATE_VAR_RE.sub("{id}", raw_path.strip())
    parsed = urlparse(cleaned)
    path_only = parsed.path or "/"
    # Also normalize any `{anything}` placeholder or raw ID segment consistently
    parts = [p for p in path_only.split("/") if p]
    out: list[str] = []
    for part in parts:
        if part.startswith("{") and part.endswith("}"):
            out.append("{id}")
        else:
            out.append(canonicalize_path("/" + part).lstrip("/"))
    return "/" + "/".join(out) if out else "/"


def extract_script_urls_from_html(html: str, base_url: str) -> list[str]:
    urls: list[str] = []
    for match in _SCRIPT_SRC_RE.finditer(html):
        resolved = urljoin(base_url, match.group(1))
        if resolved not in urls:
            urls.append(resolved)
    return urls


def _tokenize_js_strings(js_text: str) -> list[str]:
    """Lightweight deterministic JS string/template-literal lexer (no regex-only blind spots)."""
    literals: list[str] = []
    i = 0
    n = len(js_text)
    while i < n:
        ch = js_text[i]
        if ch in ('"', "'", "`"):
            quote = ch
            i += 1
            buf: list[str] = []
            while i < n:
                c = js_text[i]
                if c == "\\" and i + 1 < n:
                    buf.append(js_text[i + 1])
                    i += 2
                    continue
                if c == quote:
                    i += 1
                    break
                buf.append(c)
                i += 1
            literals.append("".join(buf))
        elif ch == "/" and i + 1 < n and js_text[i + 1] == "/":
            nl = js_text.find("\n", i)
            i = n if nl == -1 else nl + 1
        elif ch == "/" and i + 1 < n and js_text[i + 1] == "*":
            end = js_text.find("*/", i + 2)
            i = n if end == -1 else end + 2
        else:
            i += 1
    return literals


def extract_api_paths_from_js(js_text: str) -> list[str]:
    """Extract API path strings using both JS string/template lexing and pattern matching."""
    discovered: list[str] = []
    for literal in _tokenize_js_strings(js_text):
        norm_cand = literal.strip()
        if norm_cand.startswith(("/api/", "/internal/", "/v1/", "/v2/", "/v3/")):
            canon = normalize_path(norm_cand)
            if canon not in discovered:
                discovered.append(canon)
    for match in _QUOTED_ROUTE_RE.finditer(js_text):
        canon = normalize_path(match.group(1))
        if canon not in discovered:
            discovered.append(canon)
    return discovered


class DiscoveryResult(BaseModel):
    discovered_endpoints: int
    js_routes: list[str] = Field(default_factory=list)
    crawled_roles: list[str] = Field(default_factory=list)
    probed_legacy_hits: list[str] = Field(default_factory=list)
    log_routes_ingested: int = 0


class ReconAgent:
    """Zero-spec multi-source discovery agent feeding AppKnowledgeGraph."""

    def __init__(
        self,
        gateway: SafetyGateway,
        graph: AppKnowledgeGraph,
        base_url: str = "http://127.0.0.1:8001",
        async_transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.gateway = gateway
        self.graph = graph
        self.base_url = base_url.rstrip("/")
        self._async_transport = async_transport

    async def discover_from_ui_playwright(
        self,
        roles: list[str] | None = None,
    ) -> list[str]:
        """Crawl UI in real headless Chromium via Playwright with all traffic gated by SafetyGateway."""
        from playwright.async_api import async_playwright  # declared in pyproject.toml

        crawled: list[str] = []
        target_roles = roles or ["agency_a_admin", "agency_a_subagent", "agency_b_admin"]

        async with async_playwright() as pw:
            browser = await pw.chromium.launch(headless=True)
            try:
                for actor in target_roles:
                    context = await browser.new_context()
                    page = await context.new_page()
                    await page.route(
                        "**/*",
                        create_playwright_route_handler(self.gateway, agent="recon_playwright", actor=actor),
                    )
                    captured_urls: list[tuple[str, str, int]] = []

                    def _on_response(resp: Any) -> None:
                        req = resp.request
                        captured_urls.append((str(req.method), str(resp.url), int(resp.status)))

                    page.on("response", _on_response)
                    await page.goto(f"{self.base_url}/", wait_until="networkidle")
                    crawled.append(actor)

                    for method, req_url, status_code in captured_urls:
                        parsed = urlparse(req_url)
                        if parsed.path.startswith(("/api/", "/internal/")):
                            canon = normalize_path(parsed.path)
                            self.graph.add_endpoint(
                                method=method,
                                canonical_path=canon,
                                source="playwright_ui",
                                sample_path=parsed.path,
                                role=actor,
                                status_code=status_code,
                            )
                    await context.close()
            finally:
                await browser.close()
        return crawled

    async def discover_js_bundles(self, actor: str = "unauthenticated") -> list[str]:
        """Fetch portal HTML and JS bundles through SafetyGateway and extract API routes."""
        extracted_routes: list[str] = []
        async with SafeAsyncClient(
            self.gateway,
            agent="recon_js",
            actor=actor,
            pace=True,
            inner_transport=self._async_transport,
        ) as client:
            index_resp = await client.get(f"{self.base_url}/")
            if index_resp.status_code != 200:
                return extracted_routes
            script_urls = extract_script_urls_from_html(index_resp.text, f"{self.base_url}/")
            for js_url in script_urls:
                js_resp = await client.get(js_url)
                if js_resp.status_code != 200:
                    continue
                for route_path in extract_api_paths_from_js(js_resp.text):
                    if route_path not in extracted_routes:
                        extracted_routes.append(route_path)
                    # Record inferred GET/POST placeholder endpoint in Knowledge Graph
                    inferred_method = "POST" if (
                        route_path.endswith("/bookings")
                        or any(
                            kw in route_path
                            for kw in ("login", "holds", "coupons", "pay", "confirm", "cancel", "refund", "webhook")
                        )
                    ) else ("PATCH" if "users/me" in route_path else "GET")
                    self.graph.add_endpoint(
                        method=inferred_method,
                        canonical_path=route_path,
                        source="js_bundle",
                        sample_path=route_path,
                    )
        return extracted_routes

    async def exercise_role_flows(
        self,
        roles: list[str] | None = None,
    ) -> list[str]:
        """Exercise core B2B travel APIs per role through SafeAsyncClient to map params & schemas."""
        exercised_roles: list[str] = []
        target_roles = roles or ["agency_a_admin", "agency_a_subagent", "agency_b_admin"]

        for actor in target_roles:
            async with SafeAsyncClient(
                self.gateway,
                agent="recon_flow_crawler",
                actor=actor,
                pace=True,
                inner_transport=self._async_transport,
            ) as client:
                # 1. Search
                search_resp = await client.get(f"{self.base_url}/api/v3/search", params={"city": "Delhi"})
                self._record_http_observation("GET", "/api/v3/search", actor, search_resp, params={"city": "query"})

                # 2. Hold
                hold_resp = await client.post(
                    f"{self.base_url}/api/v3/holds",
                    json={"item_id": "INV-DEL-101", "quantity": 1},
                )
                self._record_http_observation(
                    "POST",
                    "/api/v3/holds",
                    actor,
                    hold_resp,
                    params={"item_id": "body", "quantity": "body"},
                )

                # 3. Read sample booking owned by Alpha (1001) or Beta (2001)
                bk_id = "1001" if "agency_a" in actor else "2001"
                bk_resp = await client.get(f"{self.base_url}/api/v3/bookings/{bk_id}")
                self._record_http_observation(
                    "GET",
                    f"/api/v3/bookings/{bk_id}",
                    actor,
                    bk_resp,
                    params={"id": "path"},
                )

                # 4. Book from hold if hold succeeded
                if hold_resp.status_code == 200:
                    hold_id = hold_resp.json()["hold_id"]
                    coupon_resp = await client.post(
                        f"{self.base_url}/api/v3/coupons/apply",
                        json={"hold_id": hold_id, "code": "SAVE20"},
                    )
                    self._record_http_observation(
                        "POST",
                        "/api/v3/coupons/apply",
                        actor,
                        coupon_resp,
                        params={"hold_id": "body", "code": "body"},
                    )
                    book_resp = await client.post(
                        f"{self.base_url}/api/v3/bookings",
                        json={
                            "hold_id": hold_id,
                            "traveller_name": "Recon Synthetic",
                            "traveller_passport": "SYNTH-RECON-01",
                            "traveller_email": "recon@synthetic-traveller.test",
                        },
                    )
                    self._record_http_observation(
                        "POST",
                        "/api/v3/bookings",
                        actor,
                        book_resp,
                        params={
                            "hold_id": "body",
                            "traveller_name": "body",
                            "traveller_passport": "body",
                            "traveller_email": "body",
                        },
                    )
                    if book_resp.status_code == 200:
                        new_bk = book_resp.json()["booking_id"]
                        fare = book_resp.json()["total_fare"]
                        pay_resp = await client.post(
                            f"{self.base_url}/api/v3/bookings/{new_bk}/pay",
                            json={"amount": fare},
                        )
                        self._record_http_observation(
                            "POST",
                            f"/api/v3/bookings/{new_bk}/pay",
                            actor,
                            pay_resp,
                            params={"amount": "body"},
                        )
                        conf_resp = await client.post(f"{self.base_url}/api/v3/bookings/{new_bk}/confirm")
                        self._record_http_observation(
                            "POST", f"/api/v3/bookings/{new_bk}/confirm", actor, conf_resp
                        )
                        cancel_resp = await client.post(f"{self.base_url}/api/v3/bookings/{new_bk}/cancel")
                        self._record_http_observation(
                            "POST", f"/api/v3/bookings/{new_bk}/cancel", actor, cancel_resp
                        )
                        refund_resp = await client.post(f"{self.base_url}/api/v3/bookings/{new_bk}/refund")
                        self._record_http_observation(
                            "POST", f"/api/v3/bookings/{new_bk}/refund", actor, refund_resp
                        )

                # 5. Profile patch & supplier webhook schema observation
                me_resp = await client.patch(
                    f"{self.base_url}/api/v3/users/me",
                    json={"display_name": f"Recon {actor}"},
                )
                self._record_http_observation(
                    "PATCH", "/api/v3/users/me", actor, me_resp, params={"display_name": "body"}
                )
            exercised_roles.append(actor)
        return exercised_roles

    async def probe_legacy_paths(self, candidate_paths: tuple[str, ...] = _LEGACY_PROBE_PATHS) -> list[str]:
        """Safely probe legacy/versioned route guesses through SafetyGateway."""
        hits: list[str] = []
        async with SafeAsyncClient(
            self.gateway,
            agent="recon_prober",
            actor="unauthenticated",
            pace=True,
            inner_transport=self._async_transport,
        ) as client:
            for path in candidate_paths:
                resp = await client.get(f"{self.base_url}{path}")
                if resp.status_code not in (404, 410):
                    canon = normalize_path(path)
                    hits.append(canon)
                    self._record_http_observation("GET", path, "unauthenticated", resp, source="legacy_probe")
        return hits

    def ingest_har_or_gateway_logs(self, logs_path: Path) -> int:
        """Ingest recorded gateway logs (excluding 404 noise) into the Knowledge Graph."""
        ingested = 0
        if not Path(logs_path).exists():
            return 0
        for line in Path(logs_path).read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            row = json.loads(line)
            status_code = int(row.get("status", 0))
            if status_code == 404:
                continue
            method = str(row.get("method", "GET")).upper()
            raw_path = str(row.get("path", "/"))
            canon = normalize_path(raw_path)
            self.graph.add_endpoint(
                method=method,
                canonical_path=canon,
                source="gateway_log",
                sample_path=raw_path,
                status_code=status_code,
            )
            ingested += 1
        return ingested

    def _record_http_observation(
        self,
        method: str,
        raw_path: str,
        actor: str,
        resp: httpx.Response,
        params: dict[str, str] | None = None,
        source: str = "role_crawl",
    ) -> None:
        resp_fields: list[str] = []
        try:
            payload = resp.json()
            if isinstance(payload, dict):
                resp_fields = list(payload.keys())
            elif isinstance(payload, list) and payload and isinstance(payload[0], dict):
                resp_fields = list(payload[0].keys())
        except Exception:  # noqa: BLE001
            pass

        self.graph.add_endpoint(
            method=method,
            canonical_path=normalize_path(raw_path),
            source=source,
            sample_path=raw_path,
            role=actor,
            params=params,
            status_code=resp.status_code,
            response_fields=resp_fields,
        )

    async def run_full_discovery(
        self,
        *,
        use_playwright: bool = False,
        gateway_logs_path: Path | None = None,
    ) -> DiscoveryResult:
        js_routes = await self.discover_js_bundles()
        crawled_roles = await self.exercise_role_flows()
        if use_playwright:
            pw_roles = await self.discover_from_ui_playwright()
            for r in pw_roles:
                if r not in crawled_roles:
                    crawled_roles.append(r)
        probed_hits = await self.probe_legacy_paths()
        log_count = self.ingest_har_or_gateway_logs(gateway_logs_path) if gateway_logs_path else 0
        return DiscoveryResult(
            discovered_endpoints=len(self.graph.list_endpoints()),
            js_routes=js_routes,
            crawled_roles=crawled_roles,
            probed_legacy_hits=probed_hits,
            log_routes_ingested=log_count,
        )
