import React from 'react'

export function MetricCard({
  label,
  value,
  sub,
  icon,
  tone = 'slate',
  badgeText = null,
}) {
  const toneMap = {
    cyan: {
      text: 'text-slate-100',
      dot: 'bg-sky-400',
      iconText: 'text-slate-400',
    },
    emerald: {
      text: 'text-slate-100',
      dot: 'bg-emerald-400',
      iconText: 'text-slate-400',
    },
    amber: {
      text: 'text-slate-100',
      dot: 'bg-amber-400',
      iconText: 'text-slate-400',
    },
    rose: {
      text: 'text-slate-100',
      dot: 'bg-rose-400',
      iconText: 'text-slate-400',
    },
    slate: {
      text: 'text-slate-100',
      dot: 'bg-slate-400',
      iconText: 'text-slate-400',
    },
  }

  const selectedTone = toneMap[tone] || toneMap.slate

  return (
    <div className="relative overflow-hidden rounded-xl bg-slate-900/60 p-4 transition-colors hover:bg-slate-900/80">
      <div className="flex items-start justify-between gap-3">
        <div className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${selectedTone.dot}`} />
          <span>{label}</span>
        </div>
        {icon && (
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-800/60 text-slate-400">
            {icon}
          </div>
        )}
      </div>

      <div className="mt-2.5 flex items-baseline gap-2">
        <div className="text-2xl font-semibold tracking-tight font-mono text-white">
          {value}
        </div>
        {badgeText && (
          <span className="text-[11px] font-mono text-slate-500">
            ({badgeText})
          </span>
        )}
      </div>

      {sub && (
        <div className="mt-1 text-xs text-slate-500 font-sans">
          {sub}
        </div>
      )}
    </div>
  )
}
