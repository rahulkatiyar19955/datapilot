// agents.jsx — Agents & MCP servers screen

const { useState: useStateAg } = React;

const AGENTS = [
  { id: 'rca',       name: 'Root Cause Analyst',  desc: 'Traces failure chains across topics, logs, and TF events. Best for "why did X happen" questions.', icon: <Icon.Sparkles size={18} />, color: 'var(--accent)',  enabled: true,  model: 'claude-sonnet-4.5', calls: 142 },
  { id: 'anomaly',   name: 'Anomaly Detector',    desc: 'Continuously scans sensor streams for statistical outliers and known fault signatures.',          icon: <Icon.Activity size={18} />, color: 'var(--warn)',    enabled: true,  model: 'claude-sonnet-4.5', calls: 1284 },
  { id: 'perf',      name: 'Performance Profiler',desc: 'Tracks node-level CPU/RAM/topic-rate regressions across runs and releases.',                       icon: <Icon.Cpu size={18} />,      color: 'var(--magenta)', enabled: true,  model: 'gpt-5',             calls: 38 },
  { id: 'replay',    name: 'Replay Narrator',     desc: 'Generates step-by-step natural-language commentary while a session is replayed.',                  icon: <Icon.Play size={18} />,     color: 'var(--ok)',      enabled: false, model: 'gemini-2.5-pro',    calls: 12 },
  { id: 'safety',    name: 'Safety Auditor',      desc: 'Flags ISO 26262 / 21448 contraventions in command and recovery histories.',                       icon: <Icon.Alert size={18} />,    color: 'var(--danger)',  enabled: false, model: 'claude-opus-4',     calls: 0 },
  { id: 'compare',   name: 'Release Comparator',  desc: 'Diffs metric distributions between any two bag sets or fleet windows.',                            icon: <Icon.Layers size={18} />,   color: 'var(--accent)',  enabled: true,  model: 'claude-sonnet-4.5', calls: 56 },
];

const MCP = [
  { id: 'ros',     name: 'ROS Bridge',     url: 'ws://localhost:9090/rosbridge',                tools: 14, transport: 'WS',    status: 'connected', desc: 'Live ROS2 topic/service/action introspection' },
  { id: 'foxglove',name: 'Foxglove Cloud', url: 'https://api.foxglove.dev/mcp',                 tools: 8,  transport: 'HTTP',  status: 'connected', desc: 'Recording library + visualization layouts' },
  { id: 's3',      name: 'Rosbag S3',      url: 's3://datapilot-rosbags/',                      tools: 4,  transport: 'STDIO', status: 'connected', desc: 'Read/write bag archives, signed URLs' },
  { id: 'gitea',   name: 'Git (self-host)',url: 'https://git.internal/api/mcp',                 tools: 11, transport: 'HTTP',  status: 'connected', desc: 'Repo, PR, issue context for release diffs' },
  { id: 'jira',    name: 'Linear',         url: 'mcp://linear',                                 tools: 6,  transport: 'STDIO', status: 'disabled',  desc: 'File bugs from incidents' },
  { id: 'slack',   name: 'Slack',          url: 'https://slack.com/mcp',                        tools: 3,  transport: 'HTTP',  status: 'error',     desc: 'Post incident summaries to ops channel' },
];

function StatusPill({ status }) {
  const map = {
    connected: { cls: 'ok',     label: 'connected' },
    disabled:  { cls: 'ghost',  label: 'disabled' },
    error:     { cls: 'danger', label: 'error' },
  };
  const s = map[status] || map.disabled;
  return <span className={`pill sm ${s.cls}`}><span className="swatch" />{s.label}</span>;
}

function Toggle({ on, onChange }) {
  return (
    <button onClick={() => onChange(!on)} style={{
      width: 32, height: 18,
      borderRadius: 10,
      background: on ? 'var(--accent)' : 'var(--bg-4)',
      border: '1px solid ' + (on ? 'var(--accent)' : 'var(--border-2)'),
      position: 'relative',
      cursor: 'pointer',
      transition: 'background 0.15s',
      padding: 0,
    }}>
      <span style={{
        position: 'absolute',
        top: 1, left: on ? 15 : 1,
        width: 14, height: 14,
        borderRadius: 50,
        background: 'var(--bg-0)',
        boxShadow: '0 1px 2px oklch(0 0 0 / 0.4)',
        transition: 'left 0.15s',
      }} />
    </button>
  );
}

function AgentCard({ a, onToggle }) {
  return (
    <div className="card" style={{ padding: 16, opacity: a.enabled ? 1 : 0.7, transition: 'opacity 0.15s' }}>
      <div className="row gap-3" style={{ marginBottom: 10 }}>
        <div style={{
          width: 36, height: 36,
          borderRadius: 8,
          background: 'var(--bg-3)',
          color: a.color,
          display: 'grid', placeItems: 'center',
          flexShrink: 0,
        }}>
          {a.icon}
        </div>
        <div className="flex1" style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-0)' }}>{a.name}</div>
          <div className="mono dim" style={{ fontSize: 10.5, marginTop: 2 }}>{a.model}</div>
        </div>
        <Toggle on={a.enabled} onChange={(v) => onToggle(a.id, v)} />
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5, marginBottom: 12 }}>{a.desc}</div>
      <div className="row gap-2">
        <span className="pill sm ghost mono">{a.calls.toLocaleString()} calls · 7d</span>
        <div className="flex1" />
        <button className="btn ghost sm"><Icon.Settings size={11} />Config</button>
      </div>
    </div>
  );
}

function MCPRow({ m, onToggle }) {
  return (
    <div className="row gap-3" style={{
      padding: '12px 16px',
      borderBottom: '1px solid var(--border-1)',
    }}>
      <div style={{
        width: 32, height: 32,
        borderRadius: 6,
        background: 'var(--bg-3)',
        color: 'var(--accent)',
        display: 'grid', placeItems: 'center',
        flexShrink: 0,
      }}>
        <Icon.Plug size={15} />
      </div>
      <div className="flex1" style={{ minWidth: 0 }}>
        <div className="row gap-2">
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-0)' }}>{m.name}</span>
          <StatusPill status={m.status} />
          <span className="pill sm ghost mono">{m.transport}</span>
          <span className="pill sm ghost">{m.tools} tools</span>
        </div>
        <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.url}</div>
        <div style={{ fontSize: 11.5, color: 'var(--text-2)', marginTop: 4 }}>{m.desc}</div>
      </div>
      <div className="row gap-1" style={{ flexShrink: 0 }}>
        <button className="btn ghost icon sm"><Icon.Refresh size={12} /></button>
        <button className="btn ghost sm">Edit</button>
        <Toggle on={m.status === 'connected'} onChange={(v) => onToggle(m.id, v)} />
      </div>
    </div>
  );
}

function AddMCPForm({ onClose }) {
  return (
    <div className="card" style={{ margin: '0 18px 18px', padding: 18 }}>
      <div className="row gap-2" style={{ marginBottom: 12 }}>
        <Icon.Plus size={14} />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-0)' }}>Add MCP server</span>
        <div className="flex1" />
        <button className="btn ghost icon sm" onClick={onClose}><Icon.X size={12} /></button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Name" placeholder="e.g. Internal RAG" />
        <Field label="Transport" select options={['STDIO','HTTP','WebSocket']} />
        <div style={{ gridColumn: '1 / 3' }}>
          <Field label="URL / Command" placeholder="https://… or npx -y @scope/mcp-server" mono />
        </div>
        <div style={{ gridColumn: '1 / 3' }}>
          <Field label="Authentication" placeholder="Bearer / Header / None" />
        </div>
      </div>
      <div className="row gap-2" style={{ marginTop: 14 }}>
        <button className="btn ghost sm">Test connection</button>
        <div className="flex1" />
        <button className="btn ghost sm" onClick={onClose}>Cancel</button>
        <button className="btn primary sm"><Icon.Check size={12} />Add server</button>
      </div>
    </div>
  );
}

function Field({ label, placeholder, value, mono, select, options, type, onChange, hint, after }) {
  return (
    <div className="col" style={{ gap: 6 }}>
      <label style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--text-2)' }}>{label}</label>
      <div className="input" style={{ height: 32 }}>
        {select ? (
          <select defaultValue={value || (options && options[0])} style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-1)', font: 'inherit' }}>
            {options.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : (
          <input
            type={type || 'text'}
            className={mono ? 'mono' : ''}
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange && onChange(e.target.value)}
            style={{ fontFamily: mono ? 'var(--font-mono)' : 'inherit', fontSize: mono ? 12 : 13 }}
          />
        )}
        {after}
      </div>
      {hint && <span className="dim" style={{ fontSize: 11 }}>{hint}</span>}
    </div>
  );
}

function AgentsScreen() {
  const [agents, setAgents] = useStateAg(AGENTS);
  const [mcps, setMcps] = useStateAg(MCP);
  const [showAdd, setShowAdd] = useStateAg(false);
  const [section, setSection] = useStateAg('agents'); // agents | mcp

  const enabledAgents = agents.filter(a => a.enabled).length;
  const connectedMcps = mcps.filter(m => m.status === 'connected').length;

  return (
    <div className="col flex1" style={{ minHeight: 0, background: 'var(--bg-0)' }}>
      <div className="row gap-3" style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-1)', flexShrink: 0 }}>
        <div className="col">
          <div className="row gap-2">
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--text-0)' }}>Agents & MCP</h2>
            <span className="pill sm ghost mono">{enabledAgents}/{agents.length} agents · {connectedMcps}/{mcps.length} MCP</span>
          </div>
          <span className="dim" style={{ fontSize: 11.5, marginTop: 2 }}>Compose your copilot — toggle specialist agents and external tool servers.</span>
        </div>
        <div className="flex1" />
        <div className="row gap-1" style={{ background: 'var(--bg-1)', border: '1px solid var(--border-1)', borderRadius: 7, padding: 3 }}>
          <button className={`btn sm ${section === 'agents' ? '' : 'ghost'}`} style={{ height: 24 }} onClick={() => setSection('agents')}>
            <Icon.Bot size={12} />Agents
          </button>
          <button className={`btn sm ${section === 'mcp' ? '' : 'ghost'}`} style={{ height: 24 }} onClick={() => setSection('mcp')}>
            <Icon.Plug size={12} />MCP Servers
          </button>
        </div>
      </div>

      <div className="flex1" style={{ overflow: 'auto' }}>
        {section === 'agents' && (
          <div style={{ padding: 18 }}>
            <div className="row gap-2" style={{ marginBottom: 14 }}>
              <span className="section-h">Built-in agents</span>
              <div className="flex1" />
              <button className="btn ghost sm"><Icon.Plus size={12} />Create custom agent</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 12 }}>
              {agents.map(a => (
                <AgentCard key={a.id} a={a} onToggle={(id, v) => setAgents(prev => prev.map(x => x.id === id ? { ...x, enabled: v } : x))} />
              ))}
            </div>

            <div className="card" style={{ marginTop: 22, padding: 16 }}>
              <div className="row gap-2" style={{ marginBottom: 10 }}>
                <Icon.Sparkles size={14} />
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-0)' }}>Routing strategy</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5, marginBottom: 12 }}>
                How DataPilot orchestrates the enabled agents when you ask a question.
              </div>
              <div className="row gap-2">
                {[
                  ['auto', 'Auto-route', 'Coordinator picks the best agent per turn'],
                  ['parallel', 'Parallel', 'All agents run, results merged & ranked'],
                  ['manual', 'Manual', 'You pick the agent in each message'],
                ].map(([k, l, d]) => (
                  <label key={k} className="card" style={{
                    flex: 1, padding: '10px 12px', cursor: 'pointer',
                    borderColor: k === 'auto' ? 'var(--accent)' : 'var(--border-1)',
                    background: k === 'auto' ? 'var(--accent-bg)' : 'var(--bg-2)',
                  }}>
                    <div className="row gap-2" style={{ marginBottom: 4 }}>
                      <input type="radio" name="route" defaultChecked={k === 'auto'} />
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-0)' }}>{l}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-2)' }}>{d}</div>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {section === 'mcp' && (
          <div style={{ padding: 18 }}>
            <div className="row gap-2" style={{ marginBottom: 14 }}>
              <span className="section-h">Connected servers</span>
              <span className="dim mono" style={{ fontSize: 11 }}>· tools surface to all enabled agents</span>
              <div className="flex1" />
              <button className="btn ghost sm"><Icon.Globe size={12} />Marketplace</button>
              <button className="btn primary sm" onClick={() => setShowAdd(true)}><Icon.Plus size={12} />Add MCP server</button>
            </div>

            <div className="panel" style={{ overflow: 'hidden', marginBottom: 18 }}>
              {mcps.map((m, i) => (
                <MCPRow key={m.id} m={m}
                  onToggle={(id, v) => setMcps(prev => prev.map(x => x.id === id ? { ...x, status: v ? 'connected' : 'disabled' } : x))} />
              ))}
            </div>

            {showAdd && <AddMCPForm onClose={() => setShowAdd(false)} />}

            <div className="card" style={{ padding: 14 }}>
              <div className="row gap-2">
                <Icon.Alert size={13} />
                <span style={{ fontSize: 12, color: 'var(--text-1)' }}>
                  MCP servers run locally on your machine. Outgoing tool calls show in <span className="mono" style={{ color: 'var(--accent)' }}>~/.datapilot/audit.log</span>.
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

window.AgentsScreen = AgentsScreen;
window.SettingsField = Field;
window.SettingsToggle = Toggle;
