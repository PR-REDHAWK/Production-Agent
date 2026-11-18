import React from 'react'

export function MetricCard({
  label,
  value,
  sub,
  icon,
  tone = 'cyan',
  accentGlow = false,
  badgeText = null,
}) {
  const toneMap = {
    cyan: {
      text: 'text-cyan-300',
      border: 'border-cyan-500/20 hover:border-cyan-500/40',
      glow: 'hover:shadow-[0_0_20px_-3px_rgba(6,182,212,0.25)]',
      iconBg: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
    },
    emerald: {
      text: 'text-emerald-300',
      border: 'border-emerald-500/20 hover:border-emerald-500/40',
      glow: 'hover:shadow-[0_0_20px_-3px_rgba(16,185,129,0.25)]',
      iconBg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    },
    amber: {
      text: 'text-amber-300',
      border: 'border-amber-500/20 hover:border-amber-500/40',
      glow: 'hover:shadow-[0_0_20px_-3px_rgba(245,158,11,0.25)]',
      iconBg: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    },
    rose: {
      text: 'text-rose-300',
      border: 'border-rose-500/20 hover:border-rose-500/40',
      glow: 'hover:shadow-[0_0_20px_-3px_rgba(244,63,94,0.3)]',
      iconBg: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    },
    violet: {
      text: 'text-purple-300',
      border: 'border-purple-500/20 hover:border-purple-500/40',
      glow: 'hover:shadow-[0_0_20px_-3px_rgba(168,85,247,0.25)]',
      iconBg: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    },
    slate: {
      text: 'text-slate-100',
      border: 'border-slate-800 hover:border-slate-700',
      glow: '',
      iconBg: 'bg-slate-800/80 text-slate-300 border-slate-700/50',
    },
  }

  const selectedTone = toneMap[tone] || toneMap.cyan

  return (
    <div
      className={`relative overflow-hidden rounded-xl bg-slate-900/60 p-4 backdrop-blur-md border ${selectedTone.border} ${selectedTone.glow} transition-all duration-200`}
    >
      {/* Subtle background glow circle */}
      <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br from-cyan-500/5 to-transparent blur-xl" />

      <div className="flex items-start justify-between gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          {label}
        </div>
        {icon && (
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${selectedTone.iconBg}`}>
            {icon}
          </div>
        )}
      </div>

      <div className="mt-2 flex items-baseline gap-2">
        <div className={`text-2xl font-bold tracking-tight font-mono ${selectedTone.text}`}>
          {value}
        </div>
        {badgeText && (
          <span className="rounded bg-slate-800/90 px-1.5 py-0.5 text-[10px] font-medium text-slate-300 border border-slate-700/60">
            {badgeText}
          </span>
        )}
      </div>

      {sub && (
        <div className="mt-1 text-xs text-slate-400 truncate">
          {sub}
        </div>
      )}
    </div>
  )
}
