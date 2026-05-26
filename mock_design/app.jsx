// app.jsx — Main shell

const { useState: useStateA, useEffect: useEffectA } = React;

function NavBtn({ icon, label, active, onClick, badge }) {
  return (
    <button className={`rail-btn ${active ? 'active' : ''}`} onClick={onClick} title={label} data-screen-label={label}>
      {icon}
      {badge && (
        <span style={{
          position: 'absolute', top: 4, right: 4,
          width: 6, height: 6, borderRadius: 50,
          background: 'var(--danger)',
          boxShadow: '0 0 6px var(--danger)',
        }} />
      )}
    </button>
  );
}

function App() {
  const [screen, setScreen] = useStateA('copilot'); // copilot | fleet | replay | agents | settings
  const [searchOpen, setSearchOpen] = useStateA(false);
  const [tab, setTab] = useStateA('timeline');
  const [theme, setTheme] = useStateA(() => localStorage.getItem('datapilot.theme') || 'dark');

  useEffectA(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('datapilot.theme', theme);
  }, [theme]);

  // ⌘K opens search
  useEffectA(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      } else if (e.key === 'Escape') {
        setSearchOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const jumpFromChat = (target) => {
    setScreen('copilot');
    setTab(target);
  };

  return (
    <div className="window">
      {/* Title bar */}
      <div className="titlebar">
        <div className="traffic">
          <span className="dot red" />
          <span className="dot yellow" />
          <span className="dot green" />
        </div>
        <div className="title">
          <b>DataPilot</b> · robot-12_2026-05-22_142.bag — Loading Bay 3 incident
        </div>
        <div className="row gap-2">
          <button className="btn ghost icon sm" onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
            {theme === 'dark' ? <Icon.Sun size={13} /> : <Icon.Moon size={13} />}
          </button>
          <span className="pill sm ghost mono">v0.18.4</span>
          <span className="pill sm ok"><span className="swatch" />local</span>
        </div>
      </div>

      {/* Body */}
      <div className="body" style={{ position: 'relative' }}>
        {/* Rail */}
        <div className="rail">
          <div className="rail-logo">D</div>
          <NavBtn icon={<Icon.Chat size={18} />}   label="Copilot" active={screen === 'copilot'} onClick={() => setScreen('copilot')} />
          <NavBtn icon={<Icon.Fleet size={18} />}  label="Fleet"   active={screen === 'fleet'}   onClick={() => setScreen('fleet')}   badge />
          <NavBtn icon={<Icon.Search size={18} />} label="Search"  active={searchOpen}            onClick={() => setSearchOpen(true)} />
          <NavBtn icon={<Icon.Replay size={18} />} label="Replay"  active={screen === 'replay'}  onClick={() => setScreen('replay')} />

          <div className="rail-spacer" />

          <NavBtn icon={<Icon.Bot size={18} />}      label="Agents & MCP" active={screen === 'agents'}   onClick={() => setScreen('agents')} />
          <NavBtn icon={<Icon.Settings size={18} />} label="Settings"     active={screen === 'settings'} onClick={() => setScreen('settings')} />
        </div>

        {/* Screen */}
        {screen === 'copilot' && (
          <div className="flex1" style={{ minWidth: 0, display: 'flex', flexDirection: 'row', alignItems: 'stretch' }} data-screen-label="01 Copilot Workspace">
            <CopilotPanel onJump={jumpFromChat} />
            <Workspace initialTab={tab} />
          </div>
        )}
        {screen === 'fleet'    && <div data-screen-label="02 Fleet Dashboard" className="flex1 col" style={{ minWidth: 0 }}><FleetDashboard /></div>}
        {screen === 'replay'   && <div data-screen-label="03 Replay" className="flex1 col" style={{ minWidth: 0 }}><ReplayView /></div>}
        {screen === 'agents'   && <div data-screen-label="04 Agents & MCP" className="flex1 col" style={{ minWidth: 0 }}><AgentsScreen /></div>}
        {screen === 'settings' && <div data-screen-label="05 Settings" className="flex1 col" style={{ minWidth: 0 }}><SettingsScreen theme={theme} setTheme={setTheme} /></div>}

        {/* Search overlay */}
        {searchOpen && <SemanticSearchOverlay onClose={() => setSearchOpen(false)} />}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
