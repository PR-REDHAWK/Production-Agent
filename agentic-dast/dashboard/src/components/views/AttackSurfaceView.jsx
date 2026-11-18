import React, { useMemo, useState, useRef } from 'react'
import { dastApi } from '../../api/client'
import { Panel } from '../common/Panel'
import { MetricCard } from '../common/MetricCard'
import { MethodBadge, TagBadge, SeverityBadge } from '../common/Badge'
import { FLOW_ORDER } from '../../theme/designTokens'
import {
  IconNetwork,
  IconDownload,
  IconCpu,
  IconDatabase,
  IconSliders,
  IconShieldAlert,
  IconX,
  IconSparkles,
} from '../common/Icons'

export function AttackSurfaceView({
  graphData = { summary: null, endpoints: [], nodes: [], links: [] },
  tickets = [],
}) {
  const [selectedNode, setSelectedNode] = useState(null)
  const [filterFlow, setFilterFlow] = useState('ALL')
  const [zoom, setZoom] = useState(1.0)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const svgRef = useRef(null)

  const summary = graphData.summary || {}
  const endpoints = graphData.endpoints || []
  const rawNodes = graphData.nodes || []
  const rawLinks = graphData.links || []

  // Map vulnerable endpoints by path
  const vulnerableEndpointMap = useMemo(() => {
    const map = new Map()
    for (const t of tickets) {
      if (t.status !== 'VERIFIED_FIXED') {
        const ep = t.finding?.canonical_endpoint
        if (ep) {
          const list = map.get(ep) || []
          list.push(t)
          map.set(ep, list)
        }
      }
    }
    return map
  }, [tickets])

  // Filtered endpoints
  const filteredEndpoints = useMemo(() => {
    return filterFlow === 'ALL'
      ? endpoints
      : endpoints.filter((e) => (e.business_flow || 'unmapped') === filterFlow)
  }, [endpoints, filterFlow])

  // Compute graph nodes with deterministic coordinates for interactive SVG rendering
  const visualGraph = useMemo(() => {
    const nodes = []
    const links = []
    const width = 960
    const height = 620

    // 1. Roles on top-left (X: 100, Y: 80, 160, 240, 320)
    const roles = ['agency_a_admin', 'agency_a_subagent', 'agency_b_admin', 'unauthenticated']
    roles.forEach((r, idx) => {
      nodes.push({
        id: `Role:${r}`,
        label: r,
        type: 'Role',
        x: 110,
        y: 80 + idx * 80,
        color: '#8b5cf6',
      })
    })

    // 2. Business flows in upper center
    FLOW_ORDER.forEach((flow, idx) => {
      nodes.push({
        id: `BusinessFlow:${flow}`,
        label: flow.toUpperCase(),
        type: 'BusinessFlow',
        x: 280 + idx * 95,
        y: 60,
        color: '#10b981',
      })
    })

    // 3. Endpoints in the main center matrix (arranged in 3 rows)
    endpoints.forEach((ep, idx) => {
      const row = idx % 4
      const col = Math.floor(idx / 4)
      const isVuln = vulnerableEndpointMap.has(ep.canonical_path)
      nodes.push({
        id: `Endpoint:${ep.method}:${ep.canonical_path}`,
        label: `${ep.method} ${ep.canonical_path}`,
        raw: ep,
        type: 'Endpoint',
        x: 310 + col * 170,
        y: 150 + row * 110,
        isVuln,
        vulns: vulnerableEndpointMap.get(ep.canonical_path) || [],
        color: isVuln ? '#f43f5e' : '#06b6d4',
      })
    })

    // 4. Asset Owners on bottom right
    const ownerTeams = Array.from(new Set(endpoints.map((e) => e.owner_team).filter(Boolean)))
    ownerTeams.forEach((team, idx) => {
      nodes.push({
        id: `AssetOwner:${team}`,
        label: team,
        type: 'AssetOwner',
        x: 240 + idx * 160,
        y: height - 60,
        color: '#64748b',
      })
    })

    // Build visual links matching rawLinks or synthesized from endpoints
    const nodeMap = new Map(nodes.map((n) => [n.id, n]))

    for (const link of rawLinks) {
      const src = nodeMap.get(link.source)
      const tgt = nodeMap.get(link.target)
      if (src && tgt) {
        links.push({
          source: src,
          target: tgt,
          type: link.edge_type,
        })
      }
    }

    // If backend links were empty, synthesize connections from EndpointRecord properties
    if (links.length === 0) {
      for (const ep of endpoints) {
        const epNode = nodeMap.get(`Endpoint:${ep.method}:${ep.canonical_path}`)
        if (!epNode) continue

        // Flow step link
        if (ep.business_flow) {
          const flowNode = nodeMap.get(`BusinessFlow:${ep.business_flow}`)
          if (flowNode) {
            links.push({ source: flowNode, target: epNode, type: 'FLOW_STEP' })
          }
        }
        // Role link
        for (const r of ep.roles || []) {
          const rNode = nodeMap.get(`Role:${r}`)
          if (rNode) {
            links.push({ source: epNode, target: rNode, type: 'ACCESSIBLE_BY_ROLE' })
          }
        }
        // Owner link
        if (ep.owner_team) {
          const oNode = nodeMap.get(`AssetOwner:${ep.owner_team}`)
          if (oNode) {
            links.push({ source: epNode, target: oNode, type: 'OWNED_BY' })
          }
        }
      }
    }

    return { nodes, links, width, height }
  }, [endpoints, rawLinks, vulnerableEndpointMap])

  // Mouse pan event handlers
  const handleMouseDown = (e) => {
    setIsDragging(true)
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
  }

  const handleMouseMove = (e) => {
    if (!isDragging) return
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y })
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  return (
    <div className="space-y-6">
      {/* Topology Summary Cards */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <MetricCard
          label="Total Endpoints"
          value={summary.endpoints_count ?? endpoints.length}
          sub="Attack Surface Nodes"
          tone="cyan"
          icon={<IconCpu className="w-4 h-4" />}
        />
        <MetricCard
          label="Vulnerable Endpoints"
          value={vulnerableEndpointMap.size}
          sub="Active Threat Vectors"
          tone={vulnerableEndpointMap.size > 0 ? 'rose' : 'emerald'}
          icon={<IconShieldAlert className="w-4 h-4" />}
        />
        <MetricCard
          label="Multi-Tenant Roles"
          value={summary.roles_count ?? 4}
          sub="Symbolic Access Matrix"
          tone="violet"
          icon={<IconSliders className="w-4 h-4" />}
        />
        <MetricCard
          label="B2B Business Flows"
          value={summary.flows_count ?? 6}
          sub="State Machine Sequences"
          tone="emerald"
          icon={<IconNetwork className="w-4 h-4" />}
        />
        <MetricCard
          label="Asset Owners"
          value={summary.owners_count ?? 4}
          sub="Engineering Teams"
          tone="slate"
        />
      </section>

      {/* Main Interactive Graph Canvas Panel */}
      <Panel
        title="Interactive Application Knowledge Graph"
        subtitle="NetworkX topology: Endpoints, Roles, Business Flows & Parameters with live vulnerability highlighting"
        icon={<IconNetwork className="w-4 h-4" />}
        actions={
          <div className="flex items-center gap-2">
            {/* Zoom Controls */}
            <div className="flex items-center rounded-lg border border-slate-800 bg-slate-900 p-0.5">
              <button
                onClick={() => setZoom((z) => Math.min(2.0, z + 0.15))}
                title="Zoom in"
                className="px-2 py-1 text-xs font-mono font-bold text-slate-300 hover:text-white"
              >
                +
              </button>
              <span className="px-1.5 text-[10px] font-mono text-slate-500">{Math.round(zoom * 100)}%</span>
              <button
                onClick={() => setZoom((z) => Math.max(0.4, z - 0.15))}
                title="Zoom out"
                className="px-2 py-1 text-xs font-mono font-bold text-slate-300 hover:text-white"
              >
                -
              </button>
              <button
                onClick={() => {
                  setZoom(1.0)
                  setPan({ x: 0, y: 0 })
                }}
                title="Reset view"
                className="px-2 py-1 text-[10px] font-mono text-slate-400 hover:text-cyan-300 border-l border-slate-800"
              >
                Reset
              </button>
            </div>

            {/* OpenAPI Download */}
            <a
              href={dastApi.getOpenApiUrl()}
              download="inferred-openapi-3.1.json"
              className="flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-3 py-1.5 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/25 transition shadow-[0_0_10px_-2px_rgba(6,182,212,0.25)]"
            >
              <IconDownload className="h-3.5 w-3.5" />
              <span>OpenAPI 3.1</span>
            </a>
          </div>
        }
      >
        {/* Flow Filter Pills */}
        <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3">
          <span className="font-mono text-[10px] uppercase text-slate-500 mr-1">FILTER FLOW:</span>
          <button
            onClick={() => setFilterFlow('ALL')}
            className={`rounded-lg px-2.5 py-1 text-xs font-mono font-semibold transition ${
              filterFlow === 'ALL'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            ALL ({endpoints.length})
          </button>
          {FLOW_ORDER.map((flow) => {
            const count = endpoints.filter((e) => e.business_flow === flow).length
            return (
              <button
                key={flow}
                onClick={() => setFilterFlow(flow)}
                className={`rounded-lg px-2.5 py-1 text-xs font-mono font-semibold transition ${
                  filterFlow === flow
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                {flow.toUpperCase()} ({count})
              </button>
            )
          })}
        </div>

        {/* Interactive SVG Canvas */}
        <div
          className="relative h-[560px] w-full overflow-hidden rounded-xl border border-slate-800/80 bg-slate-950 cursor-grab active:cursor-grabbing select-none"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {/* Subtle grid background */}
          <div className="bg-cyber-grid pointer-events-none absolute inset-0 opacity-40" />

          {/* Canvas SVG */}
          <svg
            ref={svgRef}
            className="h-full w-full"
            viewBox={`0 0 ${visualGraph.width} ${visualGraph.height}`}
          >
            <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
              {/* Edges / Relationship Links */}
              {visualGraph.links.map((link, idx) => {
                const isHighlighted =
                  selectedNode && (selectedNode.id === link.source.id || selectedNode.id === link.target.id)
                return (
                  <g key={idx}>
                    <line
                      x1={link.source.x}
                      y1={link.source.y}
                      x2={link.target.x}
                      y2={link.target.y}
                      stroke={isHighlighted ? '#38bdf8' : '#1e293b'}
                      strokeWidth={isHighlighted ? 2 : 1}
                      strokeDasharray={link.type === 'FLOW_STEP' ? '4 3' : 'none'}
                    />
                  </g>
                )
              })}

              {/* Nodes */}
              {visualGraph.nodes.map((node) => {
                const isSelected = selectedNode?.id === node.id
                const isVuln = node.isVuln

                return (
                  <g
                    key={node.id}
                    transform={`translate(${node.x}, ${node.y})`}
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedNode(node)
                    }}
                    className="cursor-pointer group"
                  >
                    {/* Vulnerability Pulse Halo */}
                    {isVuln && (
                      <circle
                        r="24"
                        fill="none"
                        stroke="#f43f5e"
                        strokeWidth="2"
                        opacity="0.6"
                        className="animate-ping"
                      />
                    )}

                    {/* Node Background Disc/Box */}
                    {node.type === 'Endpoint' ? (
                      <rect
                        x="-65"
                        y="-16"
                        width="130"
                        height="32"
                        rx="8"
                        fill={isVuln ? '#4c0519' : isSelected ? '#083344' : '#0f172a'}
                        stroke={isVuln ? '#f43f5e' : isSelected ? '#22d3ee' : '#334155'}
                        strokeWidth={isVuln || isSelected ? 2 : 1}
                        className="transition-all group-hover:stroke-cyan-400"
                      />
                    ) : (
                      <rect
                        x="-50"
                        y="-14"
                        width="100"
                        height="28"
                        rx="14"
                        fill={node.type === 'BusinessFlow' ? '#064e3b' : node.type === 'Role' ? '#2e1065' : '#1e293b'}
                        stroke={isSelected ? '#22d3ee' : node.color}
                        strokeWidth={isSelected ? 2 : 1}
                        className="transition-all group-hover:brightness-125"
                      />
                    )}

                    {/* Node Text Label */}
                    <text
                      textAnchor="middle"
                      dy="4"
                      className={`text-[9px] font-mono font-bold select-none ${
                        isVuln ? 'fill-rose-200' : isSelected ? 'fill-cyan-300' : 'fill-slate-200'
                      }`}
                    >
                      {node.type === 'Endpoint' ? (
                        node.label.length > 20 ? node.label.slice(0, 19) + '…' : node.label
                      ) : (
                        node.label
                      )}
                    </text>

                    {/* Vulnerability Alert Badge */}
                    {isVuln && (
                      <circle cx="58" cy="-12" r="5" fill="#f43f5e" stroke="#060911" strokeWidth="1.5" />
                    )}
                  </g>
                )
              })}
            </g>
          </svg>

          {/* Interactive Instructions Pill */}
          <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg border border-slate-800 bg-slate-900/80 px-2.5 py-1 text-[10px] font-mono text-slate-400 backdrop-blur-md">
            Click node to inspect details · Drag to pan · Mouse zoom active
          </div>

          {/* Empty State Overlay */}
          {endpoints.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/90 p-6 backdrop-blur-md max-w-md shadow-2xl">
                <IconCpu className="mx-auto h-8 w-8 text-cyan-400 mb-2" />
                <h4 className="text-sm font-bold text-white">Knowledge Graph Awaiting Discovery</h4>
                <p className="mt-1 text-xs text-slate-400 leading-relaxed font-sans">
                  The application topology populates dynamically as the Reconnaissance Agent tokenizes JS bundles and crawls B2B portals.
                </p>
                <div className="mt-3 text-[11px] font-mono text-cyan-300">
                  Click [Run Full Scan] to discover endpoints
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Node Inspection Detail Drawer */}
        {selectedNode && (
          <div className="mt-4 rounded-xl border border-cyan-500/40 bg-slate-950/90 p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="rounded bg-cyan-500/15 px-2 py-0.5 font-mono text-[10px] font-bold text-cyan-300 border border-cyan-500/30">
                  {selectedNode.type.toUpperCase()}
                </span>
                <h3 className="font-mono text-sm font-bold text-white">{selectedNode.label}</h3>
              </div>
              <button
                onClick={() => setSelectedNode(null)}
                className="rounded-lg border border-slate-800 p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <IconX className="h-4 w-4" />
              </button>
            </div>

            {selectedNode.type === 'Endpoint' && selectedNode.raw && (
              <div className="space-y-3 text-xs font-mono">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <span className="text-slate-500 text-[10px] block">HTTP METHOD</span>
                    <MethodBadge method={selectedNode.raw.method} />
                  </div>
                  <div>
                    <span className="text-slate-500 text-[10px] block">BUSINESS FLOW</span>
                    <span className="text-emerald-400 font-bold">{selectedNode.raw.business_flow || 'unmapped'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[10px] block">ENGINEERING OWNER</span>
                    <span className="text-slate-300 font-bold">{selectedNode.raw.owner_team || 'Unassigned'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[10px] block">THREAT STATUS</span>
                    {selectedNode.isVuln ? (
                      <span className="text-rose-400 font-bold">VULNERABLE ({selectedNode.vulns.length})</span>
                    ) : (
                      <span className="text-emerald-400 font-bold">CLEAR</span>
                    )}
                  </div>
                </div>

                {/* Sensitivity Tags */}
                <div>
                  <span className="text-slate-500 text-[10px] block mb-1">SENSITIVITY CLASSIFICATION</span>
                  <div className="flex flex-wrap gap-1">
                    {(selectedNode.raw.sensitivity_tags || []).map((tag) => (
                      <TagBadge key={tag} tone="amber">{tag}</TagBadge>
                    ))}
                  </div>
                </div>

                {/* Permitted Roles */}
                <div>
                  <span className="text-slate-500 text-[10px] block mb-1">AUTHENTICATED ROLES PERMITTED</span>
                  <div className="flex flex-wrap gap-1">
                    {(selectedNode.raw.roles || []).map((r) => (
                      <TagBadge key={r} tone="violet">{r}</TagBadge>
                    ))}
                  </div>
                </div>

                {/* Parameters */}
                {selectedNode.raw.params && selectedNode.raw.params.length > 0 && (
                  <div>
                    <span className="text-slate-500 text-[10px] block mb-1">ACCEPTED PARAMETERS</span>
                    <div className="flex flex-wrap gap-1 text-[11px] text-cyan-300">
                      {selectedNode.raw.params.map((p) => (
                        <span key={p} className="rounded bg-slate-900 px-2 py-0.5 border border-slate-800">
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Active Vulnerabilities on this Node */}
                {selectedNode.isVuln && (
                  <div className="rounded-xl border border-rose-500/30 bg-rose-950/30 p-3 space-y-2">
                    <span className="text-rose-400 font-bold flex items-center gap-1.5">
                      <IconShieldAlert className="w-3.5 h-3.5" />
                      <span>Active Verified Vulnerabilities</span>
                    </span>
                    {selectedNode.vulns.map((v) => (
                      <div key={v.ticket_id} className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-200">{v.finding.title}</span>
                        <SeverityBadge severity={v.severity} size="xs" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Panel>
    </div>
  )
}
