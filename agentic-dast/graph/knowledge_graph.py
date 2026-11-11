"""NetworkX-backed App Knowledge Graph and OpenAPI 3.1 exporter."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import networkx as nx

from graph.models import (
    BusinessFlowName,
    EndpointRecord,
    GraphSummary,
    NodeType,
    SensitivityTag,
)

FLOW_ORDER: tuple[BusinessFlowName, ...] = ("search", "hold", "book", "pay", "cancel", "refund")


def classify_business_flow(path: str) -> BusinessFlowName | None:
    lower = path.lower()
    if "/refund" in lower:
        return "refund"
    if "/cancel" in lower:
        return "cancel"
    if "/pay" in lower:
        return "pay"
    if "/confirm" in lower or "/bookings" in lower:
        return "book"
    if "/holds" in lower or "/coupons" in lower:
        return "hold"
    if "/search" in lower:
        return "search"
    return None


def infer_sensitivity_tags(
    path: str,
    params: list[str] | None = None,
    response_fields: list[str] | None = None,
) -> list[SensitivityTag]:
    lower = path.lower()
    all_keys = " ".join((params or []) + (response_fields or [])).lower()
    tags: list[SensitivityTag] = []

    if any(k in lower or k in all_keys for k in ("pay", "refund", "coupon", "fare", "credit", "paid_amount")):
        tags.append("PAYMENTS_CREDIT")
    if any(k in lower for k in ("/bookings", "/holds", "/confirm", "/cancel")):
        tags.append("BOOKINGS")
    if any(k in lower or k in all_keys for k in ("passport", "traveller", "email", "users/me", "shadow-export")):
        tags.append("PII_TRAVELLER")
    if any(k in lower for k in ("/suppliers", "webhook", "role")):
        tags.append("SUPPLIER_ADMIN")
    if "/search" in lower:
        tags.append("PUBLIC_SEARCH")

    return tags


class AppKnowledgeGraph:
    """Inferred API map built from UI crawl, JS bundles, probing, and gateway logs."""

    def __init__(self, ownership_config_path: Path | None = None) -> None:
        self.graph: nx.MultiDiGraph = nx.MultiDiGraph()
        self._ownership = self._load_ownership(ownership_config_path)

    @staticmethod
    def _load_ownership(path: Path | None) -> dict[str, Any]:
        if path and Path(path).exists():
            return json.loads(Path(path).read_text(encoding="utf-8"))
        return {"default_owner": {"team": "unowned"}, "routes": []}

    def resolve_owner(self, canonical_path: str) -> tuple[str, str]:
        best_prefix = ""
        best_route: dict[str, Any] | None = None
        for route in self._ownership.get("routes", []):
            prefix = str(route.get("path_prefix", ""))
            if canonical_path.startswith(prefix) and len(prefix) > len(best_prefix):
                best_prefix = prefix
                best_route = route
        if best_route:
            return str(best_route.get("team", "unowned")), str(best_route.get("owner_email", ""))
        default = self._ownership.get("default_owner", {})
        return str(default.get("team", "unowned")), str(default.get("slack_channel", ""))

    @staticmethod
    def endpoint_node_id(method: str, canonical_path: str) -> str:
        return f"Endpoint:{method.upper()}:{canonical_path}"

    def _ensure_node(self, node_id: str, node_type: NodeType, **attrs: Any) -> None:
        if node_id not in self.graph:
            self.graph.add_node(node_id, node_type=node_type, **attrs)
        else:
            for key, val in attrs.items():
                if isinstance(val, list) and isinstance(self.graph.nodes[node_id].get(key), list):
                    existing = self.graph.nodes[node_id][key]
                    for item in val:
                        if item not in existing:
                            existing.append(item)
                elif isinstance(val, dict) and isinstance(self.graph.nodes[node_id].get(key), dict):
                    self.graph.nodes[node_id][key].update(val)
                elif val is not None:
                    self.graph.nodes[node_id][key] = val

    def _add_edge_once(self, src: str, dst: str, edge_type: str, **attrs: Any) -> None:
        if self.graph.has_edge(src, dst):
            for _, data in self.graph.get_edge_data(src, dst).items():
                if data.get("edge_type") == edge_type:
                    return
        self.graph.add_edge(src, dst, edge_type=edge_type, **attrs)

    def add_endpoint(
        self,
        *,
        method: str,
        canonical_path: str,
        source: str,
        sample_path: str | None = None,
        role: str | None = None,
        params: dict[str, str] | None = None,
        status_code: int | None = None,
        response_fields: list[str] | None = None,
    ) -> str:
        upper_method = method.upper()
        ep_id = self.endpoint_node_id(upper_method, canonical_path)
        param_names = sorted((params or {}).keys())
        resp_keys = sorted(set(response_fields or []))
        flow = classify_business_flow(canonical_path)
        owner_team, owner_contact = self.resolve_owner(canonical_path)

        existing_params: list[str] = []
        existing_resp: list[str] = []
        existing_role_samples: dict[str, list[str]] = {}
        if ep_id in self.graph:
            existing_params = list(self.graph.nodes[ep_id].get("params", []))
            existing_resp = list(self.graph.nodes[ep_id].get("response_fields", []))
            for r_key, r_paths in dict(self.graph.nodes[ep_id].get("role_sample_paths", {})).items():
                existing_role_samples[str(r_key)] = list(r_paths)

        if role and sample_path and sample_path != canonical_path:
            bucket = existing_role_samples.setdefault(role, [])
            if sample_path not in bucket:
                bucket.append(sample_path)

        merged_params = sorted(set(existing_params + param_names))
        merged_resp = sorted(set(existing_resp + resp_keys))
        tags = infer_sensitivity_tags(canonical_path, merged_params, merged_resp)

        self._ensure_node(
            ep_id,
            "Endpoint",
            method=upper_method,
            canonical_path=canonical_path,
            sample_paths=[sample_path] if sample_path else [],
            role_sample_paths=existing_role_samples,
            sources=[source],
            roles=[role] if role else [],
            params=merged_params,
            param_locations=dict(params or {}),
            sensitivity_tags=tags,
            business_flow=flow,
            owner_team=owner_team,
            observed_statuses=[status_code] if status_code is not None else [],
            response_fields=merged_resp,
        )

        for p_name, p_loc in (params or {}).items():
            p_id = f"Parameter:{p_name}"
            self._ensure_node(p_id, "Parameter", name=p_name, location=p_loc)
            self._add_edge_once(ep_id, p_id, "ACCEPTS_PARAM", location=p_loc)

        if role:
            r_id = f"Role:{role}"
            self._ensure_node(r_id, "Role", name=role)
            self._add_edge_once(ep_id, r_id, "ACCESSIBLE_BY_ROLE")

        o_id = f"AssetOwner:{owner_team}"
        self._ensure_node(o_id, "AssetOwner", team=owner_team, contact=owner_contact)
        self._add_edge_once(ep_id, o_id, "OWNED_BY")

        if flow:
            f_id = f"BusinessFlow:{flow}"
            self._ensure_node(f_id, "BusinessFlow", name=flow)
            self._add_edge_once(f_id, ep_id, "FLOW_STEP", step=flow)

        self._link_flow_sequence()
        return ep_id

    def _link_flow_sequence(self) -> None:
        by_flow: dict[BusinessFlowName, list[str]] = {f: [] for f in FLOW_ORDER}
        for node_id, data in self.graph.nodes(data=True):
            if data.get("node_type") == "Endpoint" and data.get("business_flow") in by_flow:
                by_flow[data["business_flow"]].append(node_id)

        for idx in range(len(FLOW_ORDER) - 1):
            curr_nodes = by_flow[FLOW_ORDER[idx]]
            next_nodes = by_flow[FLOW_ORDER[idx + 1]]
            for src in curr_nodes:
                for dst in next_nodes:
                    self._add_edge_once(src, dst, "FLOW_STEP", transition=f"{FLOW_ORDER[idx]}->{FLOW_ORDER[idx + 1]}")

    def list_endpoints(self) -> list[EndpointRecord]:
        records: list[EndpointRecord] = []
        for _, data in self.graph.nodes(data=True):
            if data.get("node_type") == "Endpoint":
                records.append(
                    EndpointRecord(
                        method=data["method"],
                        canonical_path=data["canonical_path"],
                        sample_paths=list(data.get("sample_paths", [])),
                        role_sample_paths={k: list(v) for k, v in dict(data.get("role_sample_paths", {})).items()},
                        sources=list(data.get("sources", [])),
                        roles=list(data.get("roles", [])),
                        params=list(data.get("params", [])),
                        param_locations=dict(data.get("param_locations", {})),
                        sensitivity_tags=list(data.get("sensitivity_tags", [])),
                        business_flow=data.get("business_flow"),
                        owner_team=data.get("owner_team"),
                        observed_statuses=list(data.get("observed_statuses", [])),
                        response_fields=list(data.get("response_fields", [])),
                    )
                )
        return sorted(records, key=lambda r: (r.canonical_path, r.method))

    def summary(self) -> GraphSummary:
        counts: dict[str, int] = {
            "Endpoint": 0,
            "Role": 0,
            "Parameter": 0,
            "BusinessFlow": 0,
            "AssetOwner": 0,
        }
        for _, data in self.graph.nodes(data=True):
            nt = data.get("node_type", "")
            if nt in counts:
                counts[nt] += 1
        return GraphSummary(
            total_nodes=self.graph.number_of_nodes(),
            total_edges=self.graph.number_of_edges(),
            endpoints_count=counts["Endpoint"],
            roles_count=counts["Role"],
            params_count=counts["Parameter"],
            flows_count=counts["BusinessFlow"],
            owners_count=counts["AssetOwner"],
        )

    def export_openapi_31(self, title: str = "Inferred Target API", server_url: str = "http://127.0.0.1:8001") -> dict[str, Any]:
        """Generate an OpenAPI 3.1.0 specification as a by-product of discovery."""
        paths: dict[str, dict[str, Any]] = {}
        for ep in self.list_endpoints():
            path_item = paths.setdefault(ep.canonical_path, {})
            parameters: list[dict[str, Any]] = []
            body_props: dict[str, dict[str, str]] = {}

            # Path placeholders
            for seg in ep.canonical_path.split("/"):
                if seg.startswith("{") and seg.endswith("}"):
                    p_name = seg[1:-1]
                    parameters.append(
                        {"name": p_name, "in": "path", "required": True, "schema": {"type": "string"}}
                    )

            for p_name, loc in ep.param_locations.items():
                if loc == "query":
                    parameters.append(
                        {"name": p_name, "in": "query", "required": False, "schema": {"type": "string"}}
                    )
                elif loc == "body":
                    body_props[p_name] = {"type": "string"}

            op: dict[str, Any] = {
                "summary": f"Discovered {ep.method} {ep.canonical_path}",
                "tags": ep.sensitivity_tags or ["UNCLASSIFIED"],
                "x-discovered-sources": ep.sources,
                "x-roles": ep.roles,
                "x-owner-team": ep.owner_team,
                "responses": {
                    str(code): {"description": "Observed response"}
                    for code in (ep.observed_statuses or [200])
                },
            }
            if parameters:
                op["parameters"] = parameters
            if body_props and ep.method in ("POST", "PUT", "PATCH"):
                op["requestBody"] = {
                    "content": {
                        "application/json": {
                            "schema": {"type": "object", "properties": body_props}
                        }
                    }
                }
            path_item[ep.method.lower()] = op

        return {
            "openapi": "3.1.0",
            "info": {"title": title, "version": "inferred"},
            "servers": [{"url": server_url}],
            "paths": paths,
        }

    def save_json(self, output_path: Path) -> None:
        data = nx.node_link_data(self.graph, edges="links")
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        Path(output_path).write_text(json.dumps(data, indent=2), encoding="utf-8")

    @classmethod
    def load_json(cls, input_path: Path, ownership_config_path: Path | None = None) -> AppKnowledgeGraph:
        obj = cls(ownership_config_path=ownership_config_path)
        raw = json.loads(Path(input_path).read_text(encoding="utf-8"))
        obj.graph = nx.node_link_graph(raw, directed=True, multigraph=True, edges="links")
        return obj
