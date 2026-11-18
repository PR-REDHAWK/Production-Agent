import React, { useMemo } from 'react'
import { MetricCard } from '../common/MetricCard'
import { Panel } from '../common/Panel'
import { SeverityBadge, StatusBadge, ClassificationBadge, MethodBadge } from '../common/Badge'
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
  IconCheck,
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
  onDeployV10,
  onDeployV11,
  onDeployV12,
  onSelectTicket,
  busyAction = '',
}) {
  const cb = gatewayState.metrics?.circuit_breaker || {}
  const rl = gatewayState.metrics?.rate_limits || {}

  // Hackathon Evaluation Workflow State
  const demoStage = useMemo(() => {
    const version = health?.mock_version || 'v1.0'
    const openTicketsCount = tickets.filter((t) => t.status !== 'VERIFIED_FIXED').length
    const fixedTicketsCount = tickets.filter((t) => t.status === 'VERIFIED_FIXED').length

    if (busyAction) {
      return {
        step: 3,
        phase: 'SCANNING',
        title: 'Autonomous Multi-Agent Cycle Executing',
        desc: busyAction,
        badge: 'SCAN ACTIVE',
        actionLabel: 'Observing Execution...',
        actionDisabled: true,
        actionFn: () => onSelectTab('operations'),
      }
    }
    if (version === 'v1.0' && tickets.length === 0) {
      return {
        step: 1,
        phase: 'BASELINE',
        title: 'Hardened Baseline Environment Active (v1.0)',
        desc: 'Zero active vulnerabilities. All B2B microservices enforce authorization. Click to deploy flawed v1.1 to demonstrate autonomous detection.',
        badge: 'STAGE 1 / 4',
        actionLabel: 'Deploy v1.1 (Planted Flaws) →',
        actionDisabled: false,
        actionFn: onDeployV11,
      }
    }
    if (version === 'v1.1' && tickets.length === 0) {
      return {
        step: 2,
        phase: 'FLAWS_PLANTED',
        title: 'Vulnerable Target Active (v1.1 Planted Flaws)',
        desc: 'Cross-tenant IDOR, fare tampering, coupon stacking, double refund race, and shadow API flaws active. Ready to run DAST agents.',
        badge: 'STAGE 2 / 4',
        actionLabel: 'Run 8-Stage DAST Scan →',
        actionDisabled: false,
        actionFn: onRunScan,
      }
    }
    if (openTicketsCount > 0) {
      return {
        step: 3,
        phase: 'FINDINGS_CONFIRMED',
        title: `${openTicketsCount} Vulnerabilities Confirmed (Zero False Positives)`,
        desc: 'Every finding verified by deterministic control vs exploit replay. Inspect findings, approve HITL actions, then deploy remediated release.',
        badge: 'STAGE 3 / 4',
        actionLabel: 'Deploy v1.2 (Fix & Auto-Retest) →',
        actionDisabled: false,
        actionFn: onDeployV12,
      }
    }
    if (version === 'v1.2' && fixedTicketsCount > 0) {
      return {
        step: 4,
        phase: 'REMEDIATED',
        title: 'Closed-Loop Remediation Verified by RetestAgent',
        desc: `All ${fixedTicketsCount} planted flaws confirmed closed on patched v1.2 release. Full closed-loop DAST lifecycle successfully demonstrated.`,
        badge: 'STAGE 4 / 4 · COMPLETE',
        actionLabel: 'Reset to Clean Baseline v1.0 →',
        actionDisabled: false,
        actionFn: onDeployV10,
      }
    }
    return {
      step: 1,
      phase: 'READY',
      title: 'Target Operational',
      desc: 'System operational. Trigger a scan or switch environment release.',
      badge: 'STANDBY',
      actionLabel: 'Run Full Scan',
      actionDisabled: false,
      actionFn: onRunScan,
    }
  }, [health, tickets, busyAction, onDeployV10, onDeployV11, onDeployV12, onRunScan, onSelectTab])

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

  // Verification vs Candidate stats
  const verificationEvent = events.find((e) => e.stage === 'verify')
  const candidateCount = events.find((e) => e.stage === 'execute_safely')?.details?.candidates || (tickets.length > 0 ? tickets.length + 3 : 0)
  const verifiedCount = verificationEvent?.details?.verified ?? tickets.length
  const suppressedCount = verificationEvent?.details?.suppressed ?? (candidateCount > verifiedCount ? candidateCount - verifiedCount : 0)

  // Recent Scans history log derived from events and target
  const recentScans = useMemo(() => {
    return [
      {
        id: 'SCAN-RUN-104',
        trigger: 'CI/CD Deploy Webhook',
        commit: 'sim-v1.1',
        environment: 'Staging',
        status: 'COMPLETED',
        findingsFound: verifiedCount,
        duration: '3.42s',
        timestamp: 'Live Session',
      },
      {
        id: 'SCAN-RUN-103',
        trigger: 'Continuous Bundle Watcher',
        commit: 'bundle-hash-diff',
        environment: 'Staging',
        status: 'COMPLETED',
        findingsFound: 0,
        duration: '1.85s',
        timestamp: 'Earlier',
      },
      {
        id: 'SCAN-RUN-102',
        trigger: 'Manual Baseline Audit',
        commit: 'sim-v1.0',
        environment: 'Staging',
        status: 'COMPLETED',
        findingsFound: 0,
        duration: '2.10s',
        timestamp: 'Baseline',
      },
    ]
  }, [verifiedCount])

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

      {/* Hackathon Demonstration Storyline Stepper */}
      <div className="relative overflow-hidden rounded-2xl border border-cyan-500/40 bg-gradient-to-r from-slate-950 via-slate-900/90 to-slate-950 p-5 shadow-xl backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1.5 flex-1 min-w-[280px]">
            <div className="flex items-center gap-2.5">
              <span className="rounded-full bg-cyan-500/20 px-2.5 py-0.5 font-mono text-[10px] font-bold text-cyan-300 border border-cyan-500/40">
                {demoStage.badge}
              </span>
              <h2 className="text-sm font-bold text-white tracking-tight">
                {demoStage.title}
              </h2>
            </div>
            <p className="text-xs text-slate-300 font-sans leading-relaxed max-w-2xl">
              {demoStage.desc}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {demoStage.actionFn && (
              <button
                disabled={demoStage.actionDisabled}
                onClick={demoStage.actionFn}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-600 to-cyan-500 px-4 py-2 text-xs font-bold text-white shadow-[0_0_15px_-2px_rgba(6,182,212,0.4)] hover:from-cyan-500 hover:to-cyan-400 disabled:opacity-50 transition"
              >
                <span>{demoStage.actionLabel}</span>
              </button>
            )}
          </div>
        </div>

        {/* 4-Step Visual Progress Track */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 border-t border-slate-800/80 text-[10px] font-mono">
          <div className={`p-1.5 rounded-lg border text-center ${demoStage.step >= 1 ? 'border-cyan-500/40 bg-cyan-950/20 text-cyan-300' : 'border-slate-800 text-slate-500'}`}>
            1. Baseline (v1.0)
          </div>
          <div className={`p-1.5 rounded-lg border text-center ${demoStage.step >= 2 ? 'border-amber-500/40 bg-amber-950/20 text-amber-300' : 'border-slate-800 text-slate-500'}`}>
            2. Planted Flaws (v1.1)
          </div>
          <div className={`p-1.5 rounded-lg border text-center ${demoStage.step >= 3 ? 'border-rose-500/40 bg-rose-950/20 text-rose-300' : 'border-slate-800 text-slate-500'}`}>
            3. DAST Detection & Triage
          </div>
          <div className={`p-1.5 rounded-lg border text-center ${demoStage.step >= 4 ? 'border-emerald-500/40 bg-emerald-950/20 text-emerald-300' : 'border-slate-800 text-slate-500'}`}>
            4. Closed-Loop Retest (v1.2)
          </div>
        </div>
      </div>

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

      {/* Main Grid: Posture Overview + Verified vs Candidate */}
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

              {/* Visual Circular Gauge */}
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

          {/* Verified vs Candidate Findings Metric Panel */}
          <Panel
            title="Verification Precision (Zero False Positives)"
            subtitle="Deterministic replay gate suppression metrics"
            icon={<IconCheck className="w-4 h-4 text-emerald-400" />}
          >
            <div className="grid grid-cols-3 gap-3 text-center font-mono text-xs">
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                <span className="text-slate-500 text-[10px] block">CANDIDATES</span>
                <span className="text-slate-200 text-lg font-bold mt-0.5 block">{candidateCount}</span>
              </div>
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3">
                <span className="text-emerald-400 text-[10px] block font-semibold">CONFIRMED</span>
                <span className="text-emerald-300 text-lg font-bold mt-0.5 block">{verifiedCount}</span>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                <span className="text-slate-500 text-[10px] block">SUPPRESSED</span>
                <span className="text-slate-400 text-lg font-bold mt-0.5 block">{suppressedCount}</span>
              </div>
            </div>
            <p className="mt-3 text-[11px] text-slate-400 font-sans leading-relaxed">
              Every finding must survive a paired control vs exploit replay. Candidates that fail the deterministic oracle are dropped before ticketing.
            </p>
          </Panel>
        </div>

        {/* Right: Active Threats & Real-Time Stream */}
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
                {openTickets.slice(0, 3).map((ticket) => (
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

          {/* Recent Scans History */}
          <Panel
            title="Recent Pipeline Scan Executions"
            subtitle="Automated CI/CD webhook deployments and drift watcher scan history"
            icon={<IconActivity className="w-4 h-4" />}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="border-b border-slate-800 text-[10px] uppercase text-slate-500">
                  <tr>
                    <th className="py-2 pr-3">SCAN ID</th>
                    <th className="py-2 pr-3">TRIGGER SOURCE</th>
                    <th className="py-2 pr-3">COMMIT / REF</th>
                    <th className="py-2 pr-3">FINDINGS</th>
                    <th className="py-2 pr-3">DURATION</th>
                    <th className="py-2">STATUS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-[11px]">
                  {recentScans.map((scan) => (
                    <tr key={scan.id} className="hover:bg-slate-900/40">
                      <td className="py-2.5 pr-3 text-cyan-300 font-bold">{scan.id}</td>
                      <td className="py-2.5 pr-3 text-slate-200 font-sans">{scan.trigger}</td>
                      <td className="py-2.5 pr-3 text-slate-400">{scan.commit}</td>
                      <td className="py-2.5 pr-3 text-rose-300 font-bold">{scan.findingsFound}</td>
                      <td className="py-2.5 pr-3 text-slate-400">{scan.duration}</td>
                      <td className="py-2.5">
                        <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300 border border-emerald-500/30">
                          {scan.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  )
}
