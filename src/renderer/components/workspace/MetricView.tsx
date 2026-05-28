import { type JSX } from 'react'
import { Icon } from '@renderer/components/Icon'
import { useSessionStore } from '@renderer/stores/session'
import type { TopicInfo } from '@shared/types'

function topicColor(index: number): string {
  const colors = [
    'var(--color-danger)',
    'var(--color-accent)',
    'var(--color-warn)',
    'var(--color-magenta)',
    'oklch(0.70 0.10 200)',
    'oklch(0.70 0.15 120)',
  ]
  return colors[index % colors.length]
}

function TopicCard({ topic, index }: { topic: TopicInfo; index: number }): JSX.Element {
  const color = topicColor(index)
  return (
    <div className="card" style={{ padding: '12px 14px' }}>
      <div className="row gap-2" style={{ marginBottom: 8 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0, marginTop: 3 }} />
        <div className="col flex1" style={{ minWidth: 0, gap: 2 }}>
          <span
            className="mono"
            style={{
              fontSize: 11.5,
              fontWeight: 600,
              color: 'var(--color-text-1)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={topic.name}
          >
            {topic.name}
          </span>
          <span className="mono dim" style={{ fontSize: 10 }}>
            {topic.type.split('/').pop()}
          </span>
        </div>
        <div className="col" style={{ alignItems: 'flex-end', flexShrink: 0, gap: 2 }}>
          <span className="mono" style={{ fontSize: 11, color: 'var(--color-accent)' }}>
            {topic.hz} Hz
          </span>
          <span className="mono dim" style={{ fontSize: 10 }}>
            {topic.msgs.toLocaleString()} msgs
          </span>
        </div>
      </div>
      {/* Time-series chart placeholder */}
      <div
        style={{
          height: 56,
          borderRadius: 6,
          background: 'var(--color-bg-2)',
          border: '1px dashed var(--color-border-2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
        }}
      >
        <Icon.Activity size={13} style={{ color: 'var(--color-text-3)', opacity: 0.5 }} />
        <span style={{ fontSize: 10.5, color: 'var(--color-text-3)' }}>
          Time-series plot · coming soon
        </span>
      </div>
    </div>
  )
}

export function MetricView(): JSX.Element {
  const topics = useSessionStore((s) => s.topics)

  return (
    <div className="col flex1" style={{ minHeight: 0 }}>
      <div
        className="row gap-2"
        style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-border-1)' }}
      >
        <span className="section-h">Metrics</span>
        {topics.length > 0 && (
          <span className="pill sm ghost mono">{topics.length} topics</span>
        )}
        <div className="flex1" />
        <button className="btn ghost icon sm" title="Download (not available)" disabled>
          <Icon.Download size={13} />
        </button>
      </div>

      <div className="flex1" style={{ overflow: 'auto', padding: 14 }}>
        {topics.length === 0 ? (
          <div
            className="col"
            style={{ alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}
          >
            <Icon.Activity size={32} style={{ color: 'var(--color-text-3)', opacity: 0.3 }} />
            <span style={{ fontSize: 12, color: 'var(--color-text-3)' }}>
              No session loaded — load a ROS bag to see topic metrics
            </span>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {topics.map((topic, i) => (
              <TopicCard key={topic.name} topic={topic} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
