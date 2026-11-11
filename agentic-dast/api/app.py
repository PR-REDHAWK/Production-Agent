"""FastAPI Control Plane exposing SSE stream, graph/OpenAPI, inventory, tickets, HITL, and metrics."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import socket
import threading
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any

import httpx
import networkx as nx
from fastapi import FastAPI, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

from agents.orchestrator import OrchestratorAgent, StageEvent
from agents.retest import RetestAgent
from agents.triage import TriageAgent
from agents.verifier import VerifierAgent
from mock_tbo_target.app import VersionLiteral, create_app as create_mock_target_app
from safety.audit import AuditLogger
from safety.gateway import SafetyGateway, load_scope_config
from safety.vault import TestCredentialVault
from triggers.watchers import ChangeEvent, DeployWebhookEvent

logger = logging.getLogger("agentic_dast.api")


class ScanRunRequest(BaseModel):
    delta_only: bool = False
    use_playwright: bool = False
    auto_approve_hitl_execution: bool = True
    background: bool = False


class HITLDecisionRequest(BaseModel):
    approve: bool


class SimSwitchRequest(BaseModel):
    version: VersionLiteral
    reset_state: bool = True
    trigger_webhook: bool = False
    is_fix_deploy: bool | None = None
    background: bool = False


class ControlPlaneState:
    """Holds live orchestrator, safety gateway, mock target (if local), and SSE subscribers."""

    def __init__(
        self,
        *,
        configs_dir: Path,
        base_dir: Path,
        logs_path: Path | None,
        target_base_url: str,
        use_in_memory_mock: bool = True,
        start_canary: bool = True,
        audit_dir: Path | None = None,
    ) -> None:
        self.configs_dir = configs_dir
        self.base_dir = base_dir
        self.logs_path = logs_path
        self.target_base_url = target_base_url.rstrip("/")
        self.use_in_memory_mock = use_in_memory_mock
        self.mock_app = create_mock_target_app("v1.0") if use_in_memory_mock else None
        self._async_transport = httpx.ASGITransport(app=self.mock_app) if self.mock_app else None

        scope_cfg = load_scope_config(configs_dir / "target_scope.yaml")
        vault = TestCredentialVault(configs_dir / "credentials.vault.json")
        if audit_dir is not None:
            audit_logger = AuditLogger(audit_dir / "audit_log.jsonl", audit_dir / "audit_log.db")
        else:
            audit_logger = AuditLogger(
                base_dir / scope_cfg.audit_log.jsonl_path,
                base_dir / scope_cfg.audit_log.sqlite_path,
            )
        self.gateway = SafetyGateway(
            scope_config=scope_cfg,
            vault=vault,
            audit_logger=audit_logger,
            async_login_transport=self._async_transport,
        )

        self._subscribers: set[asyncio.Queue[StageEvent]] = set()
        self.canary_hits: list[dict[str, Any]] = []
        self._canary_server: HTTPServer | None = None
        self._canary_thread: threading.Thread | None = None
        self._scan_lock = asyncio.Lock()
        self._background_tasks: set[asyncio.Task[Any]] = set()

        self.orchestrator = OrchestratorAgent(
            gateway=self.gateway,
            ownership_path=configs_dir / "ownership.json",
            logs_path=logs_path,
            base_url=self.target_base_url,
            async_transport=self._async_transport,
            on_event=self._broadcast_event,
        )
        self._start_canary_flag = start_canary

    def start_local_canary(self) -> None:
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
                if sock.connect_ex(("127.0.0.1", 8002)) == 0:
                    return
        except OSError as exc:
            logger.warning("Canary port check failed: %s", exc)
            return

        hits = self.canary_hits

        class _CanaryHandler(BaseHTTPRequestHandler):
            def do_POST(self) -> None:  # noqa: N802
                length = int(self.headers.get("Content-Length", "0"))
                raw = self.rfile.read(length).decode("utf-8", errors="replace")
                try:
                    parsed = json.loads(raw) if raw else {}
                except json.JSONDecodeError:
                    parsed = {"raw": raw}
                hits.append({"path": self.path, "body": parsed})
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b"canary-ok")

            def do_GET(self) -> None:  # noqa: N802
                hits.append({"path": self.path, "body": {}})
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b"canary-ok")

            def log_message(self, format: str, *args: object) -> None:
                return

        try:
            srv = HTTPServer(("127.0.0.1", 8002), _CanaryHandler)
            thread = threading.Thread(target=srv.serve_forever, daemon=True)
            thread.start()
            self._canary_server = srv
            self._canary_thread = thread
        except OSError as exc:
            logger.warning("Could not bind local OOB canary on 127.0.0.1:8002: %s", exc)

    def shutdown(self) -> None:
        for task in list(self._background_tasks):
            task.cancel()
        self._background_tasks.clear()
        if self._canary_server is not None:
            self._canary_server.shutdown()
            self._canary_server.server_close()
            self._canary_server = None
        if self._canary_thread is not None:
            self._canary_thread.join(timeout=2.0)
            self._canary_thread = None

    def _broadcast_event(self, event: StageEvent) -> None:
        for queue in list(self._subscribers):
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                logger.warning("Dropping SSE event for slow subscriber")

    def subscribe(self) -> asyncio.Queue[StageEvent]:
        queue: asyncio.Queue[StageEvent] = asyncio.Queue(maxsize=200)
        self._subscribers.add(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue[StageEvent]) -> None:
        self._subscribers.discard(queue)


def create_control_app(
    *,
    configs_dir: Path | None = None,
    base_dir: Path | None = None,
    logs_path: Path | None = None,
    target_base_url: str | None = None,
    use_in_memory_mock: bool | None = None,
    start_canary: bool = True,
    audit_dir: Path | None = None,
) -> FastAPI:
    resolved_base = base_dir or Path(__file__).resolve().parent.parent
    resolved_configs = configs_dir or Path(os.environ.get("DAST_CONFIGS_DIR", str(resolved_base / "configs")))
    resolved_logs = logs_path or Path(
        os.environ.get("DAST_LOGS_PATH", str(resolved_base / "mock_tbo_target" / "sample_gateway_logs.jsonl"))
    )
    resolved_target = target_base_url or os.environ.get("DAST_TARGET_BASE_URL", "http://127.0.0.1:8001")
    if use_in_memory_mock is None:
        in_memory = os.environ.get("DAST_TARGET_MODE", "in_memory").lower() != "live_http"
    else:
        in_memory = use_in_memory_mock

    state = ControlPlaneState(
        configs_dir=resolved_configs,
        base_dir=resolved_base,
        logs_path=resolved_logs,
        target_base_url=resolved_target,
        use_in_memory_mock=in_memory,
        start_canary=start_canary,
        audit_dir=audit_dir,
    )

    @asynccontextmanager
    async def _lifespan(_: FastAPI) -> AsyncIterator[None]:
        if state._start_canary_flag:
            state.start_local_canary()
        try:
            yield
        finally:
            state.shutdown()

    app = FastAPI(title="Agentic Real-Time DAST Control Plane", version="1.0.0", lifespan=_lifespan)
    app.state.cp = state

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/health")
    def health() -> dict[str, Any]:
        return {
            "status": "ok",
            "mode": "in_memory_mock" if state.use_in_memory_mock else "live_http",
            "target_base_url": state.target_base_url,
            "mock_version": state.mock_app.state.sim.version if state.mock_app else None,
            "canary_hits": len(state.canary_hits),
        }

    def _launch_background(coro: Any, label: str) -> None:
        async def _runner() -> None:
            try:
                async with state._scan_lock:
                    await coro()
                state.orchestrator._emit("scan_complete", f"{label} finished")
            except Exception as exc:  # noqa: BLE001
                logger.exception("Background %s failed: %s", label, exc)
                state.orchestrator._emit("scan_error", f"{label} failed: {exc}")

        task = asyncio.create_task(_runner())
        state._background_tasks.add(task)
        task.add_done_callback(state._background_tasks.discard)

    @app.post("/api/scans/run")
    async def run_scan(req: ScanRunRequest | None = None) -> dict[str, Any]:
        body = req or ScanRunRequest()
        if body.background:
            _launch_background(
                lambda: state.orchestrator.run_cycle(
                    change_event=ChangeEvent(
                        trigger_type="manual",
                        summary="Control-plane triggered scan",
                        delta_paths=[],
                    ),
                    use_playwright=body.use_playwright,
                    delta_only=body.delta_only,
                    auto_approve_hitl_execution=body.auto_approve_hitl_execution,
                ),
                "Full scan",
            )
            return {"status": "started"}

        async with state._scan_lock:
            report = await state.orchestrator.run_cycle(
                change_event=ChangeEvent(
                    trigger_type="manual",
                    summary="Control-plane triggered scan",
                    delta_paths=[],
                ),
                use_playwright=body.use_playwright,
                delta_only=body.delta_only,
                auto_approve_hitl_execution=body.auto_approve_hitl_execution,
            )
            return report.model_dump()

    @app.post("/webhooks/deploy")
    async def deploy_webhook(event: DeployWebhookEvent) -> dict[str, Any]:
        async with state._scan_lock:
            result = await state.orchestrator.handle_deploy_webhook(event, auto_approve_hitl_execution=True)
            return result.model_dump()

    @app.post("/api/sim/switch")
    async def sim_switch(req: SimSwitchRequest) -> dict[str, Any]:
        if state.mock_app is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Simulator controls are only available in in_memory_mock mode",
            )
        if req.reset_state:
            state.mock_app.state.sim.reset(version=req.version)
            # Clear cached vault tokens so reset users get fresh tokens cleanly
            for actor in state.gateway.vault.list_actors():
                state.gateway.vault.clear_token(actor)
        else:
            state.mock_app.state.sim.version = req.version

        state.orchestrator._emit("sim_switch", f"Target switched to {req.version}", version=req.version)

        webhook_result: dict[str, Any] | None = None
        if req.trigger_webhook:
            is_fix = req.is_fix_deploy if req.is_fix_deploy is not None else (req.version == "v1.2")
            deploy_ev = DeployWebhookEvent(
                commit=f"sim-{req.version}",
                changed_services=["bookings", "users", "suppliers", "pricing", "legacy"],
                release_notes=f"Simulated deploy {req.version}",
                environment="staging",
                is_fix_deploy=is_fix,
            )
            if req.background:
                _launch_background(
                    lambda: state.orchestrator.handle_deploy_webhook(
                        deploy_ev,
                        auto_approve_hitl_execution=True,
                    ),
                    f"Deploy {req.version}",
                )
                return {"status": "started", "version": state.mock_app.state.sim.version, "webhook_result": None}

            async with state._scan_lock:
                res = await state.orchestrator.handle_deploy_webhook(
                    deploy_ev,
                    auto_approve_hitl_execution=True,
                )
                webhook_result = res.model_dump()

        return {"version": state.mock_app.state.sim.version, "webhook_result": webhook_result}

    @app.get("/api/events/stream")
    async def stream_events(once: bool = False) -> StreamingResponse:
        queue = state.subscribe()

        async def _generator() -> AsyncIterator[str]:
            try:
                for past in state.orchestrator.timeline[-40:]:
                    yield f"event: stage\ndata: {past.model_dump_json()}\n\n"
                if once:
                    return
                while True:
                    try:
                        ev = await asyncio.wait_for(queue.get(), timeout=15.0)
                        yield f"event: stage\ndata: {ev.model_dump_json()}\n\n"
                    except asyncio.TimeoutError:
                        yield ": heartbeat\n\n"
            finally:
                state.unsubscribe(queue)

        return StreamingResponse(_generator(), media_type="text/event-stream")

    @app.get("/api/events/history")
    def events_history() -> list[dict[str, Any]]:
        return [ev.model_dump() for ev in state.orchestrator.timeline[-100:]]

    @app.get("/api/graph")
    def get_graph() -> dict[str, Any]:
        kg = state.orchestrator.graph
        raw = nx.node_link_data(kg.graph, edges="links")
        return {
            "summary": kg.summary().model_dump(),
            "endpoints": [ep.model_dump() for ep in kg.list_endpoints()],
            "nodes": raw.get("nodes", []),
            "links": raw.get("links", []),
        }

    @app.get("/api/openapi.json")
    def download_openapi() -> Response:
        spec = state.orchestrator.latest_openapi or state.orchestrator.graph.export_openapi_31(
            server_url=state.target_base_url
        )
        return JSONResponse(
            content=spec,
            headers={"Content-Disposition": 'attachment; filename="inferred-openapi-3.1.json"'},
        )

    @app.get("/api/inventory")
    def get_inventory() -> dict[str, Any]:
        inv = state.orchestrator.latest_inventory
        if inv is None:
            return {"total_endpoints": 0, "active_count": 0, "zombie_count": 0, "shadow_count": 0, "entries": []}
        return inv.model_dump()

    @app.get("/api/tickets")
    def get_tickets() -> list[dict[str, Any]]:
        return [t.model_dump() for t in state.orchestrator.tickets]

    @app.post("/api/tickets/{ticket_id}/retest")
    async def retest_ticket(ticket_id: str) -> dict[str, Any]:
        ticket = next((t for t in state.orchestrator.tickets if t.ticket_id == ticket_id), None)
        if ticket is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")

        exec_req = state.orchestrator.hitl_queue.submit_execution_request(
            description=f"Manual retest for {ticket_id}",
            target_ref=ticket.finding.canonical_endpoint,
            risk_level="HIGH",
        )
        state.orchestrator.hitl_queue.approve(exec_req.approval_id)
        verifier = VerifierAgent(
            state.gateway,
            base_url=state.target_base_url,
            async_transport=state._async_transport,
            hitl_approval_id=exec_req.approval_id,
        )
        retest = RetestAgent(verifier)
        outcome = await retest.retest_ticket(ticket)
        state.orchestrator._emit(
            "retest",
            f"Retested {ticket.ticket_id}: {outcome.previous_status} -> {outcome.new_status}",
            ticket_id=ticket.ticket_id,
            fixed=outcome.fixed,
        )
        return {"outcome": outcome.model_dump(), "ticket": ticket.model_dump()}

    @app.get("/api/hitl")
    def get_hitl() -> dict[str, Any]:
        all_items = state.orchestrator.hitl_queue.list_all()
        pending = [i for i in all_items if i.decision == "PENDING"]
        return {
            "pending_count": len(pending),
            "pending": [i.model_dump() for i in pending],
            "all": [i.model_dump() for i in all_items],
        }

    @app.post("/api/hitl/{approval_id}/decide")
    def decide_hitl(approval_id: str, req: HITLDecisionRequest) -> dict[str, Any]:
        all_items = {i.approval_id: i for i in state.orchestrator.hitl_queue.list_all()}
        item = all_items.get(approval_id)
        if item is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Approval ID not found")

        if item.kind == "HIGH_SEVERITY_TICKET":
            triage = TriageAgent(state.orchestrator.graph, hitl_queue=state.orchestrator.hitl_queue)
            ticket = next((t for t in state.orchestrator.tickets if t.ticket_id == item.target_ref), None)
            if ticket is not None:
                triage.apply_hitl_decision(ticket, approve=req.approve)
        else:
            if req.approve:
                state.orchestrator.hitl_queue.approve(approval_id)
            else:
                state.orchestrator.hitl_queue.reject(approval_id)

        state.orchestrator._emit(
            "hitl_decision",
            f"HITL {approval_id} {'APPROVED' if req.approve else 'REJECTED'}",
            approval_id=approval_id,
            approved=req.approve,
        )
        return item.model_dump()

    @app.get("/api/gateway/metrics")
    def get_gateway_metrics() -> dict[str, Any]:
        recent = [rec.model_dump() for rec in state.gateway.audit.read_recent(limit=40)]
        return {
            "metrics": state.gateway.metrics(),
            "recent_audit": recent,
            "canary_hits": list(state.canary_hits),
        }

    return app


app = create_control_app(start_canary=True)
