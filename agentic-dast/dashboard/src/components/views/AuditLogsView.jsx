import React, { useState } from 'react'
import { Panel } from '../common/Panel'
import { Table } from '../common/Table'
import { MethodBadge } from '../common/Badge'
import { IconActivity, IconZap, IconShieldAlert } from '../common/Icons'

export function AuditLogsView({
  gatewayState = { metrics: null, recent_audit: [], canary_hits: [] },
}) {
  const [filterDecision, setFilterDecision] = useState('ALL')
  const logs = gatewayState.recent_audit || []

  const filteredLogs = filterDecision === 'ALL'
    ? logs
    : logs.filter((l) => {
        if (filterDecision === 'ALLOWED') return l.decision === 'ALLOWED'
        if (filterDecision === 'BLOCKED') return l.decision.startsWith('BLOCKED')
        return true
      })

  return (
    <div className="space-y-6">
      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          {['ALL', 'ALLOWED', 'BLOCKED'].map((dec) => {
            const count = dec === 'ALL'
              ? logs.length
              : dec === 'ALLOWED'
              ? logs.filter((l) => l.decision === 'ALLOWED').length
              : logs.filter((l) => l.decision.startsWith('BLOCKED')).length
            return (
              <button
                key={dec}
                onClick={() => setFilterDecision(dec)}
                className={`rounded-lg px-3 py-1.5 text-xs font-mono font-semibold transition ${
                  filterDecision === dec
                    ? 'bg-slate-800 text-slate-100'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                {dec} ({count})
              </button>
            )
          })}
        </div>
        <span className="text-xs font-mono text-slate-500">
          Immutable Trail: {gatewayState.metrics?.allowed_requests ?? 0} Allowed · {gatewayState.metrics?.blocked_requests ?? 0} Blocked
        </span>
      </div>

      <Panel
        title={`Safety Gateway Immutable Audit Trail (${filteredLogs.length})`}
        subtitle="Dual-channel audit log synchronized to append-only JSONL and SQLite in WAL mode"
        icon={<IconActivity className="w-4 h-4" />}
        bodyClassName="p-0"
      >
        <Table
          headers={[
            'GATEWAY DECISION',
            'ACTOR IDENTITY',
            'REQUEST DETAILS',
            'STATUS',
            'LATENCY',
            'TRACE IDENTIFIER',
          ]}
          isEmpty={filteredLogs.length === 0}
          emptyMessage="No audit records matching the selected filter."
        >
          {filteredLogs.map((rec) => {
            const isAllowed = rec.decision === 'ALLOWED'
            return (
              <tr
                key={rec.trace_id}
                className="hover:bg-slate-900/60 transition font-mono text-[11px]"
              >
                <td className="py-3 px-3 whitespace-nowrap">
                  <span className={`inline-flex items-center gap-1.5 font-mono text-xs font-semibold ${isAllowed ? 'text-emerald-400' : 'text-rose-400'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${isAllowed ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                    {isAllowed ? 'ALLOWED' : 'BLOCKED'}
                  </span>
                </td>
                <td className="py-3 px-3 text-slate-300">
                  <span className="font-mono text-xs text-slate-300">
                    {rec.actor}
                  </span>
                </td>
                <td className="py-3 px-3 max-w-sm truncate text-white" title={rec.url}>
                  <div className="flex items-center gap-1.5">
                    <MethodBadge method={rec.method} />
                    <span className="text-slate-300">{rec.url.replace('http://127.0.0.1:8001', '')}</span>
                  </div>
                </td>
                <td className="py-3 px-3">
                  <span
                    className={`font-bold ${
                      rec.status >= 500
                        ? 'text-rose-400'
                        : rec.status >= 400
                        ? 'text-amber-400'
                        : 'text-emerald-400'
                    }`}
                  >
                    {rec.status}
                  </span>
                </td>
                <td className="py-3 px-3 text-slate-400">
                  {rec.latency_ms} ms
                </td>
                <td className="py-3 px-3 text-slate-500 text-[10px]">
                  {rec.trace_id}
                </td>
              </tr>
            )
          })}
        </Table>
      </Panel>
    </div>
  )
}
