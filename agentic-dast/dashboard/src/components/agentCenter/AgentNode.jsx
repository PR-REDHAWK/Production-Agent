import React from 'react'
import { getAgentRobot } from './RobotAvatars'

export function AgentNode({
  agent,
  isSelected = false,
  onSelect,
  compact = false,
  className = '',
}) {
  const isRunning = agent.status === 'RUNNING'
  const isBlocked = agent.status === 'BLOCKED' || agent.status === 'FAILED'
  const isWaiting = agent.status === 'WAITING_FOR_APPROVAL'
  const isCompleted = agent.status === 'COMPLETED'

  const statusStyles = {
    IDLE: 'border-slate-800 bg-slate-950/80 text-slate-400',
    RUNNING: 'border-cyan-400 bg-cyan-950/50 text-cyan-200 ring-2 ring-cyan-500/40 shadow-[0_0_20px_-2px_rgba(6,182,212,0.4)]',
    COMPLETED: 'border-emerald-500/40 bg-slate-900/90 text-emerald-300 shadow-[0_0_15px_-3px_rgba(16,185,129,0.25)]',
    BLOCKED: 'border-rose-500/50 bg-rose-950/40 text-rose-300 ring-2 ring-rose-500/40 shadow-[0_0_20px_-2px_rgba(244,63,94,0.4)]',
    WAITING_FOR_APPROVAL: 'border-amber-500/50 bg-amber-950/40 text-amber-300 ring-2 ring-amber-500/40 animate-pulse',
    FAILED: 'border-rose-600 bg-rose-950/50 text-rose-200',
  }

  const badgeStyles = {
    IDLE: 'bg-slate-800/80 text-slate-400 border-slate-700/60',
    RUNNING: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-[0_0_8px_#06b6d4]',
    COMPLETED: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    BLOCKED: 'bg-rose-500/20 text-rose-300 border-rose-500/50',
    WAITING_FOR_APPROVAL: 'bg-amber-500/20 text-amber-300 border-amber-500/50',
    FAILED: 'bg-red-600/30 text-red-200 border-red-500',
  }

  return (
    <button
      onClick={() => onSelect(agent.id)}
      className={`group relative flex items-center gap-3.5 rounded-2xl border p-3 text-left transition-all duration-200 ${
        statusStyles[agent.status] || statusStyles.IDLE
      } ${
        isSelected
          ? 'ring-2 ring-cyan-400 shadow-[0_0_25px_-2px_rgba(6,182,212,0.5)] scale-[1.02] border-cyan-400'
          : 'hover:scale-[1.01] hover:border-slate-700'
      } ${compact ? 'p-2.5 gap-2.5' : ''} ${className}`}
    >
      {/* Top right pulse ping if running */}
      {isRunning && (
        <span className="absolute -top-1 -right-1 flex h-3 w-3">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-cyan-500" />
        </span>
      )}

      {/* Robotic Avatar */}
      <div className="shrink-0 transition-transform group-hover:scale-105">
        {getAgentRobot(agent.id, agent.status, compact ? 42 : 52)}
      </div>

      {/* Metadata */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="truncate font-bold text-white text-xs tracking-tight group-hover:text-cyan-300 transition-colors">
            {agent.name}
          </div>
          <span
            className={`rounded-full px-2 py-0.5 font-mono text-[9px] font-bold uppercase border ${
              badgeStyles[agent.status] || badgeStyles.IDLE
            }`}
          >
            {agent.status.replace(/_/g, ' ')}
          </span>
        </div>

        <div className="mt-0.5 truncate text-[11px] text-slate-400">
          {agent.role}
        </div>

        {/* Dynamic Metric Pill */}
        <div className="mt-2 flex items-center gap-2 text-[10px] font-mono">
          {agent.endpointsProcessed > 0 && (
            <span className="rounded bg-slate-900/90 px-1.5 py-0.5 text-cyan-300 border border-slate-800">
              {agent.endpointsProcessed} Endpoints
            </span>
          )}
          {agent.findingsGenerated > 0 && (
            <span className="rounded bg-slate-900/90 px-1.5 py-0.5 text-rose-300 border border-slate-800">
              {agent.findingsGenerated} Findings
            </span>
          )}
          {agent.durationMs > 0 && (
            <span className="text-slate-500">
              {agent.durationMs}ms
            </span>
          )}
        </div>
      </div>
    </button>
  )
}
