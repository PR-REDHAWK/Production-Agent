import React, { useMemo } from 'react'
import { MetricCard } from '../common/MetricCard'
import { Panel } from '../common/Panel'
import { SeverityBadge, StatusBadge, ClassificationBadge } from '../common/Badge'
import { getAgentRobot } from '../agentCenter/RobotAvatars'
import {
  IconShield,
  IconShieldAlert,
  IconZap,
  IconBug,
  IconDatabase,
  IconActivity,
  IconCpu,
  IconPlay,
  IconRefresh,
} from '../common/Icons'

export function CommandCenter({
  health,
  tickets = [],
  graphData = { summary: null, endpoints: [] },
  inventory = { active_count: 0, zombie_count: 0, shadow_count: 0, entries: [] },
  gatewayState = { metrics: null, recent_audit: [], canary_hits: [] },
  events = [],
  onSelectTab,
  onRunScan,
  onDeployV11,
  onDeployV12,
  onSelectTicket,
  busyAction = '',
}) {
  const cb = gatewayState.metrics?.circuit_breaker || {}
  const rl = gatewayState.metrics?.rate_limits || {}

  // Compute security posture score (0 - 100)
  const postureScore = useMemo(() => {
    let score = 100
    const criticals = tickets.filter((t) => t.severity === 'CRITICAL' && t.status !== 'VERIFIED_FIXED').length
    const highs = tickets.filter((t) => t.severity === 'HIGH' && t.status !== 'VERIFIED_FIXED').length
    const mediums = tickets.filter((t) => t.severity === 'MEDIUM' && t.status !== 'VERIFIED_FIXED').length
    const shadows = inventory.shadow_count || 0
    const zombies = inventory.zombie_count || 0

    score -= criticals * 20
    score -= highs * 10
    score -= mediums * 5
    score -= shadows * 5
    score -= zombies * 3
    return Math.max(12, Math.min(100, score))
  }, [tickets, inventory])

  const openTickets = tickets.filter((t) => t.status !== 'VERIFIED_FIXED')
  const verifiedFixed = tickets.filter((t) => t.status === 'VERIFIED_FIXED')

  return (
    <div className="space-y-6">
      {/* Top Telemetry Strip */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <MetricCard
          label="Allowed Probes"
          value={gatewayState.metrics?.allowed_requests ?? 0}
          sub="Passed Safety Gate"
          tone="cyan"
          icon={<IconZap className="w-4 h-4" />}
        />
        <MetricCard
          label="Blocked Probes"
          value={gatewayState.metrics?.blocked_requests ?? 0}
          sub="Scope / Rate / Destructive"
          tone="rose"
          icon={<IconShieldAlert className="w-4 h-4" />}
        />
        <MetricCard
          label="Circuit Breaker"
          value={cb.state || 'CLOSED'}
          sub={`p95: ${cb.p95_latency_ms ?? 0}ms · 5xx: ${((cb.five_xx_ratio ?? 0) * 100).toFixed(1)}%`}
          tone={cb.state === 'EMERGENCY_PAUSE' ? 'rose' : 'emerald'}
          icon={<IconActivity className="w-4 h-4" />}
        />
        <MetricCard
          label="Rate Budget"
          value={`${rl.global_rps ?? 8} / ${rl.per_endpoint_rps ?? 4}`}
          sub="Global / Endpoint RPS"
          tone="slate"
          badgeText={`Burst: ${rl.burst_capacity ?? 10}`}
        />
        <MetricCard
          label="Mapped Endpoints"
          value={graphData.summary?.endpoints_count ?? 0}
          sub={`${graphData.summary?.flows_count ?? 0} B2B Flows`}
          tone="cyan"
          icon={<IconCpu className="w-4 h-4" />}
        />
        <MetricCard
          label="Zombie / Shadow"
          value={`${inventory.zombie_count} / ${inventory.shadow_count}`}
          sub={`Active: ${inventory.active_count}`}
          tone="violet"
          icon={<IconDatabase className="w-4 h-4" />}
        />
      </section>

      {/* Multi-Agent Operations Network Highlight Strip */}
      <div
        onClick={() => onSelectTab('operations')}
        className="cursor-pointer group relative overflow-hidden rounded-2xl border border-cyan-500/30 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 p-4 shadow-xl backdrop-blur-xl hover:border-cyan-400 hover:shadow-[0_0_25px_-4px_rgba(6,182,212,0.3)] transition-all"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-cyan-500/15 text-cyan-300 border border-cyan-500/40 shadow-[0_0_15px_-2px_rgba(6,182,212,0.4)]">
              <IconCpu className="h-6 w-6 text-cyan-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold tracking-tight text-white group-hover:text-cyan-300 transition-colors">
                  Autonomous Agent Operations Center
                </h3>
                <span className="rounded-full bg-cyan-500/20 px-2 py-0.5 font-mono text-[9px] font-bold text-cyan-300 border border-cyan-500/40 animate-pulse">
                  INTERACTIVE PIPELINE
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-400">
                Network of 9 multi-stage robotic agents connected via live data pathways. Inspect real-time execution states & dataflow.
              </p>
            </div>
          </div>

          {/* Mini Robot Roster */}
          <div className="flex items-center gap-2 overflow-x-auto py-1">
            <div title="Change Detection Agent">{getAgentRobot('change_detector', 'COMPLETED', 34)}</div>
            <div className="w-2 h-0.5 bg-slate-700" />
            <div title="Reconnaissance Agent">{getAgentRobot('recon', 'COMPLETED', 34)}</div>
            <div className="w-2 h-0.5 bg-slate-700" />
            <div title="API Inventory Engine">{getAgentRobot('inventory', 'COMPLETED', 34)}</div>
            <div className="w-2 h-0.5 bg-slate-700" />
            <div title="Attack Planning Agent">{getAgentRobot('planner', 'COMPLETED', 34)}</div>
            <div className="w-2 h-0.5 bg-slate-700" />
            <div title="Safety Gateway">{getAgentRobot('safety_gateway', 'COMPLETED', 34)}</div>
            <div className="w-2 h-0.5 bg-slate-700" />
            <div title="IDOR Executor">{getAgentRobot('exec_idor', 'COMPLETED', 30)}</div>
            <div title="Business Logic Executor">{getAgentRobot('exec_bizlogic', 'COMPLETED', 30)}</div>
            <div title="Auth Executor">{getAgentRobot('exec_auth', 'COMPLETED', 30)}</div>
            <div className="w-2 h-0.5 bg-slate-700" />
            <div title="Deterministic Verifier">{getAgentRobot('verifier', 'COMPLETED', 34)}</div>
            <div className="w-2 h-0.5 bg-slate-700" />
            <div title="Triage Agent">{getAgentRobot('triage', 'COMPLETED', 34)}</div>
            <div className="w-2 h-0.5 bg-slate-700" />
            <div title="Continuous Retest Agent">{getAgentRobot('retest', 'COMPLETED', 34)}</div>

            <span className="ml-3 rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-3 py-1.5 text-xs font-semibold text-cyan-200 group-hover:bg-cyan-500/25 transition">
              Open Canvas &rarr;
            </span>
          </div>
        </div>
      </div>

      {/* Main Grid: Posture Overview + Quick Actions */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Posture Score & Target Architecture Status */}
        <div className="lg:col-span-5 space-y-6">
          <Panel
            title="Defense Posture Index"
            subtitle="Real-time multi-tenant API security index"
            icon={<IconShield className="w-4 h-4" />}
            badge={
              <span className={`font-mono text-xs font-bold ${postureScore > 75 ? 'text-emerald-400' : postureScore > 40 ? 'text-amber-400' : 'text-rose-400'}`}>
                {postureScore >= 80 ? 'DEFENDED' : postureScore >= 50 ? 'ELEVATED RISK' : 'CRITICAL EXPOSURE'}
              </span>
            }
          >
            <div className="flex items-center justify-between gap-6">
              <div>
                <div className="flex items-baseline gap-2">
                  <span className={`text-5xl font-black font-mono tracking-tight ${postureScore > 75 ? 'text-emerald-400' : postureScore > 40 ? 'text-amber-400' : 'text-rose-400'}`}>
                    {postureScore}
                  </span>
                  <span className="text-slate-500 font-mono text-sm">/ 100</span>
                </div>
                <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                  Evaluated across cross-tenant IDOR, fare tampering, double-refund idempotency, and shadow API exposure.
                </p>
              </div>

              {/* Visual Circular Gauge Placeholder */}
              <div className="relative flex h-24 w-24 shrink-0 items-center justify-center rounded-full border-4 border-slate-800 bg-slate-950 shadow-inner">
                <div
                  className={`absolute inset-0 rounded-full border-4 border-transparent ${
                    postureScore > 75 ? 'border-t-emerald-400 border-r-emerald-400' : postureScore > 40 ? 'border-t-amber-400 border-r-amber-400' : 'border-t-rose-500 border-r-rose-500'
                  } animate-cyber-pulse`}
                />
                <span className="font-mono text-xs font-bold text-slate-300">
                  {openTickets.length} THREATS
                </span>
              </div>
            </div>

            {/* Severity Distribution Bar */}
            <div className="mt-6 space-y-2">
              <div className="flex justify-between text-xs font-mono text-slate-400">
                <span>VULNERABILITY SEVERITY BREAKDOWN</span>
                <span>{tickets.length} TOTAL VERIFIED</span>
              </div>
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-950 border border-slate-800">
                {tickets.length === 0 ? (
                  <div className="w-full bg-emerald-500/30 text-center text-[9px] text-emerald-300">
                    CLEAN BASELINE
                  </div>
                ) : (
                  <>
                    <div
                      style={{ width: `${(tickets.filter((t) => t.severity === 'CRITICAL').length / tickets.length) * 100}%` }}
                      className="bg-rose-500 shadow-[0_0_8px_#f43f5e]"
                      title="Critical"
                    />
                    <div
                      style={{ width: `${(tickets.filter((t) => t.severity === 'HIGH').length / tickets.length) * 100}%` }}
                      className="bg-amber-500 shadow-[0_0_8px_#f59e0b]"
                      title="High"
                    />
                    <div
                      style={{ width: `${(tickets.filter((t) => t.severity === 'MEDIUM').length / tickets.length) * 100}%` }}
                      className="bg-sky-500"
                      title="Medium"
                    />
                    <div
                      style={{ width: `${(tickets.filter((t) => t.severity === 'LOW').length / tickets.length) * 100}%` }}
                      className="bg-slate-600"
                      title="Low"
                    />
                  </>
                )}
              </div>
              <div className="flex justify-between text-[11px] font-mono text-slate-400 pt-1">
                <span className="text-rose-400">{tickets.filter((t) => t.severity === 'CRITICAL').length} Critical</span>
                <span className="text-amber-400">{tickets.filter((t) => t.severity === 'HIGH').length} High</span>
                <span className="text-sky-400">{tickets.filter((t) => t.severity === 'MEDIUM').length} Medium</span>
                <span className="text-emerald-400">{verifiedFixed.length} Fixed</span>
              </div>
            </div>
          </Panel>

          {/* Quick Simulation & Testing Actions */}
          <Panel
            title="Attack Surface Simulation"
            subtitle="Toggle staging environments to test zero-spec discovery & auto-retest"
            icon={<IconZap className="w-4 h-4" />}
          >
            <div className="grid grid-cols-2 gap-3">
              <button
                disabled={Boolean(busyAction)}
                onClick={onDeployV11}
                className="flex flex-col items-start gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-left hover:border-amber-500/60 hover:bg-amber-500/15 disabled:opacity-50 transition"
              >
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                  <IconBug className="w-3.5 h-3.5" />
                  <span>Deploy v1.1 Flaws</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Plants IDOR, fare tampering, double refund & shadow export.
                </p>
              </button>

              <button
                disabled={Boolean(busyAction)}
                onClick={onDeployV12}
                className="flex flex-col items-start gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-left hover:border-emerald-500/60 hover:bg-emerald-500/15 disabled:opacity-50 transition"
              >
                <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
                  <IconRefresh className="w-3.5 h-3.5" />
                  <span>Deploy v1.2 Fix</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Applies security patches and triggers autonomous retest closure.
                </p>
              </button>
            </div>
          </Panel>
        </div>

        {/* Right: Active Verified Findings Spotlight + Real-time Stream Preview */}
        <div className="lg:col-span-7 space-y-6">
          {/* Active Findings Spotlight */}
          <Panel
            title={`Active Threat Spotlight (${openTickets.length})`}
            subtitle="Verified vulnerabilities with reproducible zero-false-positive proofs"
            icon={<IconBug className="w-4 h-4" />}
            actions={
              <button
                onClick={() => onSelectTab('findings')}
                className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 hover:underline transition"
              >
                View All Findings &rarr;
              </button>
            }
          >
            {openTickets.length === 0 ? (
              <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-8 text-center text-xs text-slate-400">
                <p className="font-semibold text-slate-300">Zero active vulnerabilities detected.</p>
                <p className="mt-1 text-slate-500">
                  Run a full scan or deploy simulated flaws (v1.1) to test the agentic pipeline.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {openTickets.slice(0, 4).map((ticket) => (
                  <div
                    key={ticket.ticket_id}
                    onClick={() => {
                      onSelectTicket(ticket.ticket_id)
                      onSelectTab('findings')
                    }}
                    className="cursor-pointer rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 hover:border-cyan-500/40 hover:bg-slate-900/80 transition"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <SeverityBadge severity={ticket.severity} size="xs" />
                        <span className="font-mono text-xs font-bold text-white">
                          {ticket.finding.method} {ticket.finding.canonical_endpoint}
                        </span>
                      </div>
                      <StatusBadge status={ticket.status} size="xs" />
                    </div>

                    <div className="mt-1.5 text-xs text-slate-300 font-medium">
                      {ticket.finding.title}
                    </div>

                    <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 font-mono">
                      <span>Param: <code className="text-cyan-300">{ticket.finding.affected_parameter}</code></span>
                      <span>Owner: <strong className="text-slate-400">{ticket.owner_team}</strong></span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {/* Real-time Agent Loop Event Stream */}
          <Panel
            title="Real-Time Agentic Loop (SSE)"
            subtitle="Autonomous multi-agent orchestration events"
            icon={<IconActivity className="w-4 h-4" />}
            actions={
              <button
                onClick={() => onSelectTab('operations')}
                className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 hover:underline transition"
              >
                Full Operations Timeline &rarr;
              </button>
            }
          >
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {events.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500">
                  Waiting for agent loop events... Click <strong>Run Full Scan</strong> to trigger.
                </div>
              ) : (
                events.slice(0, 5).map((ev, idx) => (
                  <div
                    key={`${ev.timestamp}-${idx}`}
                    className="rounded-lg border border-slate-800/80 bg-slate-950/70 p-2.5 text-xs flex items-start justify-between gap-3"
                  >
                    <div>
                      <span className="rounded bg-cyan-500/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-cyan-300 border border-cyan-500/30 mr-2">
                        {ev.stage}
                      </span>
                      <span className="text-slate-200">{ev.message}</span>
                    </div>
                    <span className="font-mono text-[10px] text-slate-500 shrink-0">
                      {ev.timestamp.slice(11, 19)}Z
                    </span>
                  </div>
                ))
              )}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  )
}
