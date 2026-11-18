import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { NAV_ITEMS } from './theme/designTokens'
import { Sidebar } from './components/shell/Sidebar'
import { Header } from './components/shell/Header'
import { HITLModal } from './components/shell/HITLModal'
import { CommandCenter } from './components/views/CommandCenter'
import { AgentOperations } from './components/views/AgentOperations'
import { FindingsView } from './components/views/FindingsView'
import { AttackSurfaceView } from './components/views/AttackSurfaceView'
import { InventoryView } from './components/views/InventoryView'
import { RetestingView } from './components/views/RetestingView'
import { AuditLogsView } from './components/views/AuditLogsView'
import { SettingsView } from './components/views/SettingsView'

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
  const [activeTab, setActiveTab] = useState('command')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
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
          return [parsed, ...prev].slice(0, 100)
        })
        if (
          [
            'recon',
            'inventory',
            'execute_safely',
            'verify',
            'triage_report',
            'retest',
            'hitl_decision',
            'sim_switch',
            'scan_complete',
            'scan_error',
          ].includes(parsed.stage)
        ) {
          refreshAll()
        }
        if (
          [
            'recon',
            'inventory',
            'plan_attacks',
            'execute_safely',
            'verify',
            'triage_report',
            'retest',
          ].includes(parsed.stage)
        ) {
          setBusyAction((curr) => (curr ? `${parsed.stage}: ${parsed.message}` : curr))
        }
        if (parsed.stage === 'scan_complete') {
          setBusyAction('')
        }
        if (parsed.stage === 'scan_error') {
          setBusyAction('')
          setErrorMsg(parsed.message)
        }
      } catch {
        // Ignore malformed event payload
      }
    })
    return () => es.close()
  }, [refreshAll])

  const runAction = async (label, fn, { background = false } = {}) => {
    setBusyAction(label)
    setErrorMsg('')
    try {
      await fn()
      await refreshAll()
      if (!background) {
        setBusyAction('')
      }
    } catch (err) {
      setErrorMsg(err.message)
      setBusyAction('')
    }
  }

  const handleRunScan = (options = {}) => {
    runAction(
      'Executing 8-stage DAST scan cycle...',
      () =>
        apiJson('/api/scans/run', {
          method: 'POST',
          body: JSON.stringify({
            auto_approve_hitl_execution: true,
            background: true,
            use_playwright: Boolean(options.usePlaywright),
            delta_only: Boolean(options.deltaOnly),
          }),
        }),
      { background: true }
    )
  }

  const handleDeployV11 = () => {
    runAction(
      'Deploying target v1.1 (vulnerable release)...',
      () =>
        apiJson('/api/sim/switch', {
          method: 'POST',
          body: JSON.stringify({
            version: 'v1.1',
            reset_state: true,
            trigger_webhook: true,
            is_fix_deploy: false,
            background: true,
          }),
        }),
      { background: true }
    )
  }

  const handleDeployV12 = () => {
    runAction(
      'Deploying target v1.2 (remediated release & retest)...',
      () =>
        apiJson('/api/sim/switch', {
          method: 'POST',
          body: JSON.stringify({
            version: 'v1.2',
            reset_state: true,
            trigger_webhook: true,
            is_fix_deploy: true,
            background: true,
          }),
        }),
      { background: true }
    )
  }

  const handlePollWatchers = () => {
    runAction('Polling continuous drift watchers...', () => apiJson('/api/watchers/poll', { method: 'POST' }))
  }

  const handleRetestTicket = (ticketId) => {
    runAction(`Retesting verified PoC for ${ticketId}...`, () =>
      apiJson(`/api/tickets/${ticketId}/retest`, { method: 'POST' })
    )
  }

  const handleDecideHITL = (approvalId, approve) => {
    runAction(
      `${approve ? 'Approving' : 'Rejecting'} HITL ${approvalId}...`,
      () =>
        apiJson(`/api/hitl/${approvalId}/decide`, {
          method: 'POST',
          body: JSON.stringify({ approve }),
        })
    )
  }

  const currentNav = useMemo(
    () => NAV_ITEMS.find((n) => n.id === activeTab) || NAV_ITEMS[0],
    [activeTab]
  )

  const badgeCounts = useMemo(
    () => ({
      findings: tickets.filter((t) => t.status !== 'VERIFIED_FIXED').length,
      surface: graphData.summary?.endpoints_count ?? 0,
      inventory: (inventory.zombie_count || 0) + (inventory.shadow_count || 0),
      audit: gatewayState.recent_audit?.length ?? 0,
    }),
    [tickets, graphData, inventory, gatewayState]
  )

  return (
    <div className="min-h-screen bg-[#060911] text-slate-100 flex flex-col font-sans">
      {/* Collapsible Sidebar */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
        badgeCounts={badgeCounts}
        gatewayMetrics={gatewayState.metrics}
      />

      {/* Main Content Area */}
      <div
        className={`flex-1 flex flex-col transition-all duration-300 ${
          sidebarCollapsed ? 'pl-18' : 'pl-64'
        }`}
      >
        {/* Header Navigation */}
        <Header
          title={currentNav.label}
          subtitle={currentNav.desc}
          health={health}
          sseConnected={sseConnected}
          pendingHitlCount={hitl.pending_count}
          busyAction={busyAction}
          onRunScan={handleRunScan}
          onDeployV11={handleDeployV11}
          onDeployV12={handleDeployV12}
          onOpenHitl={() => setHitlModalOpen(true)}
        />

        {/* Global Error Alert */}
        {errorMsg && (
          <div className="mx-6 mt-4 flex items-center justify-between rounded-xl border border-rose-500/40 bg-rose-500/15 px-4 py-2.5 text-xs text-rose-200">
            <span>{errorMsg}</span>
            <button onClick={() => setErrorMsg('')} className="text-rose-400 hover:text-white font-bold ml-4">
              Dismiss
            </button>
          </div>
        )}

        {/* Page Content View Router */}
        <main className="flex-1 px-6 py-6 max-w-7xl w-full mx-auto">
          {activeTab === 'command' && (
            <CommandCenter
              health={health}
              tickets={tickets}
              graphData={graphData}
              inventory={inventory}
              gatewayState={gatewayState}
              events={events}
              onSelectTab={setActiveTab}
              onRunScan={handleRunScan}
              onDeployV11={handleDeployV11}
              onDeployV12={handleDeployV12}
              onSelectTicket={setSelectedTicketId}
              busyAction={busyAction}
            />
          )}

          {activeTab === 'operations' && (
            <AgentOperations
              events={events}
              busyAction={busyAction}
              graphData={graphData}
              inventory={inventory}
              tickets={tickets}
              gatewayState={gatewayState}
              hitl={hitl}
              health={health}
              onRunScan={handleRunScan}
              onDeployV11={handleDeployV11}
              onDeployV12={handleDeployV12}
              onPollWatchers={handlePollWatchers}
            />
          )}

          {activeTab === 'findings' && (
            <FindingsView
              tickets={tickets}
              selectedTicketId={selectedTicketId}
              onSelectTicket={setSelectedTicketId}
              onRetestTicket={handleRetestTicket}
              busyAction={busyAction}
            />
          )}

          {activeTab === 'surface' && (
            <AttackSurfaceView
              graphData={graphData}
              tickets={tickets}
            />
          )}

          {activeTab === 'inventory' && (
            <InventoryView
              inventory={inventory}
            />
          )}

          {activeTab === 'retesting' && (
            <RetestingView
              tickets={tickets}
              onRetestTicket={handleRetestTicket}
              onDeployV11={handleDeployV11}
              onDeployV12={handleDeployV12}
              busyAction={busyAction}
            />
          )}

          {activeTab === 'audit' && (
            <AuditLogsView
              gatewayState={gatewayState}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsView
              gatewayState={gatewayState}
            />
          )}
        </main>
      </div>

      {/* Human-in-the-Loop Decision Modal */}
      <HITLModal
        isOpen={hitlModalOpen}
        onClose={() => setHitlModalOpen(false)}
        hitlState={hitl}
        onDecide={handleDecideHITL}
        busyAction={busyAction}
      />
    </div>
  )
}
