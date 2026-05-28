import type { JSX } from 'react'
import { Icon } from '@renderer/components/Icon'
import { useSessionStore } from '@renderer/stores/session'

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function formatSize(totalMessages: number): string {
  if (totalMessages > 10000) return `${(totalMessages / 1000).toFixed(0)}K msgs`
  return `${totalMessages} msgs`
}

export function ContextChips(): JSX.Element | null {
  const { meta, clearSession, setPendingPath } = useSessionStore()

  if (!meta) return null

  const filename = meta.filename.split(/[/\\]/).pop() ?? meta.filename

  const handleClear = () => {
    clearSession()
    setPendingPath(null)
  }

  return (
    <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-border-1)', flexShrink: 0 }}>
      <div className="row gap-2" style={{ marginBottom: 6 }}>
        <span className="section-h">Context</span>
        <div className="flex1" />
        <button
          className="btn ghost sm"
          style={{ height: 20, padding: '0 6px', fontSize: 11 }}
          onClick={handleClear}
          title="Clear session"
        >
          <Icon.X size={11} /> Clear
        </button>
      </div>
      <div className="row gap-2" style={{ flexWrap: 'wrap' }}>
        {/* Bag pill */}
        <div className="pill" style={{ height: 26, padding: '0 4px 0 10px', gap: 8 }}>
          <Icon.File size={11} />
          <span className="mono" style={{ fontSize: 11 }}>{filename}</span>
          <span className="dim mono" style={{ fontSize: 10 }}>· {formatSize(meta.totalMessages)}</span>
          <button
            className="btn ghost icon sm"
            style={{ height: 18, width: 18 }}
            onClick={handleClear}
            title="Remove bag"
          >
            <Icon.X size={10} />
          </button>
        </div>

        {/* Robot pill */}
        <div className="pill accent">
          <span className="swatch" />
          {meta.robot}
        </div>

        {/* Duration/topics pill */}
        <div className="pill ghost mono" style={{ fontSize: 10.5 }}>
          {formatDuration(meta.durationSeconds)} duration · {meta.topicsCount} topics
        </div>
      </div>
    </div>
  )
}
