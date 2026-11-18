import React, { useState } from 'react'
import { Panel } from '../common/Panel'
import { SeverityBadge, StatusBadge, MethodBadge } from '../common/Badge'
import { IconBug, IconCopy, IconCheck, IconRefresh } from '../common/Icons'

export function FindingsView({
  tickets = [],
  selectedTicketId,
  onSelectTicket,
  onRetestTicket,
  busyAction = '',
}) {
  const [severityFilter, setSeverityFilter] = useState('ALL')
  const [copiedCurl, setCopiedCurl] = useState(false)

  const filteredTickets = severityFilter === 'ALL'
    ? tickets
    : tickets.filter((t) => t.severity === severityFilter)

  const selectedTicket = tickets.find((t) => t.ticket_id === selectedTicketId) || filteredTickets[0] || null

  const handleCopy = async (text) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedCurl(true)
      setTimeout(() => setCopiedCurl(false), 2000)
    } catch {
      // fallback
    }
  }

  return (
    <div className="space-y-6">
      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((sev) => {
            const count = sev === 'ALL'
              ? tickets.length
              : tickets.filter((t) => t.severity === sev).length
            return (
              <button
                key={sev}
                onClick={() => setSeverityFilter(sev)}
                className={`rounded-lg px-3 py-1.5 text-xs font-mono font-semibold transition ${
                  severityFilter === sev
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-[0_0_10px_-2px_rgba(6,182,212,0.3)]'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                {sev} ({count})
              </button>
            )
          })}
        </div>
        <span className="text-xs font-mono text-slate-500">
          Showing {filteredTickets.length} of {tickets.length} Verified Findings
        </span>
      </div>

      {/* Master Detail Grid */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Ticket List (Left Pane) */}
        <div className="lg:col-span-5 space-y-2.5 max-h-[700px] overflow-y-auto pr-1">
          {filteredTickets.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-8 text-center text-xs text-slate-400">
              No findings matching the selected filter.
            </div>
          ) : (
            filteredTickets.map((t) => {
              const isSelected = selectedTicket?.ticket_id === t.ticket_id
              return (
                <button
                  key={t.ticket_id}
                  onClick={() => onSelectTicket(t.ticket_id)}
                  className={`w-full rounded-xl border p-4 text-left transition-all ${
                    isSelected
                      ? 'border-cyan-500/50 bg-slate-900/90 shadow-[0_0_15px_-3px_rgba(6,182,212,0.2)] ring-1 ring-cyan-500/30'
                      : 'border-slate-800/80 bg-slate-950/60 hover:border-slate-700 hover:bg-slate-900/50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <SeverityBadge severity={t.severity} size="xs" />
                    <StatusBadge status={t.status} size="xs" />
                  </div>

                  <div className="mt-2 text-sm font-semibold text-white leading-snug">
                    {t.finding.title}
                  </div>

                  <div className="mt-2 flex items-center justify-between text-xs text-slate-400 font-mono">
                    <span className="flex items-center gap-1.5">
                      <MethodBadge method={t.finding.method} />
                      <span className="truncate max-w-[200px]">{t.finding.canonical_endpoint}</span>
                    </span>
                    <span className="text-[11px] text-slate-500">{t.owner_team}</span>
                  </div>
                </button>
              )
            })
          )}
        </div>

        {/* Selected Finding Detail (Right Pane) */}
        <div className="lg:col-span-7">
          {selectedTicket ? (
            <Panel
              title={selectedTicket.finding.title}
              subtitle={`Ticket ID: ${selectedTicket.ticket_id} · Class: ${selectedTicket.finding.vuln_class}`}
              icon={<IconBug className="w-4 h-4 text-rose-400" />}
              badge={<SeverityBadge severity={selectedTicket.severity} />}
              actions={
                <button
                  disabled={Boolean(busyAction)}
                  onClick={() => onRetestTicket(selectedTicket.ticket_id)}
                  className="flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-3 py-1.5 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/25 disabled:opacity-50 transition shadow-[0_0_10px_-2px_rgba(6,182,212,0.25)]"
                >
                  <IconRefresh className="w-3.5 h-3.5" />
                  <span>Retest PoC</span>
                </button>
              }
            >
              <div className="space-y-5 text-xs">
                {/* Meta Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3 font-mono text-[11px]">
                  <div>
                    <span className="text-slate-500 block">STATUS</span>
                    <span className="text-slate-200 font-semibold">{selectedTicket.status}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">AFFECTED PARAMETER</span>
                    <span className="text-cyan-300 font-semibold">{selectedTicket.finding.affected_parameter}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">ENGINEERING OWNER</span>
                    <span className="text-slate-200 font-semibold">{selectedTicket.owner_team}</span>
                  </div>
                </div>

                {/* Business Impact */}
                <div>
                  <h4 className="font-mono text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Business Impact Analysis
                  </h4>
                  <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-3.5 text-slate-200 leading-relaxed font-sans">
                    {selectedTicket.business_impact}
                  </div>
                </div>

                {/* Reproducible PoC (Redacted cURL) */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <h4 className="font-mono text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Replayable Proof-of-Concept (Credentials Redacted)
                    </h4>
                    <button
                      onClick={() => handleCopy(selectedTicket.finding.repro_curl)}
                      className="flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 transition"
                    >
                      {copiedCurl ? (
                        <>
                          <IconCheck className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">Copied!</span>
                        </>
                      ) : (
                        <>
                          <IconCopy className="w-3 h-3" />
                          <span>Copy curl</span>
                        </>
                      )}
                    </button>
                  </div>
                  <pre className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950 p-3.5 font-mono text-[11px] text-emerald-300 shadow-inner">
                    {selectedTicket.finding.repro_curl}
                  </pre>
                </div>

                {/* Minimal Proof Evidence */}
                <div>
                  <h4 className="font-mono text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Minimal Deterministic Proof Evidence
                  </h4>
                  <pre className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950 p-3.5 font-mono text-[11px] text-amber-300">
                    {JSON.stringify(selectedTicket.finding.minimal_evidence, null, 2)}
                  </pre>
                </div>

                {/* Suggested Code Fix */}
                <div>
                  <h4 className="font-mono text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Engineering Remediation Guidance
                  </h4>
                  <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-3.5 text-slate-200 font-sans leading-relaxed">
                    {selectedTicket.code_fix_suggestion}
                  </div>
                </div>
              </div>
            </Panel>
          ) : (
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-12 text-center text-xs text-slate-400">
              Select a finding from the list to inspect its verified PoC and remediation advice.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
