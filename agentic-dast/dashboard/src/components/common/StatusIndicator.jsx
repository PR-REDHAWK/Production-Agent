import React from 'react'

export function SSEStatusIndicator({ connected }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/80 px-2.5 py-1 text-xs">
      <span className="relative flex h-2 w-2">
        {connected ? (
          <>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
          </>
        ) : (
          <span className="relative inline-flex h-2 w-2 rounded-full bg-slate-500" />
        )}
      </span>
      <span className={`font-mono text-[11px] font-medium ${connected ? 'text-emerald-300' : 'text-slate-400'}`}>
        {connected ? 'LIVE STREAM' : 'DISCONNECTED'}
      </span>
    </div>
  )
}

export function CircuitBreakerIndicator({ circuitBreaker = {} }) {
  const isPause = circuitBreaker.state === 'EMERGENCY_PAUSE'
  return (
    <div
      className={`flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-mono ${
        isPause
          ? 'border-rose-500/40 bg-rose-500/15 text-rose-300 shadow-[0_0_12px_rgba(244,63,94,0.3)] animate-pulse'
          : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${isPause ? 'bg-rose-400' : 'bg-emerald-400'}`} />
      <span>CIRCUIT: {circuitBreaker.state || 'CLOSED'}</span>
    </div>
  )
}

export function EnvironmentIndicator({ version, mode = 'in_memory' }) {
  const versionColors = {
    'v1.0': 'border-sky-500/30 bg-sky-500/15 text-sky-300',
    'v1.1': 'border-amber-500/30 bg-amber-500/15 text-amber-300 shadow-[0_0_10px_-2px_rgba(245,158,11,0.25)]',
    'v1.2': 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300 shadow-[0_0_10px_-2px_rgba(16,185,129,0.25)]',
  }
  const color = versionColors[version] || 'border-slate-700 bg-slate-800 text-slate-300'

  return (
    <div className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-mono ${color}`}>
      <span className="font-semibold">{version ? `TARGET: ${version.toUpperCase()}` : 'TARGET: READY'}</span>
      <span className="text-[10px] opacity-75">({mode === 'in_memory_mock' ? 'In-Memory' : 'HTTP Staging'})</span>
    </div>
  )
}
