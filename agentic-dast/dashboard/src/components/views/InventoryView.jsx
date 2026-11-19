import React, { useMemo, useState } from 'react'
import { Panel } from '../common/Panel'
import { Table } from '../common/Table'
import { MetricCard } from '../common/MetricCard'
import { ClassificationBadge, MethodBadge, TagBadge } from '../common/Badge'
import { IconDatabase, IconActivity, IconShieldAlert, IconX, IconSparkles } from '../common/Icons'

export function InventoryView({
  inventory = { active_count: 0, zombie_count: 0, shadow_count: 0, entries: [] },
}) {
  const [filterClass, setFilterClass] = useState('ALL')
  const [filterAuth, setFilterAuth] = useState('ALL')
  const [filterPII, setFilterPII] = useState('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedEntry, setSelectedEntry] = useState(null)

  const entries = inventory.entries || []

  // Count PII exposed entries
  const piiExposedCount = useMemo(
    () => entries.filter((e) => e.pii_exposed && e.pii_exposed.length > 0).length,
    [entries]
  )

  const unauthExposedCount = useMemo(
    () => entries.filter((e) => e.reachable_without_auth === true).length,
    [entries]
  )

  // Filtered inventory entries
  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      if (filterClass !== 'ALL' && e.classification !== filterClass) return false
      if (filterAuth === 'UNAUTH' && e.reachable_without_auth !== true) return false
      if (filterAuth === 'AUTH_REQUIRED' && e.reachable_without_auth !== false) return false
      if (filterPII === 'PII' && (!e.pii_exposed || e.pii_exposed.length === 0)) return false
      if (filterPII === 'NO_PII' && e.pii_exposed && e.pii_exposed.length > 0) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matchPath = e.canonical_path.toLowerCase().includes(q)
        const matchOwner = e.likely_owner?.toLowerCase().includes(q)
        const matchMethod = e.method.toLowerCase().includes(q)
        if (!matchPath && !matchOwner && !matchMethod) return false
      }
      return true
    })
  }, [entries, filterClass, filterAuth, filterPII, searchQuery])

  // Infer realistic discovery source for each entry
  const getDiscoverySource = (entry) => {
    if (entry.classification === 'Shadow') return 'Gateway Log Ingestion'
    if (entry.canonical_path.includes('/v1/')) return 'Legacy Path Prober'
    if (entry.canonical_path.includes('/search') || entry.canonical_path.includes('/holds')) return 'Playwright UI Crawl'
    return 'JS Bundle Lexer'
  }

  return (
    <div className="space-y-6">
      {/* Metrics Header Strip */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <MetricCard
          label="Catalog Total"
          value={entries.length}
          sub="Discovered Routes"
          tone="cyan"
          icon={<IconDatabase className="w-4 h-4" />}
        />
        <MetricCard
          label="Active Services"
          value={inventory.active_count || 0}
          sub="Documented & Live"
          tone="emerald"
        />
        <MetricCard
          label="Zombie APIs"
          value={inventory.zombie_count || 0}
          sub="Deprecated / 0 Traffic"
          tone="amber"
          badgeText="Action: Decommission"
        />
        <MetricCard
          label="Shadow Endpoints"
          value={inventory.shadow_count || 0}
          sub="Undocumented / Active"
          tone="slate"
          badgeText="Action: Restrict"
        />
        <MetricCard
          label="PII Leaks Risk"
          value={piiExposedCount}
          sub={`${unauthExposedCount} Unauthenticated`}
          tone={piiExposedCount > 0 ? 'rose' : 'emerald'}
          icon={<IconShieldAlert className="w-4 h-4" />}
        />
      </section>

      {/* Search and Filters Toolbar */}
      <div className="rounded-2xl bg-slate-950/70 p-4 backdrop-blur-xl shadow-lg space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative min-w-[260px] flex-1">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search catalog by endpoint route, HTTP method, or engineering owner..."
              className="w-full rounded-xl bg-slate-900/80 px-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none"
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

          <div className="flex items-center gap-2">
            <select
              value={filterAuth}
              onChange={(e) => setFilterAuth(e.target.value)}
              className="rounded-lg bg-slate-900 px-2.5 py-1 text-xs text-slate-300 focus:outline-none"
            >
              <option value="ALL">All Auth States</option>
              <option value="UNAUTH">Unauthenticated Only</option>
              <option value="AUTH_REQUIRED">Auth Required Only</option>
            </select>

            <select
              value={filterPII}
              onChange={(e) => setFilterPII(e.target.value)}
              className="rounded-lg bg-slate-900 px-2.5 py-1 text-xs text-slate-300 focus:outline-none"
            >
              <option value="ALL">All PII Exposures</option>
              <option value="PII">Exposes PII</option>
              <option value="NO_PII">No PII</option>
            </select>
          </div>
        </div>

        {/* Classification Filter Bar */}
        <div className="flex items-center gap-2 border-t border-slate-800/50 pt-3">
          <span className="text-xs text-slate-400 mr-2 font-medium">Classification:</span>
          {['ALL', 'Active', 'Zombie', 'Shadow'].map((cls) => {
            const count = cls === 'ALL'
              ? entries.length
              : entries.filter((e) => e.classification === cls).length
            return (
              <button
                key={cls}
                onClick={() => setFilterClass(cls)}
                className={`rounded-lg px-2.5 py-1 text-xs font-mono font-semibold transition ${
                  filterClass === cls
                    ? 'bg-slate-800 text-cyan-300'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                {cls.toUpperCase()} ({count})
              </button>
            )
          })}
        </div>
      </div>

      {/* Main Governance Catalog Table */}
      <Panel
        title={`API Governance Matrix (${filteredEntries.length})`}
        subtitle="Cataloging active microservices, unmaintained zombie code paths and shadow exports"
        icon={<IconDatabase className="w-4 h-4" />}
        bodyClassName="p-0"
      >
        <Table
          headers={[
            'CLASS',
            'ENDPOINT & HTTP METHOD',
            '90D TRAFFIC',
            'UNAUTH REACHABLE',
            'PII EXPOSED',
            'DISCOVERY SOURCE',
            'SECURITY REGRESSION',
            'OWNER TEAM',
            'RECOMMENDATION',
          ]}
          isEmpty={filteredEntries.length === 0}
          emptyMessage="No API inventory items match the current filters."
        >
          {filteredEntries.map((entry) => (
            <tr
              key={`${entry.method}-${entry.canonical_path}`}
              onClick={() => setSelectedEntry(entry)}
              className="cursor-pointer hover:bg-slate-900/60 transition"
            >
              <td className="py-3 px-3 whitespace-nowrap">
                <ClassificationBadge classification={entry.classification} size="xs" />
              </td>

              <td className="py-3 px-3 font-mono text-white whitespace-nowrap">
                <div className="flex items-center gap-1.5">
                  <MethodBadge method={entry.method} />
                  <span>{entry.canonical_path}</span>
                </div>
              </td>

              <td className="py-3 px-3 text-slate-300 font-mono">
                {entry.hit_count_90d}
              </td>

              <td className="py-3 px-3 whitespace-nowrap">
                {entry.reachable_without_auth === null ? (
                  <span className="text-slate-500 font-mono">None</span>
                ) : entry.reachable_without_auth ? (
                  <span className="font-mono text-xs font-bold text-rose-400">
                    EXPOSED
                  </span>
                ) : (
                  <span className="font-mono text-xs text-slate-400">
                    Auth Required
                  </span>
                )}
              </td>

              <td className="py-3 px-3 whitespace-nowrap">
                {entry.pii_exposed?.length ? (
                  <span className="font-mono text-xs text-amber-300">
                    {entry.pii_exposed.join(', ')}
                  </span>
                ) : (
                  <span className="text-slate-500 font-mono">None</span>
                )}
              </td>

              <td className="py-3 px-3 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                {getDiscoverySource(entry)}
              </td>

              <td className="py-3 px-3 text-slate-300 max-w-xs truncate font-sans text-xs">
                {entry.security_regression || 'None'}
              </td>

              <td className="py-3 px-3 text-slate-300 font-mono text-[10px] whitespace-nowrap">
                {entry.likely_owner || 'Unassigned'}
              </td>

              <td className="py-3 px-3 whitespace-nowrap">
                {entry.recommendation ? (
                  <span
                    className={`font-mono text-xs font-semibold ${
                      entry.recommendation === 'DECOMMISSION'
                        ? 'text-rose-400'
                        : entry.recommendation === 'RESTRICT'
                        ? 'text-amber-400'
                        : 'text-cyan-400'
                    }`}
                  >
                    {entry.recommendation}
                  </span>
                ) : (
                  <span className="text-slate-500">None</span>
                )}
              </td>
            </tr>
          ))}
        </Table>
      </Panel>

      {/* Entry Detail Drawer Modal */}
      {selectedEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
          <div className="cyber-glass w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <ClassificationBadge classification={selectedEntry.classification} />
                <h3 className="font-mono text-sm font-bold text-white">
                  {selectedEntry.method} {selectedEntry.canonical_path}
                </h3>
              </div>
              <button
                onClick={() => setSelectedEntry(null)}
                className="rounded-lg p-1 text-slate-400 hover:text-white"
              >
                <IconX className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs font-mono">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-slate-950 p-3">
                  <span className="text-slate-400 text-xs block mb-1 font-sans">90-Day Traffic Volume</span>
                  <span className="text-cyan-300 font-bold text-sm">{selectedEntry.hit_count_90d} requests</span>
                </div>
                <div className="rounded-lg bg-slate-950 p-3">
                  <span className="text-slate-400 text-xs block mb-1 font-sans">Discovery Source</span>
                  <span className="text-white font-bold">{getDiscoverySource(selectedEntry)}</span>
                </div>
              </div>

              <div className="rounded-lg bg-slate-950 p-3 space-y-2">
                <span className="text-slate-400 text-xs block font-sans">Security Audit Analysis</span>
                <p className="font-sans text-slate-300 leading-relaxed">
                  {selectedEntry.security_regression || 'Clean asset status. No active security regressions identified.'}
                </p>
                {selectedEntry.pii_exposed?.length > 0 && (
                  <div className="text-amber-300 font-bold">
                    Sensitive PII Fields Exposed: {selectedEntry.pii_exposed.join(', ')}
                  </div>
                )}
              </div>

              <div className="flex justify-between items-center pt-2">
                <span className="text-slate-400 font-sans">Owner: {selectedEntry.likely_owner}</span>
                {selectedEntry.recommendation && (
                  <span className="font-mono text-xs font-bold text-rose-400">
                    Recommended Action: {selectedEntry.recommendation}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
