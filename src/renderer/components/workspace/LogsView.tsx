import { useState, type JSX } from 'react'
import { Icon } from '@renderer/components/Icon'
import { Input } from '@renderer/components/ui/Input'
import { useSessionStore } from '@renderer/stores/session'
import type { LogItem } from '@shared/types'

type SevFilter = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG'

const ALL_SEVERITIES: SevFilter[] = ['ERROR', 'WARN', 'INFO', 'DEBUG']

function sevColor(sev: LogItem['sev']): string {
  if (sev === 'ERROR') return 'var(--color-danger)'
  if (sev === 'WARN') return 'var(--color-warn)'
  if (sev === 'INFO') return 'var(--color-accent)'
  return 'var(--color-text-3)'
}

function sevPillClass(sev: SevFilter): string {
  if (sev === 'ERROR') return 'pill sm danger'
  if (sev === 'WARN') return 'pill sm warn'
  if (sev === 'INFO') return 'pill sm accent'
  return 'pill sm ghost'
}

function countBySev(logs: LogItem[], sev: SevFilter): number {
  return logs.filter((l) => l.sev === sev).length
}

export function LogsView(): JSX.Element {
  const logs = useSessionStore((s) => s.logs)
  const [active, setActive] = useState<Set<SevFilter>>(new Set(ALL_SEVERITIES))
  const [search, setSearch] = useState('')

  const toggleSev = (sev: SevFilter) => {
    setActive((prev) => {
      const next = new Set(prev)
      if (next.has(sev)) next.delete(sev)
      else next.add(sev)
      return next
    })
  }

  const filtered = logs.filter(
    (l) =>
      active.has(l.sev) &&
      (!search || l.text.toLowerCase().includes(search.toLowerCase()) ||
        l.node.toLowerCase().includes(search.toLowerCase())),
  )

  return (
    <div className="col flex1" style={{ minHeight: 0 }}>
      {/* Toolbar */}
      <div
        className="row gap-2"
        style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-border-1)' }}
      >
        <span className="section-h">Logs</span>
        <Input
          size="sm"
          placeholder="Semantic search in logs… e.g. 'planner abort'"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          leading={<Icon.Search size={12} />}
          trailing={
            <span className="dim mono" style={{ fontSize: 10 }}>⌘K</span>
          }
          style={{ minWidth: 280 }}
        />
        <div className="flex1" />
        <div className="row gap-1">
          {ALL_SEVERITIES.map((sev) => (
            <button
              key={sev}
              className={`${sevPillClass(sev)}${active.has(sev) ? '' : ' ghost'}`}
              style={{ cursor: 'pointer', opacity: active.has(sev) ? 1 : 0.45 }}
              onClick={() => toggleSev(sev)}
            >
              {active.has(sev) && sev !== 'DEBUG' && <span className="swatch" />}
              {sev} ·{countBySev(logs, sev)}
            </button>
          ))}
        </div>
      </div>

      {/* Log table */}
      <div className="flex1" style={{ overflow: 'auto' }}>
        <table
          className="mono"
          style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}
        >
          <thead>
            <tr
              style={{
                background: 'var(--color-bg-1)',
                position: 'sticky',
                top: 0,
                zIndex: 1,
              }}
            >
              {['Timestamp', 'Severity', 'Node', 'Message'].map((h, i) => (
                <th
                  key={i}
                  style={{
                    textAlign: 'left',
                    padding: '8px 12px',
                    fontSize: 10.5,
                    fontWeight: 600,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: 'var(--color-text-3)',
                    borderBottom: '1px solid var(--color-border-1)',
                    fontFamily: 'var(--font-ui)',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  style={{
                    padding: '24px 12px',
                    textAlign: 'center',
                    color: 'var(--color-text-3)',
                    fontFamily: 'var(--font-ui)',
                  }}
                >
                  {logs.length === 0 ? 'No session loaded' : 'No matching log entries'}
                </td>
              </tr>
            )}
            {filtered.map((l, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--color-border-1)' }}>
                <td style={{ padding: '7px 12px', color: 'var(--color-text-3)', whiteSpace: 'nowrap' }}>
                  {l.t}
                </td>
                <td style={{ padding: '7px 12px', whiteSpace: 'nowrap' }}>
                  <span
                    style={{
                      color: sevColor(l.sev),
                      fontWeight: 600,
                      fontSize: 11,
                    }}
                  >
                    {l.sev.padEnd(5, ' ')}
                  </span>
                </td>
                <td style={{ padding: '7px 12px', color: 'var(--color-accent)', whiteSpace: 'nowrap' }}>
                  {l.node}
                </td>
                <td style={{ padding: '7px 12px', color: 'var(--color-text-1)' }}>
                  {l.text}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
