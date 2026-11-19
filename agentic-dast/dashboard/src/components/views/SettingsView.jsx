import React from 'react'
import { Panel } from '../common/Panel'
import { TagBadge } from '../common/Badge'
import { IconSliders, IconShield, IconActivity, IconDatabase } from '../common/Icons'

export function SettingsView({ gatewayState = { metrics: null } }) {
  const rl = gatewayState.metrics?.rate_limits || {}
  const cb = gatewayState.metrics?.circuit_breaker || {}

  return (
    <div className="space-y-6">
      {/* Policy Panels */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Scope Boundaries */}
        <Panel
          title="Fail-Closed Scope Boundaries"
          subtitle="Enforced by ScopeValidator on all outbound agent requests"
          icon={<IconShield className="w-4 h-4" />}
        >
          <div className="space-y-3 text-xs font-mono">
            <div className="rounded-lg bg-slate-950/60 p-3">
              <span className="text-slate-400 block text-xs font-sans mb-1">Approved Target Hosts</span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <TagBadge tone="cyan">http://127.0.0.1:8001 (mock_tbo_target)</TagBadge>
                <TagBadge tone="slate">http://127.0.0.1:8002 (local_oob_canary)</TagBadge>
              </div>
            </div>

            <div className="rounded-lg bg-slate-950/60 p-3">
              <span className="text-slate-400 block text-xs font-sans mb-1">Allowed Path Prefixes</span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <TagBadge tone="slate">/api/</TagBadge>
                <TagBadge tone="slate">/static/</TagBadge>
                <TagBadge tone="slate">/assets/</TagBadge>
                <TagBadge tone="slate">/__sim/</TagBadge>
                <TagBadge tone="slate">/internal/</TagBadge>
                <TagBadge tone="slate">/canary/</TagBadge>
              </div>
            </div>

            <div className="rounded-lg bg-slate-950/60 p-3">
              <span className="text-slate-400 block text-xs font-sans mb-1">Destructive Action Keywords (Blocked)</span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <TagBadge tone="amber">/drop</TagBadge>
                <TagBadge tone="amber">/truncate</TagBadge>
                <TagBadge tone="amber">/shutdown</TagBadge>
                <TagBadge tone="amber">/destroy</TagBadge>
                <TagBadge tone="amber">/wipe</TagBadge>
                <TagBadge tone="amber">Global DELETE</TagBadge>
              </div>
            </div>
          </div>
        </Panel>

        {/* Rate Limiting & Circuit Breaker Policies */}
        <Panel
          title="Dynamic Protection & Rate Limiting"
          subtitle="TokenBucketRateLimiter and CircuitBreaker parameters"
          icon={<IconActivity className="w-4 h-4" />}
        >
          <div className="space-y-3 text-xs font-mono">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-slate-950/60 p-3">
                <span className="text-slate-400 block text-xs font-sans mb-1">Global Rate Limit</span>
                <span className="text-cyan-300 font-bold text-sm">{rl.global_rps ?? 8.0} RPS</span>
              </div>
              <div className="rounded-lg bg-slate-950/60 p-3">
                <span className="text-slate-400 block text-xs font-sans mb-1">Per-Endpoint Limit</span>
                <span className="text-cyan-300 font-bold text-sm">{rl.per_endpoint_rps ?? 4.0} RPS</span>
              </div>
              <div className="rounded-lg bg-slate-950/60 p-3">
                <span className="text-slate-400 block text-xs font-sans mb-1">Burst Capacity</span>
                <span className="text-slate-200 font-bold text-sm">{rl.burst_capacity ?? 10} tokens</span>
              </div>
              <div className="rounded-lg bg-slate-950/60 p-3">
                <span className="text-slate-400 block text-xs font-sans mb-1">Max Concurrency</span>
                <span className="text-emerald-400 font-bold text-sm">Semaphore(4)</span>
              </div>
            </div>

            <div className="rounded-lg bg-slate-950/60 p-3">
              <span className="text-slate-400 block text-xs font-sans mb-1">Circuit Breaker Thresholds</span>
              <div className="mt-1.5 space-y-1 text-slate-300 text-[11px]">
                <div className="flex justify-between">
                  <span>Max p95 Latency:</span>
                  <span className="text-amber-300">2000 ms</span>
                </div>
                <div className="flex justify-between">
                  <span>Max 5xx Error Ratio:</span>
                  <span className="text-rose-300">25.0%</span>
                </div>
                <div className="flex justify-between">
                  <span>Cooldown Duration:</span>
                  <span className="text-cyan-300">30.0 s</span>
                </div>
                <div className="flex justify-between">
                  <span>Sliding Window:</span>
                  <span className="text-slate-300">50 requests</span>
                </div>
              </div>
            </div>
          </div>
        </Panel>
      </div>

      {/* Credential Vault Catalog */}
      <Panel
        title="Test Credential Vault Identities"
        subtitle="Symbolic roles isolated from test executors with automated secret scrubbing"
        icon={<IconDatabase className="w-4 h-4" />}
      >
        <div className="grid gap-3 sm:grid-cols-3 text-xs">
          <div className="rounded-xl bg-slate-950/70 p-4">
            <div className="font-mono text-cyan-300 font-bold text-sm">agency_a_admin</div>
            <div className="mt-1 text-slate-400">Agency Alpha Administrator</div>
            <div className="mt-3 text-[11px] font-mono space-y-1 text-slate-500">
              <div>Role: <span className="text-slate-300">admin</span></div>
              <div>Credit Limit: <span className="text-emerald-400">$50,000.00</span></div>
              <div>Tenant: <span className="text-slate-300">AGENCY-ALPHA</span></div>
            </div>
          </div>

          <div className="rounded-xl bg-slate-950/70 p-4">
            <div className="font-mono text-amber-300 font-bold text-sm">agency_a_subagent</div>
            <div className="mt-1 text-slate-400">Agency Alpha Subagent</div>
            <div className="mt-3 text-[11px] font-mono space-y-1 text-slate-500">
              <div>Role: <span className="text-slate-300">subagent</span></div>
              <div>Credit Limit: <span className="text-emerald-400">$5,000.00</span></div>
              <div>Tenant: <span className="text-slate-300">AGENCY-ALPHA</span></div>
            </div>
          </div>

          <div className="rounded-xl bg-slate-950/70 p-4">
            <div className="font-mono text-sky-300 font-bold text-sm">agency_b_admin</div>
            <div className="mt-1 text-slate-400">Competitor Agency Beta Admin</div>
            <div className="mt-3 text-[11px] font-mono space-y-1 text-slate-500">
              <div>Role: <span className="text-slate-300">admin</span></div>
              <div>Credit Limit: <span className="text-emerald-400">$30,000.00</span></div>
              <div>Tenant: <span className="text-slate-300">AGENCY-BETA</span></div>
            </div>
          </div>
        </div>
      </Panel>
    </div>
  )
}
