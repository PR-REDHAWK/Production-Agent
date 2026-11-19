import React from 'react'
import { getAgentRobot } from './RobotAvatars'
import { IconX, IconShieldAlert } from '../common/Icons'

export function AgentInspector({
  agent,
  isOpen = false,
  onClose,
}) {
  if (!isOpen || !agent) return null

  const statusColors = {
    IDLE: 'text-slate-400',
    RUNNING: 'text-cyan-300 animate-pulse',
    COMPLETED: 'text-emerald-400',
    BLOCKED: 'text-rose-400',
    WAITING_FOR_APPROVAL: 'text-amber-400',
    FAILED: 'text-rose-400',
  }

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col bg-slate-950/95 shadow-2xl backdrop-blur-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800/80 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="shrink-0">
            {getAgentRobot(agent.id, agent.status, 44)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-white">{agent.name}</h2>
              <span className={`font-mono text-xs font-semibold ${statusColors[agent.status] || 'text-slate-400'}`}>
                {agent.status.replace(/_/g, ' ')}
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono">{agent.role}</p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition"
        >
          <IconX className="h-4 w-4" />
        </button>
      </div>

      {/* Body Details */}
      <div className="flex-1 space-y-5 overflow-y-auto p-6 text-xs font-sans">
        {/* Component Architecture Description */}
        <div>
          <h3 className="text-xs font-semibold text-slate-200 mb-1.5">
            Architectural Responsibility and Function
          </h3>
          <p className="rounded-xl bg-slate-900/60 p-3.5 text-slate-200 leading-relaxed font-sans">
            {agent.description}
          </p>
        </div>

        {/* Live Metrics Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-slate-900/50 p-3.5">
            <span className="text-xs text-slate-400 block">
              Endpoints Handled
            </span>
            <span className="font-mono text-xl font-bold text-cyan-300 mt-1 block">
              {agent.endpointsProcessed}
            </span>
          </div>

          <div className="rounded-xl bg-slate-900/50 p-3.5">
            <span className="text-xs text-slate-400 block">
              Findings Generated
            </span>
            <span className="font-mono text-xl font-bold text-rose-400 mt-1 block">
              {agent.findingsGenerated}
            </span>
          </div>

          <div className="rounded-xl bg-slate-900/50 p-3.5">
            <span className="text-xs text-slate-400 block">
              Processing Duration
            </span>
            <span className="font-mono text-xl font-bold text-emerald-400 mt-1 block">
              {agent.durationMs} ms
            </span>
          </div>

          <div className="rounded-xl bg-slate-900/50 p-3.5">
            <span className="text-xs text-slate-400 block">
              Pipeline Stage Key
            </span>
            <span className="font-mono text-xs font-semibold text-slate-300 mt-1.5 block truncate">
              {agent.stageKey}
            </span>
          </div>
        </div>

        {/* Input Received */}
        <div>
          <h3 className="text-xs font-semibold text-slate-200 mb-1.5">
            Input Consumed
          </h3>
          <div className="rounded-xl bg-slate-950 p-3 font-mono text-[11px] text-slate-300 leading-relaxed">
            {agent.inputReceived}
          </div>
        </div>

        {/* Output Generated */}
        <div>
          <h3 className="text-xs font-semibold text-slate-200 mb-1.5">
            Output Generated
          </h3>
          <div className="rounded-xl bg-slate-950 p-3 font-mono text-[11px] text-emerald-300 leading-relaxed">
            {agent.outputGenerated}
          </div>
        </div>

        {/* Warnings or Errors */}
        {agent.warnings && (
          <div>
            <h3 className="text-xs font-semibold text-rose-400 mb-1.5 flex items-center gap-1.5">
              <IconShieldAlert className="w-4 h-4" />
              <span>Warnings and Operational Flags</span>
            </h3>
            <div className="rounded-xl bg-rose-950/20 p-3 font-mono text-[11px] text-rose-200">
              {agent.warnings}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
