"""Unit tests for AppKnowledgeGraph and OpenAPI 3.1 export (Phase 2)."""

from __future__ import annotations

from pathlib import Path

from graph.knowledge_graph import AppKnowledgeGraph

OWNERSHIP_PATH = Path(__file__).resolve().parent.parent / "configs" / "ownership.json"


def test_knowledge_graph_nodes_edges_and_openapi_31(tmp_path: Path) -> None:
    kg = AppKnowledgeGraph(ownership_config_path=OWNERSHIP_PATH)

    kg.add_endpoint(
        method="GET",
        canonical_path="/api/v3/search",
        source="role_crawl",
        role="agency_a_admin",
        params={"city": "query"},
        status_code=200,
    )
    kg.add_endpoint(
        method="POST",
        canonical_path="/api/v3/holds",
        source="role_crawl",
        role="agency_a_admin",
        params={"item_id": "body", "quantity": "body"},
        status_code=200,
    )
    kg.add_endpoint(
        method="POST",
        canonical_path="/api/v3/bookings",
        source="role_crawl",
        role="agency_a_subagent",
        params={"hold_id": "body", "traveller_passport": "body"},
        status_code=200,
        response_fields=["booking_id", "total_fare", "traveller_passport"],
    )
    kg.add_endpoint(
        method="POST",
        canonical_path="/api/v3/bookings/{id}/pay",
        source="role_crawl",
        role="agency_b_admin",
        params={"amount": "body"},
        status_code=200,
    )
    kg.add_endpoint(
        method="POST",
        canonical_path="/api/v3/suppliers/webhook-test",
        source="js_bundle",
        role="agency_a_admin",
        params={"callback_url": "body"},
        status_code=200,
    )

    summary = kg.summary()
    assert summary.endpoints_count == 5
    assert summary.roles_count == 3
    assert summary.owners_count == 3
    assert summary.flows_count >= 4

    edge_types = {data["edge_type"] for _, _, data in kg.graph.edges(data=True)}
    assert {"ACCEPTS_PARAM", "ACCESSIBLE_BY_ROLE", "FLOW_STEP", "OWNED_BY"}.issubset(edge_types)

    endpoints = {ep.canonical_path: ep for ep in kg.list_endpoints()}
    assert "PUBLIC_SEARCH" in endpoints["/api/v3/search"].sensitivity_tags
    assert "BOOKINGS" in endpoints["/api/v3/bookings"].sensitivity_tags
    assert "PII_TRAVELLER" in endpoints["/api/v3/bookings"].sensitivity_tags
    assert "PAYMENTS_CREDIT" in endpoints["/api/v3/bookings/{id}/pay"].sensitivity_tags
    assert "SUPPLIER_ADMIN" in endpoints["/api/v3/suppliers/webhook-test"].sensitivity_tags

    spec = kg.export_openapi_31()
    assert spec["openapi"] == "3.1.0"
    assert "/api/v3/bookings/{id}/pay" in spec["paths"]
    assert "post" in spec["paths"]["/api/v3/bookings/{id}/pay"]

    save_file = tmp_path / "graph.json"
    kg.save_json(save_file)
    loaded = AppKnowledgeGraph.load_json(save_file, ownership_config_path=OWNERSHIP_PATH)
    assert loaded.summary().endpoints_count == 5
