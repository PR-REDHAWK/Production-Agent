import React, { useState } from 'react'
import { Panel } from '../common/Panel'
import { Table } from '../common/Table'
import { ClassificationBadge, MethodBadge } from '../common/Badge'
import { IconDatabase } from '../common/Icons'

export function InventoryView({
  inventory = { active_count: 0, zombie_count: 0, shadow_count: 0, entries: [] },
}) {
  const [filterClass, setFilterClass] = useState('ALL')
  const entries = inventory.entries || []

  const filteredEntries = filterClass === 'ALL'
    ? entries
    : entries.filter((e) => e.classification === filterClass)

  return (
    <div className="space-y-6">
      {/* Category Filter Pills */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          {['ALL', 'Active', 'Zombie', 'Shadow'].map((cls) => {
            const count = cls === 'ALL'
              ? entries.length
              : entries.filter((e) => e.classification === cls).length
            return (
              <button
                key={cls}
                onClick={() => setFilterClass(cls)}
                className={`rounded-lg px-3 py-1.5 text-xs font-mono font-semibold transition ${
                  filterClass === cls
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-[0_0_10px_-2px_rgba(6,182,212,0.3)]'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                {cls.toUpperCase()} ({count})
              </button>
            )
          })}
        </div>
        <span className="text-xs font-mono text-slate-500">
          Governance Matrix: {inventory.active_count} Active · {inventory.zombie_count} Zombie · {inventory.shadow_count} Shadow
        </span>
      </div>

      <Panel
        title="API Inventory & Catalog Governance"
        subtitle="Identifies active production routes, deprecated zombie APIs and unmanaged shadow endpoints"
        icon={<IconDatabase className="w-4 h-4" />}
        bodyClassName="p-0"
      >
        <Table
          headers={[
            'CLASSIFICATION',
            'ENDPOINT & METHOD',
            '90D TRAFFIC HITS',
            'UNAUTHENTICATED',
            'PII EXPOSURE',
            'REGRESSION / SECURITY RISK',
            'ENGINEERING OWNER',
            'RECOMMENDED ACTION',
          ]}
          isEmpty={filteredEntries.length === 0}
          emptyMessage="No catalog entries matching the selected filter."
        >
          {filteredEntries.map((entry) => (
            <tr
              key={`${entry.method}-${entry.canonical_path}`}
              className="hover:bg-slate-900/60 transition"
            >
              <td className="py-3 px-3 whitespace-nowrap">
                <ClassificationBadge classification={entry.classification} size="xs" />
              </td>
              <td className="py-3 px-3 font-mono text-white">
                <div className="flex items-center gap-1.5">
                  <MethodBadge method={entry.method} />
                  <span>{entry.canonical_path}</span>
                </div>
              </td>
              <td className="py-3 px-3 text-slate-300 font-mono">
                {entry.hit_count_90d}
              </td>
              <td className="py-3 px-3">
                {entry.reachable_without_auth === null ? (
                  <span className="text-slate-500">—</span>
                ) : entry.reachable_without_auth ? (
                  <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-bold text-rose-300 border border-rose-500/30">
                    EXPOSED
                  </span>
                ) : (
                  <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
                    AUTH REQUIRED
                  </span>
                )}
              </td>
              <td className="py-3 px-3 text-amber-200">
                {entry.pii_exposed?.length ? (
                  <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-mono text-amber-300 border border-amber-500/30">
                    {entry.pii_exposed.join(', ')}
                  </span>
                ) : (
                  <span className="text-slate-500">—</span>
                )}
              </td>
              <td className="py-3 px-3 text-slate-300 max-w-xs truncate font-sans text-xs">
                {entry.security_regression || '—'}
              </td>
              <td className="py-3 px-3 text-slate-300 font-mono text-[10px]">
                {entry.likely_owner || 'Unassigned'}
              </td>
              <td className="py-3 px-3">
                {entry.recommendation ? (
                  <span className="rounded bg-rose-500/20 px-2 py-0.5 text-[10px] font-semibold text-rose-200 border border-rose-500/30">
                    {entry.recommendation}
                  </span>
                ) : (
                  <span className="text-slate-500">—</span>
                )}
              </td>
            </tr>
          ))}
        </Table>
      </Panel>
    </div>
  )
}
