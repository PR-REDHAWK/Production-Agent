"""Zero-spec discovery & App Knowledge Graph population (Phase 2).

All HTTP and Playwright traffic goes strictly through SafetyGateway.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urljoin, urlparse

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
_ACCESS_LOG_RE = re.compile(
    r'^\S+\s+\S+\s+\S+\s+\[([^\]]+)\]\s+"([A-Z]+)\s+([^\s?"]+)(?:\?([^\s"]*))?\s+HTTP/[^"]+"\s+(\d{3})(?:\s+\S+\s+"[^"]*"\s+"([^"]*)")?'
)
_STATIC_ASSET_EXTS = (".css", ".js", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".woff", ".woff2", ".map")
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


class TrafficRecord(BaseModel):
    method: str
    raw_path: str
    canonical_path: str
    status: int
    timestamp: str | None = None
    user_agent: str | None = None
    params: dict[str, str] = Field(default_factory=dict)
    response_fields: list[str] = Field(default_factory=list)


def _extract_json_keys(raw_text: str | None) -> list[str]:
    if not raw_text:
        return []
    try:
        parsed = json.loads(raw_text)
        if isinstance(parsed, dict):
            return list(parsed.keys())
        if isinstance(parsed, list) and parsed and isinstance(parsed[0], dict):
            return list(parsed[0].keys())
    except (json.JSONDecodeError, TypeError):
        return []
    return []


def parse_traffic_records(logs_path: Path) -> list[TrafficRecord]:
    """Parse browser HAR JSON, JSONL gateway logs, or NGINX/Apache combined access logs."""
    path_obj = Path(logs_path)
    if not path_obj.exists():
        return []

    raw_text = path_obj.read_text(encoding="utf-8")
    stripped = raw_text.lstrip()
    records: list[TrafficRecord] = []

    # 1. Standard HAR 1.2 JSON file
    if stripped.startswith("{"):
        try:
            har_doc = json.loads(raw_text)
        except json.JSONDecodeError:
            har_doc = None
        if isinstance(har_doc, dict) and isinstance(har_doc.get("log"), dict) and "entries" in har_doc["log"]:
            for entry in har_doc["log"].get("entries", []):
                req = entry.get("request", {})
                resp = entry.get("response", {})
                status_code = int(resp.get("status", 0))
                if status_code == 404:
                    continue
                parsed_url = urlparse(str(req.get("url", "/")))
                raw_path = parsed_url.path or "/"
                if raw_path.lower().endswith(_STATIC_ASSET_EXTS):
                    continue
                params: dict[str, str] = {}
                for q_item in req.get("queryString", []):
                    q_name = q_item.get("name")
                    if q_name:
                        params[str(q_name)] = "query"
                for q_name in parse_qs(parsed_url.query).keys():
                    params.setdefault(q_name, "query")
                post_text = (req.get("postData") or {}).get("text")
                for b_key in _extract_json_keys(post_text):
                    params[b_key] = "body"
                ua = next(
                    (str(h.get("value")) for h in req.get("headers", []) if str(h.get("name", "")).lower() == "user-agent"),
                    None,
                )
                resp_text = (resp.get("content") or {}).get("text")
                records.append(
                    TrafficRecord(
                        method=str(req.get("method", "GET")).upper(),
                        raw_path=raw_path,
                        canonical_path=normalize_path(raw_path),
                        status=status_code,
                        timestamp=str(entry.get("startedDateTime")) if entry.get("startedDateTime") else None,
                        user_agent=ua,
                        params=params,
                        response_fields=_extract_json_keys(resp_text),
                    )
                )
            return records

    # 2. Line-delimited JSONL or plain-text NGINX/Apache combined access logs
    for line in raw_text.splitlines():
        line_str = line.strip()
        if not line_str:
            continue
        if line_str.startswith("{"):
            row = json.loads(line_str)
            status_code = int(row.get("status", 0))
            if status_code == 404:
                continue
            parsed_url = urlparse(str(row.get("path", "/")))
            raw_path = parsed_url.path or "/"
            if raw_path.lower().endswith(_STATIC_ASSET_EXTS):
                continue
            q_params = {q: "query" for q in parse_qs(parsed_url.query).keys()}
            records.append(
                TrafficRecord(
                    method=str(row.get("method", "GET")).upper(),
                    raw_path=raw_path,
                    canonical_path=normalize_path(raw_path),
                    status=status_code,
                    timestamp=str(row["timestamp"]) if row.get("timestamp") else None,
                    user_agent=str(row["user_agent"]) if row.get("user_agent") else None,
                    params=q_params,
                )
            )
            continue

        match = _ACCESS_LOG_RE.match(line_str)
        if match:
            ts, method, raw_path, raw_query, status_str, ua = match.groups()
            status_code = int(status_str)
            if status_code == 404 or raw_path.lower().endswith(_STATIC_ASSET_EXTS):
                continue
            q_params = {q: "query" for q in parse_qs(raw_query or "").keys()}
            records.append(
                TrafficRecord(
                    method=method.upper(),
                    raw_path=raw_path,
                    canonical_path=normalize_path(raw_path),
                    status=status_code,
                    timestamp=ts,
                    user_agent=ua,
                    params=q_params,
                )
            )
    return records


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
        """Crawl UI flows in real headless Chromium via Playwright with all traffic gated by SafetyGateway."""
        import asyncio
        from playwright.async_api import async_playwright  # declared in pyproject.toml

        role_aliases: dict[str, tuple[str, ...]] = {
            "agency_a_admin": ("agency alpha admin", "alpha admin", "agency a admin"),
            "agency_a_subagent": ("agency alpha sub-agent", "agency alpha subagent", "alpha sub-agent", "sub-agent"),
            "agency_b_admin": ("agency beta admin", "beta admin", "agency b admin"),
        }
        all_role_terms = tuple(term for terms in role_aliases.values() for term in terms)
        destructive_terms = (
            "logout",
            "log out",
            "sign out",
            "delete",
            "remove",
            "destroy",
            "wipe",
            "reset",
            "drop",
            "purge",
            "revoke",
            "terminate",
        )

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
                    captured_entries: list[tuple[str, str, int, str | None, list[str]]] = []
                    capture_tasks: list[asyncio.Task[None]] = []

                    async def _capture_response(resp: Any) -> None:
                        req = resp.request
                        method = str(req.method)
                        req_url = str(resp.url)
                        status_code = int(resp.status)
                        post_data: str | None = None
                        try:
                            post_data = req.post_data
                        except Exception:  # noqa: BLE001
                            post_data = None
                        resp_text = ""
                        try:
                            if urlparse(req_url).path.startswith(("/api/", "/internal/")):
                                resp_text = await resp.text()
                        except Exception:  # noqa: BLE001
                            resp_text = ""
                        captured_entries.append(
                            (
                                method,
                                req_url,
                                status_code,
                                post_data,
                                _extract_json_keys(resp_text),
                            )
                        )

                    def _on_response(resp: Any) -> None:
                        capture_tasks.append(asyncio.create_task(_capture_response(resp)))

                    page.on("response", _on_response)
                    await page.goto(f"{self.base_url}/", wait_until="networkidle")

                    # Step 1: Click matching demo role sign-in button if rendered
                    actor_terms = role_aliases.get(actor, (actor.replace("_", " "),))
                    other_role_terms = tuple(t for t in all_role_terms if t not in actor_terms)
                    role_buttons = page.locator("button:visible")
                    for idx in range(await role_buttons.count()):
                        btn = role_buttons.nth(idx)
                        label = " ".join((await btn.inner_text()).split()).strip().lower()
                        if any(term in label for term in actor_terms):
                            await btn.click(timeout=2000)
                            await page.wait_for_load_state("networkidle")
                            await page.wait_for_timeout(150)
                            break

                    # Step 2: Safely click non-destructive interactive flows & tabs (panel actions before top tabs)
                    clicked_labels: set[str] = set()
                    for _ in range(16):
                        visible_controls = page.locator("button:visible, [role='tab']:visible")
                        count = await visible_controls.count()
                        raw_items: list[tuple[int, str, int, float]] = []
                        for idx in range(count):
                            el = visible_controls.nth(idx)
                            if not await el.is_enabled():
                                continue
                            raw_label = " ".join((await el.inner_text()).split()).strip()
                            lower_label = raw_label.lower()
                            if not lower_label or lower_label in clicked_labels:
                                continue
                            if any(term in lower_label for term in destructive_terms):
                                continue
                            if any(term in lower_label for term in other_role_terms):
                                continue
                            if any(term in lower_label for term in actor_terms):
                                clicked_labels.add(lower_label)
                                continue
                            nav_flag = await el.evaluate(
                                """node => {
                                    if (node.type === 'submit' || node.closest('form')) return 0;
                                    if (node.getAttribute('role') === 'tab' || node.closest('nav, header, aside, [role="tablist"]')) return 2;
                                    return 1;
                                }"""
                            )
                            box = await el.bounding_box()
                            y_pos = float(box["y"]) if box else 9999.0
                            raw_items.append((idx, lower_label, int(nav_flag), y_pos))

                        if not raw_items:
                            break

                        min_y = min(item[3] for item in raw_items)
                        top_row_count = sum(1 for item in raw_items if item[3] <= min_y + 24.0)
                        candidates: list[tuple[int, int, str]] = []
                        for idx, lower_label, nav_flag, y_pos in raw_items:
                            if nav_flag == 2:
                                priority = 1
                            elif nav_flag == 0:
                                priority = 0
                            elif top_row_count >= 2 and y_pos <= min_y + 24.0:
                                priority = 1
                            else:
                                priority = 0
                            candidates.append((priority, idx, lower_label))

                        candidates.sort(key=lambda item: (item[0], item[1]))
                        _, target_idx, chosen_label = candidates[0]
                        clicked_labels.add(chosen_label)
                        try:
                            await visible_controls.nth(target_idx).click(timeout=2000)
                            await page.wait_for_load_state("networkidle")
                            await page.wait_for_timeout(150)
                        except Exception:  # noqa: BLE001
                            continue

                    if capture_tasks:
                        await asyncio.gather(*capture_tasks, return_exceptions=True)

                    crawled.append(actor)

                    for method, req_url, status_code, post_data, resp_fields in captured_entries:
                        parsed = urlparse(req_url)
                        if not parsed.path.startswith(("/api/", "/internal/")) or status_code == 404:
                            continue
                        params: dict[str, str] = {}
                        for q_name in parse_qs(parsed.query).keys():
                            params[q_name] = "query"
                        for body_key in _extract_json_keys(post_data):
                            params[body_key] = "body"
                        canon = normalize_path(parsed.path)
                        self.graph.add_endpoint(
                            method=method,
                            canonical_path=canon,
                            source="playwright_ui",
                            sample_path=parsed.path,
                            role=actor,
                            params=params or None,
                            status_code=status_code,
                            response_fields=resp_fields or None,
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

                # 3. List actor's bookings dynamically and inspect concrete owned resource IDs
                list_bk_resp = await client.get(f"{self.base_url}/api/v3/bookings")
                self._record_http_observation("GET", "/api/v3/bookings", actor, list_bk_resp)
                observed_ids: list[str] = []
                if list_bk_resp.status_code == 200:
                    try:
                        list_payload = list_bk_resp.json()
                        rows = (
                            list_payload.get("bookings", [])
                            if isinstance(list_payload, dict)
                            else (list_payload if isinstance(list_payload, list) else [])
                        )
                        for row in rows:
                            if isinstance(row, dict):
                                raw_id = row.get("booking_id") or row.get("id")
                                if raw_id is not None and str(raw_id) not in observed_ids:
                                    observed_ids.append(str(raw_id))
                    except Exception:  # noqa: BLE001
                        observed_ids = []
                if not observed_ids:
                    observed_ids = ["1001" if "agency_a" in actor else "2001"]

                for bk_id in observed_ids[:2]:
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
        """Ingest HAR JSON, JSONL gateway logs, or access logs (excluding 404 noise) into the Knowledge Graph."""
        records = parse_traffic_records(logs_path)
        for rec in records:
            self.graph.add_endpoint(
                method=rec.method,
                canonical_path=rec.canonical_path,
                source="gateway_log",
                sample_path=rec.raw_path,
                params=rec.params or None,
                status_code=rec.status,
                response_fields=rec.response_fields or None,
            )
        return len(records)

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
