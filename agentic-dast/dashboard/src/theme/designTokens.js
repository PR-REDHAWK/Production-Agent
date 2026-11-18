/**
 * Cybersecurity Design System Tokens
 * Agentic Real-Time DAST Command Center
 */

export const THEME = {
  colors: {
    bg: {
      deep: '#060911',
      dark: '#0a0f1d',
      card: '#0f172a',
      cardGlass: 'rgba(15, 23, 42, 0.75)',
      cardHover: '#16223d',
      border: 'rgba(56, 189, 248, 0.12)',
      borderHover: 'rgba(56, 189, 248, 0.35)',
    },
    accents: {
      cyan: {
        primary: '#06b6d4',
        light: '#22d3ee',
        glow: 'rgba(6, 182, 212, 0.3)',
      },
      violet: {
        primary: '#8b5cf6',
        light: '#a78bfa',
        glow: 'rgba(139, 92, 246, 0.3)',
      },
      emerald: {
        primary: '#10b981',
        light: '#34d399',
        glow: 'rgba(16, 185, 129, 0.3)',
      },
      rose: {
        primary: '#f43f5e',
        light: '#fb7185',
        glow: 'rgba(244, 63, 94, 0.35)',
      },
      amber: {
        primary: '#f59e0b',
        light: '#fbbf24',
        glow: 'rgba(245, 158, 11, 0.3)',
      },
    },
  },
}

export const SEVERITY_CONFIG = {
  CRITICAL: {
    label: 'CRITICAL',
    badge: 'bg-rose-500/15 text-rose-300 border-rose-500/40 shadow-[0_0_12px_-2px_rgba(244,63,94,0.3)]',
    dot: 'bg-rose-400 shadow-[0_0_8px_#f43f5e]',
    text: 'text-rose-400',
    border: 'border-rose-500/40',
  },
  HIGH: {
    label: 'HIGH',
    badge: 'bg-amber-500/15 text-amber-300 border-amber-500/40 shadow-[0_0_12px_-2px_rgba(245,158,11,0.25)]',
    dot: 'bg-amber-400 shadow-[0_0_8px_#f59e0b]',
    text: 'text-amber-400',
    border: 'border-amber-500/40',
  },
  MEDIUM: {
    label: 'MEDIUM',
    badge: 'bg-sky-500/15 text-sky-300 border-sky-500/40 shadow-[0_0_12px_-2px_rgba(14,165,233,0.25)]',
    dot: 'bg-sky-400 shadow-[0_0_8px_#38bdf8]',
    text: 'text-sky-400',
    border: 'border-sky-500/40',
  },
  LOW: {
    label: 'LOW',
    badge: 'bg-slate-500/15 text-slate-300 border-slate-500/40',
    dot: 'bg-slate-400',
    text: 'text-slate-400',
    border: 'border-slate-500/40',
  },
}

export const STATUS_CONFIG = {
  OPEN: {
    label: 'OPEN',
    badge: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    dot: 'bg-rose-400 animate-pulse',
  },
  PENDING_HUMAN_REVIEW: {
    label: 'PENDING REVIEW',
    badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    dot: 'bg-amber-400 animate-pulse',
  },
  VERIFIED_FIXED: {
    label: 'VERIFIED FIXED',
    badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 shadow-[0_0_10px_-2px_rgba(16,185,129,0.3)]',
    dot: 'bg-emerald-400',
  },
  STILL_VULNERABLE: {
    label: 'STILL VULNERABLE',
    badge: 'bg-red-600/25 text-red-200 border-red-500/50 shadow-[0_0_12px_-2px_rgba(239,68,68,0.4)]',
    dot: 'bg-red-500 animate-ping',
  },
  REJECTED: {
    label: 'REJECTED',
    badge: 'bg-slate-600/20 text-slate-400 border-slate-600/40',
    dot: 'bg-slate-500',
  },
}

export const CLASSIFICATION_CONFIG = {
  Active: {
    badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 shadow-[0_0_10px_-2px_rgba(16,185,129,0.25)]',
    dot: 'bg-emerald-400',
    tag: 'ACTIVE ASSET',
  },
  Zombie: {
    badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30 shadow-[0_0_10px_-2px_rgba(245,158,11,0.25)]',
    dot: 'bg-amber-400',
    tag: 'ZOMBIE (DEPRECATED)',
  },
  Shadow: {
    badge: 'bg-purple-500/15 text-purple-300 border-purple-500/30 shadow-[0_0_10px_-2px_rgba(168,85,247,0.3)]',
    dot: 'bg-purple-400',
    tag: 'SHADOW (UNMANAGED)',
  },
}

export const FLOW_ORDER = ['search', 'hold', 'book', 'pay', 'confirm', 'cancel', 'refund']

export const PIPELINE_STAGES = [
  { id: 'detect_change', label: '1. Change Detection', desc: 'Bundle diff, DNS drift & CI/CD hooks' },
  { id: 'recon', label: '2. Zero-Spec Recon', desc: 'JS lexer, Playwright crawl & Knowledge Graph' },
  { id: 'inventory', label: '3. API Catalog', desc: 'Active, Zombie & Shadow categorization' },
  { id: 'plan_attacks', label: '4. Attack Planning', desc: 'Contextual threat modeling & hypothesis generation' },
  { id: 'execute_safely', label: '5. Safe Execution', desc: 'Throttled candidate probing with Semaphore(4)' },
  { id: 'verify', label: '6. Code Verification', desc: 'Zero-LLM deterministic control vs exploit replay' },
  { id: 'triage_report', label: '7. Triage & HITL', desc: 'CVSS calculation, team routing & HITL queue' },
  { id: 'retest', label: '8. Retest Engine', desc: 'Autonomous patch verification & state transition' },
]

export const NAV_ITEMS = [
  { id: 'command', label: 'Command Center', icon: 'radar', desc: 'Master Security Posture & Telemetry' },
  { id: 'operations', label: 'Agent Operations', icon: 'cpu', desc: '8-Stage DAST Loop & SSE Stream' },
  { id: 'findings', label: 'Vulnerability Findings', icon: 'bug', desc: 'Verified PoCs & Remediation Guidance' },
  { id: 'surface', label: 'Attack Surface', icon: 'network', desc: 'App Knowledge Graph & Topology' },
  { id: 'inventory', label: 'API Inventory', icon: 'database', desc: 'Zombie & Shadow Governance' },
  { id: 'retesting', label: 'Retesting', icon: 'refresh', desc: 'Automated Fix Verification' },
  { id: 'audit', label: 'Audit Logs', icon: 'activity', desc: 'Immutable Safety Gateway Log' },
  { id: 'settings', label: 'Settings', icon: 'sliders', desc: 'Scope Policy & Credential Vault' },
]
