import { useState, type JSX } from "react";
import { Icon } from "@renderer/components/Icon";
import { useSessionStore } from "@renderer/stores/session";
export function DataSourceBar(): JSX.Element {
  const [sourceMode, setSourceMode] = useState<"rosbag" | "live">("rosbag");
  const { meta, status } = useSessionStore();

  const filename = meta?.filename.split(/[/\\]/).pop() ?? null;
  const isReady = status === "ready";

  return (
    <div
      className="row gap-3"
      style={{
        height: 44,
        padding: "0 14px",
        borderBottom: "1px solid var(--color-border-1)",
        background: "var(--color-bg-1)",
        flexShrink: 0,
      }}
    >
      {/* Source mode toggle */}
      <div
        className="row gap-1"
        style={{
          background: "var(--color-bg-0)",
          borderRadius: 6,
          padding: 3,
          border: "1px solid var(--color-border-1)",
        }}
      >
        <button
          className="btn sm"
          style={{
            background:
              sourceMode === "rosbag" ? "var(--color-bg-3)" : "transparent",
            borderColor: "transparent",
            height: 22,
            fontSize: 11.5,
          }}
          onClick={() => setSourceMode("rosbag")}
        >
          <Icon.File size={11} />
          Rosbag
        </button>
        <button
          className="btn ghost sm"
          style={{ height: 22, fontSize: 11.5, color: "var(--color-text-3)" }}
          onClick={() => setSourceMode("live")}
          disabled
          title="Live robot connection not available in this version"
        >
          <Icon.Wifi size={11} />
          Live robot
        </button>
      </div>

      {/* Filename */}
      {filename && (
        <div className="row gap-2">
          <Icon.File size={13} />
          <span
            className="mono"
            style={{ fontSize: 12, color: "var(--color-text-1)" }}
          >
            {filename}
          </span>
          {meta && (
            <span className="dim mono" style={{ fontSize: 11 }}>
              {meta.totalMessages.toLocaleString()} msgs · {meta.topicsCount}{" "}
              topics
            </span>
          )}
        </div>
      )}

      <div className="flex1" />

      {/* Status pills */}
      {isReady && (
        <div className="row gap-2">
          <span className="pill ok">
            <span className="swatch" />
            parsed
          </span>
          <span className="pill accent">
            <Icon.Sparkles size={10} />
            indexed by AI
          </span>
        </div>
      )}

      {status === "processing" && (
        <span className="pill ghost mono pulse" style={{ fontSize: 10.5 }}>
          indexing…
        </span>
      )}

      {/* Action buttons */}
      <div className="row gap-1" style={{ marginLeft: 8 }}>
        <button className="btn sm" title="Replay — coming soon" disabled>
          <Icon.Play size={12} />
          Replay
        </button>
        <button
          className="btn ghost icon sm"
          title="Share (not available)"
          disabled
        >
          <Icon.Share size={13} />
        </button>
        <button
          className="btn ghost icon sm"
          title="Download (not available)"
          disabled
        >
          <Icon.Download size={13} />
        </button>
      </div>
    </div>
  );
}
