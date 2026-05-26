import { useEffect, useState, type JSX } from 'react'
import { Setup } from './screens/Setup'
import type { DockerStatus } from '@shared/ipc'
import {
  Sun,
  Moon,
  MessageSquare,
  LayoutGrid,
  Search,
  PlayCircle,
  Cpu,
  Settings as SettingsIcon,
  Upload,
  FolderOpen
} from 'lucide-react'

export function App(): JSX.Element {
  const [dockerStatus, setDockerStatus] = useState<DockerStatus>({ state: 'pending' })
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [platform, setPlatform] = useState<string>('darwin')
  const [version, setVersion] = useState<string>('0.1.0')
  const [bagPath, setBagPath] = useState<string | null>(null)

  // Get initial values and subscribe to Docker status changes
  useEffect(() => {
    if (!window.datapilot) return

    // App info
    void window.datapilot.app.platform().then(setPlatform)
    void window.datapilot.app.version().then(setVersion)

    // Initial Docker status
    void window.datapilot.docker.status().then(setDockerStatus)

    // Initial Theme
    void window.datapilot.theme.get().then((t) => {
      const activeTheme = t === 'system' ? 'dark' : t
      setTheme(activeTheme)
      document.documentElement.setAttribute('data-theme', activeTheme)
    })

    // Listen to changes
    const unsubscribe = window.datapilot.docker.onStatusChanged((status) => {
      setDockerStatus(status)
    })

    return () => {
      unsubscribe()
    }
  }, [])

  const handleRetry = () => {
    if (window.datapilot) {
      setDockerStatus({ state: 'pending' })
      void window.datapilot.docker.retry()
    }
  }

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark'
    setTheme(nextTheme)
    document.documentElement.setAttribute('data-theme', nextTheme)
    if (window.datapilot) {
      void window.datapilot.theme.set(nextTheme)
    }
  }

  const pickBagFile = async () => {
    if (window.datapilot) {
      const file = await window.datapilot.file.pickBag()
      if (file) {
        setBagPath(file)
      }
    }
  }

  // Render Setup screen on pending/error
  if (dockerStatus.state !== 'ready') {
    return <Setup status={dockerStatus} onRetry={handleRetry} />
  }

  // Ready State: Main Dashboard
  return (
    <div className="window fade-in">
      {/* Title bar */}
      <div className="titlebar">
        {platform === 'darwin' ? (
          <div style={{ width: 72, height: 12 }} />
        ) : (
          <div className="traffic">
            <span className="dot red" />
            <span className="dot yellow" />
            <span className="dot green" />
          </div>
        )}
        <div className="title">
          {bagPath ? (
            <span>
              <b>DataPilot</b> · {bagPath.split('/').pop() || bagPath} — Loaded session
            </span>
          ) : (
            <span>
              <b>DataPilot</b> · No active session — Load a bag to begin
            </span>
          )}
        </div>
        <div className="titlebar-actions">
          <button
            className="btn ghost icon sm"
            onClick={toggleTheme}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          >
            {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
          </button>
          <span className="pill sm ghost mono">v{version}</span>
          <span className="pill sm ok">
            <span className="swatch" />
            local stack
          </span>
        </div>
      </div>

      {/* Main Body */}
      <div className="body">
        {/* Navigation Rail */}
        <div className="rail">
          <div className="rail-logo">D</div>
          <button className="rail-btn active" title="Copilot">
            <MessageSquare size={18} />
          </button>
          <button className="rail-btn" title="Fleet">
            <LayoutGrid size={18} />
          </button>
          <button className="rail-btn" title="Search">
            <Search size={18} />
          </button>
          <button className="rail-btn" title="Replay">
            <PlayCircle size={18} />
          </button>
          <div className="rail-spacer" />
          <button className="rail-btn" title="Agents & MCP">
            <Cpu size={18} />
          </button>
          <button className="rail-btn" title="Settings">
            <SettingsIcon size={18} />
          </button>
        </div>

        {/* Dashboard Placeholder */}
        <div className="flex1 flex flex-col items-center justify-center p-8 bg-bg-0 text-center gap-6">
          <div className="w-16 h-16 rounded-2xl bg-accent-bg border border-accent/20 flex items-center justify-center text-accent">
            <FolderOpen size={32} />
          </div>
          <div className="flex flex-col gap-2 max-w-md">
            <h2 className="text-xl font-semibold text-text-0">Local Environment Active</h2>
            <p className="text-sm text-text-2">
              The SQLite database, Neo4j knowledge graph, FastAPI engine, and all 5 worker daemons are connected and ready to process bags.
            </p>
          </div>
          <div className="flex gap-4 mt-2">
            <button onClick={pickBagFile} className="btn primary row gap-2 h-9 px-4">
              <Upload size={14} />
              <span>Load ROS bag</span>
            </button>
            <button
              onClick={() => setBagPath('/sample_bags/lidar_failure.mcap')}
              className="btn ghost border-border-1 row gap-2 h-9 px-4"
            >
              <span>Load demo bag</span>
            </button>
          </div>

          {bagPath && (
            <div className="mt-8 px-4 py-3 rounded-lg bg-bg-1 border border-border-1 max-w-xl w-full text-left row gap-3">
              <div className="w-2 h-2 rounded-full bg-ok pulse" />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-text-3 font-semibold uppercase tracking-wider">Loaded File</div>
                <div className="text-sm text-text-1 truncate mono font-medium">{bagPath}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
