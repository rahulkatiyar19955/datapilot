import { useState, type JSX, type ReactNode } from 'react'
import { Icon } from '@renderer/components/Icon'
import { Toggle } from '@renderer/components/ui'
import { useTheme } from '@renderer/hooks/useTheme'
import type { Theme } from '@renderer/hooks/useTheme'

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

interface Provider {
  id: string
  name: string
  models: string[]
  keyHint: string
  endpoint: string
  color: string
}

const PROVIDERS: Provider[] = [
  { id: 'anthropic', name: 'Claude (Anthropic)',        models: ['claude-opus-4', 'claude-sonnet-4.5', 'claude-haiku-4.5'], keyHint: 'sk-ant-…',  endpoint: 'https://api.anthropic.com',                  color: 'oklch(0.65 0.14 30)' },
  { id: 'openai',    name: 'OpenAI',                   models: ['gpt-5', 'gpt-5-mini', 'gpt-4.1'],                         keyHint: 'sk-…',      endpoint: 'https://api.openai.com/v1',                  color: 'oklch(0.65 0.14 150)' },
  { id: 'google',    name: 'Gemini (Google)',           models: ['gemini-2.5-pro', 'gemini-2.5-flash'],                     keyHint: 'AIza…',     endpoint: 'https://generativelanguage.googleapis.com',  color: 'oklch(0.65 0.14 240)' },
  { id: 'ollama',    name: 'Ollama (local)',            models: ['llama-3.3-70b', 'qwen-2.5-coder-32b'],                    keyHint: '— none —',  endpoint: 'http://localhost:11434',                     color: 'oklch(0.65 0.14 300)' },
  { id: 'custom',    name: 'Custom (OpenAI-compatible)', models: [],                                                         keyHint: 'sk-…',      endpoint: 'https://…',                                  color: 'oklch(0.65 0.05 240)' },
]

const SECTIONS = [
  { id: 'general',   label: 'General',           icon: <Icon.Settings size={14} /> },
  { id: 'models',    label: 'Models & API Keys',  icon: <Icon.Key size={14} /> },
  { id: 'docker',    label: 'Docker & Runtime',   icon: <Icon.Box size={14} /> },
  { id: 'storage',   label: 'Storage & Data',     icon: <Icon.Database size={14} /> },
  { id: 'shortcuts', label: 'Shortcuts',          icon: <Icon.Code size={14} /> },
  { id: 'about',     label: 'About',              icon: <Icon.Sparkles size={14} /> },
] as const

type SectionId = (typeof SECTIONS)[number]['id']

// ---------------------------------------------------------------------------
// Shared field primitives
// ---------------------------------------------------------------------------

interface FieldInputProps {
  label?: string
  placeholder?: string
  value?: string
  mono?: boolean
  type?: string
  onChange?: (v: string) => void
  hint?: string
  after?: ReactNode
}

function FieldInput({
  label,
  placeholder,
  value,
  mono,
  type = 'text',
  onChange,
  hint,
  after,
}: FieldInputProps): JSX.Element {
  return (
    <div className="col" style={{ gap: 6 }}>
      {label && (
        <label style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--color-text-2)' }}>
          {label}
        </label>
      )}
      <div className="input" style={{ height: 32 }}>
        <input
          type={type}
          placeholder={placeholder}
          defaultValue={value}
          onChange={(e) => onChange?.(e.target.value)}
          style={{
            fontFamily: mono ? 'var(--font-mono)' : 'inherit',
            fontSize: mono ? 12 : 13,
          }}
        />
        {after}
      </div>
      {hint && <span className="dim" style={{ fontSize: 11 }}>{hint}</span>}
    </div>
  )
}

interface FieldSelectProps {
  label: string
  options: readonly string[]
  value?: string
  hint?: string
}

function FieldSelect({ label, options, value, hint }: FieldSelectProps): JSX.Element {
  return (
    <div className="col" style={{ gap: 6 }}>
      <label style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--color-text-2)' }}>
        {label}
      </label>
      <div className="input" style={{ height: 32 }}>
        <select
          defaultValue={value ?? options[0]}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--color-text-1)',
            font: 'inherit',
          }}
        >
          {options.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      </div>
      {hint && <span className="dim" style={{ fontSize: 11 }}>{hint}</span>}
    </div>
  )
}

function SectionCard({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: ReactNode
}): JSX.Element {
  return (
    <div className="card" style={{ padding: 18, marginBottom: 18 }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-0)' }}>{title}</div>
        {hint && (
          <div className="dim" style={{ fontSize: 11.5, marginTop: 3 }}>
            {hint}
          </div>
        )}
      </div>
      {children}
    </div>
  )
}

function Row({
  label,
  hint,
  children,
  align = 'center',
}: {
  label: string
  hint?: string
  children: ReactNode
  align?: string
}): JSX.Element {
  return (
    <div
      className="row"
      style={{
        gap: 16,
        padding: '12px 0',
        borderTop: '1px solid var(--color-border-1)',
        alignItems: align,
      }}
    >
      <div style={{ flex: '0 0 220px' }}>
        <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--color-text-1)' }}>{label}</div>
        {hint && (
          <div className="dim" style={{ fontSize: 11, marginTop: 3, lineHeight: 1.4 }}>
            {hint}
          </div>
        )}
      </div>
      <div className="flex1">{children}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// KeyInput — API key card with reveal/copy
// ---------------------------------------------------------------------------

function KeyInput({
  provider,
  value,
  onChange,
  isDefault,
  onSetDefault,
  status,
}: {
  provider: Provider
  value: string
  onChange: (v: string) => void
  isDefault: boolean
  onSetDefault: () => void
  status: 'connected' | 'not_set' | 'error'
}): JSX.Element {
  const [reveal, setReveal] = useState(false)
  return (
    <div className="card" style={{ padding: 14, marginBottom: 10 }}>
      <div className="row gap-3" style={{ marginBottom: 12 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 6,
            background: 'var(--color-bg-3)',
            color: provider.color,
            display: 'grid',
            placeItems: 'center',
            flexShrink: 0,
          }}
        >
          <Icon.Sparkles size={15} />
        </div>
        <div className="flex1">
          <div className="row gap-2">
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-0)' }}>
              {provider.name}
            </span>
            {status === 'connected' && (
              <span className="pill sm ok">
                <span className="swatch" />connected
              </span>
            )}
            {status === 'not_set' && <span className="pill sm ghost">no key</span>}
            {status === 'error' && (
              <span className="pill sm danger">
                <span className="swatch" />401 unauthorized
              </span>
            )}
            {isDefault && (
              <span className="pill sm accent">
                <span className="swatch" />default
              </span>
            )}
          </div>
          <div className="mono dim" style={{ fontSize: 10.5, marginTop: 2 }}>
            {provider.endpoint}
          </div>
        </div>
        <button className="btn ghost sm" onClick={onSetDefault} disabled={isDefault}>
          {isDefault ? 'Default' : 'Set default'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 10 }}>
        <FieldInput
          label="API key"
          mono
          placeholder={provider.keyHint}
          value={value}
          type={reveal ? 'text' : 'password'}
          onChange={onChange}
          after={
            <div className="row gap-1">
              <button
                className="btn ghost icon sm"
                onClick={() => setReveal((r) => !r)}
                title={reveal ? 'Hide' : 'Reveal'}
                style={{ height: 22, width: 22 }}
              >
                {reveal ? <Icon.EyeOff size={12} /> : <Icon.Eye size={12} />}
              </button>
              <button className="btn ghost icon sm" title="Copy" style={{ height: 22, width: 22 }}>
                <Icon.Copy size={12} />
              </button>
            </div>
          }
        />
        {provider.models.length > 0 ? (
          <FieldSelect label="Default model" options={provider.models} />
        ) : (
          <FieldInput label="Custom endpoint" mono placeholder="https://api.example.com/v1" />
        )}
      </div>

      <div className="row gap-2" style={{ marginTop: 10 }}>
        <button className="btn ghost sm">
          <Icon.Refresh size={11} />
          Test
        </button>
        {provider.models.length > 0 && (
          <button className="btn ghost sm">
            <Icon.Download size={11} />
            Refresh models
          </button>
        )}
        <div className="flex1" />
        <button className="btn ghost sm" style={{ color: 'var(--color-danger)' }}>
          <Icon.Trash size={11} />
          Remove
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section views
// ---------------------------------------------------------------------------

const ACCENT_PRESETS = [
  { color: 'oklch(0.74 0.17 235)', label: 'Electric' },
  { color: 'oklch(0.78 0.17 150)', label: 'Lime' },
  { color: 'oklch(0.70 0.18 330)', label: 'Magenta' },
  { color: 'oklch(0.80 0.15 80)',  label: 'Amber' },
  { color: 'oklch(0.70 0.20 25)',  label: 'Crimson' },
]

function GeneralSection({
  theme,
  setTheme,
}: {
  theme: Theme
  setTheme: (t: Theme) => void
}): JSX.Element {
  const [monoFreq, setMonoFreq] = useState(true)
  const [telemetryUsage, setTelemetryUsage] = useState(false)
  const [telemetryCrash, setTelemetryCrash] = useState(true)

  const handleThemeClick = (key: string) => {
    if (key === 'system') {
      // Read OS preference and apply it
      const prefersDark = !window.matchMedia?.('(prefers-color-scheme: light)').matches
      setTheme(prefersDark ? 'dark' : 'light')
    } else {
      setTheme(key as Theme)
    }
  }

  return (
    <>
      <SectionCard title="Appearance" hint="UI theme and density.">
        <Row label="Theme" hint="Switch between dark and light. Synced across all windows.">
          <div className="row gap-2">
            {(
              [
                ['dark',   'Dark',         <Icon.Moon size={13} />],
                ['light',  'Light',        <Icon.Sun size={13} />],
                ['system', 'Match system', <Icon.Globe size={13} />],
              ] as [string, string, JSX.Element][]
            ).map(([k, l, icon]) => (
              <button
                key={k}
                className={`btn sm ${theme === k ? 'primary' : ''}`}
                onClick={() => handleThemeClick(k)}
              >
                {icon}
                {l}
              </button>
            ))}
          </div>
        </Row>
        <Row label="Accent color" hint="Used for highlights, links, and the AI-active state.">
          <div className="row gap-2" style={{ flexWrap: 'wrap' }}>
            {ACCENT_PRESETS.map(({ color, label }) => (
              <button
                key={label}
                className="card"
                style={{
                  padding: '4px 10px 4px 4px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  cursor: 'pointer',
                  borderColor: label === 'Electric' ? 'var(--color-accent)' : 'var(--color-border-1)',
                }}
              >
                <span style={{ width: 22, height: 22, borderRadius: 4, background: color, display: 'block' }} />
                <span style={{ fontSize: 11.5 }}>{label}</span>
              </button>
            ))}
          </div>
        </Row>
        <Row label="UI density">
          <div className="row gap-2">
            {['Compact', 'Comfortable', 'Spacious'].map((d) => (
              <button key={d} className={`btn sm ${d === 'Comfortable' ? 'primary' : ''}`}>
                {d}
              </button>
            ))}
          </div>
        </Row>
        <Row
          label="Show topic frequencies in mono"
          hint="Render Hz / latency / counters in JetBrains Mono."
        >
          <Toggle on={monoFreq} onChange={setMonoFreq} label="Mono frequencies" />
        </Row>
      </SectionCard>

      <SectionCard
        title="Telemetry"
        hint="DataPilot runs entirely on your machine. Nothing leaves unless you turn this on."
      >
        <Row label="Anonymous usage stats">
          <Toggle on={telemetryUsage} onChange={setTelemetryUsage} label="Anonymous usage stats" />
        </Row>
        <Row label="Crash reports">
          <Toggle on={telemetryCrash} onChange={setTelemetryCrash} label="Crash reports" />
        </Row>
      </SectionCard>
    </>
  )
}

function ModelsSection(): JSX.Element {
  const [keys, setKeys] = useState<Record<string, string>>({
    anthropic: 'sk-ant-api03-************************************',
    openai:    'sk-proj-************************************',
    google:    '',
    ollama:    '',
    custom:    '',
  })
  const [defaultProvider, setDefaultProvider] = useState('anthropic')

  const statusFor = (id: string): 'connected' | 'not_set' | 'error' => {
    if (id === 'ollama') return 'connected'
    if (!keys[id]) return 'not_set'
    if (id === 'google') return 'error'
    return 'connected'
  }

  return (
    <>
      <SectionCard title="Default" hint="The model used when no agent overrides it.">
        <Row label="Default provider · model">
          <div className="row gap-2">
            <FieldSelect
              label=""
              options={PROVIDERS.filter((p) => keys[p.id] || p.id === 'ollama').map((p) => p.name)}
              value="Claude (Anthropic)"
            />
            <FieldSelect
              label=""
              options={['claude-sonnet-4.5', 'claude-opus-4', 'claude-haiku-4.5']}
              value="claude-sonnet-4.5"
            />
          </div>
        </Row>
        <Row label="Embedding model" hint="Used for semantic search across bags.">
          <FieldSelect
            label=""
            options={[
              'text-embedding-3-large (OpenAI)',
              'voyage-3 (Anthropic)',
              'nomic-embed-text (local)',
            ]}
            value="voyage-3 (Anthropic)"
          />
        </Row>
      </SectionCard>

      <SectionCard
        title="API keys"
        hint="Stored encrypted in your OS keychain. Never sent to DataPilot servers."
      >
        {PROVIDERS.map((p) => (
          <KeyInput
            key={p.id}
            provider={p}
            value={keys[p.id] ?? ''}
            isDefault={defaultProvider === p.id}
            onSetDefault={() => setDefaultProvider(p.id)}
            onChange={(v) => setKeys((prev) => ({ ...prev, [p.id]: v }))}
            status={statusFor(p.id)}
          />
        ))}
        <button className="btn ghost sm" style={{ marginTop: 4 }}>
          <Icon.Plus size={11} />
          Add another provider
        </button>
      </SectionCard>
    </>
  )
}

const DOCKER_PRESETS = [
  ['unix:///var/run/docker.sock',       'Local (Linux/macOS)'],
  ['npipe:////./pipe/docker_engine',    'Windows named pipe'],
  ['tcp://localhost:2375',              'TCP · 2375 (unencrypted)'],
  ['tcp://docker.internal:2376',        'TCP · 2376 (TLS)'],
  ['ssh://user@host',                   'Remote over SSH'],
] as const

function DockerSection(): JSX.Element {
  const [gpuPassthrough, setGpuPassthrough] = useState(true)
  return (
    <>
      <SectionCard
        title="Docker engine"
        hint="Used to launch ROS containers, replay sims, and bag-conversion workers."
      >
        <Row label="Status" align="flex-start">
          <div className="row gap-2">
            <span className="pill ok">
              <span className="swatch" />
              Daemon reachable
            </span>
            <span className="pill ghost mono">v25.0.6 · linux/arm64</span>
          </div>
        </Row>
        <Row
          label="Docker socket"
          hint="Path or URL the client connects to. Most setups use the local Unix socket."
        >
          <FieldInput mono placeholder="unix:///var/run/docker.sock" value="unix:///var/run/docker.sock" />
        </Row>
        <Row label="Quick presets">
          <div className="row gap-2" style={{ flexWrap: 'wrap' }}>
            {DOCKER_PRESETS.map(([, label]) => (
              <button key={label} className="pill ghost" style={{ cursor: 'pointer', height: 26 }}>
                <Icon.Plug size={11} />
                {label}
              </button>
            ))}
          </div>
        </Row>
        <Row label="TLS certificate path" hint="Only needed for remote engines secured with mTLS.">
          <FieldInput mono placeholder="~/.docker/certs/" />
        </Row>
        <Row label="Default ROS image">
          <FieldSelect
            label=""
            options={[
              'osrf/ros:humble-desktop',
              'osrf/ros:iron-desktop',
              'osrf/ros:jazzy-desktop',
              'datapilot/ros2-replay:latest',
            ]}
          />
        </Row>
        <Row label="GPU passthrough" hint="Use --gpus all for replay/3D viz workloads when available.">
          <Toggle on={gpuPassthrough} onChange={setGpuPassthrough} label="GPU passthrough" />
        </Row>
      </SectionCard>

      <SectionCard title="Worker pool" hint="Background containers DataPilot keeps warm.">
        <Row label="Concurrent workers">
          <div className="row gap-2" style={{ alignItems: 'center' }}>
            <FieldInput type="number" value="4" />
            <span className="dim" style={{ fontSize: 11 }}>
              · 4 of 8 CPU cores
            </span>
          </div>
        </Row>
        <Row label="Auto-tear-down idle workers after">
          <FieldSelect
            label=""
            options={['30 seconds', '2 minutes', '10 minutes', 'never']}
            value="2 minutes"
          />
        </Row>
      </SectionCard>
    </>
  )
}

function StorageSection(): JSX.Element {
  const [autoIndex, setAutoIndex] = useState(true)
  return (
    <>
      <SectionCard
        title="Local storage"
        hint="DataPilot caches indexed bags here for instant re-load."
      >
        <Row label="Cache directory">
          <FieldInput mono value="~/Library/Application Support/DataPilot" />
        </Row>
        <Row label="Storage used" hint="2,041 indexed messages · 14 bag files · 6 sessions">
          <div
            style={{
              height: 8,
              background: 'var(--color-bg-3)',
              borderRadius: 4,
              overflow: 'hidden',
              marginBottom: 6,
            }}
          >
            <div
              style={{ width: '34%', height: '100%', background: 'var(--color-accent)' }}
            />
          </div>
          <div className="row gap-2 dim mono" style={{ fontSize: 11 }}>
            <span style={{ color: 'var(--color-text-1)' }}>4.2 GB</span>
            <span>of</span>
            <span>12 GB cap</span>
            <div className="flex1" />
            <button className="btn ghost sm">
              <Icon.Trash size={11} />
              Clear cache
            </button>
          </div>
        </Row>
        <Row label="Bag archive root" hint="Where uploaded rosbags are stored.">
          <FieldInput mono value="~/datapilot/bags" />
        </Row>
      </SectionCard>

      <SectionCard title="Indexing" hint="Semantic indexing settings for /search.">
        <Row label="Auto-index new bags">
          <Toggle on={autoIndex} onChange={setAutoIndex} label="Auto-index new bags" />
        </Row>
        <Row label="Chunk window">
          <FieldSelect label="" options={['1 sec', '5 sec', '10 sec', '30 sec']} value="5 sec" />
        </Row>
      </SectionCard>
    </>
  )
}

const SHORTCUTS = [
  ['Open semantic search',    '⌘ K'],
  ['New chat',                '⌘ N'],
  ['Send message',            '⌘ ↵'],
  ['Toggle Copilot panel',    '⌘ \\'],
  ['Jump to timeline',        '⌘ 1'],
  ['Jump to metrics',         '⌘ 2'],
  ['Jump to map',             '⌘ 3'],
  ['Jump to logs',            '⌘ 4'],
  ['Jump to knowledge graph', '⌘ 5'],
  ['Toggle replay',           'Space'],
  ['Step ±1 sec',             '← →'],
] as const

function ShortcutsSection(): JSX.Element {
  return (
    <SectionCard title="Keyboard shortcuts">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 24px' }}>
        {SHORTCUTS.map(([label, key]) => (
          <div
            key={label}
            className="row"
            style={{ padding: '8px 0', borderTop: '1px solid var(--color-border-1)' }}
          >
            <span style={{ fontSize: 12.5, color: 'var(--color-text-1)' }}>{label}</span>
            <div className="flex1" />
            <span
              className="mono"
              style={{
                fontSize: 11,
                padding: '2px 8px',
                border: '1px solid var(--color-border-2)',
                borderRadius: 4,
                color: 'var(--color-text-1)',
                background: 'var(--color-bg-2)',
              }}
            >
              {key}
            </span>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}

function AboutSection({ version }: { version?: string }): JSX.Element {
  return (
    <SectionCard title="DataPilot" hint="Local-first AI copilot for ROS/ROS2 engineers.">
      <Row label="Version">
        <span className="mono" style={{ fontSize: 12.5, color: 'var(--color-text-1)' }}>
          {version ?? '0.1.0'} (build {new Date().getFullYear()}.{String(new Date().getMonth() + 1).padStart(2, '0')}.{String(new Date().getDate()).padStart(2, '0')})
        </span>
      </Row>
      <Row label="Update channel">
        <FieldSelect label="" options={['Stable', 'Beta', 'Nightly']} value="Stable" />
      </Row>
      <Row label="License">
        <span className="mono dim" style={{ fontSize: 12 }}>
          Apache 2.0
        </span>
      </Row>
      <Row label="Logs">
        <button className="btn ghost sm">
          <Icon.Terminal size={11} />
          Open log directory
        </button>
      </Row>
      <Row label="Reset">
        <button className="btn ghost sm" style={{ color: 'var(--color-danger)' }}>
          <Icon.Power size={11} />
          Reset all settings
        </button>
      </Row>
    </SectionCard>
  )
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export function Settings(): JSX.Element {
  const [section, setSection] = useState<SectionId>('general')
  const { theme, setTheme } = useTheme()

  const activeLabel = SECTIONS.find((s) => s.id === section)?.label ?? ''

  return (
    <div
      className="flex1"
      style={{
        minHeight: 0,
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'stretch',
        background: 'var(--color-bg-0)',
      }}
    >
      {/* Left sidebar */}
      <div
        className="col"
        style={{
          width: 220,
          flexShrink: 0,
          borderRight: '1px solid var(--color-border-1)',
          background: 'var(--color-bg-1)',
          padding: '18px 10px',
        }}
      >
        <div className="section-h" style={{ padding: '0 8px 10px' }}>
          Settings
        </div>
        <div className="col gap-1">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              className="row gap-2"
              style={{
                padding: '8px 10px',
                fontSize: 12.5,
                fontWeight: 500,
                color: section === s.id ? 'var(--color-text-0)' : 'var(--color-text-2)',
                background: section === s.id ? 'var(--color-bg-3)' : 'transparent',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                textAlign: 'left',
                fontFamily: 'inherit',
                position: 'relative',
                width: '100%',
              }}
            >
              {/* Active accent bar */}
              {section === s.id && (
                <span
                  style={{
                    position: 'absolute',
                    left: -10,
                    top: 8,
                    bottom: 8,
                    width: 2,
                    background: 'var(--color-accent)',
                    borderRadius: '0 2px 2px 0',
                  }}
                />
              )}
              {s.icon}
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Right body */}
      <div className="flex1 col" style={{ minWidth: 0 }}>
        {/* Section header */}
        <div
          className="row gap-3"
          style={{
            padding: '14px 22px',
            borderBottom: '1px solid var(--color-border-1)',
            flexShrink: 0,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--color-text-0)' }}>
            {activeLabel}
          </h2>
          <div className="flex1" />
          <span className="pill sm ok">
            <span className="swatch" />
            all changes saved locally
          </span>
        </div>

        {/* Scrollable content */}
        <div className="flex1" style={{ overflowY: 'auto', padding: '18px 22px 22px' }}>
          <div style={{ maxWidth: 880 }}>
            {section === 'general'   && <GeneralSection theme={theme} setTheme={setTheme} />}
            {section === 'models'    && <ModelsSection />}
            {section === 'docker'    && <DockerSection />}
            {section === 'storage'   && <StorageSection />}
            {section === 'shortcuts' && <ShortcutsSection />}
            {section === 'about'     && <AboutSection />}
          </div>
        </div>
      </div>
    </div>
  )
}
