// copilot.jsx — Chat sidebar (left 30%)

const { useState, useEffect, useRef } = React;

function SeverityDot({ sev }) {
  const map = { critical: 'danger', warning: 'warn', info: 'accent', success: 'ok' };
  return <span className={`pill sm ${map[sev] || 'ghost'}`}><span className="swatch" />{sev}</span>;
}

function ChatMessage({ msg, onJump }) {
  if (msg.role === 'user') {
    return (
      <div className="row" style={{ justifyContent: 'flex-end', padding: '6px 14px' }}>
        <div style={{
          maxWidth: '85%',
          background: 'var(--accent-bg)',
          border: '1px solid oklch(0.42 0.10 235 / 0.55)',
          color: 'oklch(0.95 0.04 235)',
          borderRadius: '12px 12px 2px 12px',
          padding: '8px 12px',
          fontSize: 12.5,
          lineHeight: 1.45,
        }}>{msg.text}</div>
      </div>
    );
  }

  if (msg.role === 'system') {
    return (
      <div style={{ padding: '4px 14px' }}>
        <div className="row gap-2 dim" style={{ fontSize: 11.5, padding: '4px 0' }}>
          <Icon.Sparkles size={12} />
          <span>{msg.text}</span>
        </div>
      </div>
    );
  }

  // assistant
  return (
    <div style={{ padding: '6px 14px' }}>
      <div className="row gap-2" style={{ marginBottom: 6 }}>
        <div style={{
          width: 22, height: 22, borderRadius: 6,
          background: 'linear-gradient(135deg, var(--accent), oklch(0.55 0.18 280))',
          display: 'grid', placeItems: 'center',
          color: 'var(--bg-0)',
        }}>
          <Icon.Sparkles size={12} stroke={2} />
        </div>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-1)' }}>DataPilot</span>
        <span className="dim" style={{ fontSize: 11 }}>· {msg.time}</span>
      </div>

      {msg.summary && (
        <div style={{ fontSize: 12.5, color: 'var(--text-1)', lineHeight: 1.5, marginBottom: 8 }}>
          {msg.summary}
        </div>
      )}

      {msg.plan && (
        <div className="card" style={{ marginBottom: 8, overflow: 'hidden' }}>
          <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-1)', fontSize: 11, fontWeight: 600, color: 'var(--text-2)', letterSpacing: '0.03em', textTransform: 'uppercase' }}>
            Analysis Plan
          </div>
          <div className="col" style={{ padding: '6px 0' }}>
            {msg.plan.map((step, i) => (
              <div key={i} className="row gap-2" style={{ padding: '5px 12px', fontSize: 12 }}>
                <span style={{
                  width: 16, height: 16, borderRadius: 4,
                  display: 'grid', placeItems: 'center',
                  background: step.done ? 'oklch(0.30 0.08 150 / 0.4)' : 'var(--bg-3)',
                  color: step.done ? 'var(--ok)' : 'var(--text-3)',
                  flexShrink: 0,
                }}>
                  {step.done ? <Icon.Check size={11} stroke={2.5} /> : <span className="mono" style={{ fontSize: 10 }}>{i+1}</span>}
                </span>
                <span style={{ color: step.done ? 'var(--text-1)' : 'var(--text-2)' }}>{step.label}</span>
                {step.active && <span className="dim mono pulse" style={{ marginLeft: 'auto', fontSize: 10 }}>running…</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {msg.findings && (
        <div className="card" style={{ marginBottom: 8 }}>
          <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-1)', fontSize: 11, fontWeight: 600, color: 'var(--text-2)', letterSpacing: '0.03em', textTransform: 'uppercase' }}>
            Key findings
          </div>
          <div className="col">
            {msg.findings.map((f, i) => (
              <div key={i} className="row gap-2" style={{ padding: '8px 10px', borderTop: i ? '1px solid var(--border-1)' : 'none', alignItems: 'flex-start' }}>
                <SeverityDot sev={f.sev} />
                <div className="flex1">
                  <div style={{ fontSize: 12.5, color: 'var(--text-1)', lineHeight: 1.45 }}>{f.text}</div>
                  {f.detail && <div className="dim mono" style={{ fontSize: 10.5, marginTop: 3 }}>{f.detail}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {msg.causal && (
        <div className="card" style={{ marginBottom: 8, padding: '10px 12px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', letterSpacing: '0.03em', textTransform: 'uppercase', marginBottom: 8 }}>
            Root cause chain
          </div>
          <div className="col gap-1">
            {msg.causal.map((c, i) => (
              <div key={i} className="row gap-2">
                <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-3)', width: 24 }}>{i === 0 ? '┌─' : i === msg.causal.length - 1 ? '└─' : '├─'}</span>
                <span style={{ fontSize: 11.5, color: 'var(--text-1)' }}>{c}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {msg.actions && (
        <div className="row gap-2" style={{ flexWrap: 'wrap', marginTop: 6 }}>
          {msg.actions.map((a, i) => (
            <button key={i} className="btn sm" onClick={() => onJump && onJump(a.target)}>
              {a.icon}
              {a.label}
              <Icon.ArrowRight size={11} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CopilotPanel({ onJump }) {
  const [input, setInput] = useState('');
  const scrollRef = useRef(null);

  const messages = [
    { role: 'system', text: 'Session started · rosbag loaded · 14:32 PT' },
    {
      role: 'assistant',
      time: '14:32',
      summary: 'Loaded robot-12_2026-05-22_142.bag. 10 topics, 14:32 duration, 312 MB. Indexed semantic stream in 3.1s.',
    },
    { role: 'user', text: 'Why did robot-12 stop near loading bay 3?' },
    {
      role: 'assistant',
      time: '14:33',
      summary: 'Looked into the stop event at t=66.3s. Here\'s what I found and how I got there.',
      plan: [
        { label: 'Locate stop event in /cmd_vel', done: true },
        { label: 'Cross-reference /diagnostics + /sensors', done: true },
        { label: 'Trace planner decisions ±10s', done: true },
        { label: 'Check costmap inflation history', done: true },
        { label: 'Compare against baseline run-1024', done: false, active: true },
      ],
      findings: [
        { sev: 'critical', text: 'Sensor dropout on /sensors/lidar_a for 782 ms at t=64.2s', detail: 'threshold 250 ms · 3.1× tolerance' },
        { sev: 'critical', text: 'Planner aborted at t=66.1s — no valid path within tolerance', detail: '/move_base · 2 retries' },
        { sev: 'warning', text: 'Costmap inflated defensively from 0.45 → 0.85 m', detail: 'cascading effect, narrowed corridor' },
        { sev: 'warning', text: 'Pedestrian tracker lost 3 frames at t=58.3s', detail: '/perception/objects · same time window' },
      ],
      causal: [
        '/sensors/lidar_a dropout (782 ms)',
        '/costmap defensive inflation (0.85 m)',
        '/move_base planner abort',
        '/cmd_vel emergency brake (stop)',
      ],
      actions: [
        { icon: <Icon.Clock size={12} />,   label: 'Jump to timeline', target: 'timeline' },
        { icon: <Icon.Graph size={12} />,   label: 'See causal graph', target: 'kgraph' },
        { icon: <Icon.Activity size={12} />, label: 'Metric: lidar latency', target: 'metrics' },
      ],
    },
    { role: 'system', text: 'Comparing against baseline run-1024 — 4 more results pending' },
  ];

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, []);

  return (
    <div className="col" style={{ width: 420, flexShrink: 0, background: 'var(--bg-1)', borderRight: '1px solid var(--border-1)', minHeight: 0 }}>
      {/* Panel header */}
      <div className="row" style={{ height: 44, padding: '0 14px', borderBottom: '1px solid var(--border-1)', gap: 10, flexShrink: 0 }}>
        <Icon.Sparkles size={15} />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-0)' }}>Copilot</span>
        <span className="pill sm ghost mono">claude-sonnet-4.5</span>
        <div className="flex1" />
        <button className="btn ghost icon sm" title="New session"><Icon.Plus size={13} /></button>
        <button className="btn ghost icon sm" title="History"><Icon.Clock size={13} /></button>
      </div>

      {/* Uploaded bag chips */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-1)', flexShrink: 0 }}>
        <div className="row gap-2" style={{ marginBottom: 6 }}>
          <span className="section-h">Context</span>
          <div className="flex1" />
          <button className="btn ghost sm" style={{ height: 20, padding: '0 6px', fontSize: 11 }}>
            <Icon.Plus size={11} /> Add
          </button>
        </div>
        <div className="row gap-2" style={{ flexWrap: 'wrap' }}>
          <div className="pill" style={{ height: 26, padding: '0 4px 0 10px', gap: 8 }}>
            <Icon.File size={11} />
            <span className="mono" style={{ fontSize: 11 }}>robot-12_05-22_142.bag</span>
            <span className="dim mono" style={{ fontSize: 10 }}>· 312 MB</span>
            <button className="btn ghost icon sm" style={{ height: 18, width: 18 }}><Icon.X size={10} /></button>
          </div>
          <div className="pill accent">
            <span className="swatch" /> robot-12
          </div>
          <div className="pill ghost mono" style={{ fontSize: 10.5 }}>14:32 duration · 10 topics</div>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex1" style={{ overflowY: 'auto', padding: '8px 0' }}>
        {messages.map((m, i) => <ChatMessage key={i} msg={m} onJump={onJump} />)}
      </div>

      {/* Quick action chips */}
      <div style={{ padding: '8px 14px 4px', flexShrink: 0 }}>
        <div className="row gap-2" style={{ flexWrap: 'wrap' }}>
          <button className="pill ghost" style={{ cursor: 'pointer', height: 24 }}>
            <Icon.Upload size={11} /> Upload rosbag
          </button>
          <button className="pill ghost" style={{ cursor: 'pointer', height: 24 }}>
            <Icon.Wifi size={11} /> Connect live robot
          </button>
          <button className="pill ghost" style={{ cursor: 'pointer', height: 24 }}>
            <Icon.Search size={11} /> Search past runs
          </button>
          <button className="pill ghost" style={{ cursor: 'pointer', height: 24 }}>
            <Icon.Layers size={11} /> Compare releases
          </button>
        </div>
      </div>

      {/* Command bar */}
      <div style={{ padding: '8px 14px 14px', flexShrink: 0 }}>
        <div className="col" style={{
          background: 'var(--bg-3)',
          border: '1px solid var(--border-2)',
          borderRadius: 10,
          padding: '10px 12px',
          gap: 8,
        }}>
          <textarea
            placeholder="Ask anything about this run, or paste a topic name…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={2}
            style={{
              background: 'transparent', border: 'none', outline: 'none',
              color: 'var(--text-0)', fontFamily: 'inherit', fontSize: 13,
              resize: 'none', lineHeight: 1.45,
            }}
          />
          <div className="row gap-2">
            <button className="btn ghost icon sm" title="Mic"><Icon.Mic size={13} /></button>
            <button className="btn ghost icon sm" title="Attach"><Icon.Upload size={13} /></button>
            <span className="dim mono" style={{ fontSize: 10.5 }}>⌘↵ to send</span>
            <div className="flex1" />
            <button className="btn primary sm">
              <Icon.Send size={12} />
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

window.CopilotPanel = CopilotPanel;
window.SeverityDot = SeverityDot;
