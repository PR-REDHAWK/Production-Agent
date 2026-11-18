import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { NAV_ITEMS } from './theme/designTokens'
import { dastApi, SafeEventStream } from './api/client'
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

export default function App() {
  const [activeTab, setActiveTab] = useState('command')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [health, setHealth] = useState(null)
  const [tickets, setTickets] = useState([])
  const [selectedTicketId, setSelectedTicketId] = useState(null)
  const [graphData, setGraphData] = useState({ summary: null, endpoints: [], nodes: [], links: [] })
  const [inventory, setInventory] = useState({ active_count: 0, zombie_count: 0, shadow_count: 0, entries: [] })
  const [hitl, setHitl] = useState({ pending_count: 0, pending: [], all: [] })
  const [gatewayState, setGatewayState] = useState({ metrics: null, recent_audit: [], canary_hits: [] })
  const [events, setEvents] = useState([])
  const [busyAction, setBusyAction] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [hitlModalOpen, setHitlModalOpen] = useState(false)
  const [sseConnected, setSseConnected] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)

  const refreshAll = useCallback(async () => {
    try {
      const [h, t, g, inv, ht, gw] = await Promise.all([
        dastApi.getHealth(),
        dastApi.getTickets(),
        dastApi.getGraph(),
        dastApi.getInventory(),
        dastApi.getHitlQueue(),
        dastApi.getGatewayMetrics(),
      ])
      setHealth(h)
      setTickets(Array.isArray(t) ? t : [])
      setGraphData(g || { summary: null, endpoints: [], nodes: [], links: [] })
      setInventory(inv || { active_count: 0, zombie_count: 0, shadow_count: 0, entries: [] })
      setHitl(ht || { pending_count: 0, pending: [], all: [] })
      setGatewayState(gw || { metrics: null, recent_audit: [], canary_hits: [] })
      setErrorMsg('')
      if (Array.isArray(t) && t.length > 0) {
        setSelectedTicketId((prev) => (prev && t.some((x) => x.ticket_id === prev) ? prev : t[0].ticket_id))
      }
    } catch (err) {
      setErrorMsg(err.message || 'Control plane unreachable')
    } finally {
      setInitialLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshAll()
    dastApi.getEventsHistory()
      .then((hist) => {
        if (Array.isArray(hist)) {
          setEvents(hist.slice().reverse())
        }
      })
      .catch(() => {})
  }, [refreshAll])

  useEffect(() => {
    const stream = new SafeEventStream({
      endpoint: '/api/events/stream',
      onStatusChange: (status) => {
        setSseConnected(status === 'CONNECTED')
      },
      onEvent: (parsed) => {
        setEvents((prev) => [parsed, ...prev].slice(0, 100))
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
      },
    })

    stream.connect()
    return () => stream.close()
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
      setErrorMsg(err.message || 'Action failed')
      setBusyAction('')
    }
  }

  const handleRunScan = (options = {}) => {
    runAction(
      'Executing 8-stage DAST scan cycle...',
      () =>
        dastApi.startScan({
          auto_approve_hitl_execution: true,
          background: true,
          use_playwright: Boolean(options.usePlaywright),
          delta_only: Boolean(options.deltaOnly),
        }),
      { background: true }
    )
  }

  const handleDeployV11 = () => {
    runAction(
      'Deploying target v1.1 (vulnerable release)...',
      () =>
        dastApi.switchSimVersion({
          version: 'v1.1',
          reset_state: true,
          trigger_webhook: true,
          is_fix_deploy: false,
          background: true,
        }),
      { background: true }
    )
  }

  const handleDeployV12 = () => {
    runAction(
      'Deploying target v1.2 (remediated release & retest)...',
      () =>
        dastApi.switchSimVersion({
          version: 'v1.2',
          reset_state: true,
          trigger_webhook: true,
          is_fix_deploy: true,
          background: true,
        }),
      { background: true }
    )
  }

  const handleDeployV10 = () => {
    runAction(
      'Resetting target to baseline v1.0 (clean state)...',
      () =>
        dastApi.switchSimVersion({
          version: 'v1.0',
          reset_state: true,
          trigger_webhook: false,
          is_fix_deploy: false,
          background: true,
        }),
      { background: true }
    )
  }

  const handlePollWatchers = () => {
    runAction('Polling continuous drift watchers...', () => dastApi.pollWatchers())
  }

  const handleRetestTicket = (ticketId) => {
    runAction(`Retesting verified PoC for ${ticketId}...`, () =>
      dastApi.retestTicket(ticketId)
    )
  }

  const handleDecideHITL = (approvalId, approve) => {
    runAction(
      `${approve ? 'Approving' : 'Rejecting'} HITL ${approvalId}...`,
      () => dastApi.decideHitl(approvalId, approve)
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
          onDeployV10={handleDeployV10}
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
              onDeployV10={handleDeployV10}
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
              onDeployV10={handleDeployV10}
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
              onDeployV10={handleDeployV10}
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
