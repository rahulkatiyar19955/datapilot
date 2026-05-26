// replay.jsx — Synchronised debugging session replay

const { useState: useStateR, useEffect: useEffectR } = React;

function ReplayView() {
  const [playing, setPlaying] = useStateR(true);
  const [t, setT] = useStateR(66.3);  // seconds
  const [speed, setSpeed] = useStateR(1);
  const total = 100;

  useEffectR(() => {
    if (!playing) return;
    const i = setInterval(() => {
      setT((p) => {
        const n = p + 0.1 * speed;
        return n > total ? 0 : n;
      });
    }, 100);
    return () => clearInterval(i);
  }, [playing, speed]);

  const fmtT = (s) => {
    const m = Math.floor(s / 60), sec = s % 60;
    return `${String(m).padStart(2,'0')}:${sec.toFixed(2).padStart(5,'0')}`;
  };

  // simulate animated robot position along path
  const progress = Math.min(t / 70, 1);
  const robotX = 60 + (595 - 60) * progress;
  const robotY = 380 - (380 - 245) * progress;

  return (
    <div className="col flex1" style={{ minHeight: 0, background: 'var(--bg-0)' }}>
      {/* Header */}
      <div className="row gap-3" style={{ padding: '12px 18px', borderBottom: '1px solid var(--border-1)' }}>
        <div className="col">
          <div className="row gap-2">
            <Icon.Play size={14} />
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-0)' }}>Replay Session</span>
            <span className="pill sm ghost mono">robot-12_2026-05-22_142.bag</span>
          </div>
          <span className="dim mono" style={{ fontSize: 11, marginTop: 2 }}>synchronised playback · 10 topics · TF · /tf_static · 2 cameras</span>
        </div>
        <div className="flex1" />
        <button className="btn sm"><Icon.Share size={12} />Share session</button>
        <button className="btn sm"><Icon.Download size={12} />Export MP4</button>
      </div>

      {/* Main grid */}
      <div className="flex1" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gridTemplateRows: '1fr 1fr', gap: 1, minHeight: 0, background: 'var(--border-1)' }}>
        {/* 3D / Map view */}
        <div className="col" style={{ background: 'var(--map-bg)', position: 'relative', gridRow: '1 / 3' }}>
          <div className="row gap-2" style={{ padding: '10px 14px', background: 'var(--bg-1)', borderBottom: '1px solid var(--border-1)' }}>
            <Icon.Map size={12} />
            <span style={{ fontSize: 11.5, fontWeight: 600 }}>2D Map · TF frames</span>
            <span className="pill sm ghost mono">base_link</span>
            <div className="flex1" />
            <button className="btn ghost icon sm"><Icon.Zoom size={12} /></button>
            <button className="btn ghost icon sm"><Icon.Layers size={12} /></button>
          </div>
          <div className="flex1" style={{ position: 'relative', overflow: 'hidden' }}>
            <svg viewBox="0 0 800 500" preserveAspectRatio="xMidYMid meet" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
              <defs>
                <pattern id="rgrid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="var(--grid)" strokeWidth="0.5"/>
                </pattern>
              </defs>
              <rect width="800" height="500" fill="url(#rgrid)" />
              <rect x="40" y="40" width="720" height="420" fill="none" stroke="var(--border-2)" strokeWidth="2" />

              {/* obstacles */}
              {[[120,80,160,40],[380,80,160,40],[640,80,100,40],[120,400,120,40],[320,400,120,40],[520,400,120,40]].map(([x,y,w,h], i) => (
                <rect key={i} x={x} y={y} width={w} height={h} fill="var(--bg-2)" stroke="var(--border-2)" />
              ))}

              {/* trajectory ghost */}
              <path d="M 60 380 Q 160 360 240 320 T 420 260 T 600 220 T 760 200" stroke="var(--accent)" strokeWidth="2" fill="none" strokeDasharray="6 4" opacity="0.4" />
              {/* actual traversed */}
              <path d={`M 60 380 Q 160 360 240 320 T ${robotX} ${robotY}`} stroke="var(--warn)" strokeWidth="2.5" fill="none" />

              {/* LiDAR scan rays at current pose */}
              {Array.from({ length: 24 }).map((_, i) => {
                const a = (i / 24) * Math.PI * 2;
                const r = 60 + (i % 4) * 8;
                const x2 = robotX + Math.cos(a) * r;
                const y2 = robotY + Math.sin(a) * r;
                return (
                  <line key={i} x1={robotX} y1={robotY} x2={x2} y2={y2}
                    stroke="var(--accent)" strokeWidth="0.6" opacity="0.4" />
                );
              })}
              {Array.from({ length: 60 }).map((_, i) => {
                const a = (i / 60) * Math.PI * 2;
                const r = 56 + Math.sin(i * 0.7) * 6;
                return (
                  <circle key={i} cx={robotX + Math.cos(a) * r} cy={robotY + Math.sin(a) * r}
                    r="1" fill="var(--accent)" opacity="0.85" />
                );
              })}

              {/* robot model + TF axes */}
              <g transform={`translate(${robotX} ${robotY})`}>
                <circle r="14" fill="oklch(0.55 0.18 235 / 0.2)" />
                <rect x="-10" y="-7" width="20" height="14" rx="2" fill="var(--accent)" stroke="var(--text-0)" strokeWidth="1" />
                {/* x axis (forward) */}
                <line x1="0" y1="0" x2="20" y2="0" stroke="var(--danger)" strokeWidth="1.5" />
                {/* y axis */}
                <line x1="0" y1="0" x2="0" y2="-20" stroke="var(--ok)" strokeWidth="1.5" />
                <text x="22" y="4" fontSize="9" fill="var(--danger)" fontFamily="JetBrains Mono">x</text>
                <text x="-3" y="-22" fontSize="9" fill="var(--ok)" fontFamily="JetBrains Mono">y</text>
              </g>

              {t > 64 && t < 73 && (
                <g>
                  <circle cx="595" cy="245" r="40" fill="var(--danger)" opacity="0.15" />
                  <text x="540" y="285" fontSize="11" fill="var(--danger)" fontFamily="JetBrains Mono">⚠ sensor dropout</text>
                </g>
              )}
            </svg>

            <div className="panel" style={{ position: 'absolute', top: 12, left: 12, padding: '6px 10px' }}>
              <div className="mono" style={{ fontSize: 10.5, color: 'var(--text-2)' }}>POSE</div>
              <div className="mono" style={{ fontSize: 11, color: 'var(--text-1)' }}>x: {(robotX * 0.1).toFixed(2)} m</div>
              <div className="mono" style={{ fontSize: 11, color: 'var(--text-1)' }}>y: {(robotY * 0.1).toFixed(2)} m</div>
              <div className="mono" style={{ fontSize: 11, color: 'var(--text-1)' }}>yaw: 1.57 rad</div>
            </div>
          </div>
        </div>

        {/* Camera feed */}
        <div className="col" style={{ background: 'var(--bg-0)', position: 'relative' }}>
          <div className="row gap-2" style={{ padding: '10px 14px', background: 'var(--bg-1)', borderBottom: '1px solid var(--border-1)' }}>
            <Icon.Robot size={12} />
            <span style={{ fontSize: 11.5, fontWeight: 600 }}>Camera · /camera/front/color</span>
            <span className="pill sm ghost mono">1280×720 · 30 Hz</span>
          </div>
          <div className="flex1" style={{ position: 'relative', background: 'oklch(0.10 0.005 240)', overflow: 'hidden' }}>
            {/* simulated camera image */}
            <svg viewBox="0 0 400 250" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
              <defs>
                <linearGradient id="floor" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="oklch(0.20 0.005 240)" />
                  <stop offset="100%" stopColor="oklch(0.12 0.005 240)" />
                </linearGradient>
                <linearGradient id="ceil" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="oklch(0.16 0.005 240)" />
                  <stop offset="100%" stopColor="oklch(0.22 0.005 240)" />
                </linearGradient>
              </defs>
              <rect width="400" height="120" fill="url(#ceil)" />
              <rect y="120" width="400" height="130" fill="url(#floor)" />
              {/* vanishing point perspective */}
              <line x1="0" y1="120" x2="400" y2="120" stroke="oklch(0.30 0.005 240)" strokeWidth="0.5" />
              <line x1="0" y1="250" x2="160" y2="120" stroke="oklch(0.28 0.005 240)" strokeWidth="0.5" />
              <line x1="400" y1="250" x2="240" y2="120" stroke="oklch(0.28 0.005 240)" strokeWidth="0.5" />
              {/* shelves */}
              <rect x="20" y="60" width="80" height="60" fill="oklch(0.25 0.01 240)" stroke="oklch(0.35 0.01 240)" strokeWidth="0.5" />
              <rect x="300" y="60" width="80" height="60" fill="oklch(0.25 0.01 240)" stroke="oklch(0.35 0.01 240)" strokeWidth="0.5" />
              {/* a 'pallet' ahead */}
              <rect x="160" y="130" width="80" height="30" fill="oklch(0.30 0.04 70)" stroke="oklch(0.45 0.06 70)" strokeWidth="0.6" />
              {/* detection box */}
              <rect x="155" y="125" width="90" height="40" fill="none" stroke="var(--ok)" strokeWidth="1.2" strokeDasharray="3 2" />
              <rect x="155" y="115" width="68" height="10" fill="var(--ok)" />
              <text x="159" y="123" fontSize="7" fill="var(--bg-0)" fontFamily="JetBrains Mono" fontWeight="600">pallet · 0.94</text>

              {/* mascot pedestrian - lost detection */}
              {t > 58 && t < 67 && (
                <g>
                  <rect x="280" y="100" width="20" height="50" fill="oklch(0.30 0.05 25)" />
                  <circle cx="290" cy="92" r="7" fill="oklch(0.50 0.04 25)" />
                  <rect x="278" y="98" width="24" height="56" fill="none" stroke="var(--danger)" strokeWidth="1.2" strokeDasharray="2 2" />
                  <rect x="278" y="88" width="68" height="10" fill="var(--danger)" />
                  <text x="282" y="96" fontSize="7" fill="white" fontFamily="JetBrains Mono" fontWeight="600">person · 0.54 ⚠</text>
                </g>
              )}
            </svg>

            {/* HUD */}
            <div style={{ position: 'absolute', top: 8, left: 8, right: 8 }} className="row gap-2">
              <span className="pill sm ghost mono" style={{ background: 'oklch(0.08 0 0 / 0.7)' }}>● REC</span>
              <span className="pill sm ghost mono" style={{ background: 'oklch(0.08 0 0 / 0.7)' }}>{fmtT(t)}</span>
              <div className="flex1" />
              <span className="pill sm ghost mono" style={{ background: 'oklch(0.08 0 0 / 0.7)' }}>2 obj</span>
            </div>
          </div>
        </div>

        {/* Live data stream */}
        <div className="col" style={{ background: 'var(--bg-0)' }}>
          <div className="row gap-2" style={{ padding: '10px 14px', background: 'var(--bg-1)', borderBottom: '1px solid var(--border-1)' }}>
            <Icon.Terminal size={12} />
            <span style={{ fontSize: 11.5, fontWeight: 600 }}>Live stream</span>
            <div className="flex1" />
            <span className="dim mono" style={{ fontSize: 10.5 }}>10 topics</span>
          </div>
          <div className="flex1 mono" style={{ overflow: 'auto', padding: '8px 14px', fontSize: 11, lineHeight: 1.6, color: 'var(--text-2)' }}>
            <div><span style={{ color: 'var(--text-3)' }}>[{fmtT(t)}]</span> <span style={{ color: 'var(--accent)' }}>/odom</span> pose.x={(robotX*0.1).toFixed(2)} y={(robotY*0.1).toFixed(2)} v=0.42</div>
            <div><span style={{ color: 'var(--text-3)' }}>[{fmtT(t)}]</span> <span style={{ color: 'var(--accent)' }}>/scan</span> ranges[1080] min=0.42 max=29.8</div>
            <div><span style={{ color: 'var(--text-3)' }}>[{fmtT(t)}]</span> <span style={{ color: 'var(--accent)' }}>/cmd_vel</span> linear.x=0.42 angular.z=0.01</div>
            {t > 64 && (
              <div style={{ color: 'var(--danger)' }}><span style={{ color: 'var(--text-3)' }}>[{fmtT(t)}]</span> ERROR /sensors/lidar_a — no data 782ms</div>
            )}
            {t > 65 && (
              <div style={{ color: 'var(--warn)' }}><span style={{ color: 'var(--text-3)' }}>[{fmtT(t)}]</span> WARN /costmap inflated 0.85m</div>
            )}
            {t > 66 && (
              <div style={{ color: 'var(--danger)' }}><span style={{ color: 'var(--text-3)' }}>[{fmtT(t)}]</span> ERROR /move_base plan abort</div>
            )}
            <div><span style={{ color: 'var(--text-3)' }}>[{fmtT(t)}]</span> <span style={{ color: 'var(--accent)' }}>/tf</span> map→odom→base_link <span className="caret" /></div>
          </div>
        </div>
      </div>

      {/* Transport bar */}
      <div style={{ borderTop: '1px solid var(--border-1)', background: 'var(--bg-1)', padding: '12px 18px' }}>
        <div className="row gap-3" style={{ marginBottom: 8 }}>
          <button className="btn ghost icon"><Icon.Refresh size={14} /></button>
          <button className="btn icon" style={{ width: 36, height: 36, borderRadius: 50, background: 'var(--accent)', borderColor: 'var(--accent)', color: 'var(--bg-0)' }} onClick={() => setPlaying(p => !p)}>
            {playing ? <Icon.Pause size={16} stroke={2.5} /> : <Icon.Play size={16} stroke={2.5} />}
          </button>
          <button className="btn ghost icon"><Icon.Refresh size={14} style={{ transform: 'scaleX(-1)' }} /></button>
          <span className="mono" style={{ fontSize: 13, color: 'var(--text-0)', minWidth: 76 }}>{fmtT(t)}</span>
          <span className="dim mono" style={{ fontSize: 12 }}>/ {fmtT(total)}</span>
          <div className="flex1" />
          <div className="row gap-1">
            {[0.25, 0.5, 1, 2, 4].map(s => (
              <button key={s} className={`btn sm ${speed === s ? '' : 'ghost'}`} onClick={() => setSpeed(s)}>
                {s}×
              </button>
            ))}
          </div>
          <button className="btn ghost icon"><Icon.Settings size={14} /></button>
        </div>

        {/* Scrubber w/ event ticks */}
        <div style={{ position: 'relative', height: 30 }}>
          <div style={{ position: 'absolute', left: 0, right: 0, top: 14, height: 4, background: 'var(--bg-3)', borderRadius: 2 }} />
          <div style={{ position: 'absolute', left: 0, top: 14, height: 4, width: `${(t/total)*100}%`, background: 'var(--accent)', borderRadius: 2 }} />
          {DP.TIMELINE_EVENTS.map((e, i) => (
            <div key={i} style={{
              position: 'absolute', left: `${(e.t/total)*100}%`, top: 8,
              width: 2, height: 16,
              transform: 'translateX(-1px)',
              background: e.sev === 'critical' ? 'var(--danger)' : e.sev === 'warning' ? 'var(--warn)' : 'var(--accent-dim)',
            }} title={e.label} />
          ))}
          <div style={{
            position: 'absolute', left: `${(t/total)*100}%`, top: 9,
            width: 14, height: 14,
            transform: 'translateX(-7px)',
            background: 'var(--text-0)',
            borderRadius: 50,
            border: '2px solid var(--accent)',
            cursor: 'grab',
            boxShadow: '0 2px 8px oklch(0 0 0 / 0.5)',
          }} />
        </div>
      </div>
    </div>
  );
}

window.ReplayView = ReplayView;
