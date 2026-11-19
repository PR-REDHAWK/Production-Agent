import React from 'react'
import { SEVERITY_CONFIG, STATUS_CONFIG, CLASSIFICATION_CONFIG } from '../../theme/designTokens'

export function SeverityBadge({ severity }) {
  const cfg = SEVERITY_CONFIG[severity] || SEVERITY_CONFIG.LOW

  return (
    <span className={`inline-flex items-center gap-1.5 font-mono text-xs font-semibold ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

export function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.OPEN

  return (
    <span className={`inline-flex items-center gap-1.5 font-mono text-xs font-medium ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

export function ClassificationBadge({ classification }) {
  const cfg = CLASSIFICATION_CONFIG[classification] || CLASSIFICATION_CONFIG.Active

  return (
    <span className={`inline-flex items-center gap-1.5 font-mono text-xs font-medium ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.tag}
    </span>
  )
}

export function MethodBadge({ method }) {
  const colors = {
    GET: 'text-sky-400',
    POST: 'text-emerald-400',
    PATCH: 'text-amber-400',
    PUT: 'text-indigo-400',
    DELETE: 'text-rose-400',
  }

  return (
    <span className={`font-mono text-xs font-bold ${colors[method] || 'text-slate-300'}`}>
      {method}
    </span>
  )
}

export function TagBadge({ children, tone = 'slate' }) {
  const tones = {
    cyan: 'text-slate-300',
    slate: 'text-slate-400',
    amber: 'text-amber-400',
    emerald: 'text-emerald-400',
  }

  return (
    <span className={`text-xs font-mono ${tones[tone] || tones.slate}`}>
      {children}
    </span>
  )
}
