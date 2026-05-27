import type { JSX } from 'react'
import { useSessionStore } from '@renderer/stores/session'
import type { KGraphNode } from '@shared/types'

const GROUP_COLOR: Record<KGraphNode['group'], string> = {
  sensor: 'oklch(0.70 0.10 200)',
  fault: 'var(--color-danger)',
  state: 'var(--color-warn)',
  node: 'var(--color-accent)',
  outcome: 'var(--color-magenta)',
}

const GROUP_LABELS: Array<[KGraphNode['group'], string]> = [
  ['sensor', 'Sensors'],
  ['node', 'Nodes'],
  ['state', 'States'],
  ['fault', 'Faults'],
  ['outcome', 'Outcomes'],
]

export function KGraphView(): JSX.Element {
  const kgraph = useSessionStore((s) => s.kgraph)

  if (!kgraph) {
    return (
      <div className="col flex1" style={{ minHeight: 0 }}>
        <div
          className="row gap-2"
          style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-border-1)' }}
        >
          <span className="section-h">Knowledge Graph</span>
        </div>
        <div
          className="flex1 col"
          style={{ alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-3)', fontSize: 12 }}
        >
          No session loaded
        </div>
      </div>
    )
  }

  const { nodes, edges } = kgraph
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]))

  return (
    <div className="col flex1" style={{ minHeight: 0 }}>
      {/* Toolbar */}
      <div
        className="row gap-2"
        style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-border-1)' }}
      >
        <span className="section-h">Knowledge Graph</span>
        <span className="pill sm ghost mono">causal chain</span>
        <div className="flex1" />
        <div className="row gap-1">
          {GROUP_LABELS.map(([k, label]) => (
            <span key={k} className="pill sm ghost">
              <span className="swatch" style={{ background: GROUP_COLOR[k] }} />
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* SVG canvas */}
      <div
        className="flex1"
        style={{
          position: 'relative',
          overflow: 'hidden',
          background: 'var(--color-map-bg)',
        }}
      >
        <svg
          viewBox="0 0 700 460"
          preserveAspectRatio="xMidYMid meet"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        >
          <defs>
            {/* Dotted grid */}
            <pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1" fill="var(--color-grid)" />
            </pattern>
            {/* Arrow marker */}
            <marker
              id="arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-border-3)" />
            </marker>
          </defs>

          {/* Background */}
          <rect width="700" height="460" fill="url(#dots)" />

          {/* Edges */}
          {edges.map((e, i) => {
            const A = byId[e.source]
            const B = byId[e.target]
            if (!A || !B) return null
            const isDashed = e.source === 'sensor' || e.source === 'dropout'
            return (
              <line
                key={i}
                x1={A.x}
                y1={A.y}
                x2={B.x}
                y2={B.y}
                stroke="var(--color-border-2)"
                strokeWidth={1.4}
                markerEnd="url(#arrow)"
                strokeDasharray={isDashed ? '4 3' : undefined}
                opacity={0.8}
              />
            )
          })}

          {/* Nodes */}
          {nodes.map((n) => (
            <g key={n.id} transform={`translate(${n.x} ${n.y})`}>
              <rect
                x="-65" y="-18" width="130" height="36" rx="6"
                fill="var(--color-bg-2)"
                stroke={GROUP_COLOR[n.group]}
                strokeWidth="1.5"
              />
              <circle cx="-50" cy="0" r="4" fill={GROUP_COLOR[n.group]} />
              <text
                x="-38"
                y="4"
                fontSize="11"
                fill="var(--color-text-0)"
                fontFamily="JetBrains Mono, monospace"
              >
                {n.label}
              </text>
            </g>
          ))}
        </svg>

        {/* Inference card */}
        <div
          className="panel"
          style={{
            position: 'absolute',
            bottom: 14,
            left: 14,
            padding: '10px 12px',
            maxWidth: 320,
          }}
        >
          <div className="section-h" style={{ marginBottom: 4 }}>DataPilot inference</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-1)', lineHeight: 1.5 }}>
            Sensor dropout cascaded through costmap inflation to a planner abort.
            Confidence:{' '}
            <span className="mono" style={{ color: 'var(--color-ok)' }}>0.94</span>.
            Explored 24 alternate paths, ruled out 18.
          </div>
        </div>
      </div>
    </div>
  )
}
