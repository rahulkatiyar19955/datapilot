import type { JSX } from 'react'
import { Icon } from '@renderer/components/Icon'

const PLANNED_PATH = 'M 60 380 Q 160 360 240 320 T 420 260 T 600 220 T 760 200'
const ACTUAL_PATH = 'M 60 380 Q 160 360 240 320 T 420 260 T 590 240 L 595 245'

const WAYPOINTS: [number, number][] = [[60, 380], [240, 320], [420, 260], [600, 220], [760, 200]]

export function MapView(): JSX.Element {
  return (
    <div className="col flex1" style={{ minHeight: 0 }}>
      {/* Toolbar */}
      <div
        className="row gap-2"
        style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-border-1)' }}
      >
        <span className="section-h">Map · trajectory</span>
        <span className="pill sm ghost mono">odom + costmap · 1px = 10cm</span>
        <div className="flex1" />
        <button className="btn ghost sm">
          <span style={{ display: 'inline-block', width: 8, height: 2, background: 'var(--color-accent)' }} />
          Planned
        </button>
        <button className="btn ghost sm">
          <span style={{ display: 'inline-block', width: 8, height: 2, background: 'var(--color-warn)' }} />
          Actual
        </button>
        <button className="btn ghost sm">
          <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: 50, background: 'var(--color-danger)' }} />
          Stop point
        </button>
        <button className="btn ghost icon sm" title="Zoom">
          <Icon.Zoom size={13} />
        </button>
      </div>

      {/* Map canvas */}
      <div
        className="flex1"
        style={{
          position: 'relative',
          overflow: 'hidden',
          background: 'var(--color-map-bg)',
        }}
      >
        <svg
          viewBox="0 0 800 500"
          preserveAspectRatio="xMidYMid meet"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        >
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path
                d="M 40 0 L 0 0 0 40"
                fill="none"
                stroke="var(--color-grid)"
                strokeWidth="0.5"
              />
            </pattern>
            <pattern id="bigGrid" width="200" height="200" patternUnits="userSpaceOnUse">
              <path
                d="M 200 0 L 0 0 0 200"
                fill="none"
                stroke="var(--color-grid-2)"
                strokeWidth="0.8"
              />
            </pattern>
          </defs>

          {/* Grid background */}
          <rect width="800" height="500" fill="url(#grid)" />
          <rect width="800" height="500" fill="url(#bigGrid)" />

          {/* Workspace bounds */}
          <rect
            x="40" y="40" width="720" height="420"
            fill="none"
            stroke="var(--color-border-2)"
            strokeWidth="2"
          />

          {/* Obstacles */}
          <rect x="120" y="80" width="160" height="40" fill="var(--color-bg-2)" stroke="var(--color-border-2)" />
          <rect x="380" y="80" width="160" height="40" fill="var(--color-bg-2)" stroke="var(--color-border-2)" />
          <rect x="640" y="80" width="100" height="40" fill="var(--color-bg-2)" stroke="var(--color-border-2)" />
          <rect x="120" y="400" width="120" height="40" fill="var(--color-bg-2)" stroke="var(--color-border-2)" />
          <rect x="320" y="400" width="120" height="40" fill="var(--color-bg-2)" stroke="var(--color-border-2)" />
          <rect x="520" y="400" width="120" height="40" fill="var(--color-bg-2)" stroke="var(--color-border-2)" />

          {/* Costmap inflation cloud near stop point */}
          <circle cx="595" cy="245" r="60" fill="var(--color-danger)" opacity={0.1} />
          <circle cx="595" cy="245" r="36" fill="var(--color-danger)" opacity={0.18} />

          {/* Planned path (dashed accent) */}
          <path
            d={PLANNED_PATH}
            stroke="var(--color-accent)"
            strokeWidth="2.5"
            fill="none"
            strokeDasharray="6 4"
            opacity={0.9}
          />

          {/* Actual path (solid warn) */}
          <path d={ACTUAL_PATH} stroke="var(--color-warn)" strokeWidth="3" fill="none" />

          {/* Waypoints */}
          {WAYPOINTS.map(([x, y], i) => (
            <g key={i}>
              <circle
                cx={x} cy={y} r="5"
                fill="var(--color-bg-0)"
                stroke="var(--color-accent)"
                strokeWidth="1.5"
              />
              {i === WAYPOINTS.length - 1 && (
                <>
                  <circle
                    cx={x} cy={y} r="10"
                    fill="none"
                    stroke="var(--color-accent)"
                    strokeWidth="1"
                    opacity={0.5}
                  />
                  <text
                    x={x + 12}
                    y={y + 4}
                    fontSize="11"
                    fill="var(--color-text-1)"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    goal · bay_3_dock
                  </text>
                </>
              )}
            </g>
          ))}

          {/* E-brake / stop marker with pulse animation */}
          <g>
            <circle cx="595" cy="245" r="8" fill="var(--color-danger)" />
            <circle cx="595" cy="245" r="14" fill="none" stroke="var(--color-danger)" strokeWidth="1.5" opacity={0.6}>
              <animate attributeName="r" from="8" to="20" dur="1.6s" repeatCount="indefinite" />
              <animate attributeName="opacity" from="0.7" to="0" dur="1.6s" repeatCount="indefinite" />
            </circle>
            <text
              x="610" y="240"
              fontSize="11"
              fill="var(--color-danger)"
              fontFamily="JetBrains Mono, monospace"
            >
              e-brake · t=66.3s
            </text>
          </g>

          {/* Robot start marker */}
          <g transform="translate(60 380)">
            <rect x="-8" y="-6" width="16" height="12" rx="2" fill="var(--color-accent)" />
            <path d="M 8 0 L 14 0" stroke="var(--color-accent)" strokeWidth="2" />
            <text
              x="-22" y="22"
              fontSize="10"
              fill="var(--color-text-2)"
              fontFamily="JetBrains Mono, monospace"
            >
              start
            </text>
          </g>
        </svg>

        {/* HUD: frame chain top-left */}
        <div
          className="panel"
          style={{ position: 'absolute', top: 12, left: 12, padding: '8px 10px', fontSize: 11 }}
        >
          <div className="mono dim" style={{ fontSize: 10 }}>FRAME</div>
          <div className="mono" style={{ color: 'var(--color-text-1)' }}>
            map → odom → base_link
          </div>
        </div>

        {/* HUD: viewport extents bottom-right */}
        <div
          className="panel"
          style={{
            position: 'absolute',
            bottom: 12,
            right: 12,
            padding: '8px 10px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <div className="mono dim" style={{ fontSize: 10 }}>VIEWPORT</div>
          <div className="mono" style={{ color: 'var(--color-text-1)', fontSize: 11 }}>
            x: 0.0 → 80.0 m
          </div>
          <div className="mono" style={{ color: 'var(--color-text-1)', fontSize: 11 }}>
            y: −20.0 → 30.0 m
          </div>
        </div>
      </div>
    </div>
  )
}
