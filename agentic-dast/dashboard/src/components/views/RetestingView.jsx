import React from 'react'
import { Panel } from '../common/Panel'
import { MetricCard } from '../common/MetricCard'
import { StatusBadge, SeverityBadge, MethodBadge } from '../common/Badge'
import { IconRefresh, IconCheck, IconShieldAlert, IconPlay } from '../common/Icons'

export function RetestingView({
  tickets = [],
  onRetestTicket,
  onDeployV11,
  onDeployV12,
  busyAction = '',
}) {
  const verifiedFixed = tickets.filter((t) => t.status === 'VERIFIED_FIXED')
  const stillVulnerable = tickets.filter((t) => t.status === 'STILL_VULNERABLE')
  const openPending = tickets.filter((t) => t.status === 'OPEN' || t.status === 'PENDING_HUMAN_REVIEW')

  return (
    <div className="space-y-6">
      {/* Retest Status Summary Cards */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MetricCard
          label="Verified Remediated"
          value={verifiedFixed.length}
          sub="Exploits confirmed closed post-deploy"
          tone="emerald"
          icon={<IconCheck className="w-4 h-4" />}
        />
        <MetricCard
          label="Still Vulnerable"
          value={stillVulnerable.length}
          sub="Replays still succeed on target"
          tone="rose"
          icon={<IconShieldAlert className="w-4 h-4" />}
        />
        <MetricCard
          label="Pending Retest"
          value={openPending.length}
          sub="Open tickets awaiting fix deploy"
          tone="amber"
          icon={<IconRefresh className="w-4 h-4" />}
        />
      </section>

      {/* CI/CD Simulation & Retest Dispatch */}
      <Panel
        title="Continuous Retest Orchestration"
        subtitle="Simulate CI/CD release deployments to verify automated closed-loop remediation"
        icon={<IconRefresh className="w-4 h-4" />}
      >
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          <div>
            <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
              CI/CD Webhook Release Trigger
            </h4>
            <p className="mt-1 text-xs text-slate-400">
              When <code>is_fix_deploy=true</code> is posted to <code>/webhooks/deploy</code>, the Retest Agent autonomously replays verified PoCs.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              disabled={Boolean(busyAction)}
              onClick={onDeployV11}
              className="flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-500/25 disabled:opacity-50 transition"
            >
              <span>Deploy v1.1 (Re-plant Flaws)</span>
            </button>
            <button
              disabled={Boolean(busyAction)}
              onClick={onDeployV12}
              className="flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-50 transition shadow-[0_0_12px_-2px_rgba(16,185,129,0.3)]"
            >
              <IconCheck className="w-3.5 h-3.5" />
              <span>Deploy v1.2 (Fix & Auto-Retest)</span>
            </button>
          </div>
        </div>
      </Panel>

      {/* Ticket Retest Table */}
      <Panel
        title={`Remediation Verification Queue (${tickets.length})`}
        subtitle="Deterministic PoC replay status for all triaged findings"
        icon={<IconCheck className="w-4 h-4" />}
      >
        <div className="space-y-3">
          {tickets.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No tickets recorded. Deploy v1.1 and run a scan to generate verified findings.
            </div>
          ) : (
            tickets.map((t) => (
              <div
                key={t.ticket_id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-xs hover:border-slate-700 transition"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-cyan-300">{t.ticket_id}</span>
                    <SeverityBadge severity={t.severity} size="xs" />
                    <StatusBadge status={t.status} size="xs" />
                  </div>
                  <div className="font-semibold text-white">{t.finding.title}</div>
                  <div className="flex items-center gap-2 text-slate-400 font-mono text-[11px]">
                    <MethodBadge method={t.finding.method} />
                    <span>{t.finding.canonical_endpoint}</span>
                    <span className="text-slate-500">· Owner: {t.owner_team}</span>
                  </div>
                </div>

                <div>
                  <button
                    disabled={Boolean(busyAction)}
                    onClick={() => onRetestTicket(t.ticket_id)}
                    className="flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-3 py-1.5 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/25 disabled:opacity-50 transition shadow-[0_0_10px_-2px_rgba(6,182,212,0.25)]"
                  >
                    <IconRefresh className="w-3.5 h-3.5" />
                    <span>Replay Exploit PoC</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </Panel>
    </div>
  )
}
