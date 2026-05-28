import type { JSX } from "react";
import { Icon } from "@renderer/components/Icon";
import { useUIStore } from "@renderer/stores/ui";
import { useSessionStore } from "@renderer/stores/session";
import { Button } from "@renderer/components/ui";
import { DataSourceBar } from "./DataSourceBar";
import { TimelineView } from "./TimelineView";
import { MetricView } from "./MetricView";
import { MapView } from "./MapView";
import { LogsView } from "./LogsView";
import { KGraphView } from "./KGraphView";
import { TopicsPanel } from "./TopicsPanel";
import type { WorkspaceTab } from "@shared/types";

interface TabDef {
  id: WorkspaceTab;
  label: string;
  icon: JSX.Element;
  count: number | null;
}

export function Workspace(): JSX.Element {
  const { tab, setTab } = useUIStore();
  const { timeline, topics, logs, kgraph, status, setPendingPath } =
    useSessionStore();

  const pickBagFile = async () => {
    if (!window.datapilot) return;
    const file = await window.datapilot.file.pickBag();
    if (file) {
      setPendingPath(file);
    }
  };

  // 1. Idle state: show a beautiful prompt to load a bag file.
  if (status === "idle") {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 24,
          background: "var(--color-bg-0)",
          minWidth: 0,
          minHeight: 0,
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 16,
            background: "var(--color-accent-bg)",
            border: "1px solid var(--color-accent-border)",
            display: "grid",
            placeItems: "center",
            color: "var(--color-accent)",
          }}
        >
          <Icon.File size={32} />
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            maxWidth: 480,
            textAlign: "center",
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 600,
              color: "var(--color-text-0)",
            }}
          >
            Load a ROS bag to begin
          </h2>
          <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-2)" }}>
            The AI agent stack is ready. Use the Copilot panel or load a bag
            here.
          </p>
        </div>
        <div className="row gap-3">
          <Button variant="primary" onClick={pickBagFile}>
            <Icon.Upload size={14} /> Load ROS bag
          </Button>
        </div>
      </div>
    );
  }

  // 2. Loading state: show a premium skeleton loading experience during creation/indexing.
  if (status === "creating" || status === "processing") {
    return (
      <div className="flex1 col" style={{ minWidth: 0, minHeight: 0 }}>
        <DataSourceBar />
        <div
          className="flex1 col"
          style={{
            alignItems: "center",
            justifyContent: "center",
            gap: 20,
            background: "var(--color-bg-0)",
            padding: 40,
          }}
        >
          <div className="pulse" style={{ color: "var(--color-accent)" }}>
            <Icon.Sparkles size={40} />
          </div>
          <div
            className="col gap-1"
            style={{ alignItems: "center", textAlign: "center" }}
          >
            <span
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: "var(--color-text-0)",
              }}
            >
              {status === "creating"
                ? "Creating analysis session…"
                : "AI is indexing topic channels…"}
            </span>
            <span className="dim" style={{ fontSize: 13 }}>
              Extracting semantic metadata, logging lanes, and generating
              knowledge graph.
            </span>
          </div>

          {/* Skeleton Shimmer Lanes */}
          <div
            className="col gap-3"
            style={{
              width: "100%",
              maxWidth: 600,
              marginTop: 20,
              padding: 16,
              background: "var(--color-bg-1)",
              border: "1px solid var(--color-border-1)",
              borderRadius: 8,
            }}
          >
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="row gap-4" style={{ padding: "8px 0" }}>
                <div
                  className="pulse"
                  style={{
                    width: 80,
                    height: 12,
                    background: "var(--color-bg-3)",
                    borderRadius: 4,
                  }}
                />
                <div
                  className="flex1 pulse"
                  style={{
                    height: 12,
                    background: "var(--color-bg-2)",
                    borderRadius: 4,
                    opacity: 0.7 - i * 0.15,
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // 3. Ready / Error state: show workspace tabs and side panel.
  const TABS: TabDef[] = [
    {
      id: "timeline",
      label: "Timeline",
      icon: <Icon.Clock size={13} />,
      count: timeline.length || null,
    },
    {
      id: "metrics",
      label: "Metrics",
      icon: <Icon.Activity size={13} />,
      count: topics.length || null,
    },
    { id: "map", label: "Map", icon: <Icon.Map size={13} />, count: null },
    {
      id: "logs",
      label: "Logs",
      icon: <Icon.Terminal size={13} />,
      count: logs.length || null,
    },
    {
      id: "kgraph",
      label: "Knowledge Graph",
      icon: <Icon.Graph size={13} />,
      count: kgraph?.nodes.length ?? null,
    },
  ];

  return (
    <div className="flex1 col" style={{ minWidth: 0, minHeight: 0 }}>
      {/* Data source bar */}
      <DataSourceBar />

      {/* Tab bar */}
      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`tab${tab === t.id ? " active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.icon}
            {t.label}
            {t.count != null && <span className="count">{t.count}</span>}
          </button>
        ))}
        <div className="flex1" />
        <button
          className="tab"
          style={{ color: "var(--color-text-3)" }}
          title="Add tab (not available)"
        >
          <Icon.Plus size={13} />
        </button>
      </div>

      {/* Tab body + topics rail */}
      <div
        className="flex1"
        style={{
          minHeight: 0,
          display: "flex",
          flexDirection: "row",
          alignItems: "stretch",
        }}
      >
        <div className="flex1 col" style={{ minWidth: 0, minHeight: 0 }}>
          {tab === "timeline" && <TimelineView />}
          {tab === "metrics" && <MetricView />}
          {tab === "map" && <MapView />}
          {tab === "logs" && <LogsView />}
          {tab === "kgraph" && <KGraphView />}
        </div>
        <TopicsPanel />
      </div>
    </div>
  );
}
