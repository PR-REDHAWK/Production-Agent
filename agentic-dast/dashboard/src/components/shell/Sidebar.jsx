import React from 'react'
import { NAV_ITEMS } from '../../theme/designTokens'
import { getNavIcon, IconChevronLeft, IconChevronRight, IconShield } from '../common/Icons'

export function Sidebar({
  activeTab,
  onSelectTab,
  collapsed,
  onToggleCollapse,
  badgeCounts = {},
  gatewayMetrics = null,
}) {
  const rl = gatewayMetrics?.rate_limits || {}

  return (
    <aside
      className={`fixed top-0 bottom-0 left-0 z-40 flex flex-col border-r border-slate-800/80 bg-slate-950/90 backdrop-blur-xl transition-all duration-300 ease-in-out ${
        collapsed ? 'w-18' : 'w-64'
      }`}
    >
      {/* Brand Header */}
      <div className="flex h-16 items-center justify-between border-b border-slate-800/80 px-4">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/20 to-purple-500/20 text-cyan-300 ring-1 ring-cyan-500/40 shadow-[0_0_15px_-2px_rgba(6,182,212,0.3)]">
            <IconShield className="h-5 w-5 text-cyan-400" />
            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-cyan-500" />
            </span>
          </div>

          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="font-bold tracking-tight text-white text-sm">ANTIGRAVITY</span>
                <span className="rounded bg-cyan-500/20 px-1 py-0.2 text-[9px] font-mono font-bold text-cyan-300 border border-cyan-500/40">
                  DAST
                </span>
              </div>
              <div className="text-[10px] font-medium text-slate-400 truncate">
                Real-Time API Shield
              </div>
            </div>
          )}
        </div>

        {!collapsed && (
          <button
            onClick={onToggleCollapse}
            title="Collapse sidebar"
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition"
          >
            <IconChevronLeft className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Navigation List */}
      <nav className="flex-1 space-y-1.5 p-3 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.id
          const count = badgeCounts[item.id]

          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              title={collapsed ? item.label : undefined}
              className={`group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-medium transition-all ${
                isActive
                  ? 'bg-gradient-to-r from-cyan-500/15 to-purple-500/10 text-white border border-cyan-500/40 shadow-[0_0_15px_-3px_rgba(6,182,212,0.2)]'
                  : 'text-slate-400 hover:bg-slate-900/80 hover:text-slate-200 border border-transparent'
              } ${collapsed ? 'justify-center px-0' : ''}`}
            >
              {/* Active left indicator bar */}
              {isActive && (
                <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-cyan-400 shadow-[0_0_8px_#22d3ee]" />
              )}

              <div
                className={`flex shrink-0 items-center justify-center transition-colors ${
                  isActive ? 'text-cyan-400' : 'text-slate-400 group-hover:text-slate-200'
                }`}
              >
                {getNavIcon(item.icon, 'w-4 h-4')}
              </div>

              {!collapsed && (
                <div className="flex flex-1 items-center justify-between min-w-0">
                  <span className="truncate">{item.label}</span>
                  {typeof count === 'number' && count > 0 && (
                    <span
                      className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-mono font-semibold ${
                        item.id === 'findings'
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          : 'bg-slate-800 text-slate-300 border border-slate-700'
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </div>
              )}
            </button>
          )
        })}
      </nav>

      {/* Sidebar Footer */}
      <div className="border-t border-slate-800/80 p-3">
        {collapsed ? (
          <button
            onClick={onToggleCollapse}
            title="Expand sidebar"
            className="flex h-9 w-full items-center justify-center rounded-lg border border-slate-800 text-slate-400 hover:bg-slate-900 hover:text-slate-200 transition"
          >
            <IconChevronRight className="h-4 w-4" />
          </button>
        ) : (
          <div className="rounded-xl border border-slate-800/80 bg-slate-900/50 p-2.5">
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
              <span>RATE BUDGET</span>
              <span className="text-cyan-300 font-semibold">{rl.global_rps ?? 8} RPS</span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
              <div className="h-full w-2/3 rounded-full bg-gradient-to-r from-cyan-500 to-emerald-400" />
            </div>
            <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500 font-mono">
              <span>SAFETY GATEWAY</span>
              <span className={gatewayMetrics?.circuit_breaker?.state === 'EMERGENCY_PAUSE' ? 'text-rose-400 font-bold' : 'text-emerald-400'}>
                {gatewayMetrics?.circuit_breaker?.state === 'EMERGENCY_PAUSE' ? 'PAUSED' : 'PROTECTED'}
              </span>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}
