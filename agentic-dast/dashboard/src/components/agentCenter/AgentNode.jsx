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

  const statusColors = {
    IDLE: 'text-slate-400',
    RUNNING: 'text-sky-400 font-semibold',
    COMPLETED: 'text-emerald-400',
    BLOCKED: 'text-rose-400',
    WAITING_FOR_APPROVAL: 'text-amber-400',
    FAILED: 'text-rose-400',
  }

  return (
    <button
      onClick={() => onSelect(agent.id)}
      className={`group relative flex items-center gap-3.5 rounded-2xl bg-slate-950/80 p-3 text-left transition-all duration-200 ${
        isSelected
          ? 'ring-1 ring-slate-400 bg-slate-900'
          : 'hover:bg-slate-900/60'
      } ${compact ? 'p-2.5 gap-2.5' : ''} ${className}`}
    >
      {/* Top right pulse ping if running */}
      {isRunning && (
        <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-sky-400" />
        </span>
      )}

      {/* Robotic Avatar */}
      <div className="shrink-0 transition-transform group-hover:scale-105">
        {getAgentRobot(agent.id, agent.status, compact ? 42 : 52)}
      </div>

      {/* Metadata */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="truncate font-bold text-white text-xs tracking-tight group-hover:text-slate-200 transition-colors">
            {agent.name}
          </div>
          <span className={`font-mono text-[10px] font-semibold ${statusColors[agent.status] || 'text-slate-400'}`}>
            {agent.status.replace(/_/g, ' ')}
          </span>
        </div>

        <div className="mt-0.5 truncate text-[11px] text-slate-400">
          {agent.role}
        </div>

        {/* Dynamic Metrics */}
        <div className="mt-2 flex items-center gap-2 text-[10px] font-mono">
          {agent.endpointsProcessed > 0 && (
            <span className="text-slate-300 font-mono text-[11px]">
              {agent.endpointsProcessed} Endpoints
            </span>
          )}
          {agent.findingsGenerated > 0 && (
            <span className="text-slate-300 font-mono text-[11px]">
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
