import React, { useMemo, useState } from 'react'
import { Panel } from '../common/Panel'
import { PipelineCanvas } from '../agentCenter/PipelineCanvas'
import { AgentInspector } from '../agentCenter/AgentInspector'
import { PipelineProgressBar } from '../agentCenter/PipelineProgressBar'
import { buildAgentCenterState } from '../agentCenter/AgentCenterState'
import { IconCpu, IconActivity, IconZap, IconSparkles } from '../common/Icons'

export function AgentOperations({
  events = [],
  busyAction = '',
  graphData = { summary: null, endpoints: [] },
  inventory = { active_count: 0, zombie_count: 0, shadow_count: 0, entries: [] },
  tickets = [],
  gatewayState = { metrics: null, recent_audit: [], canary_hits: [] },
  hitl = { pending_count: 0, pending: [], all: [] },
  health = null,
  onRunScan,
  onDeployV10,
  onDeployV11,
  onDeployV12,
  onPollWatchers,
}) {
  const [selectedAgentId, setSelectedAgentId] = useState(null)
  const [filterStage, setFilterStage] = useState('ALL')
  const [usePlaywright, setUsePlaywright] = useState(false)
  const [deltaOnly, setDeltaOnly] = useState(false)

  // Compute live agent center states from real backend SSE events and telemetry
  const { pipelineProgress, currentStage, isScanning, agents } = useMemo(
    () =>
      buildAgentCenterState({
        events,
        busyAction,
        graphData,
        inventory,
        tickets,
        gatewayState,
        hitl,
        health,
      }),
    [events, busyAction, graphData, inventory, tickets, gatewayState, hitl, health]
  )

  const selectedAgent = selectedAgentId ? agents[selectedAgentId] : null

  const filteredEvents = filterStage === 'ALL'
    ? events
    : events.filter((e) => e.stage.toLowerCase().includes(filterStage.toLowerCase()))

  return (
    <div className="space-y-6">
      {/* Top Scan Progress & Orchestration Status */}
      <PipelineProgressBar
        pipelineProgress={pipelineProgress}
        currentStage={currentStage}
        isScanning={isScanning}
        circuitBreakerState={gatewayState.metrics?.circuit_breaker?.state || 'CLOSED'}
        onRunScan={() => onRunScan({ usePlaywright, deltaOnly })}
        onDeployV10={onDeployV10}
        onDeployV11={onDeployV11}
        onDeployV12={onDeployV12}
        busyAction={busyAction}
      />

      {/* Main Interactive Visual Centerpiece: Pipeline Network Canvas */}
      <section className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <div>
            <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              <IconCpu className="h-5 w-5 text-cyan-400" />
              <span>Interactive Agent Pipeline Matrix</span>
            </h2>
            <p className="text-xs text-slate-400">
              Futuristic multi-agent network connected through live data pathways. Click any agent to inspect runtime inputs, outputs and state.
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-3 font-mono text-[11px] text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_6px_#22d3ee]" />
              <span>Active Stage</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <span>Verified Node</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              <span>HITL Gate</span>
            </span>
          </div>
        </div>

        <PipelineCanvas
          agentsMap={agents}
          selectedAgentId={selectedAgentId}
          onSelectAgent={setSelectedAgentId}
          currentStage={currentStage}
          isScanning={isScanning}
        />
      </section>

      {/* Controls & Real-Time SSE Activity Timeline */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left: Execution Controls */}
        <div className="lg:col-span-4 space-y-4">
          <Panel
            title="Scan Cycle Configuration"
            subtitle="Parameters for autonomous dispatch"
            icon={<IconZap className="w-4 h-4" />}
          >
            <div className="space-y-3.5">
              <div className="flex items-center justify-between rounded-xl bg-slate-950/60 p-3 text-xs">
                <div>
                  <span className="font-semibold text-slate-200">Playwright Chromium Crawl</span>
                  <p className="text-[11px] text-slate-400">Headless browser DOM interaction</p>
                </div>
                <input
                  type="checkbox"
                  checked={usePlaywright}
                  onChange={(e) => setUsePlaywright(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-cyan-500"
                />
              </div>

              <div className="flex items-center justify-between rounded-xl bg-slate-950/60 p-3 text-xs">
                <div>
                  <span className="font-semibold text-slate-200">Delta-Only Scope</span>
                  <p className="text-[11px] text-slate-400">Target modified commit routes only</p>
                </div>
                <input
                  type="checkbox"
                  checked={deltaOnly}
                  onChange={(e) => setDeltaOnly(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-cyan-500"
                />
              </div>

              <button
                disabled={Boolean(busyAction)}
                onClick={() => onRunScan({ usePlaywright, deltaOnly })}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-600 to-cyan-500 py-2.5 text-xs font-bold text-white shadow-[0_0_15px_-2px_rgba(6,182,212,0.4)] hover:from-cyan-500 hover:to-cyan-400 disabled:opacity-50 transition"
              >
                <span>Dispatch Pipeline Cycle</span>
              </button>

              <button
                disabled={Boolean(busyAction)}
                onClick={onPollWatchers}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900/80 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-50 transition"
              >
                <IconSparkles className="h-3.5 w-3.5 text-cyan-400" />
                <span>Poll Drift Watchers (Hash / DNS)</span>
              </button>
            </div>
          </Panel>
        </div>

        {/* Right: Real-Time SSE Event Bus Feed */}
        <div className="lg:col-span-8">
          <Panel
            title={`Live Event Bus Timeline (${filteredEvents.length})`}
            subtitle="Server-Sent Events streaming directly from the orchestrator"
            icon={<IconActivity className="w-4 h-4" />}
            actions={
              <div className="flex items-center gap-1">
                {['ALL', 'recon', 'inventory', 'verify', 'triage', 'retest'].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setFilterStage(tab)}
                    className={`rounded px-2 py-1 text-[10px] font-mono font-medium transition ${
                      filterStage === tab
                        ? 'bg-slate-800 text-cyan-300 font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {tab.toUpperCase()}
                  </button>
                ))}
              </div>
            }
          >
            <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
              {filteredEvents.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500 font-sans">
                  Waiting for agent loop events... Click <strong>Dispatch Pipeline Cycle</strong> to run.
                </div>
              ) : (
                filteredEvents.map((ev, idx) => (
                  <div
                    key={`${ev.timestamp}-${idx}`}
                    className="rounded-xl bg-slate-950/70 p-3 text-xs hover:bg-slate-900/60 transition"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-cyan-300">
                          {ev.stage}
                        </span>
                      </div>
                      <span className="font-mono text-[10px] text-slate-500">
                        {ev.timestamp.replace('T', ' ').slice(0, 19)}Z
                      </span>
                    </div>

                    <p className="mt-2 text-slate-200 font-sans leading-relaxed">{ev.message}</p>

                    {ev.details && Object.keys(ev.details).length > 0 && (
                      <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-950 p-2 font-mono text-[10px] text-slate-400">
                        {JSON.stringify(ev.details, null, 2)}
                      </pre>
                    )}
                  </div>
                ))
              )}
            </div>
          </Panel>
        </div>
      </div>

      {/* Slide-over Detail Inspector for Selected Agent */}
      <AgentInspector
        agent={selectedAgent}
        isOpen={Boolean(selectedAgent)}
        onClose={() => setSelectedAgentId(null)}
      />
    </div>
  )
}
