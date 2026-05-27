import type { JSX } from 'react'
import { useSessionStore } from '@renderer/stores/session'

export function TopicsPanel(): JSX.Element {
  const topics = useSessionStore((s) => s.topics)

  return (
    <div
      className="col"
      style={{
        width: 240,
        flexShrink: 0,
        background: 'var(--color-bg-1)',
        borderLeft: '1px solid var(--color-border-1)',
      }}
    >
      <div
        className="row"
        style={{ padding: '10px 12px', borderBottom: '1px solid var(--color-border-1)' }}
      >
        <span className="section-h">Topics</span>
        <div className="flex1" />
        <span className="dim mono" style={{ fontSize: 10.5 }}>{topics.length}</span>
      </div>

      <div style={{ padding: 8, overflow: 'auto', flex: 1 }}>
        {topics.length === 0 && (
          <div
            className="dim"
            style={{ fontSize: 11, padding: '12px 8px', textAlign: 'center' }}
          >
            No session loaded
          </div>
        )}
        {topics.map((t, i) => (
          <div
            key={i}
            className="row gap-2"
            style={{ padding: '7px 8px', borderRadius: 6, cursor: 'pointer' }}
          >
            <div className="flex1" style={{ minWidth: 0 }}>
              <div
                className="mono"
                style={{
                  fontSize: 11.5,
                  color: 'var(--color-text-0)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {t.name}
              </div>
              <div
                className="mono dim"
                style={{
                  fontSize: 10,
                  marginTop: 2,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {t.type.split('/').pop()}
              </div>
            </div>
            <div className="col" style={{ alignItems: 'flex-end', flexShrink: 0 }}>
              <span className="mono" style={{ fontSize: 10.5, color: 'var(--color-accent)' }}>
                {t.hz} Hz
              </span>
              <span className="mono dim" style={{ fontSize: 9.5 }}>
                {t.msgs.toLocaleString()}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
