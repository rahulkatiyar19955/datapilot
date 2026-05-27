import type { JSX } from 'react'
import { Icon } from '@renderer/components/Icon'
import { useUIStore } from '@renderer/stores/ui'
import { useSessionStore } from '@renderer/stores/session'
import { DataSourceBar } from './DataSourceBar'
import { TimelineView } from './TimelineView'
import { MetricView } from './MetricView'
import { MapView } from './MapView'
import { LogsView } from './LogsView'
import { KGraphView } from './KGraphView'
import { TopicsPanel } from './TopicsPanel'
import type { WorkspaceTab } from '@shared/types'

interface TabDef {
  id: WorkspaceTab
  label: string
  icon: JSX.Element
  count: number | null
}

export function Workspace(): JSX.Element {
  const { tab, setTab } = useUIStore()
  const { timeline, logs, kgraph } = useSessionStore()

  const TABS: TabDef[] = [
    { id: 'timeline', label: 'Timeline', icon: <Icon.Clock size={13} />, count: timeline.length || null },
    { id: 'metrics', label: 'Metrics', icon: <Icon.Activity size={13} />, count: 4 },
    { id: 'map', label: 'Map', icon: <Icon.Map size={13} />, count: null },
    { id: 'logs', label: 'Logs', icon: <Icon.Terminal size={13} />, count: logs.length || null },
    { id: 'kgraph', label: 'Knowledge Graph', icon: <Icon.Graph size={13} />, count: kgraph?.nodes.length ?? null },
  ]

  return (
    <div className="flex1 col" style={{ minWidth: 0 }}>
      {/* Data source bar */}
      <DataSourceBar />

      {/* Tab bar */}
      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`tab${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.icon}
            {t.label}
            {t.count != null && <span className="count">{t.count}</span>}
          </button>
        ))}
        <div className="flex1" />
        <button className="tab" style={{ color: 'var(--color-text-3)' }} title="Add tab (not available)">
          <Icon.Plus size={13} />
        </button>
      </div>

      {/* Tab body + topics rail */}
      <div
        className="flex1"
        style={{ minHeight: 0, display: 'flex', flexDirection: 'row', alignItems: 'stretch' }}
      >
        <div className="flex1 col" style={{ minWidth: 0 }}>
          {tab === 'timeline' && <TimelineView />}
          {tab === 'metrics' && <MetricView />}
          {tab === 'map' && <MapView />}
          {tab === 'logs' && <LogsView />}
          {tab === 'kgraph' && <KGraphView />}
        </div>
        <TopicsPanel />
      </div>
    </div>
  )
}
