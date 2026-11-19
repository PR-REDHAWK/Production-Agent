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
      slate: {
        primary: '#64748b',
        light: '#94a3b8',
        glow: 'rgba(100, 116, 139, 0.2)',
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
    color: 'text-rose-400',
    dot: 'bg-rose-400',
  },
  HIGH: {
    label: 'HIGH',
    color: 'text-amber-400',
    dot: 'bg-amber-400',
  },
  MEDIUM: {
    label: 'MEDIUM',
    color: 'text-sky-400',
    dot: 'bg-sky-400',
  },
  LOW: {
    label: 'LOW',
    color: 'text-slate-400',
    dot: 'bg-slate-400',
  },
}

export const STATUS_CONFIG = {
  OPEN: {
    label: 'OPEN',
    color: 'text-rose-400',
    dot: 'bg-rose-400',
  },
  PENDING_HUMAN_REVIEW: {
    label: 'PENDING REVIEW',
    color: 'text-amber-400',
    dot: 'bg-amber-400',
  },
  VERIFIED_FIXED: {
    label: 'VERIFIED FIXED',
    color: 'text-emerald-400',
    dot: 'bg-emerald-400',
  },
  STILL_VULNERABLE: {
    label: 'STILL VULNERABLE',
    color: 'text-red-400',
    dot: 'bg-red-400',
  },
  REJECTED: {
    label: 'REJECTED',
    color: 'text-slate-400',
    dot: 'bg-slate-400',
  },
}

export const CLASSIFICATION_CONFIG = {
  Active: {
    color: 'text-emerald-400',
    dot: 'bg-emerald-400',
    tag: 'ACTIVE ASSET',
  },
  Zombie: {
    color: 'text-amber-400',
    dot: 'bg-amber-400',
    tag: 'ZOMBIE (DEPRECATED)',
  },
  Shadow: {
    color: 'text-rose-400',
    dot: 'bg-rose-400',
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
