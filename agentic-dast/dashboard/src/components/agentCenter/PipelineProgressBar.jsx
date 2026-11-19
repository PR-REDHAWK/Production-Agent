import React from 'react'
import { IconPlay, IconActivity, IconShield, IconRefresh } from '../common/Icons'

export function PipelineProgressBar({
  pipelineProgress = 0,
  currentStage = 'standby',
  isScanning = false,
  onRunScan,
  onDeployV10,
  onDeployV11,
  onDeployV12,
  circuitBreakerState = 'CLOSED',
  busyAction = '',
}) {
  const isPause = circuitBreakerState === 'EMERGENCY_PAUSE'

  return (
    <div className="rounded-2xl bg-slate-950/70 p-5 backdrop-blur-xl shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Left: Overall Scan Progress Status */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-300">
            <IconActivity className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white tracking-tight">
                DAST Pipeline Orchestrator
              </span>
              <span
                className={`font-mono text-xs font-semibold ${
                  isScanning
                    ? 'text-cyan-300 animate-pulse'
                    : isPause
                    ? 'text-rose-400'
                    : 'text-emerald-400'
                }`}
              >
                {isScanning ? 'RUNNING' : isPause ? 'CIRCUIT PAUSE' : 'STANDBY'}
              </span>
            </div>
            <div className="mt-0.5 text-xs text-slate-400 font-mono">
              Active Stage: <span className="text-cyan-300 font-semibold">{currentStage}</span>
            </div>
          </div>
        </div>

        {/* Center / Right: Progress Counter & Control Buttons */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-right mr-2 font-mono">
            <span className="text-xs text-slate-400">CYCLE PROGRESS</span>
            <div className="text-lg font-bold text-cyan-300">{pipelineProgress}%</div>
          </div>

          <button
            disabled={isScanning || isPause}
            onClick={() => onRunScan()}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-600 to-cyan-500 px-4 py-2 text-xs font-bold text-white shadow-[0_0_15px_-2px_rgba(6,182,212,0.4)] hover:from-cyan-500 hover:to-cyan-400 disabled:opacity-50 transition"
          >
            <IconPlay className="h-3.5 w-3.5" />
            <span>Dispatch Full Cycle</span>
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mt-4 relative h-2 w-full overflow-hidden rounded bg-slate-900">
        <div
          className="h-full rounded bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-500 shadow-[0_0_12px_rgba(6,182,212,0.6)]"
          style={{ width: `${Math.max(4, pipelineProgress)}%` }}
        />
      </div>
    </div>
  )
}
