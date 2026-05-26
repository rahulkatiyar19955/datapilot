// workspace.jsx — Right side, tabbed analysis workspace

const { useState: useStateW, useMemo, useRef: useRefW, useEffect: useEffectW } = React;

// ──────── TIMELINE VIEW ────────
function TimelineView({ events, onSelect, selected }) {
  const total = 100; // seconds shown (windowed)
  const lanes = [
    { key: 'log',     label: 'Logs',          color: 'oklch(0.62 0.05 240)' },
    { key: 'sensor',  label: 'Sensors',       color: 'oklch(0.70 0.10 200)' },
    { key: 'anomaly', label: 'Anomalies',     color: 'oklch(0.70 0.18 25)'  },
  ];
  const sevColor = (s) =>
    s === 'critical' ? 'var(--danger)' :
    s === 'warning'  ? 'var(--warn)'   :
    s === 'info'     ? 'var(--accent)' : 'var(--text-2)';

  // ticks every 10s
  const ticks = Array.from({ length: 11 }, (_, i) => i * 10);

  return (
    <div className="col flex1" style={{ minHeight: 0 }}>
      {/* Toolbar */}
      <div className="row gap-2" style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-1)' }}>
        <span className="section-h">Timeline</span>
        <span className="pill sm ghost mono">00:00 → 01:40</span>
        <div className="flex1" />
        <button className="btn ghost sm"><Icon.Zoom size={12} />Zoom to anomalies</button>
        <button className="btn ghost icon sm"><Icon.Filter size={13} /></button>
        <button className="btn ghost icon sm"><Icon.Refresh size={13} /></button>
      </div>

      {/* Density overview strip */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-1)' }}>
        <div className="row" style={{ alignItems: 'flex-end', height: 30, gap: 2 }}>
          {Array.from({ length: 50 }, (_, i) => {
            const intensity =
              i >= 28 && i <= 34 ? 0.95 :
              i >= 18 && i <= 22 ? 0.6 :
              i >= 45 && i <= 48 ? 0.4 :
              0.15 + Math.sin(i * 0.7) * 0.1 + 0.1;
            return (
              <div key={i} style={{
                flex: 1, height: `${intensity * 100}%`,
                background: i >= 28 && i <= 34 ? 'var(--danger)' :
                            i >= 18 && i <= 22 ? 'var(--warn)'   :
                            'var(--accent-dim)',
                borderRadius: 1,
                opacity: 0.85,
              }} />
            );
          })}
        </div>
      </div>

      {/* Lanes */}
      <div className="flex1" style={{ overflow: 'auto', padding: '4px 14px 14px' }}>
        {/* tick row */}
        <div style={{ position: 'relative', height: 18, marginLeft: 100, borderBottom: '1px dashed var(--border-1)' }}>
          {ticks.map((tk) => (
            <div key={tk} style={{ position: 'absolute', left: `${tk}%`, top: 0, transform: 'translateX(-50%)' }}>
              <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>
                {String(Math.floor(tk / 60)).padStart(2,'0')}:{String(tk % 60).padStart(2,'0')}
              </span>
            </div>
          ))}
        </div>

        {lanes.map((lane) => (
          <div key={lane.key} className="row" style={{ alignItems: 'stretch', borderBottom: '1px solid var(--border-1)' }}>
            <div style={{ width: 100, padding: '14px 8px 14px 0', flexShrink: 0 }}>
              <div className="row gap-2">
                <span style={{ width: 6, height: 6, borderRadius: 50, background: lane.color }} />
                <span style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--text-1)' }}>{lane.label}</span>
              </div>
              <div className="dim mono" style={{ fontSize: 10, marginTop: 2 }}>
                {events.filter(e => e.type === lane.key).length} events
              </div>
            </div>
            <div style={{ flex: 1, position: 'relative', minHeight: 56 }}>
              {/* grid lines */}
              {ticks.map((tk) => (
                <div key={tk} style={{ position: 'absolute', left: `${tk}%`, top: 0, bottom: 0, width: 1, background: 'oklch(0.30 0.012 240 / 0.4)' }} />
              ))}
              {/* events */}
              {events.filter(e => e.type === lane.key).map((e, i) => {
                const pct = (e.t / total) * 100;
                const isSelected = selected && selected.t === e.t;
                return (
                  <div key={i}
                    onClick={() => onSelect(e)}
                    style={{
                      position: 'absolute', left: `calc(${pct}% - 7px)`, top: '50%',
                      transform: 'translateY(-50%)',
                      width: 14, height: 14, borderRadius: lane.key === 'anomaly' ? 3 : 50,
                      background: sevColor(e.sev),
                      border: isSelected ? '2px solid var(--text-0)' : '2px solid var(--bg-1)',
                      cursor: 'pointer',
                      boxShadow: e.sev === 'critical' ? `0 0 12px ${sevColor(e.sev)}` : 'none',
                      transition: 'transform 0.1s',
                    }}
                    title={e.label} />
                );
              })}
            </div>
          </div>
        ))}

        {/* Selected event detail panel */}
        {selected && (
          <div className="card fade-in" style={{ marginTop: 16, padding: '14px 16px' }}>
            <div className="row gap-2" style={{ marginBottom: 8 }}>
              <SeverityDot sev={selected.sev} />
              <span className="mono" style={{ fontSize: 11.5, color: 'var(--text-1)' }}>
                t={selected.t.toFixed(2)}s
              </span>
              <span className="mono" style={{ fontSize: 11.5, color: 'var(--accent)' }}>{selected.topic}</span>
              <div className="flex1" />
              <button className="btn ghost sm"><Icon.Pin size={12} />Pin</button>
              <button className="btn ghost sm"><Icon.Activity size={12} />Plot</button>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-0)', marginBottom: 8 }}>
              {selected.label}
            </div>
            <div className="dim" style={{ fontSize: 11.5, lineHeight: 1.5 }}>
              Click an adjacent event to see relationship · DataPilot suggested this is part of the failure chain that led to the e-brake at t=66.3s.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ──────── METRIC PLOT VIEW ────────
function MetricPlot({ title, unit, color, peak, anomaly, baseline, yAxis }) {
  const w = 100, h = 100;
  const path = useMemo(() => {
    const pts = [];
    for (let i = 0; i <= 60; i++) {
      const x = (i / 60) * w;
      let v;
      if (peak === 'spike') {
        v = 0.3 + 0.05 * Math.sin(i * 0.4) + (i > 30 && i < 36 ? 0.55 : 0);
      } else if (peak === 'drop') {
        v = 0.65 + 0.04 * Math.sin(i * 0.5) - (i > 28 && i < 38 ? 0.5 : 0);
      } else if (peak === 'ramp') {
        v = 0.2 + i / 90 + 0.03 * Math.sin(i * 0.6);
      } else {
        v = 0.4 + 0.08 * Math.sin(i * 0.3 + 1) + 0.04 * Math.cos(i * 0.5);
      }
      const y = h - v * h;
      pts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`);
    }
    return pts.join(' ');
  }, [peak]);

  return (
    <div className="card" style={{ padding: '12px 14px' }}>
      <div className="row gap-2" style={{ marginBottom: 6 }}>
        <span style={{ width: 6, height: 6, borderRadius: 50, background: color }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)' }}>{title}</span>
        <span className="dim mono" style={{ fontSize: 10.5 }}>{unit}</span>
        <div className="flex1" />
        <button className="btn ghost icon sm" title="Remove"><Icon.X size={11} /></button>
      </div>
      <div style={{ position: 'relative', height: 100, width: '100%' }}>
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }}>
          {/* gridlines */}
          {[0.25, 0.5, 0.75].map(g => (
            <line key={g} x1={0} x2={w} y1={h*g} y2={h*g} stroke="var(--border-1)" strokeWidth={0.3} />
          ))}
          {/* anomaly band */}
          {anomaly && <rect x={anomaly[0]} y={0} width={anomaly[1]-anomaly[0]} height={h} fill="var(--danger)" opacity="0.10" />}
          {/* baseline */}
          {baseline && <path d={path.replace(/M[\d.]+,[\d.]+/, m => m).split(' ').map(p => p).join(' ')} stroke="oklch(0.4 0.01 240)" strokeWidth={0.4} strokeDasharray="2 2" fill="none" opacity="0.6" />}
          {/* main line — filled gradient under */}
          <defs>
            <linearGradient id={`g-${title}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.35" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${path} L${w},${h} L0,${h} Z`} fill={`url(#g-${title})`} />
          <path d={path} stroke={color} strokeWidth={0.8} fill="none" />
        </svg>
        {/* y axis labels */}
        {yAxis && (
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 28, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', pointerEvents: 'none' }}>
            {yAxis.map((y, i) => (
              <span key={i} className="mono dim" style={{ fontSize: 9.5, textAlign: 'left' }}>{y}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MetricView() {
  return (
    <div className="col flex1" style={{ minHeight: 0 }}>
      <div className="row gap-2" style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-1)' }}>
        <span className="section-h">Metrics</span>
        <span className="pill sm ghost mono">4 metrics · t=64-72s focus</span>
        <div className="flex1" />
        <button className="btn ghost sm"><Icon.Plus size={12} />Add metric</button>
        <button className="btn ghost sm"><Icon.Layers size={12} />Overlay baseline</button>
        <button className="btn ghost icon sm"><Icon.Download size={13} /></button>
      </div>
      <div className="flex1" style={{ overflow: 'auto', padding: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <MetricPlot title="/sensors/lidar_a · latency" unit="ms" color="var(--danger)" peak="spike" anomaly={[50,60]} yAxis={['800','400','200','0']} />
          <MetricPlot title="/cmd_vel · linear.x" unit="m/s" color="var(--accent)" peak="drop" anomaly={[50,60]} yAxis={['0.6','0.3','0','-0.3']} />
          <MetricPlot title="/perception/objects · confidence" unit="0-1" color="var(--warn)" peak="drop" yAxis={['1.0','0.7','0.4','0.1']} />
          <MetricPlot title="/diagnostics · cpu_load" unit="%" color="var(--magenta)" peak="ramp" yAxis={['100','75','50','25']} />
        </div>
        {/* x axis */}
        <div className="row mono dim" style={{ fontSize: 10, justifyContent: 'space-between', marginTop: 6, padding: '0 4px' }}>
          <span>00:00</span><span>00:20</span><span>00:40</span><span>01:00</span><span>01:20</span><span>01:40</span>
        </div>
      </div>
    </div>
  );
}

// ──────── MAP / TRAJECTORY VIEW ────────
function MapView() {
  // a simple trajectory: planned vs actual, stop near bay 3
  const planned = "M 60 380 Q 160 360 240 320 T 420 260 T 600 220 T 760 200";
  const actual = "M 60 380 Q 160 360 240 320 T 420 260 T 590 240 L 595 245";

  // grid
  return (
    <div className="col flex1" style={{ minHeight: 0 }}>
      <div className="row gap-2" style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-1)' }}>
        <span className="section-h">Map · trajectory</span>
        <span className="pill sm ghost mono">odom + costmap · 1px = 10cm</span>
        <div className="flex1" />
        <button className="btn ghost sm">
          <span style={{ width: 8, height: 2, background: 'var(--accent)' }} />Planned
        </button>
        <button className="btn ghost sm">
          <span style={{ width: 8, height: 2, background: 'var(--warn)' }} />Actual
        </button>
        <button className="btn ghost sm">
          <span style={{ width: 6, height: 6, borderRadius: 50, background: 'var(--danger)' }} />Stop point
        </button>
        <button className="btn ghost icon sm"><Icon.Zoom size={13} /></button>
      </div>

      <div className="flex1" style={{ position: 'relative', overflow: 'hidden', background: 'var(--map-bg)' }}>
        {/* grid */}
        <svg viewBox="0 0 800 500" preserveAspectRatio="xMidYMid meet" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="var(--grid)" strokeWidth="0.5"/>
            </pattern>
            <pattern id="bigGrid" width="200" height="200" patternUnits="userSpaceOnUse">
              <path d="M 200 0 L 0 0 0 200" fill="none" stroke="var(--grid-2)" strokeWidth="0.8"/>
            </pattern>
          </defs>
          <rect width="800" height="500" fill="url(#grid)" />
          <rect width="800" height="500" fill="url(#bigGrid)" />

          {/* walls / obstacles */}
          <rect x="40" y="40" width="720" height="420" fill="none" stroke="var(--border-2)" strokeWidth="2" />
          <rect x="120" y="80" width="160" height="40" fill="var(--bg-2)" stroke="var(--border-2)" />
          <rect x="380" y="80" width="160" height="40" fill="var(--bg-2)" stroke="var(--border-2)" />
          <rect x="640" y="80" width="100" height="40" fill="var(--bg-2)" stroke="var(--border-2)" />
          <rect x="120" y="400" width="120" height="40" fill="var(--bg-2)" stroke="var(--border-2)" />
          <rect x="320" y="400" width="120" height="40" fill="var(--bg-2)" stroke="var(--border-2)" />
          <rect x="520" y="400" width="120" height="40" fill="var(--bg-2)" stroke="var(--border-2)" />

          {/* costmap inflation cloud near stop */}
          <circle cx="595" cy="245" r="60" fill="var(--danger)" opacity="0.10" />
          <circle cx="595" cy="245" r="36" fill="var(--danger)" opacity="0.18" />

          {/* planned */}
          <path d={planned} stroke="var(--accent)" strokeWidth="2.5" fill="none" strokeDasharray="6 4" opacity="0.9" />
          {/* actual */}
          <path d={actual} stroke="var(--warn)" strokeWidth="3" fill="none" />

          {/* waypoints */}
          {[[60,380],[240,320],[420,260],[600,220],[760,200]].map(([x,y], i) => (
            <g key={i}>
              <circle cx={x} cy={y} r="5" fill="var(--bg-0)" stroke="var(--accent)" strokeWidth="1.5" />
              {i === 4 && (
                <>
                  <circle cx={x} cy={y} r="10" fill="none" stroke="var(--accent)" strokeWidth="1" opacity="0.5" />
                  <text x={x+12} y={y+4} fontSize="11" fill="var(--text-1)" fontFamily="JetBrains Mono">goal · bay_3_dock</text>
                </>
              )}
            </g>
          ))}

          {/* stop point */}
          <g>
            <circle cx="595" cy="245" r="8" fill="var(--danger)" />
            <circle cx="595" cy="245" r="14" fill="none" stroke="var(--danger)" strokeWidth="1.5" opacity="0.6">
              <animate attributeName="r" from="8" to="20" dur="1.6s" repeatCount="indefinite" />
              <animate attributeName="opacity" from="0.7" to="0" dur="1.6s" repeatCount="indefinite" />
            </circle>
            <text x="610" y="240" fontSize="11" fill="var(--danger)" fontFamily="JetBrains Mono">e-brake · t=66.3s</text>
          </g>

          {/* robot at start */}
          <g transform="translate(60 380)">
            <rect x="-8" y="-6" width="16" height="12" rx="2" fill="var(--accent)" />
            <path d="M 8 0 L 14 0" stroke="var(--accent)" strokeWidth="2" />
            <text x="-22" y="22" fontSize="10" fill="var(--text-2)" fontFamily="JetBrains Mono">start</text>
          </g>
        </svg>

        {/* corner overlays */}
        <div className="panel" style={{ position: 'absolute', top: 12, left: 12, padding: '8px 10px', fontSize: 11 }}>
          <div className="mono dim" style={{ fontSize: 10 }}>FRAME</div>
          <div className="mono" style={{ color: 'var(--text-1)' }}>map → odom → base_link</div>
        </div>
        <div className="panel" style={{ position: 'absolute', bottom: 12, right: 12, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div className="mono dim" style={{ fontSize: 10 }}>VIEWPORT</div>
          <div className="mono" style={{ color: 'var(--text-1)', fontSize: 11 }}>x: 0.0 → 80.0 m</div>
          <div className="mono" style={{ color: 'var(--text-1)', fontSize: 11 }}>y: -20.0 → 30.0 m</div>
        </div>
      </div>
    </div>
  );
}

// ──────── LOG VIEW ────────
function LogView() {
  const sevColor = (s) => s === 'ERROR' ? 'var(--danger)' : s === 'WARN' ? 'var(--warn)' : s === 'DEBUG' ? 'var(--text-3)' : 'var(--accent)';
  return (
    <div className="col flex1" style={{ minHeight: 0 }}>
      <div className="row gap-2" style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-1)' }}>
        <span className="section-h">Logs</span>
        <div className="input" style={{ height: 26, padding: '0 8px', minWidth: 280 }}>
          <Icon.Search size={12} />
          <input placeholder="Semantic search in logs… e.g. 'planner abort'" />
          <span className="dim mono" style={{ fontSize: 10 }}>⌘K</span>
        </div>
        <div className="flex1" />
        <div className="row gap-1">
          <button className="pill sm danger" style={{ cursor: 'pointer' }}><span className="swatch" />ERROR ·3</button>
          <button className="pill sm warn" style={{ cursor: 'pointer' }}><span className="swatch" />WARN ·3</button>
          <button className="pill sm accent" style={{ cursor: 'pointer' }}><span className="swatch" />INFO ·5</button>
          <button className="pill sm ghost" style={{ cursor: 'pointer' }}>DEBUG ·1</button>
        </div>
      </div>
      <div className="flex1" style={{ overflow: 'auto' }}>
        <table className="mono" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--bg-1)', position: 'sticky', top: 0, zIndex: 1 }}>
              {['Timestamp','Severity','Node','Message'].map((h, i) => (
                <th key={i} style={{
                  textAlign: 'left', padding: '8px 12px',
                  fontSize: 10.5, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
                  color: 'var(--text-3)', borderBottom: '1px solid var(--border-1)',
                  fontFamily: 'var(--font-ui)',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DP.LOGS.map((l, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--border-1)' }}>
                <td style={{ padding: '7px 12px', color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{l.t}</td>
                <td style={{ padding: '7px 12px', whiteSpace: 'nowrap' }}>
                  <span style={{ color: sevColor(l.sev), fontWeight: 600, fontSize: 11 }}>{l.sev.padEnd(5,'\u00A0')}</span>
                </td>
                <td style={{ padding: '7px 12px', color: 'var(--accent)', whiteSpace: 'nowrap' }}>{l.node}</td>
                <td style={{ padding: '7px 12px', color: 'var(--text-1)' }}>{l.text}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ──────── KNOWLEDGE GRAPH ────────
function KGraphView() {
  const groupColor = {
    sensor: 'oklch(0.70 0.10 200)',
    fault:  'var(--danger)',
    state:  'var(--warn)',
    node:   'var(--accent)',
    outcome:'var(--magenta)',
  };
  const { nodes, edges } = DP.KGRAPH;
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]));

  return (
    <div className="col flex1" style={{ minHeight: 0 }}>
      <div className="row gap-2" style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-1)' }}>
        <span className="section-h">Knowledge Graph</span>
        <span className="pill sm ghost mono">causal chain · t=58-66s</span>
        <div className="flex1" />
        <div className="row gap-1">
          {[['sensor','Sensors'],['node','Nodes'],['state','States'],['fault','Faults'],['outcome','Outcomes']].map(([k, l]) => (
            <span key={k} className="pill sm ghost"><span className="swatch" style={{ background: groupColor[k] }} />{l}</span>
          ))}
        </div>
      </div>

      <div className="flex1" style={{ position: 'relative', overflow: 'hidden', background: 'var(--map-bg)' }}>
        <svg viewBox="0 0 700 460" preserveAspectRatio="xMidYMid meet" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          {/* grid dots */}
          <defs>
            <pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1" fill="var(--grid)" />
            </pattern>
            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--border-3)" />
            </marker>
          </defs>
          <rect width="700" height="460" fill="url(#dots)" />

          {/* edges */}
          {edges.map(([a, b], i) => {
            const A = byId[a], B = byId[b];
            return (
              <line key={i}
                x1={A.x} y1={A.y} x2={B.x} y2={B.y}
                stroke="var(--border-2)" strokeWidth="1.4"
                markerEnd="url(#arrow)"
                strokeDasharray={a === 'sensor' || a === 'dropout' ? '4 3' : 'none'}
                opacity={0.8}
              />
            );
          })}

          {/* nodes */}
          {nodes.map((n) => (
            <g key={n.id} transform={`translate(${n.x} ${n.y})`}>
              <rect x="-65" y="-18" width="130" height="36" rx="6"
                fill="var(--bg-2)" stroke={groupColor[n.group]} strokeWidth="1.5" />
              <circle cx="-50" cy="0" r="4" fill={groupColor[n.group]} />
              <text x="-38" y="4" fontSize="11" fill="var(--text-0)" fontFamily="JetBrains Mono">{n.label}</text>
            </g>
          ))}
        </svg>

        {/* legend / explanation */}
        <div className="panel" style={{ position: 'absolute', bottom: 14, left: 14, padding: '10px 12px', maxWidth: 320 }}>
          <div className="section-h" style={{ marginBottom: 4 }}>DataPilot inference</div>
          <div style={{ fontSize: 12, color: 'var(--text-1)', lineHeight: 1.5 }}>
            Sensor dropout cascaded through costmap inflation to a planner abort. Confidence: <span className="mono" style={{ color: 'var(--ok)' }}>0.94</span>. Explored 24 alternate paths, ruled out 18.
          </div>
        </div>
      </div>
    </div>
  );
}

// ──────── TOPICS PANEL (right sub-rail) ────────
function TopicsPanel() {
  return (
    <div className="col" style={{ width: 240, flexShrink: 0, background: 'var(--bg-1)', borderLeft: '1px solid var(--border-1)' }}>
      <div className="row" style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-1)' }}>
        <span className="section-h">Topics</span>
        <div className="flex1" />
        <span className="dim mono" style={{ fontSize: 10.5 }}>10</span>
      </div>
      <div style={{ padding: 8, overflow: 'auto' }}>
        {DP.TOPICS.map((t, i) => (
          <div key={i} className="row gap-2" style={{
            padding: '7px 8px',
            borderRadius: 6,
            cursor: 'pointer',
          }}>
            <div className="flex1" style={{ minWidth: 0 }}>
              <div className="mono" style={{ fontSize: 11.5, color: 'var(--text-0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</div>
              <div className="mono dim" style={{ fontSize: 10, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.type.split('/').pop()}</div>
            </div>
            <div className="col" style={{ alignItems: 'flex-end', flexShrink: 0 }}>
              <span className="mono" style={{ fontSize: 10.5, color: 'var(--accent)' }}>{t.hz} Hz</span>
              <span className="mono dim" style={{ fontSize: 9.5 }}>{t.msgs.toLocaleString()}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Workspace({ initialTab }) {
  const TABS = [
    { id: 'timeline', label: 'Timeline',        icon: <Icon.Clock size={13} />,    count: 12 },
    { id: 'metrics',  label: 'Metrics',         icon: <Icon.Activity size={13} />, count: 4 },
    { id: 'map',      label: 'Map',             icon: <Icon.Map size={13} />,      count: null },
    { id: 'logs',     label: 'Logs',            icon: <Icon.Terminal size={13} />, count: 128 },
    { id: 'kgraph',   label: 'Knowledge Graph', icon: <Icon.Graph size={13} />,    count: 8 },
  ];
  const [tab, setTab] = useStateW(initialTab || 'timeline');
  const [selectedEvent, setSelectedEvent] = useStateW(DP.TIMELINE_EVENTS[5]); // costmap inflation
  useEffectW(() => { if (initialTab) setTab(initialTab); }, [initialTab]);

  return (
    <div className="flex1 col" style={{ minWidth: 0 }}>
      {/* Data source bar */}
      <div className="row gap-3" style={{ height: 44, padding: '0 14px', borderBottom: '1px solid var(--border-1)', background: 'var(--bg-1)', flexShrink: 0 }}>
        <div className="row gap-1" style={{ background: 'var(--bg-0)', borderRadius: 6, padding: 3, border: '1px solid var(--border-1)' }}>
          <button className="btn sm" style={{ background: 'var(--bg-3)', borderColor: 'transparent', height: 22, fontSize: 11.5 }}>
            <Icon.File size={11} />Rosbag
          </button>
          <button className="btn ghost sm" style={{ height: 22, fontSize: 11.5, color: 'var(--text-3)' }}>
            <Icon.Wifi size={11} />Live robot
          </button>
        </div>
        <div className="row gap-2">
          <Icon.File size={13} />
          <span className="mono" style={{ fontSize: 12, color: 'var(--text-1)' }}>robot-12_2026-05-22_142.bag</span>
          <span className="dim mono" style={{ fontSize: 11 }}>312 MB · 14:32 · 10 topics</span>
        </div>
        <div className="flex1" />
        <div className="row gap-2">
          <span className="pill warn"><span className="swatch" />parsed</span>
          <span className="pill accent"><Icon.Sparkles size={10} />indexed by AI</span>
        </div>
        <div className="row gap-1" style={{ marginLeft: 8 }}>
          <button className="btn sm"><Icon.Play size={12} />Replay</button>
          <button className="btn ghost icon sm"><Icon.Share size={13} /></button>
          <button className="btn ghost icon sm"><Icon.Download size={13} /></button>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            {t.icon}
            {t.label}
            {t.count != null && <span className="count">{t.count}</span>}
          </button>
        ))}
        <div className="flex1" />
        <button className="tab" style={{ color: 'var(--text-3)' }}>
          <Icon.Plus size={13} />
        </button>
      </div>

      {/* Body + topics rail */}
      <div className="flex1" style={{ minHeight: 0, display: 'flex', flexDirection: 'row', alignItems: 'stretch' }}>
        <div className="flex1 col" style={{ minWidth: 0 }}>
          {tab === 'timeline' && <TimelineView events={DP.TIMELINE_EVENTS} onSelect={setSelectedEvent} selected={selectedEvent} />}
          {tab === 'metrics'  && <MetricView />}
          {tab === 'map'      && <MapView />}
          {tab === 'logs'     && <LogView />}
          {tab === 'kgraph'   && <KGraphView />}
        </div>
        <TopicsPanel />
      </div>
    </div>
  );
}

window.Workspace = Workspace;
