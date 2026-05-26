import { useEffect, useState, type JSX } from 'react'
import { Setup } from './screens/Setup'
import { DesignSystem } from './screens/DesignSystem'
import { Icon } from './components/Icon'
import { useTheme } from './hooks/useTheme'
import { WindowChrome, Titlebar, Traffic, Rail, RailButton } from './components/chrome'
import { Button, Pill } from './components/ui'
import type { DockerStatus } from '@shared/ipc'

/** Cross-platform basename — splits on `/` and `\` so Windows paths render
 *  the filename (not the full absolute path) in the title bar. */
function basename(p: string): string {
  const parts = p.split(/[/\\]/)
  return parts[parts.length - 1] || p
}

type ScreenName = 'main' | 'design-system'

export function App(): JSX.Element {
  const [dockerStatus, setDockerStatus] = useState<DockerStatus>({ state: 'pending' })
  const [version, setVersion] = useState<string>('0.1.0')
  const [bagPath, setBagPath] = useState<string | null>(null)
  // Transient local screen state — replaced by zustand useUIStore in Phase 6.
  // Only `design-system` is reachable today, via ⌘⇧D below.
  const [screen, setScreen] = useState<ScreenName>('main')

  const { theme, toggle: toggleTheme } = useTheme()

  // Initial Docker status + version + subscribe to status changes.
  useEffect(() => {
    if (!window.datapilot) return
    void window.datapilot.app.version().then(setVersion)
    void window.datapilot.docker.status().then(setDockerStatus)
    const unsubscribe = window.datapilot.docker.onStatusChanged(setDockerStatus)
    return () => unsubscribe()
  }, [])

  // Dev-only ⌘⇧D / Ctrl+Shift+D toggles the DesignSystem gallery.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.shiftKey && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault()
        setScreen((s) => (s === 'design-system' ? 'main' : 'design-system'))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (import.meta.env.DEV && screen === 'design-system') {
    return <DesignSystem onExit={() => setScreen('main')} />
  }

  const handleRetry = () => {
    if (!window.datapilot) return
    setDockerStatus({ state: 'pending' })
    void window.datapilot.docker.retry()
  }

  const pickBagFile = async () => {
    if (!window.datapilot) return
    const file = await window.datapilot.file.pickBag()
    if (file) setBagPath(file)
  }

  // Render Setup screen on pending / error states.
  if (dockerStatus.state !== 'ready') {
    return (
      <WindowChrome className="fade-in">
        <Titlebar
          left={<Traffic />}
          center={
            <span>
              <b>DataPilot</b> · Setup
            </span>
          }
          right={
            <>
              <Button
                variant="ghost"
                size="sm"
                icon
                onClick={toggleTheme}
                title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
              >
                {theme === 'dark' ? <Icon.Sun size={13} /> : <Icon.Moon size={13} />}
              </Button>
              <Pill size="sm" tone="ghost" mono>
                v{version}
              </Pill>
            </>
          }
        />
        <div className="body">
          <Setup status={dockerStatus} onRetry={handleRetry} />
        </div>
      </WindowChrome>
    )
  }

  // Ready: main dashboard placeholder. Real Copilot Workspace lands in Phase 6.
  return (
    <WindowChrome className="fade-in">
      <Titlebar
        left={<Traffic />}
        center={
          bagPath ? (
            <span><b>DataPilot</b> · {basename(bagPath)} — Loaded session</span>
          ) : (
            <span><b>DataPilot</b> · No active session — Load a bag to begin</span>
          )
        }
        right={
          <>
            <Button
              variant="ghost"
              size="sm"
              icon
              onClick={toggleTheme}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            >
              {theme === 'dark' ? <Icon.Sun size={13} /> : <Icon.Moon size={13} />}
            </Button>
            <Pill size="sm" tone="ghost" mono>v{version}</Pill>
            <Pill size="sm" tone="ok" swatch>local stack</Pill>
          </>
        }
      />

      <div className="body">
        <Rail>
          <RailButton icon={<Icon.Chat size={18} />} label="Copilot" active />
          <RailButton icon={<Icon.Fleet size={18} />} label="Fleet" />
          <RailButton icon={<Icon.Search size={18} />} label="Search" />
          <RailButton icon={<Icon.Replay size={18} />} label="Replay" />
          <div className="rail-spacer" />
          <RailButton icon={<Icon.Bot size={18} />} label="Agents & MCP" />
          <RailButton icon={<Icon.Settings size={18} />} label="Settings" />
        </Rail>

        <div
          className="flex1"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 32,
            background: 'var(--color-bg-0)',
            textAlign: 'center',
            gap: 24,
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: 'var(--color-accent-bg)',
              border: '1px solid oklch(0.50 0.12 235 / 0.4)',
              display: 'grid',
              placeItems: 'center',
              color: 'var(--color-accent)',
            }}
          >
            <Icon.File size={32} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 480 }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: 'var(--color-text-0)' }}>
              Local environment active
            </h2>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-2)' }}>
              The SQLite database, Neo4j knowledge graph, FastAPI engine, and 5 MCP workers are
              connected and ready to ingest bags.
            </p>
          </div>

          <div className="row gap-3" style={{ marginTop: 8 }}>
            <Button variant="primary" onClick={pickBagFile}>
              <Icon.Upload size={14} /> Load ROS bag
            </Button>
            <Button onClick={() => setBagPath('/sample_bags/lidar_failure.mcap')}>
              Load demo bag
            </Button>
          </div>

          {bagPath && (
            <div
              className="row gap-3"
              style={{
                marginTop: 16,
                padding: '12px 16px',
                borderRadius: 8,
                background: 'var(--color-bg-1)',
                border: '1px solid var(--color-border-1)',
                maxWidth: 560,
                width: '100%',
                textAlign: 'left',
              }}
            >
              <span
                aria-hidden
                className="pulse"
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 50,
                  background: 'var(--color-ok)',
                  boxShadow: '0 0 8px var(--color-ok)',
                  flexShrink: 0,
                }}
              />
              <div className="flex1" style={{ minWidth: 0 }}>
                <div className="section-h" style={{ marginBottom: 2 }}>Loaded file</div>
                <div
                  className="mono"
                  style={{
                    fontSize: 13,
                    color: 'var(--color-text-1)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={bagPath}
                >
                  {bagPath}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </WindowChrome>
  )
}
