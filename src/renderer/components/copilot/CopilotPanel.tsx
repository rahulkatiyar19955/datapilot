import { useEffect, useRef, useState, type JSX } from "react";
import { Icon } from "@renderer/components/Icon";
import { useChatStore } from "@renderer/stores/chat";
import { useSessionStore } from "@renderer/stores/session";
import { useSettingsStore } from "@renderer/stores/settings";
import { useUIStore } from "@renderer/stores/ui";
import { ChatMessage } from "./ChatMessage";
import { ContextChips } from "./ContextChips";
import { CommandBar } from "./CommandBar";
import * as api from "@renderer/services/api";
import type { SessionMeta } from "@shared/types";

function parseUTCDate(dateStr: string): Date {
  if (!dateStr.endsWith("Z") && !dateStr.includes("+") && !/-\d{2}:\d{2}$/.test(dateStr)) {
    return new Date(dateStr + "Z");
  }
  return new Date(dateStr);
}

function formatRelativeTime(dateStr?: string): string {
  if (!dateStr) return "";
  const date = parseUTCDate(dateStr);
  if (isNaN(date.getTime())) return "";
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const diffMs = date.getTime() - Date.now();
  const diffMins = Math.round(diffMs / 60000);
  const diffHours = Math.round(diffMs / 3600000);
  const diffDays = Math.round(diffMs / 86400000);

  const absMs = Math.abs(diffMs);
  if (absMs < 60000) {
    return "just now";
  } else if (absMs < 3600000) {
    return rtf.format(diffMins, "minute");
  } else if (absMs < 86400000) {
    return rtf.format(diffHours, "hour");
  } else {
    return rtf.format(diffDays, "day");
  }
}

export function CopilotPanel(): JSX.Element {
  const messages = useChatStore((s) => s.messages);
  const clearMessages = useChatStore((s) => s.clearMessages);
  const setMessages = useChatStore((s) => s.setMessages);
  const {
    status,
    sessionId,
    clearSession,
    setPendingPath,
    pendingPath,
    setPendingSessionId,
  } = useSessionStore();
  const { apiKeys, defaultProvider, defaultModel } = useSettingsStore();
  const { setScreen, setSettingsSectionTarget } = useUIStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Track the session ID that was resumed from history so we can reload its
  // chat messages once the session is fully loaded.
  const resumingSessionId = useRef<string | null>(null);

  const showWarningBanner =
    defaultProvider !== "ollama" && !apiKeys[defaultProvider];

  // Clear chat messages when session changes.
  useEffect(() => {
    clearMessages();
  }, [sessionId, clearMessages]);

  // After a session resumed from history is ready, load its chat history.
  useEffect(() => {
    if (
      sessionId &&
      status === "ready" &&
      resumingSessionId.current === sessionId
    ) {
      resumingSessionId.current = null;
      api.getChatMessages(sessionId).then((rows) => {
        if (rows.length === 0) return;
        const loaded = rows.map((r, i) => ({
          id: `hist-${i}`,
          role: r.role as "user" | "assistant",
          text: r.role !== "assistant" ? r.content : undefined,
          summary: r.role === "assistant" ? r.content : undefined,
          findings: r.findings || undefined,
          causal: r.causal || undefined,
          plan: r.plan || undefined,
          time: r.created_at
            ? parseUTCDate(r.created_at).toLocaleTimeString()
            : undefined,
        }));
        setMessages(loaded);
      }).catch(() => {/* silently ignore if history unavailable */});
    }
  }, [sessionId, status, setMessages]);

  /**
   * "New session" — clears the chat AND resets the session entirely so the
   * user lands on the idle workspace ready to load a fresh bag.
   * This also aborts any in-flight session creation (via the useSession
   * cleanup that fires when pendingPath becomes null).
   */
  const handleNewSession = () => {
    clearMessages();
    clearSession();
    setPendingPath(null);
  };

  const [showHistory, setShowHistory] = useState(false);
  const [historySessions, setHistorySessions] = useState<SessionMeta[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const handleToggleHistory = async () => {
    const nextVal = !showHistory;
    setShowHistory(nextVal);
    if (nextVal) {
      setLoadingHistory(true);
      try {
        const data = await api.getSessions();
        setHistorySessions(data);
      } catch (err) {
        console.error("Failed to load sessions history:", err);
      } finally {
        setLoadingHistory(false);
      }
    }
  };

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  const modelLabel =
    (defaultModel || "").trim() || `${defaultProvider} default`;

  const totalIn = messages.reduce(
    (acc, m) => acc + (m.usage?.tokens_in || 0),
    0,
  );
  const totalOut = messages.reduce(
    (acc, m) => acc + (m.usage?.tokens_out || 0),
    0,
  );
  const totalTokens = totalIn + totalOut;
  const totalCost = messages.reduce(
    (acc, m) => acc + (m.usage?.est_cost_usd || 0),
    0,
  );

  return (
    <div
      className="col"
      style={{
        width: 420,
        flexShrink: 0,
        background: "var(--color-bg-1)",
        borderRight: "1px solid var(--color-border-1)",
        minHeight: 0,
      }}
    >
      {/* Panel header */}
      <div
        className="row"
        style={{
          height: 44,
          padding: "0 14px",
          borderBottom: "1px solid var(--color-border-1)",
          gap: 10,
          flexShrink: 0,
          position: "relative",
        }}
      >
        <Icon.Sparkles size={15} />
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "var(--color-text-0)",
          }}
        >
          Copilot
        </span>
        <span
          className="pill sm ghost mono"
          style={{ maxWidth: 170, minWidth: 0 }}
          title={modelLabel}
        >
          <span
            style={{
              display: "block",
              maxWidth: "100%",
              overflow: "hidden",
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
            }}
          >
            {modelLabel}
          </span>
        </span>
        {totalTokens > 0 && (
          <span
            className="pill sm ghost mono"
            style={{
              fontSize: 10,
              gap: 4,
              display: "flex",
              alignItems: "center",
              cursor: "help",
            }}
            title={`Session usage:\n- Input: ${totalIn.toLocaleString()} tokens\n- Output: ${totalOut.toLocaleString()} tokens\n- Est. Cost: $${totalCost.toFixed(4)}`}
          >
            <Icon.Activity size={10} />
            <span>{(totalTokens / 1000).toFixed(1)}k tokens</span>
          </span>
        )}
        <div className="flex1" />
        <button
          className="btn ghost icon sm"
          title="New session"
          onClick={handleNewSession}
        >
          <Icon.Plus size={13} />
        </button>
        <button
          className={`btn ghost icon sm ${showHistory ? "primary" : ""}`}
          title="History"
          onClick={handleToggleHistory}
        >
          <Icon.Clock size={13} />
        </button>

        {showHistory && (
          <>
            {/* Invisible backdrop to close modal on outside click */}
            <div
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 99,
              }}
              onClick={() => setShowHistory(false)}
            />
            <div
              className="card"
              style={{
                position: "absolute",
                top: 40,
                right: 14,
              width: 320,
              maxHeight: 300,
              zIndex: 100,
              display: "flex",
              flexDirection: "column",
              boxShadow: "var(--shadow-lg)",
              background: "var(--color-bg-2)",
              borderColor: "var(--color-border-2)",
              overflow: "hidden",
            }}
          >
            <div
              className="row"
              style={{
                padding: "10px 12px",
                borderBottom: "1px solid var(--color-border-1)",
                justifyContent: "space-between",
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  fontSize: 11.5,
                  fontWeight: 600,
                  color: "var(--color-text-0)",
                }}
              >
                Session History
              </span>
              <div className="row gap-1">
                {historySessions.length > 0 && (
                  <button
                    className="btn ghost sm"
                    style={{ height: 20, fontSize: 10.5, color: "var(--color-danger)" }}
                    onClick={async () => {
                      if (confirm("Delete all sessions? This cannot be undone.")) {
                        try {
                          await api.clearAllSessions();
                          setHistorySessions([]);
                          clearSession();
                        } catch {
                          alert("Failed to clear all sessions");
                        }
                      }
                    }}
                  >
                    Clear all
                  </button>
                )}
                <button
                  className="btn ghost icon sm"
                  style={{ height: 20, width: 20 }}
                  onClick={() => setShowHistory(false)}
                >
                  <Icon.Check size={12} style={{ color: "var(--color-ok)" }} />
                </button>
              </div>
            </div>
            <div style={{ overflowY: "auto", flex: 1, padding: 4 }}>
              {loadingHistory ? (
                <div
                  style={{
                    padding: 20,
                    textAlign: "center",
                    fontSize: 12,
                    color: "var(--color-text-3)",
                  }}
                >
                  <span className="pulse">Loading history...</span>
                </div>
              ) : historySessions.length === 0 ? (
                <div
                  style={{
                    padding: 20,
                    textAlign: "center",
                    fontSize: 12,
                    color: "var(--color-text-3)",
                  }}
                >
                  No past sessions found.
                </div>
              ) : (
                historySessions.map((s) => (
                  <div
                    key={s.id}
                    className="row gap-2"
                    style={{
                      padding: "8px 10px",
                      borderRadius: 4,
                      cursor: "pointer",
                      fontSize: 12,
                      transition: "background 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "var(--color-bg-3)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <div
                      className="col flex1"
                      style={{ minWidth: 0 }}
                      onClick={() => {
                        resumingSessionId.current = s.id;
                        setPendingSessionId(s.id);
                        setShowHistory(false);
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 500,
                          color: "var(--color-text-1)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                        title={s.filename}
                      >
                        {s.filename}
                      </div>
                      <div
                        className="dim"
                        style={{ fontSize: 10.5, marginTop: 2 }}
                      >
                        {s.robot} · {s.durationSeconds.toFixed(1)}s · {s.status}
                        {s.updatedAt && ` · ${formatRelativeTime(s.updatedAt)}`}
                      </div>
                    </div>
                    <button
                      className="btn ghost icon sm"
                      style={{
                        height: 24,
                        width: 24,
                        color: "var(--color-danger)",
                      }}
                      title="Delete session"
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (confirm(`Delete session for ${s.filename}?`)) {
                          try {
                            await api.deleteSession(s.id);
                            setHistorySessions((prev) =>
                              prev.filter((item) => item.id !== s.id),
                            );
                          } catch (err) {
                            alert("Failed to delete session");
                          }
                        }
                      }}
                    >
                      <Icon.Trash size={11} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
          </>
        )}
      </div>

      {/* Model Connection Warning Banner */}
      {showWarningBanner && (
        <div
          style={{
            margin: "12px 14px 4px 14px",
            padding: "12px",
            borderRadius: "8px",
            background: "var(--color-warn-bg)",
            border: "1px solid var(--color-warn-border)",
            display: "flex",
            flexDirection: "column",
            gap: 8,
            boxShadow: "var(--shadow-sm)",
            animation: "fadeIn 0.3s ease-out",
            flexShrink: 0,
          }}
        >
          <div className="row gap-2" style={{ alignItems: "flex-start" }}>
            <div
              style={{
                color: "var(--color-warn-text)",
                marginTop: 2,
                flexShrink: 0,
              }}
            >
              <Icon.Sparkles size={16} />
            </div>
            <div className="col gap-1" style={{ flex: 1, minWidth: 0 }}>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--color-text-0)",
                }}
              >
                AI Model Not Connected
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: "var(--color-text-2)",
                  lineHeight: 1.4,
                }}
              >
                Please configure your{" "}
                <b>
                  {defaultProvider === "google"
                    ? "Gemini (Google)"
                    : defaultProvider === "anthropic"
                      ? "Claude (Anthropic)"
                      : defaultProvider === "openai"
                        ? "OpenAI"
                        : defaultProvider === "nvidia"
                          ? "NVIDIA NIM"
                          : "Custom"}
                </b>{" "}
                API key in settings to enable the Copilot.
              </span>
            </div>
          </div>
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button
              className="btn sm"
              style={{
                background: "transparent",
                color: "var(--color-warn-text)",
                border: "1px solid var(--color-warn-border)",
                borderRadius: "6px",
                fontSize: 10.5,
                padding: "3px 8px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontWeight: 600,
                transition: "filter 0.15s ease, transform 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.filter = "brightness(1.06)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.filter = "none";
              }}
              onClick={() => {
                setSettingsSectionTarget("models");
                setScreen("settings");
              }}
            >
              <Icon.Settings size={11} />
              Open Settings
            </button>
          </div>
        </div>
      )}

      {/* Context chips */}
      <ContextChips />

      {/* Message list */}
      <div
        ref={scrollRef}
        className="flex1"
        style={{ overflowY: "auto", padding: "8px 0" }}
      >
        {messages.length === 0 && status !== "idle" && (
          <div
            className="col"
            style={{
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              gap: 8,
              padding: "24px 20px",
            }}
          >
            {status === "creating" || status === "processing" ? (
              <>
                <span
                  className="pulse"
                  style={{ color: "var(--color-accent)" }}
                >
                  <Icon.Sparkles size={20} />
                </span>
                <span
                  style={{
                    fontSize: 12,
                    color: "var(--color-text-2)",
                    textAlign: "center",
                  }}
                >
                  {status === "creating"
                    ? "Creating session…"
                    : "Indexing with AI…"}
                </span>
              </>
            ) : status === "error" ? (
              <div className="col gap-3 items-center justify-center">
                <span
                  style={{
                    fontSize: 12,
                    color: "var(--color-danger)",
                    textAlign: "center",
                  }}
                >
                  Failed to load session. Please try again.
                </span>
                <button
                  className="btn primary sm"
                  onClick={() => {
                    const path = pendingPath;
                    if (path) {
                      setPendingPath(null);
                      setTimeout(() => {
                        setPendingPath(path);
                      }, 50);
                    }
                  }}
                  title="Retry loading session"
                >
                  <Icon.Refresh size={12} />
                  Retry Loading
                </button>
              </div>
            ) : (
              <span
                style={{
                  fontSize: 12,
                  color: "var(--color-text-3)",
                  textAlign: "center",
                }}
              >
                Session ready. Ask anything about this run.
              </span>
            )}
          </div>
        )}
        {messages.length === 0 && status === "idle" && (
          <div
            style={{
              padding: "32px 20px",
              textAlign: "center",
              color: "var(--color-text-3)",
              fontSize: 12,
            }}
          >
            Load a ROS bag to begin analysis.
          </div>
        )}
        {messages.map((msg) => (
          <ChatMessage key={msg.id} msg={msg} />
        ))}
      </div>

      {/* Quick-action chips */}
      <div style={{ padding: "8px 14px 4px", flexShrink: 0 }}>
        <div className="row gap-2" style={{ flexWrap: "wrap" }}>
          <button
            className="pill ghost"
            style={{ cursor: "pointer", height: 24 }}
            onClick={async () => {
              if (window.datapilot?.file?.pickBag) {
                try {
                  const filepath = await window.datapilot.file.pickBag();
                  if (filepath) {
                    setPendingPath(filepath);
                  }
                } catch (err: any) {
                  alert(`Failed to pick file: ${err.message || err}`);
                }
              } else {
                alert("File picker is not available in this environment.");
              }
            }}
          >
            <Icon.Upload size={11} /> Upload rosbag
          </button>
          <button
            className="pill ghost"
            style={{ height: 24 }}
            disabled
            title="Coming soon"
          >
            <Icon.Wifi size={11} /> Connect live robot
          </button>
          <button
            className="pill ghost"
            style={{ height: 24 }}
            disabled
            title="Coming soon"
          >
            <Icon.Search size={11} /> Search past runs
          </button>
          <button
            className="pill ghost"
            style={{ height: 24 }}
            disabled
            title="Coming soon"
          >
            <Icon.Layers size={11} /> Compare releases
          </button>
        </div>
      </div>

      {/* Command bar */}
      <CommandBar />
    </div>
  );
}
