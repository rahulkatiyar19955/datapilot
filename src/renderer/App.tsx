import { useEffect, useState, type JSX } from "react";
import { Setup } from "./screens/Setup";
import { DesignSystem } from "./screens/DesignSystem";
import { Copilot } from "./screens/Copilot";
import { Agents } from "./screens/Agents";
import { Settings } from "./screens/Settings";
import { Icon } from "./components/Icon";
import { useTheme } from "./hooks/useTheme";
import { useUIStore } from "./stores/ui";
import { useSessionStore } from "./stores/session";
import { useSettingsStore } from "./stores/settings";
import {
  WindowChrome,
  Titlebar,
  Traffic,
  Rail,
  RailButton,
} from "./components/chrome";
import { Button, Pill } from "./components/ui";
import type { DockerStatus } from "@shared/ipc";

/** Cross-platform basename — splits on `/` and `\` so Windows paths render
 *  the filename (not the full absolute path) in the title bar. */
function basename(p: string): string {
  const parts = p.split(/[/\\]/);
  return parts[parts.length - 1] || p;
}

export function App(): JSX.Element {
  const [dockerStatus, setDockerStatus] = useState<DockerStatus>({
    state: "pending",
  });
  const [version, setVersion] = useState<string>("0.1.0");
  const [devScreen, setDevScreen] = useState<"main" | "design-system">("main");

  const { theme, toggle: toggleTheme } = useTheme();
  const { screen, setScreen } = useUIStore();
  const { meta: sessionMeta, pendingPath, setPendingPath } = useSessionStore();
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const syncKeysToBackend = useSettingsStore((s) => s.syncKeysToBackend);

  // Initial Docker status + version + subscribe to status changes.
  useEffect(() => {
    if (!window.datapilot) return;
    void loadSettings();
    void window.datapilot.app.version().then(setVersion);
    void window.datapilot.docker.status().then(setDockerStatus);
    const unsubscribe =
      window.datapilot.docker.onStatusChanged(setDockerStatus);
    return () => unsubscribe();
  }, [loadSettings]);

  // Sync API keys to backend only once the backend container is healthy.
  // This avoids ERR_CONNECTION_REFUSED errors fired at mount time when the
  // Docker stack is still booting.
  useEffect(() => {
    if (dockerStatus.state === "ready") {
      void syncKeysToBackend();
    }
  }, [dockerStatus.state, syncKeysToBackend]);

  // Global drag-and-drop listener for MCAP/bag files
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        const file = files[0];
        const lowerName = file.name.toLowerCase();
        if (
          lowerName.endsWith(".bag") ||
          lowerName.endsWith(".mcap") ||
          lowerName.endsWith(".db3")
        ) {
          // Electron attaches the local absolute filesystem path to dropped files
          const path = (file as any).path;
          if (path) {
            setPendingPath(path);
            setScreen("copilot");
          }
        }
      }
    };

    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("drop", handleDrop);
    return () => {
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("drop", handleDrop);
    };
  }, [setPendingPath, setScreen]);

  // Dev-only ⌘⇧D / Ctrl+Shift+D toggles the DesignSystem gallery.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.shiftKey && (e.key === "d" || e.key === "D")) {
        e.preventDefault();
        setDevScreen((s) => (s === "design-system" ? "main" : "design-system"));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (import.meta.env.DEV && devScreen === "design-system") {
    return <DesignSystem onExit={() => setDevScreen("main")} />;
  }

  const handleRetry = () => {
    if (!window.datapilot) return;
    setDockerStatus({ state: "pending" });
    void window.datapilot.docker.retry();
  };

  const titleContent = sessionMeta ? (
    <span>
      <b>DataPilot</b> · {basename(sessionMeta.filename)} — {sessionMeta.robot}
    </span>
  ) : pendingPath ? (
    <span>
      <b>DataPilot</b> · {basename(pendingPath)} — Loading…
    </span>
  ) : (
    <span>
      <b>DataPilot</b> · No active session — Load a bag to begin
    </span>
  );

  const themeButton = (
    <Button
      variant="ghost"
      size="sm"
      icon
      onClick={toggleTheme}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
    >
      {theme === "dark" ? <Icon.Sun size={13} /> : <Icon.Moon size={13} />}
    </Button>
  );

  // Render Setup screen on pending / error states.
  if (dockerStatus.state !== "ready") {
    return (
      <WindowChrome className="fade-in">
        <Titlebar
          left={<Traffic />}
          center={
            <span>
              <b>DataPilot</b> · Setup
            </span>
          }
          right={
            <>
              {themeButton}
              <Pill size="sm" tone="ghost" mono>
                v{version}
              </Pill>
            </>
          }
        />
        <div className="body">
          <Setup status={dockerStatus} onRetry={handleRetry} />
        </div>
      </WindowChrome>
    );
  }

  // Ready: render active screen.
  return (
    <WindowChrome className="fade-in">
      <Titlebar
        left={<Traffic />}
        center={titleContent}
        right={
          <>
            {themeButton}
            <Pill size="sm" tone="ghost" mono>
              v{version}
            </Pill>
            <Pill size="sm" tone="ok" swatch>
              local stack
            </Pill>
          </>
        }
      />

      <div className="body">
        <Rail>
          <RailButton
            icon={<Icon.Chat size={18} />}
            label="Copilot"
            active={screen === "copilot"}
            onClick={() => setScreen("copilot")}
          />
          <div className="rail-spacer" />
          <RailButton
            icon={<Icon.Bot size={18} />}
            label="Agents & MCP"
            active={screen === "agents"}
            onClick={() => setScreen("agents")}
          />
          <RailButton
            icon={<Icon.Settings size={18} />}
            label="Settings"
            active={screen === "settings"}
            onClick={() => setScreen("settings")}
          />
        </Rail>

        {screen === "copilot" && <Copilot />}
        {screen === "agents" && <Agents />}
        {screen === "settings" && <Settings />}
      </div>
    </WindowChrome>
  );
}
