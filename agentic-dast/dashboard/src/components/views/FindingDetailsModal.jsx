import React, { useState } from 'react'
import { SeverityBadge, StatusBadge, MethodBadge, TagBadge } from '../common/Badge'
import {
  IconBug,
  IconCopy,
  IconCheck,
  IconRefresh,
  IconX,
  IconShieldAlert,
  IconActivity,
  IconZap,
} from '../common/Icons'

export function FindingDetailsModal({
  ticket,
  isOpen = false,
  onClose,
  onRetestTicket,
  busyAction = '',
}) {
  const [copiedCurl, setCopiedCurl] = useState(false)
  const [activeTab, setActiveTab] = useState('overview') // 'overview' | 'comparison' | 'evidence' | 'remediation'

  if (!isOpen || !ticket) return null

  const finding = ticket.finding || {}
  const candidate = finding.candidate || {}
  const controlStep = candidate.control_step || null
  const exploitStep = candidate.exploit_step || null
  const oracle = candidate.oracle || null

  const handleCopy = async (text) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedCurl(true)
      setTimeout(() => setCopiedCurl(false), 2000)
    } catch {
      // fallback
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md overflow-y-auto">
      <div className="cyber-glass relative w-full max-w-4xl rounded-2xl border border-slate-700 bg-slate-900/95 shadow-2xl overflow-hidden my-8">
        {/* Top Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-6 py-4 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-500/15 text-rose-400">
              <IconBug className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-semibold text-cyan-300">
                  {ticket.ticket_id}
                </span>
                <SeverityBadge severity={ticket.severity} size="xs" />
                <StatusBadge status={ticket.status} size="xs" />
              </div>
              <h2 className="text-base font-bold text-white tracking-tight mt-0.5">
                {finding.title || 'Vulnerability Finding Details'}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              disabled={Boolean(busyAction)}
              onClick={() => onRetestTicket(ticket.ticket_id)}
              className="flex items-center gap-1.5 rounded-lg bg-cyan-500/15 px-3 py-1.5 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/25 disabled:opacity-50 transition"
            >
              <IconRefresh className="w-3.5 h-3.5" />
              <span>Retest PoC</span>
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition"
            >
              <IconX className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-slate-950/40 px-6">
          {[
            { id: 'overview', label: 'Overview & Impact' },
            { id: 'comparison', label: 'Request/Response Comparison' },
            { id: 'evidence', label: 'Minimal Proof & PoC' },
            { id: 'remediation', label: 'Code Fix Guidance' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`border-b-2 px-4 py-2.5 text-xs font-semibold transition ${
                activeTab === tab.id
                  ? 'border-cyan-400 text-cyan-300'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content Body */}
        <div className="max-h-[65vh] overflow-y-auto p-6 space-y-6 text-xs font-sans">
          {/* TAB 1: OVERVIEW & IMPACT */}
          {activeTab === 'overview' && (
            <div className="space-y-5">
              {/* Endpoint Meta Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-xl bg-slate-950/70 p-3.5 font-mono text-[11px]">
                <div>
                  <span className="text-slate-400 block text-xs">Affected Endpoint</span>
                  <div className="flex items-center gap-1.5 text-white font-bold mt-1">
                    <MethodBadge method={finding.method || 'GET'} />
                    <span className="truncate">{finding.canonical_endpoint}</span>
                  </div>
                </div>
                <div>
                  <span className="text-slate-400 block text-xs">Parameter</span>
                  <span className="text-cyan-300 font-bold mt-1 block">
                    {finding.affected_parameter || 'None'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-xs">Vulnerability Class</span>
                  <span className="text-amber-300 font-bold mt-1 block">
                    {finding.vuln_class || 'Business Logic Flaw'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-xs">Owner Team</span>
                  <span className="text-slate-300 font-bold mt-1 block">
                    {ticket.owner_team} ({ticket.owner_contact || 'oncall'})
                  </span>
                </div>
              </div>

              {/* Technical Description */}
              <div>
                <h3 className="text-xs font-semibold text-slate-300 mb-1.5">
                  Technical Explanation
                </h3>
                <div className="rounded-xl bg-slate-950/60 p-4 text-slate-200 leading-relaxed font-sans">
                  The target endpoint fails to enforce mandatory authorization or state machine validation
                  for <code className="text-cyan-300">{finding.affected_parameter}</code> on{' '}
                  <code className="text-slate-100">{finding.canonical_endpoint}</code>. Under specialized
                  probing, the application accepts unauthorized operations or forged client parameters without
                  prior state verification.
                </div>
              </div>

              {/* Business Impact Analysis */}
              <div>
                <h3 className="text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <IconShieldAlert className="w-4 h-4 text-rose-400" />
                  <span>Business Impact & Risk Exposure</span>
                </h3>
                <div className="rounded-xl bg-rose-950/20 p-4 text-slate-200 leading-relaxed font-sans">
                  {ticket.business_impact}
                </div>
              </div>

              {/* Verification History & Audit Trail */}
              <div>
                <h3 className="text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <IconActivity className="w-4 h-4 text-cyan-400" />
                  <span>Verification History & Provenance Trail</span>
                </h3>
                <div className="rounded-xl bg-slate-950/70 p-4 font-mono text-[11px] space-y-2">
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="text-slate-500">Discovery Timestamp:</span>
                    <span className="text-white font-semibold">
                      {ticket.created_at ? new Date(ticket.created_at).toLocaleString() : 'Automated Scan Cycle (Live)'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="text-slate-500">Deterministic Replay Gate:</span>
                    <span className="text-emerald-400 font-bold">
                      {finding.verified ? 'VERIFIED_CONFIRMED (Zero-LLM Replay Passed)' : 'UNVERIFIED'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="text-slate-500">HITL Gate Status:</span>
                    <span className={ticket.hitl_required ? 'text-amber-400' : 'text-slate-400'}>
                      {ticket.hitl_required ? 'Escalated to Human Operator' : 'Autonomous Pipeline Approval'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="text-slate-500">Lifecycle Ticket Status:</span>
                    <StatusBadge status={ticket.status} size="xs" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: REQUEST/RESPONSE COMPARISON */}
          {activeTab === 'comparison' && (
            <div className="space-y-4">
              <p className="text-slate-400 text-xs">
                Zero-LLM deterministic verification: comparison between legitimate baseline control request and attacker exploit replay request.
              </p>

              <div className="grid gap-4 md:grid-cols-2">
                {/* Control Baseline Request */}
                <div className="rounded-xl bg-slate-950/80 p-4 space-y-2.5">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="font-mono text-xs font-bold text-emerald-400">
                      CONTROL REQUEST (BASELINE)
                    </span>
                    <span className="text-xs text-emerald-400 font-medium">
                      Legitimate State
                    </span>
                  </div>

                  <div className="font-mono text-[11px] space-y-1 text-slate-300">
                    <div>
                      <span className="text-slate-500">Method & Path: </span>
                      <span className="text-white font-semibold">
                        {controlStep?.method || finding.method} {controlStep?.path || finding.canonical_endpoint}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">Actor: </span>
                      <span className="text-cyan-300">{controlStep?.actor || 'agency_a_admin'}</span>
                    </div>
                    {controlStep?.json_body && (
                      <div className="mt-2">
                        <span className="text-slate-500 block mb-1">Payload:</span>
                        <pre className="overflow-x-auto rounded bg-slate-900 p-2 text-[10px] text-slate-300">
                          {JSON.stringify(controlStep.json_body, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>

                {/* Exploit Replay Request */}
                <div className="rounded-xl bg-slate-950/80 p-4 space-y-2.5">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="font-mono text-xs font-bold text-rose-400">
                      EXPLOIT REPLAY (ATTACK VECTOR)
                    </span>
                    <span className="text-xs text-rose-400 font-medium">
                      Tampered / Cross-Tenant
                    </span>
                  </div>

                  <div className="font-mono text-[11px] space-y-1 text-slate-300">
                    <div>
                      <span className="text-slate-500">Method & Path: </span>
                      <span className="text-white font-semibold">
                        {exploitStep?.method || finding.method} {exploitStep?.path || finding.canonical_endpoint}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">Attacker Identity: </span>
                      <span className="text-rose-300 font-bold">{exploitStep?.actor || 'agency_b_admin'}</span>
                    </div>
                    {exploitStep?.json_body && (
                      <div className="mt-2">
                        <span className="text-slate-500 block mb-1">Exploit Payload:</span>
                        <pre className="overflow-x-auto rounded bg-slate-900 p-2 text-[10px] text-amber-300">
                          {JSON.stringify(exploitStep.json_body, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Oracle Matching Rule */}
              {oracle && (
                <div className="rounded-xl bg-slate-950/90 p-4 font-mono text-[11px]">
                  <h4 className="text-xs font-semibold text-slate-300 mb-1 font-sans">
                    Deterministic Verification Oracle
                  </h4>
                  <div className="flex flex-wrap items-center gap-3 text-slate-300">
                    <span>Oracle Type: <strong className="text-cyan-300">{oracle.oracle_type}</strong></span>
                    {oracle.target_field && (
                      <span>Target Field: <strong className="text-amber-300">{oracle.target_field}</strong></span>
                    )}
                    {oracle.forbidden_value && (
                      <span>Forbidden Match: <strong className="text-rose-400">{String(oracle.forbidden_value)}</strong></span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: MINIMAL PROOF & REPRODUCIBLE POC */}
          {activeTab === 'evidence' && (
            <div className="space-y-5">
              {/* Reproducible cURL */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <h4 className="text-xs font-semibold text-slate-300 font-sans">
                    Reproducible cURL Command
                  </h4>
                  <button
                    onClick={() => handleCopy(finding.repro_curl)}
                    className="flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 transition"
                  >
                    {copiedCurl ? (
                      <>
                        <IconCheck className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Copied to Clipboard!</span>
                      </>
                    ) : (
                      <>
                        <IconCopy className="w-3.5 h-3.5" />
                        <span>Copy cURL</span>
                      </>
                    )}
                  </button>
                </div>
                <pre className="overflow-x-auto rounded-xl bg-slate-950 p-4 font-mono text-[11px] text-emerald-300 leading-relaxed">
                  {finding.repro_curl || 'curl -i -X GET http://127.0.0.1:8001' + finding.canonical_endpoint}
                </pre>
              </div>

              {/* Minimal Evidence JSON */}
              <div>
                <h4 className="text-xs font-semibold text-slate-300 font-sans mb-1.5">
                  Minimal Deterministic Evidence Payload
                </h4>
                <pre className="overflow-x-auto rounded-xl bg-slate-950 p-4 font-mono text-[11px] text-amber-300">
                  {JSON.stringify(finding.minimal_evidence || {}, null, 2)}
                </pre>
              </div>
            </div>
          )}

          {/* TAB 4: REMEDIATION GUIDANCE */}
          {activeTab === 'remediation' && (
            <div className="space-y-4">
              <h4 className="text-xs font-semibold text-slate-300 font-sans mb-1.5">
                Engineering Fix Recommendation
              </h4>
              <div className="rounded-xl bg-slate-950/80 p-5 text-slate-200 font-sans leading-relaxed text-xs">
                {ticket.code_fix_suggestion}
              </div>

              <div className="rounded-xl bg-cyan-950/20 p-4 text-xs font-mono text-cyan-300">
                <span className="font-semibold block text-cyan-300 mb-1 font-sans">Patch Verification Note</span>
                Deploying target release <strong>v1.2</strong> will apply this fix and automatically
                trigger the Retest Agent to verify resolution and transition ticket state to <code>VERIFIED_FIXED</code>.
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-slate-800 bg-slate-950 px-6 py-3.5 text-xs">
          <div className="font-mono text-slate-500">
            Deduplication Key: <span className="text-slate-400">{ticket.dedupe_key?.slice(0, 16)}...</span>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg bg-slate-800 px-4 py-1.5 font-medium text-slate-200 hover:bg-slate-700 transition"
          >
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  )
}
