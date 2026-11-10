# Agentic Real-Time DAST (TBO Security Hackathon 2026)

Hybrid neuro-symbolic autonomous security agents that watch deploys and JS/log deltas, discover undocumented B2B travel APIs, catch business-logic & access-control flaws safely through a fail-closed `SafetyGateway`, verify findings with deterministic PoCs, classify Active/Zombie/Shadow APIs, and auto-retest after fixes.

## Architecture Overview
- **Deterministic Enforcement (`safety/`):** `SafetyGateway` wraps all outbound HTTP (`SafeClient` / `SafeAsyncClient`) and Playwright traffic (`create_playwright_route_handler`). Enforces `configs/target_scope.yaml` allowlists, external redirect blocking, per-host/endpoint token-bucket rate limits, p95/5xx `EMERGENCY_PAUSE` circuit breaking, global `DELETE` guards, symbolic actor token injection (`TestCredentialVault`), and append-only JSONL + SQLite WAL audit logs.
- **Discovery & Inventory (`recon/`, `graph/`, `inventory/`):** Role-based crawling (`agency_a_admin`, `agency_a_subagent`, `agency_b_admin`), JS bundle string/template extraction, gateway log correlation, NetworkX `AppKnowledgeGraph` with OpenAPI 3.1 export, and `Active` / `Zombie` / `Shadow` classification.
- **Autonomous Loop (`triggers/`, `agents/`):** Deploy webhooks (`POST /webhooks/deploy`) & JS bundle diff watchers trigger delta-first `AttackPlannerAgent` -> 5 specialist executors (`idor`, `business_logic`, `auth`, `hygiene`, `injection_ssrf`) -> deterministic code-based `VerifierAgent` -> `TriageAgent` + `HITLQueue` -> `RetestAgent`.
- **Control Plane & Dashboard (`api/`, `dashboard/`):** FastAPI SSE backend + Vite React Tailwind UI.

## Quickstart (Local Simulator Mode)
1. **Run test suite:**
   ```powershell
   cd agentic-dast
   python -m pytest -v
   ```
2. **Start the FastAPI Control Plane (includes in-memory `mock_tbo_target` + local OOB canary on port `8002`):**
   ```powershell
   cd agentic-dast
   uvicorn api.app:app --host 127.0.0.1 --port 8000
   ```
3. **Start the Vite + React + Tailwind Dashboard:**
   ```powershell
   cd agentic-dast/dashboard
   npm install
   npm run dev
   ```
   Open `http://127.0.0.1:5173`. Click **Deploy v1.1 (Vuln)** -> watch live SSE events & inspect verified findings/PoCs -> approve HITL items -> click **Deploy v1.2 (Fix & Retest)** to watch `RetestAgent` transition tickets to `VERIFIED_FIXED`.

## Adapter Guide: Connecting to TBO Live Staging (`configs/target_scope.yaml`)
To switch from `mock_tbo_target/` to TBO's live hackathon staging environment without changing agent code:

1. **Update `configs/target_scope.yaml`:**
   - Replace `mock_tbo_target` under `approved_targets` with your approved staging target:
     ```yaml
     approved_targets:
       - name: "tbo_staging"
         schemes: ["https"]
         hosts: ["staging-api.example-tbo.test"]
         ports: [443]
         allowed_path_prefixes: ["/api/", "/v1/", "/v2/", "/v3/", "/"]
         blocked_path_patterns: ["^/admin/destroy", "^/billing/settlement"]
     ```
   - Keep `local_oob_canary` (`http://127.0.0.1:8002/canary/`) if testing SSRF locally, or point to your approved internal canary listener.
   - Tune `rate_limits` (`global_rps`, `per_endpoint_rps`, `burst_capacity`) and `circuit_breaker` (`max_p95_latency_ms`, `max_5xx_ratio`) to stay well within staging rules of engagement.

2. **Update `configs/credentials.vault.json`:**
   - Configure the provided staging test accounts under `actors` (`agency_a_admin`, `agency_a_subagent`, `agency_b_admin`) pointing `login_url` to staging's login endpoint and supplying synthetic test passwords via environment variables (`password_env`). Never commit live secrets or real tokens.

3. **Update `configs/ownership.json`:**
   - Map staging route prefixes (`/api/v3/bookings`, `/api/v3/payments`, etc.) to TBO asset owner teams and Slack/Jira targets.

4. **Point Control Plane Env Vars to Live Staging:**
   ```powershell
   $env:DAST_TARGET_MODE = "live_http"
   $env:DAST_TARGET_BASE_URL = "https://staging-api.example-tbo.test"
   $env:DAST_LOGS_PATH = "C:\path\to\staging_gateway_30_90d.jsonl"
   # Optional Gemini API enrichment (falls back to deterministic planner if unset):
   $env:LLM_PROVIDER = "gemini"
   $env:GEMINI_API_KEY = "<your-key>"
   uvicorn api.app:app --host 127.0.0.1 --port 8000
   ```

5. **Wire CI/CD Deploy Webhook:**
   Configure your CI/CD pipeline to `POST` release payloads to `http://<control-plane>:8000/webhooks/deploy`:
   ```json
   {
     "commit": "a1b2c3d",
     "changed_services": ["bookings", "/api/v3/bookings/88412/confirm"],
     "release_notes": "Updated fare calculation and confirmation guard",
     "environment": "staging",
     "is_fix_deploy": false
   }
   ```
   Set `"is_fix_deploy": true` on fix rollouts to trigger automatic PoC re-verification via `RetestAgent`.
