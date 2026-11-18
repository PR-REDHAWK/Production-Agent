import React, { useState } from 'react'
import { Panel } from '../common/Panel'
import { PIPELINE_STAGES } from '../../theme/designTokens'
import { IconCpu, IconActivity, IconPlay, IconZap, IconSparkles } from '../common/Icons'

export function AgentOperations({
  events = [],
  busyAction = '',
  onRunScan,
  onPollWatchers,
}) {
  const [filterStage, setFilterStage] = useState('ALL')
  const [usePlaywright, setUsePlaywright] = useState(false)
  const [deltaOnly, setDeltaOnly] = useState(false)

  // Determine current active pipeline stage from latest events or busyAction
  const currentStage = events[0]?.stage || 'idle'

  const filteredEvents = filterStage === 'ALL'
    ? events
    : events.filter((e) => e.stage.toLowerCase().includes(filterStage.toLowerCase()))

  return (
    <div className="space-y-6">
      {/* 8-Stage Pipeline Visual Stepper */}
      <Panel
        title="Autonomous 8-Stage Closed-Loop Pipeline"
        subtitle="Continuous real-time DAST orchestration lifecycle"
        icon={<IconCpu className="w-4 h-4" />}
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          {PIPELINE_STAGES.map((stg, idx) => {
            const isActive = currentStage.toLowerCase().includes(stg.id.toLowerCase())
            return (
              <div
                key={stg.id}
                className={`relative flex flex-col justify-between rounded-xl p-3 border text-xs transition-all ${
                  isActive
                    ? 'border-cyan-400 bg-cyan-950/40 text-cyan-200 shadow-[0_0_15px_-2px_rgba(6,182,212,0.4)]'
                    : 'border-slate-800 bg-slate-950/60 text-slate-400'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] font-bold text-slate-500">
                      PHASE 0{idx + 1}
                    </span>
                    {isActive && (
                      <span className="h-2 w-2 rounded-full bg-cyan-400 animate-ping" />
                    )}
                  </div>
                  <div className="mt-1.5 font-bold text-white text-[11px] leading-tight">
                    {stg.label.replace(/^\d+\.\s*/, '')}
                  </div>
                </div>
                <div className="mt-2 text-[10px] text-slate-500 line-clamp-2 leading-relaxed">
                  {stg.desc}
                </div>
              </div>
            )
          })}
        </div>
      </Panel>

      {/* Control & Trigger Actions */}
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-4 space-y-6">
          <Panel
            title="Scan Orchestration Controls"
            subtitle="Configure and dispatch agent cycles"
            icon={<IconZap className="w-4 h-4" />}
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-xs">
                <div>
                  <span className="font-semibold text-slate-200">Playwright UI Crawl</span>
                  <p className="text-[11px] text-slate-400">Spawn headless Chromium to crawl partner SPA</p>
                </div>
                <input
                  type="checkbox"
                  checked={usePlaywright}
                  onChange={(e) => setUsePlaywright(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-cyan-500"
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-xs">
                <div>
                  <span className="font-semibold text-slate-200">Delta-Only Scan</span>
                  <p className="text-[11px] text-slate-400">Scan only routes modified in recent commit</p>
                </div>
                <input
                  type="checkbox"
                  checked={deltaOnly}
                  onChange={(e) => setDeltaOnly(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-cyan-500"
                />
              </div>

              <button
                disabled={Boolean(busyAction)}
                onClick={() => onRunScan({ usePlaywright, deltaOnly })}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-600 to-cyan-500 py-2.5 text-xs font-bold text-white shadow-[0_0_15px_-2px_rgba(6,182,212,0.4)] hover:from-cyan-500 hover:to-cyan-400 disabled:opacity-50 transition"
              >
                <IconPlay className="h-4 w-4" />
                <span>Dispatch Scan Cycle</span>
              </button>

              <button
                disabled={Boolean(busyAction)}
                onClick={onPollWatchers}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800/80 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700 disabled:opacity-50 transition"
              >
                <IconSparkles className="h-3.5 w-3.5 text-cyan-400" />
                <span>Poll Continuous Watchers Once</span>
              </button>
            </div>
          </Panel>
        </div>

        {/* Live SSE Event Stream Timeline */}
        <div className="lg:col-span-8">
          <Panel
            title={`Real-Time Orchestration Feed (${filteredEvents.length})`}
            subtitle="Live SSE event bus from FastAPI control plane"
            icon={<IconActivity className="w-4 h-4" />}
            actions={
              <div className="flex items-center gap-1">
                {['ALL', 'recon', 'inventory', 'verify', 'triage', 'retest'].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setFilterStage(tab)}
                    className={`rounded px-2 py-1 text-[10px] font-mono font-medium transition ${
                      filterStage === tab
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {tab.toUpperCase()}
                  </button>
                ))}
              </div>
            }
          >
            <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
              {filteredEvents.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  No events recorded matching filter.
                </div>
              ) : (
                filteredEvents.map((ev, idx) => (
                  <div
                    key={`${ev.timestamp}-${idx}`}
                    className="rounded-xl border border-slate-800/80 bg-slate-950/70 p-3 text-xs hover:border-slate-700 transition"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-cyan-500/15 px-2 py-0.5 font-mono text-[10px] font-bold text-cyan-300 border border-cyan-500/30">
                          {ev.stage}
                        </span>
                      </div>
                      <span className="font-mono text-[10px] text-slate-500">
                        {ev.timestamp.replace('T', ' ').slice(0, 19)}Z
                      </span>
                    </div>

                    <p className="mt-2 text-slate-200 font-sans leading-relaxed">{ev.message}</p>

                    {ev.details && Object.keys(ev.details).length > 0 && (
                      <pre className="mt-2 overflow-x-auto rounded-lg border border-slate-900 bg-slate-950 p-2 font-mono text-[10px] text-slate-400">
                        {JSON.stringify(ev.details, null, 2)}
                      </pre>
                    )}
                  </div>
                ))
              )}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  )
}
