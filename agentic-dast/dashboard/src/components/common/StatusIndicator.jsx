import React from 'react'

export function SSEStatusIndicator({ connected }) {
  return (
    <div className="flex items-center gap-1.5 text-xs font-mono">
      <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-400' : 'bg-slate-500'}`} />
      <span className="text-slate-400">
        {connected ? 'LIVE STREAM' : 'DISCONNECTED'}
      </span>
    </div>
  )
}

export function CircuitBreakerIndicator({ circuitBreaker = {} }) {
  const isPause = circuitBreaker.state === 'EMERGENCY_PAUSE'
  return (
    <div className="flex items-center gap-1.5 text-xs font-mono">
      <span className={`w-1.5 h-1.5 rounded-full ${isPause ? 'bg-rose-400' : 'bg-emerald-400'}`} />
      <span className={isPause ? 'text-rose-400 font-semibold' : 'text-slate-400'}>
        CIRCUIT: {circuitBreaker.state || 'CLOSED'}
      </span>
    </div>
  )
}

export function EnvironmentIndicator({ version, mode = 'in_memory' }) {
  const versionDot = {
    'v1.0': 'bg-sky-400',
    'v1.1': 'bg-amber-400',
    'v1.2': 'bg-emerald-400',
  }
  const dot = versionDot[version] || 'bg-slate-400'

  return (
    <div className="flex items-center gap-1.5 text-xs font-mono text-slate-300">
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      <span className="font-medium text-slate-300">{version ? `TARGET: ${version.toUpperCase()}` : 'TARGET: READY'}</span>
      <span className="text-[10px] text-slate-500">({mode === 'in_memory_mock' ? 'In-Memory' : 'HTTP Staging'})</span>
    </div>
  )
}
