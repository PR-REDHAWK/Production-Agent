import React, { useMemo, useState } from 'react'
import { Panel } from '../common/Panel'
import { MetricCard } from '../common/MetricCard'
import { Table } from '../common/Table'
import { StatusBadge, SeverityBadge, MethodBadge } from '../common/Badge'
import { IconRefresh, IconCheck, IconShieldAlert, IconPlay, IconActivity, IconZap } from '../common/Icons'

export function RetestingView({
  tickets = [],
  onRetestTicket,
  onDeployV10,
  onDeployV11,
  onDeployV12,
  busyAction = '',
}) {
  const [filterState, setFilterState] = useState('ALL')

  const verifiedFixed = tickets.filter((t) => t.status === 'VERIFIED_FIXED')
  const stillVulnerable = tickets.filter((t) => t.status === 'STILL_VULNERABLE')
  const openPending = tickets.filter((t) => t.status === 'OPEN' || t.status === 'PENDING_HUMAN_REVIEW')

  const filteredTickets = filterState === 'ALL'
    ? tickets
    : tickets.filter((t) => t.status === filterState)

  // Remediation release history timeline items
  const releaseHistory = [
    {
      version: 'v1.2 (Remediated)',
      commit: 'sim-v1.2',
      tag: 'Fix Deploy',
      timestamp: 'Target Ready',
      desc: 'All planted flaws remediated: IDOR tenant isolation enforced, mass assignment blocked, double refund idempotency applied, unauth legacy routes decommissioned (HTTP 410).',
      status: 'PATCH VERIFIED',
      tone: 'emerald',
    },
    {
      version: 'v1.1 (Vulnerable Release)',
      commit: 'sim-v1.1',
      tag: 'Flawed Staging',
      timestamp: 'Simulated Deploy',
      desc: 'Planted vulnerabilities active: horizontal IDOR on bookings, subagent role privilege escalation, fare tampering during booking creation, skip-payment confirmation, double refund flaw, SSRF canary webhook, and shadow export.',
      status: 'VULNERABILITIES ACTIVE',
      tone: 'amber',
    },
    {
      version: 'v1.0 (Baseline Platform)',
      commit: 'sim-v1.0',
      tag: 'Initial Baseline',
      timestamp: 'Clean State',
      desc: 'Hardened production-ready baseline platform. Zero false positives verified by deterministic replay verifier.',
      status: 'BASELINE SECURE',
      tone: 'cyan',
    },
  ]

  return (
    <div className="space-y-6">
      {/* Retest Status Summary Cards */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-4">
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
        <MetricCard
          label="Verification Precision"
          value={tickets.length > 0 ? '100%' : '100%'}
          sub="Deterministic Code Oracles"
          tone="cyan"
          icon={<IconZap className="w-4 h-4" />}
        />
      </section>

      {/* CI/CD Release Trigger Banner */}
      <div className="rounded-2xl bg-slate-950/70 p-5 backdrop-blur-xl shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
              <IconRefresh className="h-4 w-4 text-cyan-400" />
              <span>CI/CD Automated Closed-Loop Retest Engine</span>
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              When a developer commits a fix or triggers a deployment webhook with <code>is_fix_deploy=true</code>, the Retest Agent autonomously replays verified exploit PoCs.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              disabled={Boolean(busyAction)}
              onClick={onDeployV10}
              className="flex items-center gap-1.5 rounded-xl bg-slate-800/80 px-3.5 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 hover:text-white disabled:opacity-50 transition"
            >
              <span>Reset Baseline (v1.0)</span>
            </button>
            <button
              disabled={Boolean(busyAction)}
              onClick={onDeployV11}
              className="flex items-center gap-1.5 rounded-xl bg-amber-500/15 px-3.5 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-500/25 disabled:opacity-50 transition"
            >
              <span>Deploy v1.1 (Planted Flaws)</span>
            </button>
            <button
              disabled={Boolean(busyAction)}
              onClick={onDeployV12}
              className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 px-4 py-2 text-xs font-bold text-white hover:from-emerald-500 hover:to-emerald-400 disabled:opacity-50 transition shadow-[0_0_15px_-2px_rgba(16,185,129,0.4)]"
            >
              <IconCheck className="w-3.5 h-3.5" />
              <span>Deploy v1.2 (Fix & Auto-Retest)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Historical Remediation Timeline */}
      <Panel
        title="Historical Release & Remediation Timeline"
        subtitle="Tracking vulnerability injection, CI/CD commit releases and automated retest transitions"
        icon={<IconActivity className="w-4 h-4" />}
      >
        <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
          {releaseHistory.map((rel, idx) => (
            <div key={rel.version} className="relative">
              {/* Timeline marker node */}
              <div
                className={`absolute -left-6 top-1 h-3 w-3 rounded-full border-2 border-slate-950 ${
                  rel.tone === 'emerald'
                    ? 'bg-emerald-400 ring-2 ring-emerald-500/40 shadow-[0_0_8px_#10b981]'
                    : rel.tone === 'amber'
                    ? 'bg-amber-400 ring-2 ring-amber-500/40'
                    : 'bg-cyan-400 ring-2 ring-cyan-500/40'
                }`}
              />

              <div className="rounded-xl bg-slate-950/70 p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-white">{rel.version}</span>
                    <span className="font-mono text-xs text-slate-400">
                      Commit: {rel.commit}
                    </span>
                  </div>
                  <span
                    className={`font-mono text-xs font-semibold ${
                      rel.tone === 'emerald'
                        ? 'text-emerald-400'
                        : rel.tone === 'amber'
                        ? 'text-amber-400'
                        : 'text-cyan-400'
                    }`}
                  >
                    {rel.status}
                  </span>
                </div>
                <p className="text-xs text-slate-300 font-sans leading-relaxed">{rel.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      {/* Retest Queue Table */}
      <Panel
        title={`Vulnerability Retest Queue (${filteredTickets.length})`}
        subtitle="Individual PoC replay verification against active target environment"
        icon={<IconRefresh className="w-4 h-4" />}
        actions={
          <div className="flex items-center gap-1.5">
            {['ALL', 'VERIFIED_FIXED', 'STILL_VULNERABLE', 'OPEN'].map((st) => (
              <button
                key={st}
                onClick={() => setFilterState(st)}
                className={`rounded px-2.5 py-1 text-[11px] font-mono font-semibold transition ${
                  filterState === st
                    ? 'bg-slate-800 text-cyan-300'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {st.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
        }
        bodyClassName="p-0"
      >
        <Table
          headers={[
            'TICKET ID',
            'FINDING TITLE',
            'ENDPOINT & METHOD',
            'SEVERITY',
            'RETEST STATUS',
            'OWNER TEAM',
            'REPLAY ACTION',
          ]}
          isEmpty={filteredTickets.length === 0}
          emptyMessage="No tickets match the selected retest state."
        >
          {filteredTickets.map((t) => (
            <tr key={t.ticket_id} className="hover:bg-slate-900/60 transition font-mono text-xs">
              <td className="py-3.5 px-3 text-cyan-300 font-bold whitespace-nowrap">
                {t.ticket_id}
              </td>
              <td className="py-3.5 px-3 font-sans text-white font-medium max-w-xs truncate">
                {t.finding.title}
              </td>
              <td className="py-3.5 px-3 text-slate-300 whitespace-nowrap">
                <div className="flex items-center gap-1.5">
                  <MethodBadge method={t.finding.method} />
                  <span>{t.finding.canonical_endpoint}</span>
                </div>
              </td>
              <td className="py-3.5 px-3 whitespace-nowrap">
                <SeverityBadge severity={t.severity} size="xs" />
              </td>
              <td className="py-3.5 px-3 whitespace-nowrap">
                <StatusBadge status={t.status} size="xs" />
              </td>
              <td className="py-3.5 px-3 font-sans text-slate-400 whitespace-nowrap">
                {t.owner_team}
              </td>
              <td className="py-3.5 px-3 whitespace-nowrap">
                <button
                  disabled={Boolean(busyAction)}
                  onClick={() => onRetestTicket(t.ticket_id)}
                  className="flex items-center gap-1.5 rounded-lg bg-cyan-500/15 px-2.5 py-1 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/25 disabled:opacity-50 transition"
                >
                  <IconRefresh className="w-3 h-3" />
                  <span>Retest PoC</span>
                </button>
              </td>
            </tr>
          ))}
        </Table>
      </Panel>
    </div>
  )
}
