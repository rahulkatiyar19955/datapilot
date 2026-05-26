// search.jsx — Semantic search overlay

const { useState: useStateS } = React;

function MiniTimeline({ anomalies = 0 }) {
  const dots = Array.from({ length: 20 });
  // distribute anomalies pseudo-randomly across the strip
  const anomalyIdx = new Set();
  let seed = anomalies * 13;
  for (let i = 0; i < anomalies && i < 8; i++) {
    seed = (seed * 9301 + 49297) % 233280;
    anomalyIdx.add(seed % 20);
  }
  return (
    <div className="row" style={{ gap: 2, height: 16, alignItems: 'center' }}>
      {dots.map((_, i) => {
        const isAnom = anomalyIdx.has(i);
        return (
          <div key={i} style={{
            flex: 1, height: isAnom ? 12 : 4,
            borderRadius: 1.5,
            background: isAnom ? (i % 2 ? 'var(--danger)' : 'var(--warn)') : 'var(--bg-3)',
          }} />
        );
      })}
    </div>
  );
}

function SearchResultCard({ run, onClick }) {
  return (
    <div className="card" onClick={onClick} style={{ padding: '14px 16px', cursor: 'pointer', transition: 'all 0.12s' }}>
      <div className="row gap-2" style={{ marginBottom: 8 }}>
        <span className="mono" style={{ fontSize: 12, color: 'var(--accent)' }}>{run.id}</span>
        <span className="dim mono" style={{ fontSize: 10.5 }}>· {run.robot}</span>
        <div className="flex1" />
        <span className="dim mono" style={{ fontSize: 10.5 }}>{run.date} · {run.dur}</span>
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-0)', marginBottom: 10, lineHeight: 1.4 }}>
        {run.title}
      </div>
      <div style={{ marginBottom: 10 }}>
        <MiniTimeline anomalies={run.anomalies} />
      </div>
      <div className="row gap-2" style={{ flexWrap: 'wrap' }}>
        <span className="pill sm ghost"><Icon.Map size={10} />{run.env}</span>
        <span className={`pill sm ${run.anomalies > 3 ? 'danger' : run.anomalies > 0 ? 'warn' : 'ok'}`}>
          <span className="swatch" />{run.anomalies} anomalies
        </span>
        {run.tags.map((t, i) => (
          <span key={i} className="pill sm ghost mono" style={{ fontSize: 10 }}>#{t}</span>
        ))}
      </div>
    </div>
  );
}

function SemanticSearchOverlay({ onClose }) {
  const [q, setQ] = useStateS('all runs where pedestrian detection failed in rain');
  const suggestions = [
    'planner aborts in the last 30 days',
    'lidar dropout > 500ms on Atlas-K2',
    'localization drift > 0.3m on slopes',
    'recovery behaviors triggered > 2 times',
  ];
  // filter the past runs to demo a search result
  const results = DP.PAST_RUNS.filter(r =>
    r.tags.some(t => q.toLowerCase().includes(t.split('-')[0])) ||
    q.toLowerCase().includes(r.env.toLowerCase()) ||
    q.includes('all')
  );
  const shown = results.length ? results : DP.PAST_RUNS;

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 50,
      background: 'oklch(0.08 0.01 240 / 0.65)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      display: 'flex', flexDirection: 'column',
      padding: '60px 80px',
    }} className="fade-in" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="col panel" style={{
        flex: 1, minHeight: 0,
        boxShadow: '0 30px 80px -20px oklch(0 0 0 / 0.8)',
        borderColor: 'var(--border-2)',
      }}>
        {/* Header */}
        <div className="row gap-3" style={{ padding: '18px 20px', borderBottom: '1px solid var(--border-1)' }}>
          <Icon.Search size={18} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search past runs in natural language…"
            autoFocus
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              fontSize: 18, color: 'var(--text-0)', fontFamily: 'inherit',
              letterSpacing: '-0.01em',
            }}
          />
          <span className="pill sm accent"><Icon.Sparkles size={10} />semantic</span>
          <button className="btn ghost icon" onClick={onClose}><Icon.X size={14} /></button>
        </div>

        {/* Body */}
        <div className="flex1 row" style={{ minHeight: 0 }}>
          {/* Suggestions / filters left */}
          <div className="col" style={{ width: 240, flexShrink: 0, borderRight: '1px solid var(--border-1)', padding: '14px 14px 14px 18px', overflowY: 'auto', gap: 16 }}>
            <div>
              <div className="section-h" style={{ marginBottom: 8 }}>Try</div>
              <div className="col gap-1">
                {suggestions.map((s, i) => (
                  <button key={i} className="btn ghost sm" onClick={() => setQ(s)} style={{
                    justifyContent: 'flex-start', textAlign: 'left',
                    height: 'auto', padding: '6px 8px', whiteSpace: 'normal',
                    lineHeight: 1.35,
                  }}>
                    <Icon.Sparkles size={11} />
                    <span>{s}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="section-h" style={{ marginBottom: 8 }}>Filters</div>
              <div className="col gap-2">
                <div className="row gap-2"><input type="checkbox" defaultChecked /> <span style={{ fontSize: 12 }}>Last 30 days</span></div>
                <div className="row gap-2"><input type="checkbox" /> <span style={{ fontSize: 12 }}>Has anomalies</span></div>
                <div className="row gap-2"><input type="checkbox" defaultChecked /> <span style={{ fontSize: 12 }}>Atlas-K2 only</span></div>
                <div className="row gap-2"><input type="checkbox" /> <span style={{ fontSize: 12 }}>Outdoor</span></div>
                <div className="row gap-2"><input type="checkbox" /> <span style={{ fontSize: 12 }}>Wet conditions</span></div>
              </div>
            </div>

            <div>
              <div className="section-h" style={{ marginBottom: 8 }}>Tags</div>
              <div className="row gap-1" style={{ flexWrap: 'wrap' }}>
                {['planner-abort', 'lidar-dropout', 'perception-fail', 'rain', 'fog', 'localization', 'costmap'].map((t, i) => (
                  <span key={i} className="pill sm ghost mono" style={{ fontSize: 10, cursor: 'pointer' }}>#{t}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Results */}
          <div className="flex1 col" style={{ minWidth: 0 }}>
            <div className="row gap-2" style={{ padding: '12px 20px', borderBottom: '1px solid var(--border-1)' }}>
              <span className="dim mono" style={{ fontSize: 11.5 }}>
                {shown.length} runs · ranked by semantic relevance
              </span>
              <div className="flex1" />
              <span className="dim" style={{ fontSize: 11.5 }}>Sort:</span>
              <button className="btn ghost sm">Relevance <Icon.ChevronDown size={11} /></button>
            </div>

            <div className="flex1" style={{ overflowY: 'auto', padding: '14px 20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 12 }}>
                {shown.map((r) => (
                  <SearchResultCard key={r.id} run={r} onClick={onClose} />
                ))}
              </div>

              {/* AI summary */}
              <div className="card" style={{ marginTop: 18, padding: '14px 16px' }}>
                <div className="row gap-2" style={{ marginBottom: 6 }}>
                  <Icon.Sparkles size={13} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-0)' }}>DataPilot synthesis</span>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text-1)', lineHeight: 1.55 }}>
                  Across the {shown.length} matching runs, pedestrian detection confidence dropped <span className="mono" style={{ color: 'var(--warn)' }}>0.91 → 0.54</span> on average during precipitation. <span style={{ color: 'var(--text-2)' }}>Atlas-K2</span> robots with <span className="mono" style={{ color: 'var(--accent)' }}>camera_a</span> v1.3.2 show the strongest effect. Recommended: review lens-clearing firmware, schedule re-calibration runs in clear conditions for comparison.
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="row gap-3" style={{ padding: '10px 20px', borderTop: '1px solid var(--border-1)', background: 'var(--bg-0)' }}>
          <span className="dim mono" style={{ fontSize: 10.5 }}>↑↓ navigate</span>
          <span className="dim mono" style={{ fontSize: 10.5 }}>↵ open</span>
          <span className="dim mono" style={{ fontSize: 10.5 }}>⌘D filter</span>
          <div className="flex1" />
          <span className="dim mono" style={{ fontSize: 10.5 }}>esc to close</span>
        </div>
      </div>
    </div>
  );
}

window.SemanticSearchOverlay = SemanticSearchOverlay;
