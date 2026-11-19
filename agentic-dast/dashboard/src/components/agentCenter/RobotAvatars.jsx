import React from 'react'

/**
 * Futuristic SVG Robotic Avatars for Agentic DAST Components.
 * Each character features distinct mechanical headgear, ocular visors, and status glow.
 */

export function RobotBase({
  children,
  size = 48,
  glowColor = '#06b6d4',
  status = 'IDLE',
  className = '',
}) {
  const isRunning = status === 'RUNNING'
  const isBlocked = status === 'BLOCKED' || status === 'FAILED'
  const isWaiting = status === 'WAITING_FOR_APPROVAL'

  const statusGlow = isRunning
    ? 'rgba(6, 182, 212, 0.5)'
    : isBlocked
    ? 'rgba(244, 63, 94, 0.6)'
    : isWaiting
    ? 'rgba(245, 158, 11, 0.5)'
    : glowColor

  return (
    <div
      className={`relative flex items-center justify-center shrink-0 rounded-2xl bg-gradient-to-b from-slate-900 to-slate-950 p-2 border border-slate-700/60 shadow-lg ${
        isRunning ? 'ring-2 ring-cyan-400 ring-offset-2 ring-offset-slate-950 shadow-[0_0_20px_rgba(6,182,212,0.4)]' : ''
      } ${className}`}
      style={{ width: size, height: size }}
    >
      {/* Background glow disc */}
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl opacity-20 blur-md transition-all duration-300"
        style={{ background: statusGlow }}
      />
      <svg
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full relative z-10"
      >
        <defs>
          <linearGradient id="metalGrad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
            <stop stopColor="#334155" />
            <stop offset="0.5" stopColor="#1e293b" />
            <stop offset="1" stopColor="#0f172a" />
          </linearGradient>
          <linearGradient id="cyanVisor" x1="0" y1="0" x2="64" y2="0" gradientUnits="userSpaceOnUse">
            <stop stopColor="#06b6d4" />
            <stop offset="0.5" stopColor="#22d3ee" />
            <stop offset="1" stopColor="#0891b2" />
          </linearGradient>
          <linearGradient id="skyVisor" x1="0" y1="0" x2="64" y2="0" gradientUnits="userSpaceOnUse">
            <stop stopColor="#0284c7" />
            <stop offset="0.5" stopColor="#38bdf8" />
            <stop offset="1" stopColor="#0369a1" />
          </linearGradient>
          <linearGradient id="emeraldVisor" x1="0" y1="0" x2="64" y2="0" gradientUnits="userSpaceOnUse">
            <stop stopColor="#10b981" />
            <stop offset="0.5" stopColor="#34d399" />
            <stop offset="1" stopColor="#059669" />
          </linearGradient>
          <linearGradient id="amberVisor" x1="0" y1="0" x2="64" y2="0" gradientUnits="userSpaceOnUse">
            <stop stopColor="#f59e0b" />
            <stop offset="0.5" stopColor="#fbbf24" />
            <stop offset="1" stopColor="#d97706" />
          </linearGradient>
          <linearGradient id="roseVisor" x1="0" y1="0" x2="64" y2="0" gradientUnits="userSpaceOnUse">
            <stop stopColor="#f43f5e" />
            <stop offset="0.5" stopColor="#fb7185" />
            <stop offset="1" stopColor="#e11d48" />
          </linearGradient>
        </defs>
        {children}
      </svg>
    </div>
  )
}

// 1. Change Detection Robot: Rotating radar antenna dish + sweep beam eye
export function RobotChangeDetector({ status = 'IDLE', size = 48 }) {
  const isRunning = status === 'RUNNING'
  return (
    <RobotBase size={size} status={status} glowColor="rgba(56, 189, 248, 0.4)">
      {/* Radar Dish on top */}
      <path d="M26 12 C26 7, 38 7, 38 12" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" />
      <line x1="32" y1="12" x2="32" y2="18" stroke="#38bdf8" strokeWidth="2" />
      <circle cx="32" cy="7" r="2.5" fill="#38bdf8" className={isRunning ? 'animate-ping' : ''} />

      {/* Head Chassis */}
      <rect x="14" y="18" width="36" height="30" rx="8" fill="url(#metalGrad)" stroke="#475569" strokeWidth="2" />
      {/* Side Sensors */}
      <rect x="9" y="27" width="5" height="12" rx="2" fill="#38bdf8" opacity="0.8" />
      <rect x="50" y="27" width="5" height="12" rx="2" fill="#38bdf8" opacity="0.8" />

      {/* Panoramic Scanning Visor */}
      <rect x="18" y="26" width="28" height="11" rx="4" fill="#090d16" stroke="#0ea5e9" strokeWidth="1.5" />
      <line x1="22" y1="31.5" x2="42" y2="31.5" stroke="url(#cyanVisor)" strokeWidth="3" strokeLinecap="round" />
      <circle cx={isRunning ? '36' : '32'} cy="31.5" r="2.5" fill="#ffffff" />

      {/* Mouth Vent Grid */}
      <line x1="24" y1="42" x2="40" y2="42" stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="26" y1="45" x2="38" y2="45" stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
    </RobotBase>
  )
}

// 2. Reconnaissance Robot: Dual optical binocular zoom lenses + sensor antennae
export function RobotRecon({ status = 'IDLE', size = 48 }) {
  const isRunning = status === 'RUNNING'
  return (
    <RobotBase size={size} status={status} glowColor="rgba(6, 182, 212, 0.4)">
      {/* Dual Antennae */}
      <line x1="20" y1="8" x2="24" y2="18" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round" />
      <circle cx="19" cy="7" r="2" fill="#06b6d4" />
      <line x1="44" y1="8" x2="40" y2="18" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round" />
      <circle cx="45" cy="7" r="2" fill="#06b6d4" />

      {/* Head Chassis */}
      <rect x="15" y="18" width="34" height="32" rx="9" fill="url(#metalGrad)" stroke="#475569" strokeWidth="2" />

      {/* Dual Binocular Optics */}
      <circle cx="25" cy="30" r="7" fill="#090d16" stroke="#06b6d4" strokeWidth="2" />
      <circle cx="25" cy="30" r="4" fill="url(#cyanVisor)" />
      <circle cx="23.5" cy="28.5" r="1.5" fill="#ffffff" />

      <circle cx="39" cy="30" r="7" fill="#090d16" stroke="#06b6d4" strokeWidth="2" />
      <circle cx="39" cy="30" r="4" fill="url(#cyanVisor)" />
      <circle cx="37.5" cy="28.5" r="1.5" fill="#ffffff" />

      {/* Optical Bridge */}
      <line x1="32" y1="30" x2="32" y2="30" stroke="#06b6d4" strokeWidth="2" />

      {/* Lower Processing Sensor */}
      <rect x="23" y="42" width="18" height="4" rx="2" fill="#06b6d4" opacity={isRunning ? '1' : '0.4'} />
    </RobotBase>
  )
}

// 3. API Inventory Robot: Holographic data cylinder canister + catalog matrix
export function RobotInventory({ status = 'IDLE', size = 48 }) {
  const isRunning = status === 'RUNNING'
  return (
    <RobotBase size={size} status={status} glowColor="rgba(168, 85, 247, 0.4)">
      {/* Database Tier Crown */}
      <ellipse cx="32" cy="14" rx="14" ry="4" fill="#6b21a8" stroke="#a855f7" strokeWidth="1.5" />
      <path d="M18 14 v4 c0 2.2 6.3 4 14 4 s14 -1.8 14 -4 v-4" fill="none" stroke="#a855f7" strokeWidth="1.5" />

      {/* Head Chassis */}
      <rect x="16" y="22" width="32" height="28" rx="6" fill="url(#metalGrad)" stroke="#475569" strokeWidth="2" />

      {/* Catalog Matrix Visor */}
      <rect x="20" y="27" width="24" height="12" rx="3" fill="#0b0f19" stroke="#a855f7" strokeWidth="1.5" />
      {/* Data blocks */}
      <rect x="23" y="30" width="4" height="2.5" rx="0.5" fill="#c084fc" />
      <rect x="29" y="30" width="4" height="2.5" rx="0.5" fill="#c084fc" />
      <rect x="35" y="30" width="4" height="2.5" rx="0.5" fill={isRunning ? '#22d3ee' : '#c084fc'} />
      <rect x="23" y="34.5" width="4" height="2.5" rx="0.5" fill="#c084fc" />
      <rect x="29" y="34.5" width="4" height="2.5" rx="0.5" fill="#c084fc" />
      <rect x="35" y="34.5" width="4" height="2.5" rx="0.5" fill="#c084fc" />

      {/* Storage Level LED */}
      <line x1="22" y1="44" x2="42" y2="44" stroke="#a855f7" strokeWidth="2" strokeLinecap="round" />
    </RobotBase>
  )
}

// 4. Attack Planning Robot: Neural synapse dome + tactical targeting visor
export function RobotPlanner({ status = 'IDLE', size = 48 }) {
  const isRunning = status === 'RUNNING'
  return (
    <RobotBase size={size} status={status} glowColor="rgba(245, 158, 11, 0.4)">
      {/* Translucent Neural Dome */}
      <path d="M20 22 C20 12, 44 12, 44 22 Z" fill="#1e1b4b" stroke="#818cf8" strokeWidth="1.5" />
      <circle cx="28" cy="17" r="1.5" fill="#f59e0b" className={isRunning ? 'animate-ping' : ''} />
      <circle cx="36" cy="17" r="1.5" fill="#f59e0b" />
      <line x1="28" y1="17" x2="36" y2="17" stroke="#f59e0b" strokeWidth="1" strokeDasharray="1 1" />

      {/* Chassis */}
      <rect x="15" y="22" width="34" height="28" rx="7" fill="url(#metalGrad)" stroke="#475569" strokeWidth="2" />

      {/* Tactical Angular Visor */}
      <polygon points="19,29 45,29 41,37 23,37" fill="#090d16" stroke="#f59e0b" strokeWidth="1.5" />
      <line x1="23" y1="33" x2="41" y2="33" stroke="url(#amberVisor)" strokeWidth="2.5" strokeLinecap="round" />

      {/* Threat Logic Processor */}
      <rect x="24" y="42" width="16" height="3" rx="1.5" fill="#f59e0b" opacity="0.8" />
    </RobotBase>
  )
}

// 5. Safety Gateway Robot: Reinforced heavy armor shield helmet + fail-closed firewall core
export function RobotSafetyGateway({ status = 'IDLE', size = 48 }) {
  const isBlocked = status === 'BLOCKED'
  const isRunning = status === 'RUNNING'
  return (
    <RobotBase size={size} status={status} glowColor="rgba(16, 185, 129, 0.4)">
      {/* Heavy Armor Crest / Shield Plate */}
      <path d="M22 10 L32 6 L42 10 L42 20 L32 24 L22 20 Z" fill="#064e3b" stroke="#10b981" strokeWidth="2" />
      <path d="M28 15 L32 18 L36 12" stroke="#34d399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

      {/* Head Chassis */}
      <rect x="13" y="22" width="38" height="30" rx="8" fill="url(#metalGrad)" stroke="#475569" strokeWidth="2" />
      <rect x="8" y="28" width="5" height="16" rx="2" fill="#10b981" opacity="0.9" />
      <rect x="51" y="28" width="5" height="16" rx="2" fill="#10b981" opacity="0.9" />

      {/* Protective Slit Visor */}
      <rect x="18" y="30" width="28" height="8" rx="2" fill="#060911" stroke={isBlocked ? '#f43f5e' : '#10b981'} strokeWidth="1.5" />
      <line x1="22" y1="34" x2="42" y2="34" stroke={isBlocked ? 'url(#roseVisor)' : 'url(#emeraldVisor)'} strokeWidth="3" strokeLinecap="round" />

      {/* Dual Rate-Limit Pressure Valves */}
      <circle cx="25" cy="45" r="3" fill="#090d16" stroke="#10b981" strokeWidth="1.5" />
      <circle cx="39" cy="45" r="3" fill="#090d16" stroke="#10b981" strokeWidth="1.5" />
    </RobotBase>
  )
}

// 6A. IDOR Executor Robot: Cross-tenant cipher key prism
export function RobotIDOR({ status = 'IDLE', size = 42 }) {
  return (
    <RobotBase size={size} status={status} glowColor="rgba(244, 63, 94, 0.4)">
      {/* Keyhole Antenna */}
      <circle cx="32" cy="12" r="4" stroke="#f43f5e" strokeWidth="2" fill="none" />
      <line x1="32" y1="16" x2="32" y2="20" stroke="#f43f5e" strokeWidth="2" />

      <rect x="16" y="20" width="32" height="28" rx="7" fill="url(#metalGrad)" stroke="#475569" strokeWidth="2" />
      {/* Key Prism Visor */}
      <rect x="20" y="27" width="24" height="9" rx="3" fill="#090d16" stroke="#f43f5e" strokeWidth="1.5" />
      <circle cx="27" cy="31.5" r="2.5" fill="#fb7185" />
      <circle cx="37" cy="31.5" r="2.5" fill="#fb7185" />

      {/* Key Teeth Badge */}
      <path d="M26 42 h12 v2 h-3 v2 h-3 v-2 h-3 v2 h-3 Z" fill="#f43f5e" />
    </RobotBase>
  )
}

// 6B. Business Logic Robot: State-machine circuit matrix & balance scale
export function RobotBizLogic({ status = 'IDLE', size = 42 }) {
  return (
    <RobotBase size={size} status={status} glowColor="rgba(245, 158, 11, 0.4)">
      {/* Balance Scale Balance Beam */}
      <line x1="20" y1="14" x2="44" y2="14" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
      <line x1="32" y1="10" x2="32" y2="19" stroke="#f59e0b" strokeWidth="2" />
      <circle cx="20" cy="14" r="2" fill="#fbbf24" />
      <circle cx="44" cy="14" r="2" fill="#fbbf24" />

      <rect x="16" y="20" width="32" height="28" rx="7" fill="url(#metalGrad)" stroke="#475569" strokeWidth="2" />
      {/* Hex Visor */}
      <polygon points="23,26 41,26 45,33 41,40 23,40 19,33" fill="#090d16" stroke="#f59e0b" strokeWidth="1.5" />
      <circle cx="28" cy="33" r="2" fill="#fbbf24" />
      <circle cx="36" cy="33" r="2" fill="#fbbf24" />

      {/* State Flow Arrows */}
      <path d="M25 43 L32 43 L30 41 M32 43 L30 45" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" />
    </RobotBase>
  )
}

// 6C. Authentication Robot: Cryptographic lock & token validator
export function RobotAuth({ status = 'IDLE', size = 42 }) {
  return (
    <RobotBase size={size} status={status} glowColor="rgba(6, 182, 212, 0.4)">
      {/* Padlock Shackle */}
      <path d="M24 18 V12 C24 8, 40 8, 40 12 V18" fill="none" stroke="#06b6d4" strokeWidth="2.5" />

      <rect x="16" y="19" width="32" height="29" rx="7" fill="url(#metalGrad)" stroke="#475569" strokeWidth="2" />
      {/* JWT Token Visor */}
      <rect x="21" y="26" width="22" height="10" rx="3" fill="#090d16" stroke="#06b6d4" strokeWidth="1.5" />
      <line x1="25" y1="31" x2="39" y2="31" stroke="url(#cyanVisor)" strokeWidth="2.5" strokeLinecap="round" />

      {/* Keyhole */}
      <circle cx="32" cy="41" r="2" fill="#06b6d4" />
      <polygon points="31,41 33,41 34,44 30,44" fill="#06b6d4" />
    </RobotBase>
  )
}

// 6D. API Hygiene Robot: Decontamination sterilization lens
export function RobotHygiene({ status = 'IDLE', size = 42 }) {
  return (
    <RobotBase size={size} status={status} glowColor="rgba(56, 189, 248, 0.4)">
      {/* Cleanroom Filter Hood */}
      <path d="M22 18 C22 10, 42 10, 42 18" stroke="#38bdf8" strokeWidth="2" fill="none" />
      <line x1="32" y1="9" x2="32" y2="14" stroke="#38bdf8" strokeWidth="2" />

      <rect x="16" y="19" width="32" height="29" rx="7" fill="url(#metalGrad)" stroke="#475569" strokeWidth="2" />
      {/* Dual Filter Mask */}
      <rect x="20" y="26" width="24" height="9" rx="3" fill="#090d16" stroke="#38bdf8" strokeWidth="1.5" />
      <line x1="24" y1="30.5" x2="40" y2="30.5" stroke="#38bdf8" strokeWidth="2" />

      {/* Air Vent Circles */}
      <circle cx="27" cy="42" r="2" fill="#38bdf8" />
      <circle cx="32" cy="42" r="2" fill="#38bdf8" />
      <circle cx="37" cy="42" r="2" fill="#38bdf8" />
    </RobotBase>
  )
}

// 6E. SSRF Executor Robot: Directional transmitter beacon & echo receiver
export function RobotSSRF({ status = 'IDLE', size = 42 }) {
  return (
    <RobotBase size={size} status={status} glowColor="rgba(56, 189, 248, 0.4)">
      {/* High-Gain Beacon Antenna */}
      <line x1="32" y1="7" x2="32" y2="19" stroke="#38bdf8" strokeWidth="2" />
      <circle cx="32" cy="6" r="3" fill="#7dd3fc" />
      <path d="M25 10 C25 6, 39 6, 39 10" stroke="#38bdf8" strokeWidth="1.5" fill="none" />

      <rect x="16" y="20" width="32" height="28" rx="7" fill="url(#metalGrad)" stroke="#475569" strokeWidth="2" />
      {/* Radar Sweep Screen */}
      <circle cx="32" cy="33" r="7" fill="#090d16" stroke="#38bdf8" strokeWidth="1.5" />
      <line x1="32" y1="33" x2="37" y2="30" stroke="#7dd3fc" strokeWidth="1.5" />

      {/* Canary Outbound Port Indicator */}
      <circle cx="32" cy="44" r="2" fill="#7dd3fc" />
    </RobotBase>
  )
}

// 7. Deterministic Verification Robot: High-precision forensic microscope ocular + checkmark reticle
export function RobotVerifier({ status = 'IDLE', size = 48 }) {
  const isRunning = status === 'RUNNING'
  return (
    <RobotBase size={size} status={status} glowColor="rgba(16, 185, 129, 0.5)">
      {/* Forensic Targeting Scope Mount */}
      <path d="M28 10 H36 V18 H28 Z" fill="#0f172a" stroke="#10b981" strokeWidth="1.5" />
      <line x1="32" y1="5" x2="32" y2="10" stroke="#10b981" strokeWidth="2" />
      <circle cx="32" cy="5" r="2" fill="#34d399" />

      {/* Chassis */}
      <rect x="14" y="18" width="36" height="30" rx="8" fill="url(#metalGrad)" stroke="#475569" strokeWidth="2" />

      {/* Large Forensic Monocular Lens */}
      <circle cx="32" cy="31" r="9" fill="#090d16" stroke="#10b981" strokeWidth="2" />
      <circle cx="32" cy="31" r="6" fill="#064e3b" />
      {/* Target Reticle Crosshairs */}
      <line x1="32" y1="23" x2="32" y2="39" stroke="#34d399" strokeWidth="1" strokeDasharray="1 1" />
      <line x1="24" y1="31" x2="40" y2="31" stroke="#34d399" strokeWidth="1" strokeDasharray="1 1" />
      <path d="M29 31 L31.5 33.5 L35 29" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

      {/* Zero False Positive Certification Seal */}
      <rect x="22" y="43" width="20" height="3" rx="1.5" fill="#10b981" />
    </RobotBase>
  )
}

// 8. Triage & Reporting Robot: Incident dispatcher slot & CVSS severity matrix
export function RobotTriage({ status = 'IDLE', size = 48 }) {
  const isRunning = status === 'RUNNING'
  return (
    <RobotBase size={size} status={status} glowColor="rgba(244, 63, 94, 0.4)">
      {/* Signal Light Horns */}
      <rect x="18" y="10" width="6" height="8" rx="2" fill="#f43f5e" />
      <rect x="40" y="10" width="6" height="8" rx="2" fill="#f43f5e" />

      {/* Chassis */}
      <rect x="14" y="18" width="36" height="30" rx="8" fill="url(#metalGrad)" stroke="#475569" strokeWidth="2" />

      {/* Triage Matrix Screen */}
      <rect x="19" y="24" width="26" height="12" rx="3" fill="#090d16" stroke="#f43f5e" strokeWidth="1.5" />
      <rect x="22" y="27" width="5" height="6" rx="1" fill="#f43f5e" />
      <rect x="29.5" y="27" width="5" height="6" rx="1" fill="#f59e0b" />
      <rect x="37" y="27" width="5" height="6" rx="1" fill="#38bdf8" />

      {/* Ticket Dispenser Ejector Slot */}
      <rect x="22" y="39" width="20" height="4" rx="1" fill="#0f172a" stroke="#64748b" strokeWidth="1" />
      <line x1="25" y1="41" x2="39" y2="41" stroke="#38bdf8" strokeWidth="1.5" />
    </RobotBase>
  )
}

// 9. Continuous Retest Robot: Regenerative loop crown + patch validator halo
export function RobotRetest({ status = 'IDLE', size = 48 }) {
  const isRunning = status === 'RUNNING'
  return (
    <RobotBase size={size} status={status} glowColor="rgba(16, 185, 129, 0.4)">
      {/* Regenerative Halo Ring */}
      <path
        d="M20 12 A12 12 0 1 1 44 12"
        fill="none"
        stroke="#10b981"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="4 2"
        className={isRunning ? 'animate-spin' : ''}
        style={{ transformOrigin: '32px 14px' }}
      />
      <polyline points="42,8 46,12 42,16" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

      {/* Head Chassis */}
      <rect x="14" y="20" width="36" height="28" rx="8" fill="url(#metalGrad)" stroke="#475569" strokeWidth="2" />

      {/* Circular Patch Validation Eye */}
      <circle cx="32" cy="32" r="7" fill="#090d16" stroke="#10b981" strokeWidth="1.5" />
      <path d="M29 32 L31 34 L35 30" stroke="#34d399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

      {/* Sync Status Bar */}
      <line x1="22" y1="43" x2="42" y2="43" stroke="#10b981" strokeWidth="2" strokeLinecap="round" />
    </RobotBase>
  )
}

// Avatar Resolver Helper
export function getAgentRobot(agentId, status = 'IDLE', size = 48) {
  switch (agentId) {
    case 'change_detector':
      return <RobotChangeDetector status={status} size={size} />
    case 'recon':
      return <RobotRecon status={status} size={size} />
    case 'inventory':
      return <RobotInventory status={status} size={size} />
    case 'planner':
      return <RobotPlanner status={status} size={size} />
    case 'safety_gateway':
      return <RobotSafetyGateway status={status} size={size} />
    case 'exec_idor':
      return <RobotIDOR status={status} size={size} />
    case 'exec_bizlogic':
      return <RobotBizLogic status={status} size={size} />
    case 'exec_auth':
      return <RobotAuth status={status} size={size} />
    case 'exec_hygiene':
      return <RobotHygiene status={status} size={size} />
    case 'exec_ssrf':
      return <RobotSSRF status={status} size={size} />
    case 'verifier':
      return <RobotVerifier status={status} size={size} />
    case 'triage':
      return <RobotTriage status={status} size={size} />
    case 'retest':
      return <RobotRetest status={status} size={size} />
    default:
      return <RobotRecon status={status} size={size} />
  }
}
