import React from 'react'
import { getAgentRobot } from './RobotAvatars'
import { IconX, IconShieldAlert, IconCpu, IconActivity, IconZap } from '../common/Icons'

export function AgentInspector({
  agent,
  isOpen = false,
  onClose,
}) {
  if (!isOpen || !agent) return null

  const isRunning = agent.status === 'RUNNING'
  const isBlocked = agent.status === 'BLOCKED' || agent.status === 'FAILED'
  const isWaiting = agent.status === 'WAITING_FOR_APPROVAL'

  const statusBadgeClass = {
    IDLE: 'bg-slate-800 text-slate-400 border-slate-700',
    RUNNING: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-[0_0_10px_#06b6d4]',
    COMPLETED: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    BLOCKED: 'bg-rose-500/20 text-rose-300 border-rose-500/50 shadow-[0_0_10px_#f43f5e]',
    WAITING_FOR_APPROVAL: 'bg-amber-500/20 text-amber-300 border-amber-500/50',
    FAILED: 'bg-red-600/30 text-red-200 border-red-500',
  }[agent.status] || 'bg-slate-800 text-slate-400 border-slate-700'

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-slate-800 bg-slate-950/95 shadow-2xl backdrop-blur-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800/80 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="shrink-0">
            {getAgentRobot(agent.id, agent.status, 44)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-white">{agent.name}</h2>
              <span
                className={`rounded-full px-2 py-0.5 font-mono text-[9px] font-bold uppercase border ${statusBadgeClass}`}
              >
                {agent.status.replace(/_/g, ' ')}
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono">{agent.role}</p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="rounded-lg border border-slate-800 p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition"
        >
          <IconX className="h-4 w-4" />
        </button>
      </div>

      {/* Body Details */}
      <div className="flex-1 space-y-5 overflow-y-auto p-6 text-xs font-sans">
        {/* Component Architecture Description */}
        <div>
          <h3 className="font-mono text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
            Architectural Responsibility & Function
          </h3>
          <p className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-3.5 text-slate-200 leading-relaxed font-sans">
            {agent.description}
          </p>
        </div>

        {/* Live Metrics Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3.5">
            <span className="font-mono text-[10px] text-slate-500 uppercase tracking-wider block">
              Endpoints Handled
            </span>
            <span className="font-mono text-xl font-bold text-cyan-300 mt-1 block">
              {agent.endpointsProcessed}
            </span>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3.5">
            <span className="font-mono text-[10px] text-slate-500 uppercase tracking-wider block">
              Findings Generated
            </span>
            <span className="font-mono text-xl font-bold text-rose-400 mt-1 block">
              {agent.findingsGenerated}
            </span>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3.5">
            <span className="font-mono text-[10px] text-slate-500 uppercase tracking-wider block">
              Processing Duration
            </span>
            <span className="font-mono text-xl font-bold text-emerald-400 mt-1 block">
              {agent.durationMs} ms
            </span>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3.5">
            <span className="font-mono text-[10px] text-slate-500 uppercase tracking-wider block">
              Pipeline Stage Key
            </span>
            <span className="font-mono text-xs font-semibold text-slate-300 mt-1.5 block truncate">
              {agent.stageKey}
            </span>
          </div>
        </div>

        {/* Input Received */}
        <div>
          <h3 className="font-mono text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
            Input Consumed
          </h3>
          <div className="rounded-xl border border-slate-800/80 bg-slate-950 p-3 font-mono text-[11px] text-slate-300 leading-relaxed">
            {agent.inputReceived}
          </div>
        </div>

        {/* Output Generated */}
        <div>
          <h3 className="font-mono text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
            Output Generated
          </h3>
          <div className="rounded-xl border border-slate-800/80 bg-slate-950 p-3 font-mono text-[11px] text-emerald-300 leading-relaxed">
            {agent.outputGenerated}
          </div>
        </div>

        {/* Warnings or Circuit Breaker Alerts */}
        {agent.warnings && (
          <div>
            <h3 className="font-mono text-[11px] font-bold uppercase tracking-wider text-rose-400 mb-1.5 flex items-center gap-1.5">
              <IconShieldAlert className="w-3.5 h-3.5" />
              <span>Warnings & Policy Exceptions</span>
            </h3>
            <div className="rounded-xl border border-rose-500/30 bg-rose-950/40 p-3 font-mono text-[11px] text-rose-200 leading-relaxed">
              {agent.warnings}
            </div>
          </div>
        )}

        {/* Raw Event Context Details */}
        {agent.rawDetails && Object.keys(agent.rawDetails).length > 0 && (
          <div>
            <h3 className="font-mono text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Raw Stage Event Payload
            </h3>
            <pre className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950 p-3 font-mono text-[10px] text-cyan-300">
              {JSON.stringify(agent.rawDetails, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-slate-800/80 bg-slate-950/80 px-6 py-3 text-[11px] font-mono text-slate-500 flex items-center justify-between">
        <span>Component: {agent.id}</span>
        {agent.lastActive && (
          <span>Last Event: {agent.lastActive.slice(11, 19)}Z</span>
        )}
      </div>
    </div>
  )
}
