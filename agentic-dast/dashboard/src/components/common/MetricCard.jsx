import React from 'react'

export function MetricCard({
  label,
  value,
  sub,
  icon,
  tone = 'cyan',
  badgeText = null,
}) {
  const toneMap = {
    cyan: {
      text: 'text-cyan-300',
      iconBg: 'bg-cyan-500/10 text-cyan-400',
    },
    emerald: {
      text: 'text-emerald-300',
      iconBg: 'bg-emerald-500/10 text-emerald-400',
    },
    amber: {
      text: 'text-amber-300',
      iconBg: 'bg-amber-500/10 text-amber-400',
    },
    rose: {
      text: 'text-rose-300',
      iconBg: 'bg-rose-500/10 text-rose-400',
    },
    slate: {
      text: 'text-slate-100',
      iconBg: 'bg-slate-800/80 text-slate-300',
    },
  }

  const selectedTone = toneMap[tone] || toneMap.cyan

  return (
    <div className="relative overflow-hidden rounded-xl bg-slate-900/60 p-4 transition-colors hover:bg-slate-900/80">
      <div className="flex items-start justify-between gap-3">
        <div className="text-xs font-medium text-slate-300">
          {label}
        </div>
        {icon && (
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${selectedTone.iconBg}`}>
            {icon}
          </div>
        )}
      </div>

      <div className="mt-2 flex items-baseline gap-2">
        <div className={`text-2xl font-bold tracking-tight font-mono ${selectedTone.text}`}>
          {value}
        </div>
        {badgeText && (
          <span className="text-[11px] font-mono text-slate-400">
            ({badgeText})
          </span>
        )}
      </div>

      {sub && (
        <div className="mt-1 text-xs text-slate-400">
          {sub}
        </div>
      )}
    </div>
  )
}
