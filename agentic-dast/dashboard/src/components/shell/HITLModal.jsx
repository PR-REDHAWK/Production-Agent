import React from 'react'
import { SeverityBadge } from '../common/Badge'
import { IconShieldAlert, IconCheck, IconX } from '../common/Icons'

export function HITLModal({
  isOpen,
  onClose,
  hitlState = { pending_count: 0, pending: [], all: [] },
  onDecide,
  busyAction = '',
}) {
  if (!isOpen) return null

  const items = hitlState.all || []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
      <div className="cyber-glass w-full max-w-2xl rounded-2xl border border-slate-700 bg-slate-900/95 p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-500/15 text-rose-400">
              <IconShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Human-in-the-Loop (HITL) Queue</h2>
              <p className="text-xs text-slate-400">
                Authorization required for state-mutating probes and high-severity findings
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition"
          >
            <IconX className="h-4 w-4" />
          </button>
        </div>

        {/* List */}
        <div className="mt-4 max-h-[420px] space-y-3 overflow-y-auto pr-1">
          {items.length === 0 ? (
            <div className="rounded-xl bg-slate-950/40 p-8 text-center text-xs text-slate-400">
              No HITL authorization items queued. All automated operations within safe bounds.
            </div>
          ) : (
            items.map((item) => (
              <div
                key={item.approval_id}
                className="rounded-xl bg-slate-950/70 p-4 text-xs transition"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-slate-300">
                      {item.approval_id}
                    </span>
                    <SeverityBadge severity={item.risk_level || 'HIGH'} size="xs" />
                  </div>
                  <span
                    className={`font-mono text-xs font-semibold ${
                      item.decision === 'PENDING'
                        ? 'text-amber-400'
                        : item.decision === 'APPROVED'
                        ? 'text-emerald-400'
                        : 'text-rose-400'
                    }`}
                  >
                    {item.decision}
                  </span>
                </div>

                <p className="mt-2 text-slate-200 font-sans leading-relaxed">{item.description}</p>
                {item.target_ref && (
                  <div className="mt-2 text-[11px] font-mono text-slate-400">
                    Target Reference: <span className="text-slate-300">{item.target_ref}</span>
                  </div>
                )}

                {item.decision === 'PENDING' && (
                  <div className="mt-3 flex gap-2">
                    <button
                      disabled={Boolean(busyAction)}
                      onClick={() => onDecide(item.approval_id, true)}
                      className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 transition"
                    >
                      <IconCheck className="h-3.5 w-3.5" />
                      <span>Approve Execution</span>
                    </button>
                    <button
                      disabled={Boolean(busyAction)}
                      onClick={() => onDecide(item.approval_id, false)}
                      className="flex items-center gap-1.5 rounded-lg bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs font-medium text-rose-300 hover:bg-slate-700 transition"
                    >
                      <IconX className="h-3.5 w-3.5" />
                      <span>Reject & Block</span>
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
