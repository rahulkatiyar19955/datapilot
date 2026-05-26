// fleet.jsx — Fleet monitoring dashboard

const { useState: useStateF } = React;

function StatusDot({ status }) {
  const map = {
    ok:       { color: 'var(--ok)',    glow: 'oklch(0.78 0.17 150 / 0.6)' },
    warning:  { color: 'var(--warn)',  glow: 'oklch(0.80 0.15 80 / 0.6)' },
    critical: { color: 'var(--danger)', glow: 'oklch(0.70 0.20 25 / 0.6)' },
    offline:  { color: 'var(--text-3)', glow: 'transparent' },
  };
  const s = map[status] || map.offline;
  return (
    <span style={{
      width: 8, height: 8, borderRadius: 50,
      background: s.color,
      boxShadow: status !== 'offline' ? `0 0 10px ${s.glow}` : 'none',
      flexShrink: 0,
    }} />
  );
}

function Sparkline({ trend = 'stable', color = 'var(--accent)' }) {
  const path = trend === 'down' ? "M 0 6 L 12 7 L 24 5 L 36 12 L 48 18" :
               trend === 'up'   ? "M 0 18 L 12 14 L 24 16 L 36 8 L 48 4" :
               trend === 'spike'? "M 0 14 L 8 14 L 14 4 L 20 14 L 32 14 L 38 4 L 48 14" :
                                  "M 0 12 L 12 10 L 24 13 L 36 11 L 48 12";
  return (
    <svg width="48" height="20" viewBox="0 0 48 22" style={{ display: 'block' }}>
      <path d={path} stroke={color} strokeWidth="1.4" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function RobotCard({ r, onClick, selected }) {
  return (
    <div className="card" onClick={onClick} style={{
      padding: '14px 14px 12px',
      cursor: 'pointer',
      borderColor: selected ? 'var(--accent)' : (r.status === 'critical' ? 'oklch(0.50 0.14 25 / 0.6)' : 'var(--border-1)'),
      boxShadow: selected ? '0 0 0 1px var(--accent), 0 0 0 4px var(--accent-bg)' : 'none',
      transition: 'all 0.12s',
    }}>
      <div className="row gap-2" style={{ marginBottom: 8 }}>
        <StatusDot status={r.status} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--text-0)' }}>{r.name}</span>
        <span className="dim mono" style={{ fontSize: 10.5 }}>· {r.model}</span>
        <div className="flex1" />
        {r.alerts > 0 && (
          <span className="pill sm danger" style={{ height: 16 }}>
            <Icon.Alert size={9} />{r.alerts}
          </span>
        )}
      </div>

      <div className="row gap-2" style={{ marginBottom: 10 }}>
        <Icon.Map size={11} stroke={1.4} />
        <span style={{ fontSize: 11.5, color: 'var(--text-2)' }}>{r.site}</span>
      </div>

      <div style={{ fontSize: 11.5, color: r.status === 'offline' ? 'var(--text-3)' : 'var(--text-1)', marginBottom: 12 }}>
        {r.task}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 10px', fontSize: 11 }}>
        <div className="row gap-2">
          <Icon.Battery size={12} stroke={1.4} />
          <div className="col" style={{ flex: 1, gap: 3 }}>
            <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-1)' }}>{r.battery}%</span>
            <div style={{ height: 3, background: 'var(--bg-3)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                width: `${r.battery}%`, height: '100%',
                background: r.battery < 40 ? 'var(--warn)' : r.battery < 20 ? 'var(--danger)' : 'var(--ok)',
              }} />
            </div>
          </div>
        </div>
        <div className="row gap-2">
          <Icon.Cpu size={12} stroke={1.4} />
          <div className="col" style={{ flex: 1, gap: 3 }}>
            <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-1)' }}>{r.cpu}%</span>
            <div style={{ height: 3, background: 'var(--bg-3)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                width: `${r.cpu}%`, height: '100%',
                background: r.cpu > 75 ? 'var(--danger)' : r.cpu > 50 ? 'var(--warn)' : 'var(--accent)',
              }} />
            </div>
          </div>
        </div>
        <div className="row gap-2">
          <Icon.Clock size={12} stroke={1.4} />
          <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-2)' }}>{r.uptime}</span>
        </div>
        <div className="row gap-2">
          <Icon.Activity size={12} stroke={1.4} />
          <Sparkline trend={r.status === 'critical' ? 'spike' : r.status === 'warning' ? 'down' : 'stable'}
                     color={r.status === 'critical' ? 'var(--danger)' : r.status === 'warning' ? 'var(--warn)' : 'var(--ok)'} />
        </div>
      </div>
    </div>
  );
}

function FleetStat({ label, value, hint, color }) {
  return (
    <div className="card" style={{ padding: '14px 16px', flex: 1 }}>
      <div className="section-h" style={{ marginBottom: 8 }}>{label}</div>
      <div className="row gap-2" style={{ alignItems: 'baseline' }}>
        <span style={{ fontSize: 28, fontWeight: 600, color: color || 'var(--text-0)', letterSpacing: '-0.02em', fontFamily: 'var(--font-mono)' }}>{value}</span>
        {hint && <span className="dim" style={{ fontSize: 11 }}>{hint}</span>}
      </div>
    </div>
  );
}

function FleetInsightCard({ icon, robot, severity, title, time }) {
  const sevMap = { critical: 'danger', warning: 'warn', info: 'accent' };
  return (
    <div className="row gap-3" style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-1)' }}>
      <div style={{
        width: 28, height: 28, borderRadius: 6,
        background: 'var(--bg-3)',
        display: 'grid', placeItems: 'center',
        color: severity === 'critical' ? 'var(--danger)' : severity === 'warning' ? 'var(--warn)' : 'var(--accent)',
        flexShrink: 0,
      }}>
        {icon}
      </div>
      <div className="flex1">
        <div className="row gap-2" style={{ marginBottom: 2 }}>
          <span className="mono" style={{ fontSize: 11.5, color: 'var(--text-1)' }}>{robot}</span>
          <span className={`pill sm ${sevMap[severity]}`}><span className="swatch" />{severity}</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-1)', lineHeight: 1.4 }}>{title}</div>
      </div>
      <span className="dim mono" style={{ fontSize: 10.5 }}>{time}</span>
    </div>
  );
}

function FleetDashboard() {
  const [selected, setSelected] = useStateF('rb-12');
  const [filter, setFilter] = useStateF('all');

  const filtered = filter === 'all' ? DP.ROBOTS :
                   filter === 'attention' ? DP.ROBOTS.filter(r => r.status === 'critical' || r.status === 'warning') :
                   DP.ROBOTS.filter(r => r.status === filter);

  const counts = {
    total: DP.ROBOTS.length,
    ok: DP.ROBOTS.filter(r => r.status === 'ok').length,
    warn: DP.ROBOTS.filter(r => r.status === 'warning').length,
    crit: DP.ROBOTS.filter(r => r.status === 'critical').length,
    off: DP.ROBOTS.filter(r => r.status === 'offline').length,
  };

  return (
    <div className="col flex1" style={{ minHeight: 0, background: 'var(--bg-0)' }}>
      {/* Header */}
      <div className="row gap-3" style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-1)', flexShrink: 0 }}>
        <div className="col">
          <div className="row gap-2">
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--text-0)' }}>Fleet</h2>
            <span className="pill sm ghost mono">{counts.total} robots</span>
          </div>
          <span className="dim" style={{ fontSize: 11.5, marginTop: 2 }}>Northern Yard · 3 sites · live</span>
        </div>
        <div className="flex1" />
        <div className="input" style={{ height: 30, minWidth: 260 }}>
          <Icon.Search size={13} />
          <input placeholder="Filter by fleet, location, model…" />
        </div>
        <button className="btn sm"><Icon.Filter size={12} />Filters</button>
        <button className="btn primary sm"><Icon.Plus size={12} />Add robot</button>
      </div>

      <div className="flex1" style={{ minHeight: 0, display: 'flex', flexDirection: 'row', alignItems: 'stretch' }}>
        {/* Main grid */}
        <div className="flex1 col" style={{ minWidth: 0, overflow: 'auto', padding: 18 }}>
          {/* Stats */}
          <div className="row gap-3" style={{ marginBottom: 18 }}>
            <FleetStat label="Online" value={counts.total - counts.off} hint={`/ ${counts.total} total`} color="var(--text-0)" />
            <FleetStat label="Critical" value={counts.crit} hint="immediate" color="var(--danger)" />
            <FleetStat label="Warnings" value={counts.warn} hint="across 2 sites" color="var(--warn)" />
            <FleetStat label="Avg uptime" value="11.4h" hint="↑ 8% wk/wk" color="var(--ok)" />
            <FleetStat label="AI insights" value="24" hint="last 24h" color="var(--accent)" />
          </div>

          {/* Filter chips */}
          <div className="row gap-2" style={{ marginBottom: 14 }}>
            {[
              ['all', `All · ${counts.total}`],
              ['attention', `Needs attention · ${counts.crit + counts.warn}`],
              ['critical', `Critical · ${counts.crit}`],
              ['warning', `Warning · ${counts.warn}`],
              ['ok', `OK · ${counts.ok}`],
              ['offline', `Offline · ${counts.off}`],
            ].map(([k, l]) => (
              <button key={k}
                className={`pill ${filter === k ? 'accent' : 'ghost'}`}
                style={{ cursor: 'pointer', height: 26 }}
                onClick={() => setFilter(k)}>
                {l}
              </button>
            ))}
          </div>

          {/* Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12, paddingBottom: 18 }}>
            {filtered.map((r) => (
              <RobotCard key={r.id} r={r} selected={selected === r.id} onClick={() => setSelected(r.id)} />
            ))}
          </div>
        </div>

        {/* Right insight rail */}
        <div className="col" style={{ width: 340, flexShrink: 0, background: 'var(--bg-1)', borderLeft: '1px solid var(--border-1)' }}>
          <div className="row gap-2" style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-1)' }}>
            <Icon.Sparkles size={14} />
            <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-0)' }}>AI Insights</span>
            <span className="pill sm accent">live</span>
            <div className="flex1" />
            <span className="dim mono" style={{ fontSize: 10.5 }}>last 24h</span>
          </div>

          <div className="flex1" style={{ overflow: 'auto' }}>
            <div style={{ padding: '10px 16px 4px' }}>
              <div className="section-h" style={{ marginBottom: 4 }}>Pattern detected</div>
            </div>
            <div className="card" style={{ margin: '0 12px 12px', padding: '12px 14px' }}>
              <div className="row gap-2" style={{ marginBottom: 6 }}>
                <Icon.Sparkles size={12} />
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-0)' }}>Yard fleet perception fails in rain</span>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-2)', lineHeight: 1.5, marginBottom: 8 }}>
                3 Atlas-K3 robots dropped pedestrian detection confidence below 0.6 during the last 2 wet runs. Likely cause: <span className="mono" style={{ color: 'var(--text-1)' }}>camera_a</span> lens fogging.
              </div>
              <div className="row gap-2">
                <span className="pill sm warn"><span className="swatch" />trend</span>
                <span className="pill sm ghost">3 robots</span>
                <button className="btn ghost sm" style={{ marginLeft: 'auto' }}>Investigate <Icon.ArrowRight size={11} /></button>
              </div>
            </div>

            <div style={{ padding: '10px 16px 4px' }}>
              <div className="section-h">Recent alerts</div>
            </div>
            <FleetInsightCard icon={<Icon.Alert size={14} />} robot="robot-12" severity="critical" title="Planner abort near loading bay 3 — lidar dropout cascade" time="3m ago" />
            <FleetInsightCard icon={<Icon.Activity size={14} />} robot="robot-31" severity="warning" title="Localization drift +0.34m on yard slope" time="14m ago" />
            <FleetInsightCard icon={<Icon.Cpu size={14} />} robot="robot-07" severity="warning" title="CPU sustained >70% for 8 minutes during scan" time="22m ago" />
            <FleetInsightCard icon={<Icon.Battery size={14} />} robot="robot-03" severity="info" title="Battery degradation +2.1% vs cohort baseline" time="1h ago" />
            <FleetInsightCard icon={<Icon.Wifi size={14} />} robot="robot-18" severity="critical" title="Lost telemetry — last seen aisle A-12" time="2h ago" />
            <FleetInsightCard icon={<Icon.Bot size={14} />} robot="robot-22" severity="info" title="Patrol completed 14 loops · nominal" time="3h ago" />
          </div>
        </div>
      </div>
    </div>
  );
}

window.FleetDashboard = FleetDashboard;
window.StatusDot = StatusDot;
