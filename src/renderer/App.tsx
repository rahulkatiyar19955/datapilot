import { useEffect, useState, type JSX } from 'react'
import { Setup } from './screens/Setup'
import { DesignSystem } from './screens/DesignSystem'
import { Copilot } from './screens/Copilot'
import { Icon } from './components/Icon'
import { useTheme } from './hooks/useTheme'
import { useGlobalShortcut } from './hooks/useGlobalShortcut'
import { useUIStore } from './stores/ui'
import { useSessionStore } from './stores/session'
import { WindowChrome, Titlebar, Traffic, Rail, RailButton } from './components/chrome'
import { Button, Pill } from './components/ui'
import type { DockerStatus } from '@shared/ipc'

/** Cross-platform basename — splits on `/` and `\` so Windows paths render
 *  the filename (not the full absolute path) in the title bar. */
function basename(p: string): string {
  const parts = p.split(/[/\\]/)
  return parts[parts.length - 1] || p
}

export function App(): JSX.Element {
  const [dockerStatus, setDockerStatus] = useState<DockerStatus>({ state: 'pending' })
  const [version, setVersion] = useState<string>('0.1.0')
  const [bagPath, setBagPath] = useState<string | null>(null)
  const [devScreen, setDevScreen] = useState<'main' | 'design-system'>('main')

  const { theme, toggle: toggleTheme } = useTheme()
  const { screen, setScreen, searchOpen, setSearchOpen } = useUIStore()
  const { meta: sessionMeta, setPendingPath } = useSessionStore()

  useGlobalShortcut()

  // Initial Docker status + version + subscribe to status changes.
  useEffect(() => {
    if (!window.datapilot) return
    void window.datapilot.app.version().then(setVersion)
    void window.datapilot.docker.status().then(setDockerStatus)
    const unsubscribe = window.datapilot.docker.onStatusChanged(setDockerStatus)
    return () => unsubscribe()
  }, [])

  // Global drag-and-drop listener for MCAP/bag files
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
    }

    const handleDrop = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()

      const files = e.dataTransfer?.files
      if (files && files.length > 0) {
        const file = files[0]
        if (file.name.endsWith('.bag') || file.name.endsWith('.mcap') || file.name.endsWith('.db3')) {
          // Electron attaches the local absolute filesystem path to dropped files
          const path = (file as any).path
          if (path) {
            setBagPath(path)
            setPendingPath(path)
            setScreen('copilot')
          }
        }
      }
    }

    window.addEventListener('dragover', handleDragOver)
    window.addEventListener('drop', handleDrop)
    return () => {
      window.removeEventListener('dragover', handleDragOver)
      window.removeEventListener('drop', handleDrop)
    }
  }, [setPendingPath, setScreen])

  // Dev-only ⌘⇧D / Ctrl+Shift+D toggles the DesignSystem gallery.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.shiftKey && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault()
        setDevScreen((s) => (s === 'design-system' ? 'main' : 'design-system'))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (import.meta.env.DEV && devScreen === 'design-system') {
    return <DesignSystem onExit={() => setDevScreen('main')} />
  }

  const handleRetry = () => {
    if (!window.datapilot) return
    setDockerStatus({ state: 'pending' })
    void window.datapilot.docker.retry()
  }

  const pickBagFile = async () => {
    if (!window.datapilot) return
    const file = await window.datapilot.file.pickBag()
    if (file) {
      setBagPath(file)
      setPendingPath(file)
      setScreen('copilot')
    }
  }

  const titleContent = sessionMeta ? (
    <span>
      <b>DataPilot</b> · {basename(sessionMeta.filename)} — {sessionMeta.robot}
    </span>
  ) : bagPath ? (
    <span>
      <b>DataPilot</b> · {basename(bagPath)} — Loading…
    </span>
  ) : (
    <span>
      <b>DataPilot</b> · No active session — Load a bag to begin
    </span>
  )

  const themeButton = (
    <Button
      variant="ghost"
      size="sm"
      icon
      onClick={toggleTheme}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
    >
      {theme === 'dark' ? <Icon.Sun size={13} /> : <Icon.Moon size={13} />}
    </Button>
  )

  // Render Setup screen on pending / error states.
  if (dockerStatus.state !== 'ready') {
    return (
      <WindowChrome className="fade-in">
        <Titlebar
          left={<Traffic />}
          center={<span><b>DataPilot</b> · Setup</span>}
          right={
            <>
              {themeButton}
              <Pill size="sm" tone="ghost" mono>v{version}</Pill>
            </>
          }
        />
        <div className="body">
          <Setup status={dockerStatus} onRetry={handleRetry} />
        </div>
      </WindowChrome>
    )
  }

  // Ready: render active screen.
  return (
    <WindowChrome className="fade-in">
      <Titlebar
        left={<Traffic />}
        center={titleContent}
        right={
          <>
            {themeButton}
            <Pill size="sm" tone="ghost" mono>v{version}</Pill>
            <Pill size="sm" tone="ok" swatch>local stack</Pill>
          </>
        }
      />

      <div className="body">
        <Rail>
          <RailButton
            icon={<Icon.Chat size={18} />}
            label="Copilot"
            active={screen === 'copilot'}
            onClick={() => setScreen('copilot')}
          />
          <RailButton
            icon={<Icon.Fleet size={18} />}
            label="Fleet"
            active={screen === 'fleet'}
            onClick={() => setScreen('fleet')}
          />
          <RailButton
            icon={<Icon.Search size={18} />}
            label="Search"
            active={searchOpen}
            onClick={() => setSearchOpen(true)}
          />
          <RailButton
            icon={<Icon.Replay size={18} />}
            label="Replay"
            active={screen === 'replay'}
            onClick={() => setScreen('replay')}
          />
          <div className="rail-spacer" />
          <RailButton
            icon={<Icon.Bot size={18} />}
            label="Agents & MCP"
            active={screen === 'agents'}
            onClick={() => setScreen('agents')}
          />
          <RailButton
            icon={<Icon.Settings size={18} />}
            label="Settings"
            active={screen === 'settings'}
            onClick={() => setScreen('settings')}
          />
        </Rail>

        {/* Copilot screen (includes CopilotPanel + Workspace) */}
        {screen === 'copilot' && <Copilot />}

        {/* Phase 7–11 screens: placeholder panels */}
        {(screen === 'fleet' || screen === 'replay' || screen === 'agents' || screen === 'settings') && (
          <div
            className="flex1 col"
            style={{
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-text-3)',
              fontSize: 13,
              gap: 8,
            }}
          >
            <Icon.Settings size={24} />
            <span>
              {screen === 'fleet' && 'Fleet Dashboard — Phase 7'}
              {screen === 'replay' && 'Replay — Phase 8'}
              {screen === 'agents' && 'Agents & MCP — Phase 9'}
              {screen === 'settings' && 'Settings — Phase 11'}
            </span>
          </div>
        )}

        {/* No-session overlay: shown in workspace area when copilot is active but no bag loaded */}
        {screen === 'copilot' && !bagPath && (
          <div
            style={{
              position: 'absolute',
              left: 56 + 420,
              right: 0,
              top: 0,
              bottom: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 24,
              background: 'var(--color-bg-0)',
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 480, textAlign: 'center' }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: 'var(--color-text-0)' }}>
                Load a ROS bag to begin
              </h2>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-2)' }}>
                The AI agent stack is ready. Use the Copilot panel or load a bag here.
              </p>
            </div>
            <div className="row gap-3">
              <Button variant="primary" onClick={pickBagFile}>
                <Icon.Upload size={14} /> Load ROS bag
              </Button>
              <Button onClick={() => {
                const demo = '/sample_bags/lidar_failure.mcap'
                setBagPath(demo)
                setPendingPath(demo)
              }}>
                Load demo bag
              </Button>
            </div>
          </div>
        )}

        {/* Search overlay placeholder */}
        {searchOpen && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 50,
              background: 'oklch(0.08 0.01 240 / 0.65)',
              backdropFilter: 'blur(8px)',
              display: 'flex',
              flexDirection: 'column',
              padding: '60px 80px',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-text-0)',
            }}
            onClick={() => setSearchOpen(false)}
          >
            <div
              className="panel"
              style={{
                padding: '24px 32px',
                maxWidth: 400,
                textAlign: 'center',
                boxShadow: '0 20px 40px -15px oklch(0 0 0 / 0.7)',
                borderColor: 'var(--color-border-2)',
                background: 'var(--color-bg-1)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  background: 'var(--color-accent-bg)',
                  display: 'grid',
                  placeItems: 'center',
                  color: 'var(--color-accent)',
                  margin: '0 auto 16px',
                  border: '1px solid oklch(0.50 0.12 235 / 0.3)',
                }}
              >
                <Icon.Search size={22} />
              </div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Semantic Search</h3>
              <p style={{ fontSize: 12, color: 'var(--color-text-2)', margin: '8px 0 20px', lineHeight: 1.4 }}>
                Search past runs in natural language. This feature is coming in Phase 10. You can also trigger it using the <code className="mono" style={{ background: 'var(--color-bg-2)', padding: '2px 4px', borderRadius: 4 }}>⌘K</code> shortcut.
              </p>
              <Button size="sm" onClick={() => setSearchOpen(false)}>
                Dismiss
              </Button>
            </div>
          </div>
        )}
      </div>
    </WindowChrome>
  )
}
