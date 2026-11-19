import React, { useMemo, useState } from 'react'
import { Panel } from '../common/Panel'
import { Table } from '../common/Table'
import { SeverityBadge, StatusBadge, MethodBadge } from '../common/Badge'
import { FindingDetailsModal } from './FindingDetailsModal'
import {
  IconBug,
  IconCopy,
  IconCheck,
  IconRefresh,
  IconExternalLink,
  IconActivity,
} from '../common/Icons'

export function FindingsView({
  tickets = [],
  selectedTicketId,
  onSelectTicket,
  onRetestTicket,
  busyAction = '',
}) {
  const [severityFilter, setSeverityFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [teamFilter, setTeamFilter] = useState('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortField, setSortField] = useState('severity') // 'severity' | 'endpoint' | 'title'
  const [sortAsc, setSortAsc] = useState(false)
  const [viewMode, setViewMode] = useState('table') // 'table' | 'split'
  const [detailModalTicket, setDetailModalTicket] = useState(null)
  const [copiedCurlId, setCopiedCurlId] = useState(null)

  // Extract unique owner teams
  const ownerTeams = useMemo(() => {
    const set = new Set(tickets.map((t) => t.owner_team).filter(Boolean))
    return Array.from(set)
  }, [tickets])

  // Severity sort weight mapping
  const severityWeight = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }

  // Filtered and sorted tickets
  const filteredTickets = useMemo(() => {
    return tickets
      .filter((t) => {
        if (severityFilter !== 'ALL' && t.severity !== severityFilter) return false
        if (statusFilter !== 'ALL' && t.status !== statusFilter) return false
        if (teamFilter !== 'ALL' && t.owner_team !== teamFilter) return false
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim()
          const matchTitle = t.finding?.title?.toLowerCase().includes(q)
          const matchPath = t.finding?.canonical_endpoint?.toLowerCase().includes(q)
          const matchParam = t.finding?.affected_parameter?.toLowerCase().includes(q)
          const matchClass = t.finding?.vuln_class?.toLowerCase().includes(q)
          const matchTeam = t.owner_team?.toLowerCase().includes(q)
          if (!matchTitle && !matchPath && !matchParam && !matchClass && !matchTeam) return false
        }
        return true
      })
      .sort((a, b) => {
        let diff = 0
        if (sortField === 'severity') {
          diff = (severityWeight[b.severity] || 0) - (severityWeight[a.severity] || 0)
        } else if (sortField === 'endpoint') {
          diff = (a.finding?.canonical_endpoint || '').localeCompare(b.finding?.canonical_endpoint || '')
        } else if (sortField === 'title') {
          diff = (a.finding?.title || '').localeCompare(b.finding?.title || '')
        }
        return sortAsc ? -diff : diff
      })
  }, [tickets, severityFilter, statusFilter, teamFilter, searchQuery, sortField, sortAsc])

  const selectedTicket = useMemo(
    () => tickets.find((t) => t.ticket_id === selectedTicketId) || filteredTickets[0] || null,
    [tickets, selectedTicketId, filteredTickets]
  )

  const handleCopy = async (id, text) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedCurlId(id)
      setTimeout(() => setCopiedCurlId(null), 1500)
    } catch {
      // fallback
    }
  }

  return (
    <div className="space-y-6">
      {/* Search & Filter Toolbar */}
      <div className="rounded-2xl bg-slate-950/70 p-4 backdrop-blur-xl shadow-lg space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Live Search */}
          <div className="relative min-w-[260px] flex-1">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search findings by endpoint, title, parameter, class, or owner team..."
              className="w-full rounded-xl bg-slate-900/80 px-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/40"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-2.5 text-xs text-slate-500 hover:text-white"
              >
                Clear
              </button>
            )}
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center rounded-xl bg-slate-900 p-1">
            <button
              onClick={() => setViewMode('table')}
              className={`rounded-lg px-3 py-1 text-xs font-medium transition ${
                viewMode === 'table' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-white'
              }`}
            >
              Table View
            </button>
            <button
              onClick={() => setViewMode('split')}
              className={`rounded-lg px-3 py-1 text-xs font-medium transition ${
                viewMode === 'split' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-white'
              }`}
            >
              Master-Detail Split
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/50 pt-3">
          {/* Severity Filter */}
          <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
            <span className="text-xs text-slate-400 mr-2 font-medium">Severity:</span>
            {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((sev) => {
              const count = sev === 'ALL'
                ? tickets.length
                : tickets.filter((t) => t.severity === sev).length
              return (
                <button
                  key={sev}
                  onClick={() => setSeverityFilter(sev)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-mono font-semibold transition ${
                    severityFilter === sev
                      ? 'bg-slate-800 text-cyan-300'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                  }`}
                >
                  {sev} ({count})
                </button>
              )
            })}
          </div>

          {/* Status & Team Dropdowns */}
          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg bg-slate-900 px-2.5 py-1 text-xs text-slate-300 focus:outline-none"
            >
              <option value="ALL">All Statuses</option>
              <option value="OPEN">Open</option>
              <option value="PENDING_HUMAN_REVIEW">Pending Review</option>
              <option value="VERIFIED_FIXED">Verified Fixed</option>
              <option value="STILL_VULNERABLE">Still Vulnerable</option>
            </select>

            {ownerTeams.length > 0 && (
              <select
                value={teamFilter}
                onChange={(e) => setTeamFilter(e.target.value)}
                className="rounded-lg bg-slate-900 px-2.5 py-1 text-xs text-slate-300 focus:outline-none"
              >
                <option value="ALL">All Owner Teams</option>
                {ownerTeams.map((team) => (
                  <option key={team} value={team}>{team}</option>
                ))}
              </select>
            )}

            <button
              onClick={() => {
                setSortAsc(!sortAsc)
              }}
              title="Toggle sort direction"
              className="rounded-lg bg-slate-900 px-2 py-1 text-xs font-mono text-slate-400 hover:text-white"
            >
              {sortAsc ? 'ASC ↑' : 'DESC ↓'}
            </button>
          </div>
        </div>
      </div>

      {/* MODE 1: PROFESSIONAL DATA TABLE VIEW */}
      {viewMode === 'table' && (
        <Panel
          title={`Verified Vulnerability Findings (${filteredTickets.length})`}
          subtitle="Zero-false-positive confirmed findings evaluated through deterministic replay"
          icon={<IconBug className="w-4 h-4 text-rose-400" />}
          bodyClassName="p-0"
        >
          <Table
            headers={[
              'SEVERITY',
              'VULNERABILITY TITLE & ID',
              'HTTP & ENDPOINT',
              'PARAM',
              'VERIFICATION STATUS',
              'OWNER TEAM',
              'ACTIONS',
            ]}
            isEmpty={filteredTickets.length === 0}
            emptyMessage="No vulnerability findings match the selected criteria."
          >
            {filteredTickets.map((t) => (
              <tr
                key={t.ticket_id}
                onClick={() => setDetailModalTicket(t)}
                className="cursor-pointer hover:bg-slate-900/70 transition"
              >
                <td className="py-3.5 px-3 whitespace-nowrap">
                  <SeverityBadge severity={t.severity} size="xs" />
                </td>

                <td className="py-3.5 px-3">
                  <div className="font-semibold text-white font-sans text-xs">
                    {t.finding.title}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="font-mono text-[10px] text-cyan-300">{t.ticket_id}</span>
                    <span className="text-[10px] text-slate-500 font-sans">· {t.finding.vuln_class}</span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      · {t.created_at ? new Date(t.created_at).toLocaleTimeString() : 'Live Cycle'}
                    </span>
                  </div>
                </td>

                <td className="py-3.5 px-3 font-mono text-white whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    <MethodBadge method={t.finding.method} />
                    <span className="text-slate-200">{t.finding.canonical_endpoint}</span>
                  </div>
                </td>

                <td className="py-3.5 px-3 font-mono text-cyan-300">
                  {t.finding.affected_parameter || 'None'}
                </td>

                <td className="py-3.5 px-3 whitespace-nowrap">
                  <StatusBadge status={t.status} size="xs" />
                </td>

                <td className="py-3.5 px-3 text-slate-300 font-sans text-xs whitespace-nowrap">
                  {t.owner_team}
                </td>

                <td className="py-3.5 px-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setDetailModalTicket(t)}
                      className="rounded-lg bg-slate-800/80 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-700 transition"
                    >
                      Details
                    </button>
                    <button
                      disabled={Boolean(busyAction)}
                      onClick={() => onRetestTicket(t.ticket_id)}
                      title="Retest exploit PoC"
                      className="rounded-lg bg-cyan-500/15 p-1 text-cyan-300 hover:bg-cyan-500/25 transition disabled:opacity-50"
                    >
                      <IconRefresh className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        </Panel>
      )}

      {/* MODE 2: MASTER-DETAIL SPLIT VIEW */}
      {viewMode === 'split' && (
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Left Master List */}
          <div className="lg:col-span-5 space-y-2.5 max-h-[700px] overflow-y-auto pr-1">
            {filteredTickets.map((t) => {
              const isSelected = selectedTicket?.ticket_id === t.ticket_id
              return (
                <button
                  key={t.ticket_id}
                  onClick={() => onSelectTicket(t.ticket_id)}
                  className={`w-full rounded-xl p-4 text-left transition-all ${
                    isSelected
                      ? 'bg-slate-900/90 shadow-[0_0_15px_-3px_rgba(6,182,212,0.2)] ring-1 ring-cyan-500/30'
                      : 'bg-slate-950/60 hover:bg-slate-900/50'
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
                      <span className="truncate max-w-[180px]">{t.finding.canonical_endpoint}</span>
                    </span>
                    <span className="text-[11px] text-slate-500">{t.owner_team}</span>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Right Detail Pane */}
          <div className="lg:col-span-7">
            {selectedTicket ? (
              <Panel
                title={selectedTicket.finding.title}
                subtitle={`Ticket ID: ${selectedTicket.ticket_id} · Class: ${selectedTicket.finding.vuln_class}`}
                icon={<IconBug className="w-4 h-4 text-rose-400" />}
                badge={<SeverityBadge severity={selectedTicket.severity} />}
                actions={
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setDetailModalTicket(selectedTicket)}
                      className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700 transition"
                    >
                      Full Details Modal &rarr;
                    </button>
                    <button
                      disabled={Boolean(busyAction)}
                      onClick={() => onRetestTicket(selectedTicket.ticket_id)}
                      className="flex items-center gap-1.5 rounded-lg bg-cyan-500/15 px-3 py-1.5 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/25 disabled:opacity-50 transition"
                    >
                      <IconRefresh className="w-3.5 h-3.5" />
                      <span>Retest</span>
                    </button>
                  </div>
                }
              >
                <div className="space-y-4 text-xs font-sans">
                  {/* Business Impact */}
                  <div>
                    <h4 className="text-xs font-semibold text-slate-300 mb-1">
                      Business Impact Analysis
                    </h4>
                    <p className="rounded-xl bg-slate-950/60 p-3.5 text-slate-200 leading-relaxed">
                      {selectedTicket.business_impact}
                    </p>
                  </div>

                  {/* Replayable cURL */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="text-xs font-semibold text-slate-300">
                        Replayable Proof of Concept
                      </h4>
                      <button
                        onClick={() => handleCopy(selectedTicket.ticket_id, selectedTicket.finding.repro_curl)}
                        className="text-cyan-400 hover:text-cyan-300 text-[11px]"
                      >
                        {copiedCurlId === selectedTicket.ticket_id ? 'Copied!' : 'Copy cURL'}
                      </button>
                    </div>
                    <pre className="overflow-x-auto rounded-xl bg-slate-950 p-3 font-mono text-[11px] text-emerald-300">
                      {selectedTicket.finding.repro_curl}
                    </pre>
                  </div>

                  {/* Remediation */}
                  <div>
                    <h4 className="text-xs font-semibold text-slate-300 mb-1">
                      Engineering Fix Recommendation
                    </h4>
                    <p className="rounded-xl bg-slate-950/60 p-3 text-slate-200">
                      {selectedTicket.code_fix_suggestion}
                    </p>
                  </div>
                </div>
              </Panel>
            ) : (
              <div className="rounded-xl bg-slate-950/40 p-12 text-center text-xs text-slate-400">
                Select a finding to inspect its verified proof.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Comprehensive Finding Details Modal */}
      <FindingDetailsModal
        ticket={detailModalTicket}
        isOpen={Boolean(detailModalTicket)}
        onClose={() => setDetailModalTicket(null)}
        onRetestTicket={onRetestTicket}
        busyAction={busyAction}
      />
    </div>
  )
}
