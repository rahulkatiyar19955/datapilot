import { useMemo, type JSX } from 'react'
import { Icon } from '@renderer/components/Icon'

type PeakShape = 'spike' | 'drop' | 'ramp' | 'wave'

interface MetricPlotProps {
  title: string
  unit: string
  color: string
  peak: PeakShape
  anomaly?: [number, number]
  yAxis?: string[]
}

function computePath(peak: PeakShape): string {
  const w = 100
  const h = 100
  const pts: string[] = []
  for (let i = 0; i <= 60; i++) {
    const x = (i / 60) * w
    let v: number
    if (peak === 'spike') {
      v = 0.3 + 0.05 * Math.sin(i * 0.4) + (i > 30 && i < 36 ? 0.55 : 0)
    } else if (peak === 'drop') {
      v = 0.65 + 0.04 * Math.sin(i * 0.5) - (i > 28 && i < 38 ? 0.5 : 0)
    } else if (peak === 'ramp') {
      v = 0.2 + i / 90 + 0.03 * Math.sin(i * 0.6)
    } else {
      v = 0.4 + 0.08 * Math.sin(i * 0.3 + 1) + 0.04 * Math.cos(i * 0.5)
    }
    const y = h - Math.min(Math.max(v, 0), 1) * h
    pts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`)
  }
  return pts.join(' ')
}

function MetricPlot({ title, unit, color, peak, anomaly, yAxis }: MetricPlotProps): JSX.Element {
  const w = 100
  const h = 100
  const linePath = useMemo(() => computePath(peak), [peak])
  const gradId = `g-${title.replace(/[^a-z0-9]/gi, '-')}`

  return (
    <div className="card" style={{ padding: '12px 14px' }}>
      <div className="row gap-2" style={{ marginBottom: 6 }}>
        <span style={{ width: 6, height: 6, borderRadius: 50, background: color }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-1)' }}>
          {title}
        </span>
        <span className="dim mono" style={{ fontSize: 10.5 }}>{unit}</span>
        <div className="flex1" />
        <button className="btn ghost icon sm" title="Remove">
          <Icon.X size={11} />
        </button>
      </div>
      <div style={{ position: 'relative', height: 100, width: '100%' }}>
        <svg
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio="none"
          style={{ width: '100%', height: '100%', display: 'block' }}
        >
          {/* Grid lines */}
          {[0.25, 0.5, 0.75].map((g) => (
            <line
              key={g}
              x1={0}
              x2={w}
              y1={h * g}
              y2={h * g}
              stroke="var(--color-border-1)"
              strokeWidth={0.3}
            />
          ))}

          {/* Anomaly band */}
          {anomaly && (
            <rect
              x={anomaly[0]}
              y={0}
              width={anomaly[1] - anomaly[0]}
              height={h}
              fill="var(--color-danger)"
              opacity={0.1}
            />
          )}

          {/* Gradient fill under line */}
          <defs>
            <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d={`${linePath} L${w},${h} L0,${h} Z`} fill={`url(#${gradId})`} />
          <path d={linePath} stroke={color} strokeWidth={0.8} fill="none" />
        </svg>

        {/* Y-axis labels */}
        {yAxis && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: 28,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              pointerEvents: 'none',
            }}
          >
            {yAxis.map((y, i) => (
              <span key={i} className="mono dim" style={{ fontSize: 9.5, textAlign: 'left' }}>
                {y}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const METRICS: MetricPlotProps[] = [
  {
    title: '/sensors/lidar_a · latency',
    unit: 'ms',
    color: 'var(--color-danger)',
    peak: 'spike',
    anomaly: [50, 60],
    yAxis: ['800', '400', '200', '0'],
  },
  {
    title: '/cmd_vel · linear.x',
    unit: 'm/s',
    color: 'var(--color-accent)',
    peak: 'drop',
    anomaly: [50, 60],
    yAxis: ['0.6', '0.3', '0', '-0.3'],
  },
  {
    title: '/perception/objects · confidence',
    unit: '0-1',
    color: 'var(--color-warn)',
    peak: 'drop',
    yAxis: ['1.0', '0.7', '0.4', '0.1'],
  },
  {
    title: '/diagnostics · cpu_load',
    unit: '%',
    color: 'var(--color-magenta)',
    peak: 'ramp',
    yAxis: ['100', '75', '50', '25'],
  },
]

export function MetricView(): JSX.Element {
  return (
    <div className="col flex1" style={{ minHeight: 0 }}>
      <div
        className="row gap-2"
        style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-border-1)' }}
      >
        <span className="section-h">Metrics</span>
        <span className="pill sm ghost mono">4 metrics · t=64–72s focus</span>
        <div className="flex1" />
        <button className="btn ghost sm">
          <Icon.Plus size={12} />
          Add metric
        </button>
        <button className="btn ghost sm">
          <Icon.Layers size={12} />
          Overlay baseline
        </button>
        <button className="btn ghost icon sm" title="Download">
          <Icon.Download size={13} />
        </button>
      </div>

      <div className="flex1" style={{ overflow: 'auto', padding: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {METRICS.map((m) => (
            <MetricPlot key={m.title} {...m} />
          ))}
        </div>
        {/* X-axis time labels */}
        <div
          className="row mono dim"
          style={{
            fontSize: 10,
            justifyContent: 'space-between',
            marginTop: 6,
            padding: '0 4px',
          }}
        >
          <span>00:00</span>
          <span>00:20</span>
          <span>00:40</span>
          <span>01:00</span>
          <span>01:20</span>
          <span>01:40</span>
        </div>
      </div>
    </div>
  )
}
