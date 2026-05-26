import { useEffect, useState, type JSX } from 'react'

/**
 * Phase 0 placeholder. The real Copilot Workspace lands in Phase 6.
 *
 * Renders centered "DataPilot — loading…" text with a pulsing accent dot,
 * plus a small build-info footer pulled over IPC so we can confirm the
 * preload bridge works end-to-end.
 */
export function App(): JSX.Element {
  const [version, setVersion] = useState<string>('—')
  const [platform, setPlatform] = useState<string>('—')

  useEffect(() => {
    if (!window.datapilot) return
    void window.datapilot.app.version().then(setVersion)
    void window.datapilot.app.platform().then(setPlatform)
  }, [])

  return (
    <div className="loading-shell">
      <div className="loading-card">
        <div className="loading-logo">D</div>
        <div className="loading-text">
          <span className="loading-brand">DataPilot</span>
          <span className="loading-dim"> — loading…</span>
          <span className="loading-caret" />
        </div>
        <div className="loading-meta">
          <span className="mono">v{version}</span>
          <span className="loading-sep">·</span>
          <span className="mono">{platform}</span>
          <span className="loading-sep">·</span>
          <span className="mono">phase 0 scaffold</span>
        </div>
      </div>
    </div>
  )
}
