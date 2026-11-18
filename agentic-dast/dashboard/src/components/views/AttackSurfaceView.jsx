import React, { useState } from 'react'
import { Panel } from '../common/Panel'
import { MetricCard } from '../common/MetricCard'
import { MethodBadge, TagBadge } from '../common/Badge'
import { FLOW_ORDER } from '../../theme/designTokens'
import { IconNetwork, IconDownload, IconCpu, IconDatabase, IconSliders } from '../common/Icons'

export function AttackSurfaceView({
  graphData = { summary: null, endpoints: [] },
  onDownloadOpenAPI,
}) {
  const [selectedFlow, setSelectedFlow] = useState('ALL')
  const summary = graphData.summary || {}
  const endpoints = graphData.endpoints || []

  const flows = [...FLOW_ORDER, null]

  const filteredEndpoints = selectedFlow === 'ALL'
    ? endpoints
    : endpoints.filter((e) => (e.business_flow || 'unmapped') === selectedFlow)

  return (
    <div className="space-y-6">
      {/* Knowledge Graph Topological Summary */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <MetricCard
          label="Total Endpoints"
          value={summary.endpoints_count ?? 0}
          sub="Discovered Routes"
          tone="cyan"
          icon={<IconCpu className="w-4 h-4" />}
        />
        <MetricCard
          label="Multi-Tenant Roles"
          value={summary.roles_count ?? 0}
          sub="Symbolic Identities"
          tone="emerald"
          icon={<IconSliders className="w-4 h-4" />}
        />
        <MetricCard
          label="Extracted Parameters"
          value={summary.params_count ?? 0}
          sub="Path, Query & Body"
          tone="amber"
          icon={<IconDatabase className="w-4 h-4" />}
        />
        <MetricCard
          label="B2B Business Flows"
          value={summary.flows_count ?? 0}
          sub="State Machine Sequences"
          tone="violet"
          icon={<IconNetwork className="w-4 h-4" />}
        />
        <MetricCard
          label="Asset Owners"
          value={summary.owners_count ?? 0}
          sub="Mapped Engineering Teams"
          tone="slate"
        />
      </section>

      {/* Main Flow Explorer */}
      <Panel
        title="Application Knowledge Graph Topology"
        subtitle="NetworkX multi-directed graph modeling API routes, parameters, roles and sequences"
        icon={<IconNetwork className="w-4 h-4" />}
        actions={
          <a
            href="/api/openapi.json"
            download="inferred-openapi-3.1.json"
            className="flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-3 py-1.5 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/25 transition shadow-[0_0_10px_-2px_rgba(6,182,212,0.25)]"
          >
            <IconDownload className="h-3.5 w-3.5" />
            <span>Export OpenAPI 3.1 JSON</span>
          </a>
        }
      >
        {/* Flow Selector Pills */}
        <div className="mb-4 flex flex-wrap gap-2 border-b border-slate-800 pb-3">
          <button
            onClick={() => setSelectedFlow('ALL')}
            className={`rounded-lg px-3 py-1.5 text-xs font-mono font-medium transition ${
              selectedFlow === 'ALL'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            ALL FLOWS ({endpoints.length})
          </button>
          {flows.map((flow) => {
            const count = endpoints.filter((e) => (e.business_flow || null) === flow).length
            if (count === 0 && flow !== null) return null
            const label = flow ? flow.toUpperCase() : 'ADMIN / LEGACY'
            return (
              <button
                key={flow || 'other'}
                onClick={() => setSelectedFlow(flow || 'unmapped')}
                className={`rounded-lg px-3 py-1.5 text-xs font-mono font-medium transition ${
                  selectedFlow === (flow || 'unmapped')
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                {label} ({count})
              </button>
            )
          })}
        </div>

        {/* Endpoints Grid */}
        <div className="grid gap-3 md:grid-cols-2">
          {filteredEndpoints.length === 0 ? (
            <div className="col-span-2 p-8 text-center text-xs text-slate-500">
              No endpoints mapped in this flow.
            </div>
          ) : (
            filteredEndpoints.map((ep) => (
              <div
                key={`${ep.method}-${ep.canonical_path}`}
                className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 text-xs hover:border-slate-700 transition"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-mono">
                    <MethodBadge method={ep.method} />
                    <span className="font-semibold text-white truncate max-w-[240px]">
                      {ep.canonical_path}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">
                    {ep.owner_team || 'Unassigned'}
                  </span>
                </div>

                {/* Tags & Roles */}
                <div className="mt-2.5 flex flex-wrap gap-1">
                  {ep.business_flow && (
                    <TagBadge tone="cyan">FLOW: {ep.business_flow.toUpperCase()}</TagBadge>
                  )}
                  {(ep.sensitivity_tags || []).map((tag) => (
                    <TagBadge key={tag} tone="amber">{tag}</TagBadge>
                  ))}
                  {(ep.roles || []).map((r) => (
                    <TagBadge key={r} tone="slate">{r}</TagBadge>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </Panel>
    </div>
  )
}
