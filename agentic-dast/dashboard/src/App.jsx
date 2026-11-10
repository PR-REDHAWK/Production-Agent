import { useCallback, useEffect, useMemo, useState } from 'react'

const SEVERITY_COLORS = {
  CRITICAL: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
  HIGH: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  MEDIUM: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
  LOW: 'bg-slate-500/20 text-slate-300 border-slate-500/40',
}

const STATUS_COLORS = {
  OPEN: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  PENDING_HUMAN_REVIEW: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  VERIFIED_FIXED: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  STILL_VULNERABLE: 'bg-red-600/20 text-red-300 border-red-500/40',
  REJECTED: 'bg-slate-600/20 text-slate-400 border-slate-600/40',
}

const CLASS_COLORS = {
  Active: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  Zombie: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  Shadow: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
}

const FLOW_ORDER = ['search', 'hold', 'book', 'pay', 'cancel', 'refund']

async function apiJson(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  })
  if (!res.ok) {
    const msg = await res.text()
    throw new Error(msg || `HTTP ${res.status}`)
  }
  return res.json()
}

export default function App() {
  const [activeTab, setActiveTab] = useState('findings')
  const [health, setHealth] = useState(null)
  const [tickets, setTickets] = useState([])
  const [selectedTicketId, setSelectedTicketId] = useState(null)
  const [graphData, setGraphData] = useState({ summary: null, endpoints: [] })
  const [inventory, setInventory] = useState({ active_count: 0, zombie_count: 0, shadow_count: 0, entries: [] })
  const [hitl, setHitl] = useState({ pending_count: 0, pending: [], all: [] })
  const [gatewayState, setGatewayState] = useState({ metrics: null, recent_audit: [], canary_hits: [] })
  const [events, setEvents] = useState([])
  const [busyAction, setBusyAction] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [hitlModalOpen, setHitlModalOpen] = useState(false)
  const [copiedCurl, setCopiedCurl] = useState(false)
  const [sseConnected, setSseConnected] = useState(false)

  const refreshAll = useCallback(async () => {
    try {
      const [h, t, g, inv, ht, gw] = await Promise.all([
        apiJson('/api/health'),
        apiJson('/api/tickets'),
        apiJson('/api/graph'),
        apiJson('/api/inventory'),
        apiJson('/api/hitl'),
        apiJson('/api/gateway/metrics'),
      ])
      setHealth(h)
      setTickets(t)
      setGraphData(g)
      setInventory(inv)
      setHitl(ht)
      setGatewayState(gw)
      setErrorMsg('')
      if (t.length > 0) {
        setSelectedTicketId((prev) => (prev && t.some((x) => x.ticket_id === prev) ? prev : t[0].ticket_id))
      }
    } catch (err) {
      setErrorMsg(`Control plane unreachable: ${err.message}`)
    }
  }, [])

  useEffect(() => {
    refreshAll()
    apiJson('/api/events/history')
      .then((hist) => setEvents(hist.slice().reverse()))
      .catch(() => {})
  }, [refreshAll])

  useEffect(() => {
    const es = new EventSource('/api/events/stream')
    es.onopen = () => setSseConnected(true)
    es.onerror = () => setSseConnected(false)
    es.addEventListener('stage', (e) => {
      try {
        const parsed = JSON.parse(e.data)
        setEvents((prev) => {
          const key = `${parsed.timestamp}-${parsed.stage}-${parsed.message}`
          if (prev.some((p) => `${p.timestamp}-${p.stage}-${p.message}` === key)) {
            return prev
          }
          return [parsed, ...prev].slice(0, 80)
        })
        if (['triage_report', 'retest', 'hitl_decision', 'sim_switch'].includes(parsed.stage)) {
          refreshAll()
        }
      } catch {
        // Ignore malformed event payloads
      }
    })
    return () => es.close()
  }, [refreshAll])

  const selectedTicket = useMemo(
    () => tickets.find((t) => t.ticket_id === selectedTicketId) || tickets[0] || null,
    [tickets, selectedTicketId]
  )

  const runAction = async (label, fn) => {
    setBusyAction(label)
    setErrorMsg('')
    try {
      await fn()
      await refreshAll()
    } catch (err) {
      setErrorMsg(err.message)
    } finally {
      setBusyAction('')
    }
  }

  const handleCopyCurl = async (cmd) => {
    try {
      await navigator.clipboard.writeText(cmd)
      setCopiedCurl(true)
      setTimeout(() => setCopiedCurl(false), 1500)
    } catch {
      setErrorMsg('Clipboard copy unavailable in browser context')
    }
  }

  const cb = gatewayState.metrics?.circuit_breaker || {}
  const rl = gatewayState.metrics?.rate_limits || {}

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/70 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/20 text-sm font-bold text-cyan-300 ring-1 ring-cyan-500/40">
                AD
              </span>
              <h1 className="text-lg font-semibold tracking-tight text-white">
                Agentic Real-Time DAST
              </h1>
              <span
                className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                  sseConnected
                    ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
                    : 'border-slate-700 bg-slate-800 text-slate-400'
                }`}
              >
                {sseConnected ? 'SSE Live' : 'SSE Reconnecting'}
              </span>
              {health?.mock_version && (
                <span className="rounded-full border border-indigo-500/30 bg-indigo-500/15 px-2.5 py-0.5 text-xs font-medium text-indigo-300">
                  Target: {health.mock_version}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-400">
              {health ? `${health.mode} · ${health.target_base_url} · OOB Canary Hits: ${health.canary_hits}` : 'Connecting to FastAPI control plane...'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              disabled={Boolean(busyAction)}
              onClick={() =>
                runAction('Running full scan...', () =>
                  apiJson('/api/scans/run', { method: 'POST', body: JSON.stringify({ auto_approve_hitl_execution: true }) })
                )
              }
              className="rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-cyan-500 disabled:opacity-50"
            >
              Run Full Scan
            </button>
            <button
              disabled={Boolean(busyAction)}
              onClick={() =>
                runAction('Deploying v1.1 (vulnerable)...', () =>
                  apiJson('/api/sim/switch', {
                    method: 'POST',
                    body: JSON.stringify({ version: 'v1.1', reset_state: true, trigger_webhook: true, is_fix_deploy: false }),
                  })
                )
              }
              className="rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-xs font-medium text-amber-200 hover:bg-amber-500/25 disabled:opacity-50"
            >
              Deploy v1.1 (Vuln)
            </button>
            <button
              disabled={Boolean(busyAction)}
              onClick={() =>
                runAction('Deploying v1.2 (fix + auto-retest)...', () =>
                  apiJson('/api/sim/switch', {
                    method: 'POST',
                    body: JSON.stringify({ version: 'v1.2', reset_state: true, trigger_webhook: true, is_fix_deploy: true }),
                  })
                )
              }
              className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-50"
            >
              Deploy v1.2 (Fix & Retest)
            </button>
            <a
              href="/api/openapi.json"
              download="inferred-openapi-3.1.json"
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700"
            >
              OpenAPI 3.1 JSON
            </a>
            <button
              onClick={() => setHitlModalOpen(true)}
              className="relative rounded-lg border border-rose-500/40 bg-rose-500/15 px-3 py-1.5 text-xs font-medium text-rose-200 hover:bg-rose-500/25"
            >
              HITL Queue
              {hitl.pending_count > 0 && (
                <span className="ml-2 inline-flex rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {hitl.pending_count}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6">
        {busyAction && (
          <div className="mb-4 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-xs text-cyan-200">
            {busyAction}
          </div>
        )}
        {errorMsg && (
          <div className="mb-4 rounded-lg border border-rose-500/40 bg-rose-500/15 px-4 py-2 text-xs text-rose-200">
            {errorMsg}
          </div>
        )}

        {/* Safety Gateway Telemetry Strip */}
        <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <MetricCard label="Allowed Requests" value={gatewayState.metrics?.allowed_requests ?? 0} tone="text-cyan-300" />
          <MetricCard label="Blocked (Scope / Burst)" value={gatewayState.metrics?.blocked_requests ?? 0} tone="text-amber-300" />
          <MetricCard
            label="Circuit Breaker"
            value={cb.state || 'CLOSED'}
            sub={`p95: ${cb.p95_latency_ms ?? 0}ms · 5xx: ${((cb.five_xx_ratio ?? 0) * 100).toFixed(1)}%`}
            tone={cb.state === 'EMERGENCY_PAUSE' ? 'text-rose-400' : 'text-emerald-300'}
          />
          <MetricCard
            label="Rate Budget"
            value={`${rl.global_rps ?? 8} / ${rl.per_endpoint_rps ?? 4} RPS`}
            sub={`Burst cap: ${rl.burst_capacity ?? 10}`}
            tone="text-slate-200"
          />
          <MetricCard
            label="Zombie / Shadow APIs"
            value={`${inventory.zombie_count} / ${inventory.shadow_count}`}
            sub={`Active: ${inventory.active_count}`}
            tone="text-purple-300"
          />
        </section>

        {/* Navigation Tabs */}
        <div className="mb-5 flex flex-wrap gap-2 border-b border-slate-800 pb-3">
          {[
            { id: 'findings', label: `Findings & PoC Viewer (${tickets.length})` },
            { id: 'feed', label: `Live SSE Feed & Audit (${events.length})` },
            { id: 'graph', label: `Knowledge Graph (${graphData.summary?.endpoints_count ?? 0})` },
            { id: 'inventory', label: `Zombie / Shadow Inventory (${inventory.entries?.length ?? 0})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition ${
                activeTab === tab.id
                  ? 'bg-slate-800 text-white ring-1 ring-slate-600'
                  : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab 1: Findings & PoC Viewer */}
        {activeTab === 'findings' && (
          <div className="grid gap-6 lg:grid-cols-12">
            <div className="space-y-2 lg:col-span-5">
              {tickets.length === 0 ? (
                <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 text-center text-xs text-slate-400">
                  No verified findings yet. Click <strong>Deploy v1.1 (Vuln)</strong> or <strong>Run Full Scan</strong> to start.
                </div>
              ) : (
                tickets.map((t) => (
                  <button
                    key={t.ticket_id}
                    onClick={() => setSelectedTicketId(t.ticket_id)}
                    className={`w-full rounded-xl border p-3.5 text-left transition ${
                      selectedTicket?.ticket_id === t.ticket_id
                        ? 'border-cyan-500/50 bg-slate-900'
                        : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${SEVERITY_COLORS[t.severity]}`}>
                        {t.severity}
                      </span>
                      <span className={`rounded border px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[t.status] || ''}`}>
                        {t.status}
                      </span>
                    </div>
                    <div className="mt-2 text-sm font-medium text-white">{t.finding.title}</div>
                    <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
                      <span className="font-mono">
                        {t.finding.method} {t.finding.canonical_endpoint}
                      </span>
                      <span>{t.owner_team}</span>
                    </div>
                  </button>
                ))
              )}
            </div>

            <div className="lg:col-span-7">
              {selectedTicket ? (
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-slate-400">{selectedTicket.ticket_id}</span>
                        <span className={`rounded border px-2 py-0.5 text-xs font-semibold ${SEVERITY_COLORS[selectedTicket.severity]}`}>
                          {selectedTicket.severity}
                        </span>
                        <span className={`rounded border px-2 py-0.5 text-xs ${STATUS_COLORS[selectedTicket.status] || ''}`}>
                          {selectedTicket.status}
                        </span>
                      </div>
                      <h2 className="mt-2 text-base font-semibold text-white">{selectedTicket.finding.title}</h2>
                      <p className="mt-1 text-xs text-slate-400">
                        Class: {selectedTicket.finding.vuln_class} · Param:{' '}
                        <code className="text-cyan-300">{selectedTicket.finding.affected_parameter}</code> · Owner:{' '}
                        <span className="text-slate-200">{selectedTicket.owner_team}</span> ({selectedTicket.owner_contact})
                      </p>
                    </div>
                    <button
                      disabled={Boolean(busyAction)}
                      onClick={() =>
                        runAction(`Retesting ${selectedTicket.ticket_id}...`, () =>
                          apiJson(`/api/tickets/${selectedTicket.ticket_id}/retest`, { method: 'POST' })
                        )
                      }
                      className="rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-3 py-1.5 text-xs font-medium text-cyan-200 hover:bg-cyan-500/25 disabled:opacity-50"
                    >
                      Retest PoC
                    </button>
                  </div>

                  <div className="mt-4 space-y-4 text-xs">
                    <div>
                      <div className="font-semibold uppercase tracking-wider text-slate-400">Business Impact</div>
                      <p className="mt-1 text-slate-200">{selectedTicket.business_impact}</p>
                    </div>

                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-semibold uppercase tracking-wider text-slate-400">
                          Replayable PoC (Credentials Redacted)
                        </span>
                        <button
                          onClick={() => handleCopyCurl(selectedTicket.finding.repro_curl)}
                          className="text-cyan-300 hover:underline"
                        >
                          {copiedCurl ? 'Copied!' : 'Copy curl'}
                        </button>
                      </div>
                      <pre className="mt-1 overflow-x-auto rounded-lg border border-slate-800 bg-slate-950 p-3 font-mono text-[11px] text-emerald-300">
                        {selectedTicket.finding.repro_curl}
                      </pre>
                    </div>

                    <div>
                      <div className="font-semibold uppercase tracking-wider text-slate-400">Minimal Proof Evidence</div>
                      <pre className="mt-1 overflow-x-auto rounded-lg border border-slate-800 bg-slate-950 p-3 font-mono text-[11px] text-amber-200">
                        {JSON.stringify(selectedTicket.finding.minimal_evidence, null, 2)}
                      </pre>
                    </div>

                    <div>
                      <div className="font-semibold uppercase tracking-wider text-slate-400">Suggested Fix</div>
                      <p className="mt-1 rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-slate-200">
                        {selectedTicket.code_fix_suggestion}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 text-xs text-slate-400">
                  Select a finding to inspect its verified PoC, business severity, and fix suggestion.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Live SSE Feed & Audit Log */}
        {activeTab === 'feed' && (
          <div className="grid gap-6 lg:grid-cols-12">
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 lg:col-span-5">
              <h3 className="mb-3 text-sm font-semibold text-white">Real-Time Agent Loop (SSE)</h3>
              <div className="max-h-[460px] space-y-2 overflow-y-auto pr-1">
                {events.length === 0 ? (
                  <p className="text-xs text-slate-400">Waiting for agent loop events...</p>
                ) : (
                  events.map((ev, idx) => (
                    <div key={`${ev.timestamp}-${idx}`} className="rounded-lg border border-slate-800 bg-slate-950/70 p-2.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="rounded bg-cyan-500/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-cyan-300">
                          {ev.stage}
                        </span>
                        <span className="text-[10px] text-slate-500">{ev.timestamp.slice(11, 19)}Z</span>
                      </div>
                      <p className="mt-1 text-slate-200">{ev.message}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 lg:col-span-7">
              <h3 className="mb-3 text-sm font-semibold text-white">
                Immutable Safety Gateway Audit Log (Latest {gatewayState.recent_audit?.length || 0})
              </h3>
              <div className="max-h-[460px] overflow-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-800 text-[10px] uppercase text-slate-400">
                    <tr>
                      <th className="py-2 pr-2">Decision</th>
                      <th className="py-2 pr-2">Actor</th>
                      <th className="py-2 pr-2">Request</th>
                      <th className="py-2 pr-2">Status</th>
                      <th className="py-2">Latency</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                    {(gatewayState.recent_audit || []).map((rec) => (
                      <tr key={rec.trace_id}>
                        <td className="py-1.5 pr-2">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] ${
                              rec.decision === 'ALLOWED'
                                ? 'bg-emerald-500/15 text-emerald-300'
                                : 'bg-rose-500/15 text-rose-300'
                            }`}
                          >
                            {rec.decision.startsWith('BLOCKED') ? 'BLOCKED' : 'ALLOWED'}
                          </span>
                        </td>
                        <td className="py-1.5 pr-2 text-slate-300">{rec.actor}</td>
                        <td className="max-w-xs truncate py-1.5 pr-2 text-slate-200" title={rec.url}>
                          {rec.method} {rec.url.replace('http://127.0.0.1:8001', '')}
                        </td>
                        <td className="py-1.5 pr-2 text-slate-300">{rec.status}</td>
                        <td className="py-1.5 text-slate-400">{rec.latency_ms}ms</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Knowledge Graph */}
        {activeTab === 'graph' && (
          <div className="space-y-4">
            {graphData.summary && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <MetricCard label="Endpoints" value={graphData.summary.endpoints_count} tone="text-cyan-300" />
                <MetricCard label="Roles" value={graphData.summary.roles_count} tone="text-indigo-300" />
                <MetricCard label="Parameters" value={graphData.summary.params_count} tone="text-amber-300" />
                <MetricCard label="Business Flows" value={graphData.summary.flows_count} tone="text-emerald-300" />
                <MetricCard label="Asset Owners" value={graphData.summary.owners_count} tone="text-purple-300" />
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              {[...FLOW_ORDER, null].map((flow) => {
                const items = (graphData.endpoints || []).filter((e) => (e.business_flow || null) === flow)
                if (items.length === 0) return null
                return (
                  <div key={flow || 'other'} className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-cyan-300">
                        Flow: {flow || 'unmapped / legacy / admin'}
                      </h4>
                      <span className="text-[11px] text-slate-400">{items.length} endpoints</span>
                    </div>
                    <div className="space-y-2">
                      {items.map((ep) => (
                        <div key={`${ep.method}-${ep.canonical_path}`} className="rounded-lg border border-slate-800 bg-slate-950/70 p-2.5 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono font-medium text-white">
                              <span className="mr-1.5 text-cyan-400">{ep.method}</span>
                              {ep.canonical_path}
                            </span>
                            <span className="text-[10px] text-slate-400">{ep.owner_team}</span>
                          </div>
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {ep.sensitivity_tags.map((tag) => (
                              <span key={tag} className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-200">
                                {tag}
                              </span>
                            ))}
                            {ep.roles.map((r) => (
                              <span key={r} className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300">
                                {r}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Tab 4: Zombie / Shadow Inventory */}
        {activeTab === 'inventory' && (
          <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 text-[10px] uppercase text-slate-400">
                <tr>
                  <th className="py-2 pr-3">Class</th>
                  <th className="py-2 pr-3">Endpoint</th>
                  <th className="py-2 pr-3">90d Hits</th>
                  <th className="py-2 pr-3">Unauth</th>
                  <th className="py-2 pr-3">PII</th>
                  <th className="py-2 pr-3">Regression / Notes</th>
                  <th className="py-2 pr-3">Owner</th>
                  <th className="py-2">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {(inventory.entries || []).map((entry) => (
                  <tr key={`${entry.method}-${entry.canonical_path}`}>
                    <td className="py-2.5 pr-3">
                      <span className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${CLASS_COLORS[entry.classification]}`}>
                        {entry.classification}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-white">
                      {entry.method} {entry.canonical_path}
                    </td>
                    <td className="py-2.5 pr-3 text-slate-300">{entry.hit_count_90d}</td>
                    <td className="py-2.5 pr-3">
                      {entry.reachable_without_auth === null
                        ? '—'
                        : entry.reachable_without_auth
                          ? <span className="text-rose-300">Yes</span>
                          : <span className="text-emerald-300">No</span>}
                    </td>
                    <td className="py-2.5 pr-3 text-amber-200">
                      {entry.pii_exposed?.length ? entry.pii_exposed.join(', ') : '—'}
                    </td>
                    <td className="max-w-xs py-2.5 pr-3 text-slate-300">{entry.security_regression || '—'}</td>
                    <td className="py-2.5 pr-3 text-slate-300">{entry.likely_owner}</td>
                    <td className="py-2.5">
                      {entry.recommendation ? (
                        <span className="rounded bg-rose-500/20 px-2 py-0.5 text-[10px] font-semibold text-rose-200">
                          {entry.recommendation}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* HITL Modal */}
      {hitlModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-base font-semibold text-white">Human-in-the-Loop (HITL) Approval Queue</h2>
                <p className="text-xs text-slate-400">
                  Risky state-mutating probes and HIGH/CRITICAL findings require human sign-off.
                </p>
              </div>
              <button
                onClick={() => setHitlModalOpen(false)}
                className="rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800"
              >
                Close
              </button>
            </div>

            <div className="mt-4 max-h-96 space-y-3 overflow-y-auto">
              {(hitl.all || []).length === 0 ? (
                <p className="text-xs text-slate-400">No HITL items queued yet.</p>
              ) : (
                hitl.all.map((item) => (
                  <div key={item.approval_id} className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-slate-400">{item.approval_id}</span>
                      <div className="flex items-center gap-2">
                        <span className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${SEVERITY_COLORS[item.risk_level]}`}>
                          {item.risk_level}
                        </span>
                        <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300">{item.decision}</span>
                      </div>
                    </div>
                    <p className="mt-1.5 text-slate-200">{item.description}</p>
                    {item.decision === 'PENDING' && (
                      <div className="mt-3 flex gap-2">
                        <button
                          disabled={Boolean(busyAction)}
                          onClick={() =>
                            runAction(`Approving ${item.approval_id}...`, () =>
                              apiJson(`/api/hitl/${item.approval_id}/decide`, {
                                method: 'POST',
                                body: JSON.stringify({ approve: true }),
                              })
                            )
                          }
                          className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-500"
                        >
                          Approve
                        </button>
                        <button
                          disabled={Boolean(busyAction)}
                          onClick={() =>
                            runAction(`Rejecting ${item.approval_id}...`, () =>
                              apiJson(`/api/hitl/${item.approval_id}/decide`, {
                                method: 'POST',
                                body: JSON.stringify({ approve: false }),
                              })
                            )
                          }
                          className="rounded-lg border border-rose-500/40 bg-rose-500/15 px-3 py-1 text-xs font-medium text-rose-200 hover:bg-rose-500/25"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MetricCard({ label, value, sub, tone = 'text-white' }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3.5">
      <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${tone}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-slate-500">{sub}</div>}
    </div>
  )
}
