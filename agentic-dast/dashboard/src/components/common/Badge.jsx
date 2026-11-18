import React from 'react'
import { SEVERITY_CONFIG, STATUS_CONFIG, CLASSIFICATION_CONFIG } from '../../theme/designTokens'

export function SeverityBadge({ severity, size = 'sm' }) {
  const cfg = SEVERITY_CONFIG[severity] || SEVERITY_CONFIG.LOW
  const pad = size === 'xs' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs'

  return (
    <span className={`inline-flex items-center gap-1.5 font-semibold font-mono rounded-md border ${cfg.badge} ${pad}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

export function StatusBadge({ status, size = 'sm' }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.OPEN
  const pad = size === 'xs' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2.5 py-0.5 text-xs'

  return (
    <span className={`inline-flex items-center gap-1.5 font-medium rounded-full border ${cfg.badge} ${pad}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

export function ClassificationBadge({ classification, size = 'sm' }) {
  const cfg = CLASSIFICATION_CONFIG[classification] || CLASSIFICATION_CONFIG.Active
  const pad = size === 'xs' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2.5 py-0.5 text-xs'

  return (
    <span className={`inline-flex items-center gap-1.5 font-semibold rounded-md border ${cfg.badge} ${pad}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.tag}
    </span>
  )
}

export function MethodBadge({ method }) {
  const colors = {
    GET: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    POST: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    PATCH: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    PUT: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
    DELETE: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  }
  const color = colors[method] || 'bg-slate-700/30 text-slate-300 border-slate-600/30'

  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 font-mono text-[10px] font-bold rounded border ${color}`}>
      {method}
    </span>
  )
}

export function TagBadge({ children, tone = 'slate' }) {
  const tones = {
    cyan: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30',
    violet: 'bg-purple-500/10 text-purple-300 border-purple-500/30',
    amber: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
    emerald: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
    slate: 'bg-slate-800/60 text-slate-300 border-slate-700/50',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-md border ${tones[tone] || tones.slate}`}>
      {children}
    </span>
  )
}
