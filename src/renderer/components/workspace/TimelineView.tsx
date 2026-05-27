import type { JSX } from 'react'
import { Icon } from '@renderer/components/Icon'
import { SeverityDot } from '@renderer/components/ui/SeverityDot'
import { useSessionStore } from '@renderer/stores/session'
import { useUIStore } from '@renderer/stores/ui'
import type { TimelineEvent } from '@shared/types'
import type { Severity } from '@renderer/components/ui/SeverityDot'

const TOTAL_SECONDS = 100
const BUCKET_COUNT = 50
const TICK_INTERVAL = 10

function sevColor(sev: TimelineEvent['sev']): string {
  if (sev === 'critical') return 'var(--color-danger)'
  if (sev === 'warning') return 'var(--color-warn)'
  return 'var(--color-accent)'
}

function sevToSeverity(sev: TimelineEvent['sev']): Severity {
  if (sev === 'critical') return 'critical'
  if (sev === 'warning') return 'warning'
  return 'info'
}

function bucketColor(events: TimelineEvent[], i: number): string {
  const start = (i / BUCKET_COUNT) * TOTAL_SECONDS
  const end = ((i + 1) / BUCKET_COUNT) * TOTAL_SECONDS
  const bucket = events.filter((e) => e.t >= start && e.t < end)
  if (bucket.some((e) => e.sev === 'critical')) return 'var(--color-danger)'
  if (bucket.some((e) => e.sev === 'warning')) return 'var(--color-warn)'
  if (bucket.length > 0) return 'var(--color-accent-dim)'
  return 'var(--color-bg-3)'
}

function bucketHeight(events: TimelineEvent[], i: number): number {
  const start = (i / BUCKET_COUNT) * TOTAL_SECONDS
  const end = ((i + 1) / BUCKET_COUNT) * TOTAL_SECONDS
  const bucket = events.filter((e) => e.t >= start && e.t < end)
  if (bucket.length === 0) return 0.15
  if (bucket.some((e) => e.sev === 'critical')) return 0.95
  if (bucket.some((e) => e.sev === 'warning')) return 0.6
  return 0.35
}

function formatTick(t: number): string {
  const m = Math.floor(t / 60)
  const s = t % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const LANES: Array<{ key: TimelineEvent['type']; label: string; color: string }> = [
  { key: 'log', label: 'Logs', color: 'oklch(0.62 0.05 240)' },
  { key: 'sensor', label: 'Sensors', color: 'oklch(0.70 0.10 200)' },
  { key: 'anomaly', label: 'Anomalies', color: 'oklch(0.70 0.18 25)' },
]

const TICKS = Array.from({ length: Math.floor(TOTAL_SECONDS / TICK_INTERVAL) + 1 }, (_, i) => i * TICK_INTERVAL)

export function TimelineView(): JSX.Element {
  const timeline = useSessionStore((s) => s.timeline)
  const selectedEventT = useUIStore((s) => s.selectedEventT)
  const setSelectedEventT = useUIStore((s) => s.setSelectedEventT)

  const selectedEvent = timeline.find((e) => e.t === selectedEventT) ?? null

  const maxT = timeline.length > 0 ? Math.max(...timeline.map((e) => e.t)) : TOTAL_SECONDS
  const displayTotal = Math.max(maxT, TOTAL_SECONDS)

  return (
    <div className="col flex1" style={{ minHeight: 0 }}>
      {/* Toolbar */}
      <div
        className="row gap-2"
        style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-border-1)' }}
      >
        <span className="section-h">Timeline</span>
        <span className="pill sm ghost mono">
          00:00 → {formatTick(Math.ceil(displayTotal / 10) * 10)}
        </span>
        <div className="flex1" />
        <button className="btn ghost sm">
          <Icon.Zoom size={12} />
          Zoom to anomalies
        </button>
        <button className="btn ghost icon sm" title="Filter">
          <Icon.Filter size={13} />
        </button>
        <button className="btn ghost icon sm" title="Refresh">
          <Icon.Refresh size={13} />
        </button>
      </div>

      {/* Density overview strip */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-border-1)' }}>
        <div className="row" style={{ alignItems: 'flex-end', height: 30, gap: 2 }}>
          {Array.from({ length: BUCKET_COUNT }, (_, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: `${bucketHeight(timeline, i) * 100}%`,
                background: bucketColor(timeline, i),
                borderRadius: 1,
                opacity: 0.85,
              }}
            />
          ))}
        </div>
      </div>

      {/* Lanes */}
      <div className="flex1" style={{ overflow: 'auto', padding: '4px 14px 14px' }}>
        {/* Tick row */}
        <div
          style={{
            position: 'relative',
            height: 18,
            marginLeft: 100,
            borderBottom: '1px dashed var(--color-border-1)',
          }}
        >
          {TICKS.map((tk) => (
            <div
              key={tk}
              style={{
                position: 'absolute',
                left: `${(tk / TOTAL_SECONDS) * 100}%`,
                top: 0,
                transform: 'translateX(-50%)',
              }}
            >
              <span className="mono" style={{ fontSize: 10, color: 'var(--color-text-3)' }}>
                {formatTick(tk)}
              </span>
            </div>
          ))}
        </div>

        {/* Event lanes */}
        {LANES.map((lane) => {
          const laneEvents = timeline.filter((e) => e.type === lane.key)
          return (
            <div
              key={lane.key}
              className="row"
              style={{ alignItems: 'stretch', borderBottom: '1px solid var(--color-border-1)' }}
            >
              {/* Lane label */}
              <div style={{ width: 100, padding: '14px 8px 14px 0', flexShrink: 0 }}>
                <div className="row gap-2">
                  <span
                    style={{ width: 6, height: 6, borderRadius: 50, background: lane.color }}
                  />
                  <span style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--color-text-1)' }}>
                    {lane.label}
                  </span>
                </div>
                <div className="dim mono" style={{ fontSize: 10, marginTop: 2 }}>
                  {laneEvents.length} events
                </div>
              </div>

              {/* Events track */}
              <div style={{ flex: 1, position: 'relative', minHeight: 56 }}>
                {/* Grid lines */}
                {TICKS.map((tk) => (
                  <div
                    key={tk}
                    style={{
                      position: 'absolute',
                      left: `${(tk / TOTAL_SECONDS) * 100}%`,
                      top: 0,
                      bottom: 0,
                      width: 1,
                      background: 'oklch(0.30 0.012 240 / 0.4)',
                    }}
                  />
                ))}

                {/* Event dots */}
                {laneEvents.map((e, i) => {
                  const pct = (e.t / TOTAL_SECONDS) * 100
                  const isSelected = selectedEventT === e.t
                  return (
                    <div
                      key={i}
                      onClick={() => setSelectedEventT(isSelected ? null : e.t)}
                      title={e.label}
                      style={{
                        position: 'absolute',
                        left: `calc(${pct}% - 7px)`,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        width: 14,
                        height: 14,
                        borderRadius: lane.key === 'anomaly' ? 3 : 50,
                        background: sevColor(e.sev),
                        border: isSelected
                          ? '2px solid var(--color-text-0)'
                          : '2px solid var(--color-bg-1)',
                        cursor: 'pointer',
                        boxShadow:
                          e.sev === 'critical'
                            ? `0 0 12px ${sevColor(e.sev)}`
                            : 'none',
                        transition: 'transform 0.1s',
                        zIndex: isSelected ? 2 : 1,
                      }}
                    />
                  )
                })}
              </div>
            </div>
          )
        })}

        {/* Selected event card */}
        {selectedEvent && (
          <div className="card fade-in" style={{ marginTop: 16, padding: '14px 16px' }}>
            <div className="row gap-2" style={{ marginBottom: 8 }}>
              <SeverityDot sev={sevToSeverity(selectedEvent.sev)} />
              <span className="mono" style={{ fontSize: 11.5, color: 'var(--color-text-1)' }}>
                t={selectedEvent.t.toFixed(2)}s
              </span>
              <span className="mono" style={{ fontSize: 11.5, color: 'var(--color-accent)' }}>
                {selectedEvent.topic}
              </span>
              <div className="flex1" />
              <button className="btn ghost sm">
                <Icon.Pin size={12} />
                Pin
              </button>
              <button className="btn ghost sm">
                <Icon.Activity size={12} />
                Plot
              </button>
            </div>
            <div style={{ fontSize: 13, color: 'var(--color-text-0)', marginBottom: 8 }}>
              {selectedEvent.label}
            </div>
            <div className="dim" style={{ fontSize: 11.5, lineHeight: 1.5 }}>
              Click an adjacent event to see relationship · DataPilot suggested this is part of
              the failure chain.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
