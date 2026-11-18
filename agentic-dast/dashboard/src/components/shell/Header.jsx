import React from 'react'
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

        {/* Right: Quick Action Center */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Run Full Scan Button */}
          <button
            disabled={Boolean(busyAction)}
            onClick={onRunScan}
            className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-600 to-cyan-500 px-3.5 py-1.5 text-xs font-semibold text-white shadow-[0_0_15px_-2px_rgba(6,182,212,0.4)] hover:from-cyan-500 hover:to-cyan-400 disabled:opacity-50 transition"
          >
            <IconPlay className="h-3.5 w-3.5" />
            <span>Run Full Scan</span>
          </button>

          {/* Deploy v1.1 Toggle */}
          <button
            disabled={Boolean(busyAction)}
            onClick={onDeployV11}
            className="flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-xs font-medium text-amber-200 hover:bg-amber-500/25 disabled:opacity-50 transition shadow-[0_0_12px_-2px_rgba(245,158,11,0.25)]"
          >
            <span>Deploy v1.1 (Vuln)</span>
          </button>

          {/* Deploy v1.2 Toggle */}
          <button
            disabled={Boolean(busyAction)}
            onClick={onDeployV12}
            className="flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-50 transition shadow-[0_0_12px_-2px_rgba(16,185,129,0.25)]"
          >
            <IconRefresh className="h-3 w-3" />
            <span>Deploy v1.2 (Fix & Retest)</span>
          </button>

          {/* Export OpenAPI */}
          <a
            href="/api/openapi.json"
            download="inferred-openapi-3.1.json"
            className="hidden md:flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-800/80 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 transition"
          >
            <IconDownload className="h-3.5 w-3.5 text-slate-400" />
            <span>OpenAPI 3.1</span>
          </a>

          {/* HITL Queue Button with Alert Pill */}
          <button
            onClick={onOpenHitl}
            className="relative flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/15 px-3 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-500/25 transition shadow-[0_0_12px_-2px_rgba(244,63,94,0.3)]"
          >
            <IconShieldAlert className="h-3.5 w-3.5 text-rose-400" />
            <span>HITL Queue</span>
            {pendingHitlCount > 0 && (
              <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 font-mono text-[10px] font-bold text-white shadow-[0_0_8px_#f43f5e]">
                {pendingHitlCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Busy Action Banner */}
      {busyAction && (
        <div className="flex items-center gap-2 border-t border-cyan-500/30 bg-cyan-950/40 px-6 py-2 text-xs text-cyan-200">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-500" />
          </span>
          <span className="font-mono">{busyAction}</span>
        </div>
      )}
    </header>
  )
}
