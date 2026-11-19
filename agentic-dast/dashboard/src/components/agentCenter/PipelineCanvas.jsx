import React from 'react'
import { AgentNode } from './AgentNode'

export function PipelineCanvas({
  agentsMap = {},
  selectedAgentId,
  onSelectAgent,
  currentStage = '',
  isScanning = false,
}) {
  const getAgent = (id) => agentsMap[id] || { id, name: id, status: 'IDLE' }

  return (
    <div className="relative overflow-hidden rounded-2xl bg-slate-950/80 p-6 backdrop-blur-xl shadow-2xl">
      {/* Background Cyber Grid */}
      <div className="bg-cyber-grid pointer-events-none absolute inset-0 opacity-20" />

      <div className="relative z-10 flex flex-col items-center space-y-6">
        {/* Stage 1: Change Detection Agent */}
        <div className="w-full max-w-md">
          <AgentNode
            agent={getAgent('change_detector')}
            isSelected={selectedAgentId === 'change_detector'}
            onSelect={onSelectAgent}
          />
        </div>

        {/* Animated Connector 1 -> 2 */}
        <VerticalPathway isActive={isScanning || getAgent('recon').status === 'COMPLETED'} />

        {/* Stage 2: Reconnaissance Agent */}
        <div className="w-full max-w-md">
          <AgentNode
            agent={getAgent('recon')}
            isSelected={selectedAgentId === 'recon'}
            onSelect={onSelectAgent}
          />
        </div>

        {/* Animated Connector 2 -> 3 */}
        <VerticalPathway isActive={isScanning || getAgent('inventory').status === 'COMPLETED'} />

        {/* Stage 3: API Inventory Engine */}
        <div className="w-full max-w-md">
          <AgentNode
            agent={getAgent('inventory')}
            isSelected={selectedAgentId === 'inventory'}
            onSelect={onSelectAgent}
          />
        </div>

        {/* Animated Connector 3 -> 4 */}
        <VerticalPathway isActive={isScanning || getAgent('planner').status === 'COMPLETED'} />

        {/* Stage 4: Attack Planning Agent */}
        <div className="w-full max-w-md">
          <AgentNode
            agent={getAgent('planner')}
            isSelected={selectedAgentId === 'planner'}
            onSelect={onSelectAgent}
          />
        </div>

        {/* Animated Connector 4 -> 5 */}
        <VerticalPathway isActive={isScanning || getAgent('safety_gateway').status === 'COMPLETED'} />

        {/* Stage 5: Safety Gateway (Central Gate) */}
        <div className="w-full max-w-lg">
          <AgentNode
            agent={getAgent('safety_gateway')}
            isSelected={selectedAgentId === 'safety_gateway'}
            onSelect={onSelectAgent}
          />
        </div>

        {/* Branching SVG Pathway to 5 Specialized Executors */}
        <BranchingPathway isActive={isScanning || getAgent('exec_idor').status === 'COMPLETED'} />

        {/* Stage 6: Specialized Attack Executors (5 Branching Nodes) */}
        <div className="w-full">
          <div className="mb-2 text-center text-xs text-slate-400 font-mono">
            Parallel Execution Matrix (Semaphore: 4)
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <AgentNode
              compact
              agent={getAgent('exec_idor')}
              isSelected={selectedAgentId === 'exec_idor'}
              onSelect={onSelectAgent}
            />
            <AgentNode
              compact
              agent={getAgent('exec_bizlogic')}
              isSelected={selectedAgentId === 'exec_bizlogic'}
              onSelect={onSelectAgent}
            />
            <AgentNode
              compact
              agent={getAgent('exec_auth')}
              isSelected={selectedAgentId === 'exec_auth'}
              onSelect={onSelectAgent}
            />
            <AgentNode
              compact
              agent={getAgent('exec_hygiene')}
              isSelected={selectedAgentId === 'exec_hygiene'}
              onSelect={onSelectAgent}
            />
            <AgentNode
              compact
              agent={getAgent('exec_ssrf')}
              isSelected={selectedAgentId === 'exec_ssrf'}
              onSelect={onSelectAgent}
            />
          </div>
        </div>

        {/* Converging SVG Pathway to Verification Engine */}
        <ConvergingPathway isActive={isScanning || getAgent('verifier').status === 'COMPLETED'} />

        {/* Stage 7: Deterministic Verification Engine */}
        <div className="w-full max-w-lg">
          <AgentNode
            agent={getAgent('verifier')}
            isSelected={selectedAgentId === 'verifier'}
            onSelect={onSelectAgent}
          />
        </div>

        {/* Animated Connector 7 -> 8 */}
        <VerticalPathway isActive={isScanning || getAgent('triage').status === 'COMPLETED'} />

        {/* Stage 8: Triage & Reporting Agent */}
        <div className="w-full max-w-md">
          <AgentNode
            agent={getAgent('triage')}
            isSelected={selectedAgentId === 'triage'}
            onSelect={onSelectAgent}
          />
        </div>

        {/* Animated Connector 8 -> 9 */}
        <VerticalPathway isActive={isScanning || getAgent('retest').status === 'COMPLETED'} />

        {/* Stage 9: Continuous Retest Agent */}
        <div className="w-full max-w-md">
          <AgentNode
            agent={getAgent('retest')}
            isSelected={selectedAgentId === 'retest'}
            onSelect={onSelectAgent}
          />
        </div>
      </div>
    </div>
  )
}

function VerticalPathway({ isActive = false }) {
  return (
    <div className="relative flex h-8 w-8 items-center justify-center">
      <svg className="h-8 w-4" viewBox="0 0 16 32" fill="none">
        <line
          x1="8"
          y1="0"
          x2="8"
          y2="32"
          stroke={isActive ? '#06b6d4' : '#334155'}
          strokeWidth="2"
          strokeDasharray={isActive ? '4 3' : 'none'}
          className={isActive ? 'animate-pulse' : ''}
        />
        {isActive && (
          <circle cx="8" cy="16" r="3" fill="#22d3ee" className="animate-ping" />
        )}
      </svg>
    </div>
  )
}

function BranchingPathway({ isActive = false }) {
  return (
    <div className="w-full max-w-4xl px-8 h-10 flex items-center justify-center">
      <svg className="w-full h-10" viewBox="0 0 800 40" fill="none" preserveAspectRatio="none">
        {/* Center trunk down from Safety Gateway */}
        <line x1="400" y1="0" x2="400" y2="16" stroke={isActive ? '#06b6d4' : '#334155'} strokeWidth="2" />
        {/* Horizontal branch bar */}
        <path
          d="M80 16 H720"
          stroke={isActive ? '#06b6d4' : '#334155'}
          strokeWidth="2"
          strokeDasharray={isActive ? '6 4' : 'none'}
        />
        {/* 5 branch drop lines */}
        <line x1="80" y1="16" x2="80" y2="40" stroke={isActive ? '#06b6d4' : '#334155'} strokeWidth="2" />
        <line x1="240" y1="16" x2="240" y2="40" stroke={isActive ? '#06b6d4' : '#334155'} strokeWidth="2" />
        <line x1="400" y1="16" x2="400" y2="40" stroke={isActive ? '#06b6d4' : '#334155'} strokeWidth="2" />
        <line x1="560" y1="16" x2="560" y2="40" stroke={isActive ? '#06b6d4' : '#334155'} strokeWidth="2" />
        <line x1="720" y1="16" x2="720" y2="40" stroke={isActive ? '#06b6d4' : '#334155'} strokeWidth="2" />

        {/* Pulsing signal dots */}
        {isActive && (
          <>
            <circle cx="80" cy="28" r="2.5" fill="#22d3ee" className="animate-ping" />
            <circle cx="240" cy="28" r="2.5" fill="#22d3ee" className="animate-ping" />
            <circle cx="400" cy="28" r="2.5" fill="#22d3ee" className="animate-ping" />
            <circle cx="560" cy="28" r="2.5" fill="#22d3ee" className="animate-ping" />
            <circle cx="720" cy="28" r="2.5" fill="#22d3ee" className="animate-ping" />
          </>
        )}
      </svg>
    </div>
  )
}

function ConvergingPathway({ isActive = false }) {
  return (
    <div className="w-full max-w-4xl px-8 h-10 flex items-center justify-center">
      <svg className="w-full h-10" viewBox="0 0 800 40" fill="none" preserveAspectRatio="none">
        {/* 5 lines dropping into horizontal bar */}
        <line x1="80" y1="0" x2="80" y2="24" stroke={isActive ? '#10b981' : '#334155'} strokeWidth="2" />
        <line x1="240" y1="0" x2="240" y2="24" stroke={isActive ? '#10b981' : '#334155'} strokeWidth="2" />
        <line x1="400" y1="0" x2="400" y2="24" stroke={isActive ? '#10b981' : '#334155'} strokeWidth="2" />
        <line x1="560" y1="0" x2="560" y2="24" stroke={isActive ? '#10b981' : '#334155'} strokeWidth="2" />
        <line x1="720" y1="0" x2="720" y2="24" stroke={isActive ? '#10b981' : '#334155'} strokeWidth="2" />

        {/* Horizontal bar */}
        <path
          d="M80 24 H720"
          stroke={isActive ? '#10b981' : '#334155'}
          strokeWidth="2"
          strokeDasharray={isActive ? '6 4' : 'none'}
        />

        {/* Center convergent line down to Verifier */}
        <line x1="400" y1="24" x2="400" y2="40" stroke={isActive ? '#10b981' : '#334155'} strokeWidth="2" />

        {/* Converging pulse */}
        {isActive && (
          <circle cx="400" cy="32" r="3" fill="#34d399" className="animate-ping" />
        )}
      </svg>
    </div>
  )
}
