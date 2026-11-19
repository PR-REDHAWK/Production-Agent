import React from 'react'

export function SSEStatusIndicator({ connected }) {
  return (
    <div className="flex items-center gap-2 text-xs font-mono">
      <span className="relative flex h-2 w-2">
        {connected ? (
          <>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </>
        ) : (
          <span className="relative inline-flex h-2 w-2 rounded-full bg-slate-500" />
        )}
      </span>
      <span className={connected ? 'text-emerald-300' : 'text-slate-400'}>
        {connected ? 'LIVE STREAM' : 'DISCONNECTED'}
      </span>
    </div>
  )
}

export function CircuitBreakerIndicator({ circuitBreaker = {} }) {
  const isPause = circuitBreaker.state === 'EMERGENCY_PAUSE'
  return (
    <div className="flex items-center gap-2 text-xs font-mono">
      <span className={`h-1.5 w-1.5 rounded-full ${isPause ? 'bg-rose-400 animate-pulse' : 'bg-emerald-400'}`} />
      <span className={isPause ? 'text-rose-300 font-bold' : 'text-emerald-300'}>
        CIRCUIT: {circuitBreaker.state || 'CLOSED'}
      </span>
    </div>
  )
}

export function EnvironmentIndicator({ version, mode = 'in_memory' }) {
  const versionColors = {
    'v1.0': 'text-sky-300',
    'v1.1': 'text-amber-300',
    'v1.2': 'text-emerald-300',
  }
  const color = versionColors[version] || 'text-slate-300'

  return (
    <div className={`flex items-center gap-1.5 text-xs font-mono ${color}`}>
      <span className="font-semibold">{version ? `TARGET: ${version.toUpperCase()}` : 'TARGET: READY'}</span>
      <span className="text-[10px] text-slate-400">({mode === 'in_memory_mock' ? 'In-Memory' : 'HTTP Staging'})</span>
    </div>
  )
}
