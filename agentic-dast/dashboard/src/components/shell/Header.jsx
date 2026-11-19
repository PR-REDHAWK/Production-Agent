import React from 'react'
import { dastApi } from '../../api/client'
import { SSEStatusIndicator, EnvironmentIndicator } from '../common/StatusIndicator'
import { IconPlay, IconDownload, IconShieldAlert, IconRefresh } from '../common/Icons'

export function Header({
  title,
  subtitle,
  health,
  sseConnected,
  pendingHitlCount = 0,
  busyAction = '',
  onRunScan,
  onDeployV10,
  onDeployV11,
  onDeployV12,
  onOpenHitl,
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-xl">
      <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-3.5">
        {/* Left: View Title & Status Indicators */}
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-base font-bold tracking-tight text-white">{title}</h1>
            {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
          </div>

          <div className="hidden sm:flex items-center gap-2">
            <SSEStatusIndicator connected={sseConnected} />
            {health?.mock_version && (
              <EnvironmentIndicator
                version={health.mock_version}
                mode={health.mode}
              />
            )}
          </div>
        </div>

        {/* Right: Action Center */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Reset v1.0 Baseline */}
          <button
            disabled={Boolean(busyAction)}
            onClick={onDeployV10}
            title="Reset target to clean baseline v1.0"
            className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/90 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-50 transition"
          >
            <span>Reset v1.0</span>
          </button>

          {/* Run Full Scan Button */}
          <button
            disabled={Boolean(busyAction)}
            onClick={onRunScan}
            className="flex items-center gap-2 rounded-lg bg-sky-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50 transition"
          >
            <IconPlay className="h-3.5 w-3.5" />
            <span>Run Full Scan</span>
          </button>

          {/* Deploy v1.1 Toggle */}
          <button
            disabled={Boolean(busyAction)}
            onClick={onDeployV11}
            className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/90 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-50 transition"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            <span>Deploy v1.1 (Vuln)</span>
          </button>

          {/* Deploy v1.2 Toggle */}
          <button
            disabled={Boolean(busyAction)}
            onClick={onDeployV12}
            className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/90 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-50 transition"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>Deploy v1.2 (Fix & Retest)</span>
          </button>

          {/* Export OpenAPI */}
          <a
            href={dastApi.getOpenApiUrl()}
            download="inferred-openapi-3.1.json"
            className="hidden md:flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/90 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition"
          >
            <IconDownload className="h-3.5 w-3.5 text-slate-400" />
            <span>OpenAPI 3.1</span>
          </a>

          {/* HITL Queue Button */}
          <button
            onClick={onOpenHitl}
            className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/90 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition"
          >
            <IconShieldAlert className="h-3.5 w-3.5 text-slate-400" />
            <span>HITL Queue</span>
            {pendingHitlCount > 0 && (
              <span className="font-mono text-xs font-semibold text-rose-400">
                ({pendingHitlCount})
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Busy Action Banner */}
      {busyAction && (
        <div className="flex items-center gap-2 border-t border-slate-800 bg-slate-900/95 px-6 py-2 text-xs text-slate-200">
          <span className="relative flex h-2 w-2">
            <span className="relative inline-flex h-2 w-2 rounded-full bg-sky-400" />
          </span>
          <span className="font-mono">{busyAction}</span>
        </div>
      )}
    </header>
  )
}
