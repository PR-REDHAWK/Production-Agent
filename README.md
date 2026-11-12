# Agentic Real-Time DAST

Autonomous, continuous, and safety-bounded Dynamic Application Security Testing (DAST) platform designed for multi-tenant B2B web applications and APIs.

The platform watches deployments, client-side JavaScript bundles, traffic logs, and DNS/TLS metadata in real time; maps undocumented endpoints and workflows into a structured Knowledge Graph without requiring an OpenAPI specification; executes bounded, code-verified security probes through a fail-closed `SafetyGateway`; classifies Active, Zombie, and Shadow APIs; enforces Human-in-the-Loop (HITL) approval on high-risk actions and findings; and automatically re-verifies fixes when new releases ship.

---

## Table of Contents

1. [Core Capabilities](#core-capabilities)
2. [Project Architecture](#project-architecture)
3. [Safety-First Design](#safety-first-design)
4. [Vulnerability Coverage](#vulnerability-coverage)
5. [Codebase Structure](#codebase-structure)
6. [Control Plane API Reference](#control-plane-api-reference)
7. [Prerequisites](#prerequisites)
8. [Running Locally](#running-locally)
9. [Running the Test Suite](#running-the-test-suite)
10. [Configuration and Live Staging Adaptation](#configuration-and-live-staging-adaptation)

---

## Core Capabilities

- **Event-Driven Change Detection:** Responds immediately to CI/CD deploy webhooks (`POST /webhooks/deploy`), JavaScript bundle hash/route diffs (`BundleWatcher`), gateway log deltas (`LogDeltaWatcher`), and host/DNS/TLS certificate drift (`DNSCertWatcher`), either on demand (`POST /api/watchers/poll`) or via an optional background polling loop (`DAST_WATCH_INTERVAL_SECONDS`).
- **Zero-Spec Multi-Modal Reconnaissance:** Discovers endpoints, parameter locations, and response schemas through role-based API crawling, interactive headless Chromium UI flows via Playwright, static JS bundle string/template parsing, and ingestion of HAR 1.2 JSON files, JSONL gateway logs, and NGINX/Apache combined access logs.
- **App Knowledge Graph and OpenAPI 3.1 Inference:** Builds a typed NetworkX `MultiDiGraph` linking endpoints, parameters, roles, business flows (`search -> hold -> book -> pay -> cancel -> refund`), sensitivity tags, and ownership teams, and exports an inferred OpenAPI 3.1 JSON specification.
- **Zombie and Shadow API Governance:** Correlates live discovered attack surfaces against historical traffic logs to classify endpoints as `Active`, `Zombie`, or `Shadow`, detecting unauthenticated reachability and PII exposure with actionable recommendations (`DECOMMISSION`, `RESTRICT`, `UPDATE`).
- **Hybrid Neuro-Symbolic Planning with Prompt-Injection Isolation:** Uses deterministic heuristics as the core engine, optionally enriched by structured-JSON LLM planning (`gemini`, `openai`, `ollama`, or `deterministic` offline fallback) where target-derived schemas are wrapped inside `<UNTRUSTED_TARGET_SCHEMA>` tags and credentials never enter prompts.
- **Zero-False-Positive Deterministic Verification:** No finding is ever accepted on LLM judgment alone. `VerifierAgent` replays baseline controls and exploit PoCs against concrete assertion oracles (and mints fresh per-replay out-of-band canary tokens for blind SSRF verification) before emitting a reproducible `$ACTOR_TOKEN`-parameterized `curl` PoC.
- **HITL Gates and Automated Fix Retesting:** Routes `HIGH` and `CRITICAL` risky test steps and severity tickets through `HITLQueue`, deduplicates tickets by vulnerability signature, and automatically re-runs verified PoCs on `is_fix_deploy: true` webhooks to transition tickets between `OPEN`, `VERIFIED_FIXED`, and `STILL_VULNERABLE`.

---

## Project Architecture

### Autonomous Continuous Loop

```
  [1. Change Detection & Watchers]
      Deploy Webhook / BundleWatcher / LogDeltaWatcher / DNSCertWatcher
                     |
                     v
  [2. Zero-Spec Reconnaissance]
      Playwright UI Flow Crawler + JS Bundle Extractor + Role API Flows + HAR/Logs
                     |
                     v
  [3. Knowledge Graph & Inventory]
      NetworkX AppKnowledgeGraph -> OpenAPI 3.1 Export + Active/Zombie/Shadow Report
                     |
                     v
  [4. Delta-First Attack Planning]
      AttackPlannerAgent (delta_only prioritization + optional LLMAdapter hypotheses)
                     |
                     v
  [5. Bounded Security Execution]  <=====>  [HITLQueue Gate (HIGH / CRITICAL)]
      IDOR | BusinessLogic | Auth | Hygiene | InjectionSSRF (CandidateFinding[])
                     |
                     v
  [6. Deterministic Code Verification]
      VerifierAgent (baseline control + exploit replay + fresh OOB canary confirmation)
                     |
                     v
  [7. Business Triage & Reporting]
      TriageAgent (dedupe, ownership mapping, business impact, HITL review queue)
                     |
                     v
  [8. Continuous Re-Verification]
      Fix Deploy Webhook / Manual Retest -> RetestAgent -> VERIFIED_FIXED / STILL_VULNERABLE
```

### Runtime Perimeter

Every outbound HTTP request and Playwright browser network call made by recon, watchers, executors, verifier, and retest agents passes strictly through `SafetyGateway`:

```
  Agents / Crawlers / Watchers
        |  (SafeClient / SafeAsyncClient / create_playwright_route_handler)
        v
  [ SafetyGateway ]
    |-- ScopeValidator        (scheme/host/port/prefix allowlists + blocked patterns)
    |-- DestructiveGuard      (blocks global DELETE and destructive URL keywords)
    |-- RateLimiter           (per-host & per-canonical-endpoint token buckets + micro-burst cap)
    |-- CircuitBreaker        (trips to EMERGENCY_PAUSE on p95 latency or 5xx ratio breach)
    |-- TestCredentialVault   (resolves symbolic actors; scrubs secrets from logs)
    |-- AuditLogger           (immutable append-only JSONL + SQLite WAL audit trail)
        |
        v
  Approved Target (`127.0.0.1:8001` or Staging) + Approved OOB Canary (`127.0.0.1:8002`)
```

---

## Safety-First Design

- **Fail-Closed Scope Enforcement:** Any host, port, scheme, path prefix, or redirect target outside `configs/target_scope.yaml` raises `ScopeViolationError` and is recorded in the audit log before leaving the process.
- **Credential Isolation:** Agents only pass symbolic actor names (`agency_a_admin`, `agency_a_subagent`, `agency_b_admin`, `unauthenticated`). `TestCredentialVault` handles login token resolution at request time and redacts JWTs, headers, and credentials from logs and `repro_curl` outputs.
- **Blast-Radius Controls:** Global `DELETE` requests on collection routes, destructive keywords (e.g., `destroy`, `drop`, `wipe`, `reset`), and excessive payload iterations per parameter (`max_payload_iterations_per_param`) are rejected with `DestructiveActionError`.
- **Automatic Health Protection:** If target p95 latency exceeds `max_p95_latency_ms` (`2000 ms` default) or 5xx error ratio exceeds `max_5xx_ratio` (`0.25` default), `SafetyGateway` enters `EMERGENCY_PAUSE` until the cooldown window expires.

---

## Vulnerability Coverage

| Vulnerability Class | Specific Checks Implemented | Executor / Component |
| :--- | :--- | :--- |
| Cross-Tenant Access Control | Cross-agency resource IDOR (`role_sample_paths` & schema-driven field comparison across `agency_id`, `tenant_id`, `org_id`, `owner_agency`) | `IDORExecutor` |
| Privilege Escalation & API Hygiene | Sub-agent role elevation (`PATCH /api/v3/users/me` with `role: admin`), `credit_limit` mass assignment, traveller PII exposure, unhandled traceback detection | `IDORExecutor`, `HygieneExecutor` |
| Business Logic Abuse | Client-supplied fare tampering & negative quantity, unpaid booking confirmation bypass, single-use coupon replay, post-cancellation double refund (HITL-gated) | `BusinessLogicExecutor` |
| Authentication & Session Flaws | Unauthenticated protected resource access, forged `alg=none` JWT validation bypass, logged-out token revocation bypass | `AuthExecutor` |
| Server-Side Injection & SSRF | Out-of-band SSRF against local OOB canary (`GET /canary/__hits/{canary_id}` verification + replay token rotation), SQLi syntax error probes, SSTI `{{7*7}}` evaluation probes | `InjectionSSRFExecutor` |
| Zombie & Shadow API Risks | Deprecated unauthenticated endpoints leaking PII (`/api/v1/bookings/{id}`), undocumented traffic-only routes (`/internal/shadow-export`) | `InventoryAgent` |

---

## Codebase Structure

```
HACKATHON/
├── README.md                                     # Root project documentation
├── rules.md                                      # Engineering & safety constraints
├── Fraud Prevention & Security.pdf               # Hackathon specification & judging brief
├── .gitignore
└── agentic-dast/
    ├── pyproject.toml                            # Python package metadata & pytest config
    ├── README.md                                 # Component quickstart & staging notes
    ├── configs/
    │   ├── target_scope.yaml                     # Approved targets, canary scope, rate limits, breaker, guards
    │   ├── credentials.vault.json                # Synthetic actor credential config (env-backed passwords)
    │   └── ownership.json                        # Route prefix -> engineering team / Jira / Slack mapping
    ├── safety/
    │   ├── models.py                             # ScopeConfig, AuditRecord, safety exception hierarchy
    │   ├── vault.py                              # TestCredentialVault & secret scrubbing regexes
    │   ├── audit.py                              # Append-only JSONL + SQLite WAL AuditLogger
    │   ├── gateway.py                            # SafetyGateway, SafeClient, SafeAsyncClient, Playwright router
    │   └── test_safety.py                        # Fail-closed safety invariant tests
    ├── triggers/
    │   ├── watchers.py                           # DeployWebhookEvent, BundleWatcher, LogDeltaWatcher, DNSCertWatcher
    │   └── test_triggers.py                      # Webhook, JS bundle diff, log delta, and DNS drift tests
    ├── recon/
    │   ├── crawler.py                            # ReconAgent, Playwright UI flow crawler, JS parser, HAR/log parser
    │   └── test_recon.py                         # Zero-spec discovery, Playwright Chromium crawl, HAR/NGINX tests
    ├── graph/
    │   ├── models.py                             # EndpointRecord, GraphSummary, typed node/edge schemas
    │   ├── knowledge_graph.py                    # AppKnowledgeGraph (NetworkX MultiDiGraph + OpenAPI 3.1 export)
    │   └── test_graph.py                         # Graph construction and OpenAPI 3.1 validation tests
    ├── inventory/
    │   ├── models.py                             # InventoryEntry, InventoryReport schemas
    │   ├── classifier.py                         # InventoryAgent (Active / Zombie / Shadow + PII/auth checks)
    │   └── test_inventory.py                     # Classification and HAR ingestion tests
    ├── agents/
    │   ├── llm_adapter.py                        # Provider-agnostic LLMAdapter (gemini/openai/ollama/deterministic)
    │   ├── planner.py                            # AttackPlannerAgent, AttackPlan, AttackTask, CandidateFinding
    │   ├── verifier.py                           # VerifierAgent, AssertionOracle evaluator, fresh OOB canary replay
    │   ├── triage.py                             # TriageAgent, HITLQueue, TriagedTicket deduplication
    │   ├── retest.py                             # RetestAgent for post-fix verification cycles
    │   ├── orchestrator.py                       # OrchestratorAgent coordinating the 8-stage autonomous loop
    │   ├── executors/
    │   │   ├── idor.py                           # IDORExecutor (dynamic role-scoped IDOR & role escalation)
    │   │   ├── business_logic.py                 # BusinessLogicExecutor (fare, skip-pay, coupon, double-refund)
    │   │   ├── auth.py                           # AuthExecutor (unauth, JWT alg=none, revoked token replay)
    │   │   ├── hygiene.py                        # HygieneExecutor (mass assignment, PII & traceback checks)
    │   │   └── injection_ssrf.py                 # InjectionSSRFExecutor (OOB canary SSRF, SQLi, SSTI, Nuclei wrapper)
    │   └── test_agents.py                        # Planner, verifier, HITL, blind SSRF, dynamic IDOR, orchestrator tests
    ├── api/
    │   ├── app.py                                # FastAPI Control Plane, SSE stream, OOB canary server, watcher loop
    │   └── test_api.py                           # Control plane lifecycle, SSE, and watcher delta-scan integration tests
    ├── dashboard/                                # Vite + React + Tailwind DAST Security Console (port 5173)
    │   ├── package.json
    │   ├── vite.config.js
    │   └── src/App.jsx
    └── mock_tbo_target/                          # Simulated Multi-Tenant B2B Travel Platform + SQLite DB (port 8001)
        ├── app.py                                # Target API with toggleable v1.0 / v1.1 / v1.2 releases
        ├── db.py                                 # SQLite persistence layer (mock_tbo.db)
        ├── logs_generator.py                     # Synthetic 90-day gateway traffic log generator
        ├── sample_gateway_logs.jsonl             # Pre-generated sample traffic including Zombie/Shadow hits
        ├── test_mock_target.py                   # Target lifecycle and versioned vulnerability regression tests
        └── portal/                               # Vite + React + Tailwind demo travel portal UI (port 5174 / built dist)
            ├── package.json
            ├── vite.config.js
            └── src/App.jsx
```

---

## Control Plane API Reference

| Method & Path | Description |
| :--- | :--- |
| `GET /api/health` | Returns control plane mode (`in_memory_mock` or `live_http`), target URL, mock version, and OOB canary hit count. |
| `POST /api/scans/run` | Triggers an immediate or background scan (`delta_only`, `use_playwright`, `auto_approve_hitl_execution`, `background`). |
| `POST /api/watchers/poll` | Polls `BundleWatcher`, `LogDeltaWatcher`, and `DNSCertWatcher` once and runs delta scans for any detected changes. |
| `POST /webhooks/deploy` | Accepts a `DeployWebhookEvent` (`commit`, `changed_services`, `release_notes`, `is_fix_deploy`) to trigger delta scans or fix retesting. |
| `POST /api/sim/switch` | Switches the target release (`v1.0`, `v1.1`, `v1.2`) and optionally resets state and triggers a deploy webhook. |
| `GET /api/events/stream` | Server-Sent Events (`text/event-stream`) feed streaming live `StageEvent` execution milestones (`once=true` supported for snapshot polling). |
| `GET /api/events/history` | Returns the latest 100 recorded `StageEvent` entries. |
| `GET /api/graph` | Returns Knowledge Graph summary counts, discovered `EndpointRecord` entries, and NetworkX node/link JSON. |
| `GET /api/openapi.json` | Exports the dynamically inferred OpenAPI 3.1 JSON schema for the discovered API surface. |
| `GET /api/inventory` | Returns the latest Active / Zombie / Shadow API inventory report. |
| `GET /api/tickets` | Lists all deduplicated `TriagedTicket` findings with status, severity, owner team, business impact, and `repro_curl`. |
| `POST /api/tickets/{ticket_id}/retest` | Re-runs deterministic verification for a single ticket. |
| `GET /api/hitl` | Lists pending and resolved Human-in-the-Loop approvals (`RISKY_TEST_EXECUTION` and `HIGH_SEVERITY_TICKET`). |
| `POST /api/hitl/{approval_id}/decide` | Approves or rejects a pending HITL item (`{"approve": true}`). |
| `GET /api/gateway/metrics` | Returns `SafetyGateway` allow/block counters, circuit-breaker telemetry, recent audit entries, and canary callback hits. |
| `POST\|GET /canary/{canary_id}` | Local OOB SSRF canary listener (`127.0.0.1:8002`) recording target callbacks (`GET /canary/__hits/{canary_id}` queries hit counts). |

---

## Prerequisites

- **Python:** 3.11 or newer (`>=3.11` required in `agentic-dast/pyproject.toml`)
- **Node.js and npm:** Needed to run or rebuild the Vite React frontend apps (`dashboard/` and `mock_tbo_target/portal/`)
- **Playwright Chromium:** Needed for browser-based UI reconnaissance and Playwright route interception tests

Install Python dependencies and the headless Chromium browser from `agentic-dast/`:

```powershell
cd agentic-dast
python -m pip install -e ".[dev]"
python -m playwright install chromium
```

---

## Running Locally

### Option 1: All-in-One Simulator Mode (Quickstart)

This mode starts the FastAPI Control Plane (`127.0.0.1:8000`) with the `mock_tbo_target` running in memory and the local OOB canary server active on `127.0.0.1:8002`.

1. **Start the DAST Control Plane (Terminal 1):**

   ```powershell
   cd agentic-dast
   python -m uvicorn api.app:app --host 127.0.0.1 --port 8000
   ```

2. **Start the DAST Security Console UI (Terminal 2):**

   ```powershell
   cd agentic-dast/dashboard
   npm install
   npm run dev
   ```

3. **Walk Through the Workflow:**
   - Open `http://127.0.0.1:5173`.
   - Click **Deploy v1.1 (Vuln)** to simulate a vulnerable deployment webhook and watch live SSE stage progress.
   - Review the **Findings & PoC Viewer**, **Live SSE Feed & Audit**, **Knowledge Graph**, and **Zombie / Shadow Inventory** tabs, or download **OpenAPI 3.1 JSON**.
   - Open the **HITL Queue** modal to approve or reject pending `HIGH`/`CRITICAL` tickets.
   - Click **Deploy v1.2 (Fix & Retest)** to trigger `RetestAgent` and observe tickets automatically verify and transition to `VERIFIED_FIXED`.

---

### Option 2: Live HTTP Mode with Standalone Demo Portal + SQLite

This mode runs the simulated B2B travel backend and portal as an independent HTTP service (`127.0.0.1:8001`) backed by SQLite (`agentic-dast/mock_tbo_target/mock_tbo.db`) while the DAST Control Plane (`127.0.0.1:8000`) scans it over real HTTP through `SafetyGateway`.

1. **Start the Standalone Demo Travel Backend (Terminal 1):**

   ```powershell
   cd agentic-dast
   python -m uvicorn mock_tbo_target.app:app --host 127.0.0.1 --port 8001
   ```

2. **(Optional) Start the Standalone Travel Portal Dev Server (Terminal 2):**
   If `agentic-dast/mock_tbo_target/portal/dist/` is already built, `127.0.0.1:8001/` serves the React portal directly. To run Vite in dev mode with hot reload instead:

   ```powershell
   cd agentic-dast/mock_tbo_target/portal
   npm install
   npm run dev -- --host 127.0.0.1 --port 5174
   ```

3. **Start the DAST Control Plane in Live HTTP Mode (Terminal 3):**

   ```powershell
   cd agentic-dast
   $env:DAST_TARGET_MODE = "live_http"
   $env:DAST_TARGET_BASE_URL = "http://127.0.0.1:8001"
   python -m uvicorn api.app:app --host 127.0.0.1 --port 8000
   ```

   To also enable continuous periodic polling of `BundleWatcher`, `LogDeltaWatcher`, and `DNSCertWatcher` in the background, set:

   ```powershell
   $env:DAST_WATCH_INTERVAL_SECONDS = "15"
   ```

4. **Start the DAST Security Console UI (Terminal 4):**

   ```powershell
   cd agentic-dast/dashboard
   npm install
   npm run dev
   ```

   Open `http://127.0.0.1:5173` (DAST Security Console) alongside `http://127.0.0.1:8001` or `http://127.0.0.1:5174` (B2B Travel Portal).

---

## Running the Test Suite

Run the entire test suite (covers `mock_tbo_target`, `safety`, `graph`, `recon`, `inventory`, `triggers`, `agents`, and `api`) sequentially from the repository root:

```powershell
python -m pytest agentic-dast -c agentic-dast/pyproject.toml -v
```

Or from inside `agentic-dast/`:

```powershell
cd agentic-dast
python -m pytest -v
```

Notes:
- Tests run sequentially against isolated ephemeral OOB canary ports (`canary_port=0`) and in-memory SQLite (`:memory:` when `PYTEST_CURRENT_TEST` is set), so they do not overwrite local runtime `mock_tbo.db` data.
- `test_recon_playwright_real_chromium_crawl` launches headless Chromium via Playwright; ensure `python -m playwright install chromium` has been executed beforehand.
- If `GEMINI_API_KEY` is present in `agentic-dast/agents/.env` or the process environment, `test_llm_adapter_live_gemini_from_dotenv` tests live structured JSON planning; otherwise it returns early without calling an external LLM while the rest of the suite runs with the offline deterministic planner.

---

## Configuration and Live Staging Adaptation

### Environment Variables

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `DAST_TARGET_MODE` | `in_memory` | Set to `live_http` to target an external HTTP service instead of the in-memory mock app. |
| `DAST_TARGET_BASE_URL` | `http://127.0.0.1:8001` | Base URL of the target application (must match an entry in `target_scope.yaml`). |
| `DAST_CONFIGS_DIR` | `agentic-dast/configs` | Directory containing `target_scope.yaml`, `credentials.vault.json`, and `ownership.json`. |
| `DAST_LOGS_PATH` | `mock_tbo_target/sample_gateway_logs.jsonl` | Path to HAR 1.2 JSON, JSONL, or NGINX/Apache combined access logs for inventory and delta watching. |
| `DAST_WATCH_INTERVAL_SECONDS` | `0` | Background polling interval in seconds for `BundleWatcher`, `LogDeltaWatcher`, and `DNSCertWatcher` (`0` disables background timer). |
| `MOCK_TBO_VERSION` | `v1.0` | Initial simulated release version (`v1.0`, `v1.1`, or `v1.2`) for standalone `mock_tbo_target`. |
| `MOCK_TBO_DB_PATH` | `mock_tbo_target/mock_tbo.db` | SQLite database file path for the standalone demo target. |
| `MOCK_TBO_JWT_SECRET` | synthetic dev fallback | HMAC secret used by `mock_tbo_target` to sign synthetic JWTs. |
| `LLM_PROVIDER` | auto (`gemini` / `openai` / `deterministic`) | Selects LLM backend for `LLMAdapter`; falls back automatically to `deterministic` on error or rate-limit cooldown. |
| `LLM_MODEL` | `gemini-2.5-flash` / `gpt-4o-mini` | Model identifier used by `LLMAdapter`. |
| `GEMINI_API_KEY` | unset | Optional Google Gemini API key (can also be placed in ignored `agentic-dast/agents/.env`). |
| `OPENAI_API_KEY` | unset | Optional OpenAI API key when `LLM_PROVIDER=openai`. |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Local Ollama endpoint when `LLM_PROVIDER=ollama`. |

### Pointing at an External Staging Environment

No agent code changes are needed to switch from `mock_tbo_target` to an authorized staging deployment:

1. **Scope Policy (`agentic-dast/configs/target_scope.yaml`):**
   Update `approved_targets` with the allowed staging scheme, hostname, port, allowed path prefixes, and `blocked_path_patterns`, and configure `rate_limits`, `circuit_breaker`, and `safety_guards` per your rules of engagement.
2. **Test Credentials (`agentic-dast/configs/credentials.vault.json`):**
   Configure non-production synthetic test actors (`agency_a_admin`, `agency_a_subagent`, `agency_b_admin`) pointing `login_url` to staging's authentication endpoint and storing passwords via `password_env` environment variables rather than plaintext values.
3. **Asset Ownership (`agentic-dast/configs/ownership.json`):**
   Map route prefixes to team names, on-call contacts, Jira components, and business domains.
4. **CI/CD Webhook Integration:**
   Have release pipelines send `POST http://<control-plane>:8000/webhooks/deploy` with changed service names or route hints, setting `"is_fix_deploy": true` on remediation releases so `RetestAgent` automatically re-verifies open findings.
