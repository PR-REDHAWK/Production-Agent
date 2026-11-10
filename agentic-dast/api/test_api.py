"""Integration tests for FastAPI Control Plane (api/app.py)."""

from __future__ import annotations

from pathlib import Path

import httpx

from api.app import create_control_app

BASE_DIR = Path(__file__).resolve().parent.parent


async def test_control_plane_full_lifecycle_and_sse(tmp_path: Path) -> None:
    app = create_control_app(
        configs_dir=BASE_DIR / "configs",
        base_dir=BASE_DIR,
        logs_path=BASE_DIR / "mock_tbo_target" / "sample_gateway_logs.jsonl",
        use_in_memory_mock=True,
        start_canary=True,
        audit_dir=tmp_path,
    )
    app.state.cp.start_local_canary()
    try:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://control-plane.local") as client:
            health = await client.get("/api/health")
            assert health.status_code == 200
            assert health.json()["mock_version"] == "v1.0"

            # Switch to vulnerable v1.1 and run full scan
            sw = await client.post(
                "/api/sim/switch",
                json={"version": "v1.1", "reset_state": True, "trigger_webhook": False},
            )
            assert sw.status_code == 200
            assert sw.json()["version"] == "v1.1"

            scan = await client.post("/api/scans/run", json={"auto_approve_hitl_execution": True})
            assert scan.status_code == 200
            scan_data = scan.json()
            assert scan_data["verification"]["verified_count"] >= 8

            # Verify graph, OpenAPI 3.1 download, inventory, tickets, HITL, gateway metrics
            graph_resp = await client.get("/api/graph")
            assert graph_resp.status_code == 200
            assert graph_resp.json()["summary"]["endpoints_count"] >= 10

            openapi_resp = await client.get("/api/openapi.json")
            assert openapi_resp.status_code == 200
            assert openapi_resp.json()["openapi"] == "3.1.0"

            inv_resp = await client.get("/api/inventory")
            assert inv_resp.status_code == 200
            assert inv_resp.json()["zombie_count"] >= 1
            assert inv_resp.json()["shadow_count"] >= 1

            hitl_resp = await client.get("/api/hitl")
            assert hitl_resp.status_code == 200
            pending = hitl_resp.json()["pending"]
            assert len(pending) >= 3

            for item in pending:
                dec = await client.post(f"/api/hitl/{item['approval_id']}/decide", json={"approve": True})
                assert dec.status_code == 200
                assert dec.json()["decision"] == "APPROVED"

            # Verify SSE stream emits recorded stage events cleanly
            sse_resp = await client.get("/api/events/stream?once=true")
            assert sse_resp.status_code == 200
            assert "event: stage" in sse_resp.text
            assert "data: " in sse_resp.text

            # Switch to v1.2 and trigger fix deploy webhook -> auto-retest closes tickets
            fix_sw = await client.post(
                "/api/sim/switch",
                json={"version": "v1.2", "reset_state": True, "trigger_webhook": True, "is_fix_deploy": True},
            )
            assert fix_sw.status_code == 200
            wh_res = fix_sw.json()["webhook_result"]
            assert wh_res["fixed_count"] == wh_res["retested_count"]
            assert wh_res["still_vulnerable_count"] == 0

            tickets_after = await client.get("/api/tickets")
            assert all(t["status"] == "VERIFIED_FIXED" for t in tickets_after.json())

            metrics_resp = await client.get("/api/gateway/metrics")
            assert metrics_resp.status_code == 200
            assert metrics_resp.json()["metrics"]["allowed_requests"] > 0
            assert len(metrics_resp.json()["recent_audit"]) > 0
    finally:
        app.state.cp.shutdown()
