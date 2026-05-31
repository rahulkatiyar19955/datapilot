import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import { Icon } from "@renderer/components/Icon";
import { useSessionStore } from "@renderer/stores/session";
import * as api from "@renderer/services/api";
import type { KGraphGroup, KGraphNode } from "@shared/types";

const GROUP_COLOR: Record<KGraphGroup, string> = {
  session: "var(--color-text-0)",
  sensor: "oklch(0.70 0.10 200)",
  topic: "oklch(0.72 0.12 160)",
  fault: "var(--color-danger)",
  state: "var(--color-warn)",
  node: "var(--color-accent)",
  outcome: "var(--color-magenta)",
  fact: "oklch(0.78 0.15 90)",
};

const GROUP_LABELS: Array<[KGraphGroup, string]> = [
  ["session", "Session"],
  ["sensor", "Sensors"],
  ["topic", "Topics"],
  ["node", "Nodes"],
  ["fault", "Faults"],
  ["outcome", "Outcomes"],
  ["fact", "Facts"],
];

const RADIUS: Partial<Record<KGraphGroup, number>> = {
  session: 14,
  fact: 9,
  outcome: 8,
};
const MIN_SCALE = 0.3;
const MAX_SCALE = 3;

interface SimNode extends SimulationNodeDatum {
  id: string;
  label: string;
  group: KGraphGroup;
  meta?: Record<string, unknown>;
}
type SimLink = SimulationLinkDatum<SimNode>;

type Drag =
  | { kind: "pan"; startX: number; startY: number; tx0: number; ty0: number }
  | { kind: "node"; node: SimNode };

function nodeRadius(group: KGraphGroup): number {
  return RADIUS[group] ?? 7;
}

/** Human-readable detail lines for the hover/selection panel. */
function metaLines(node: SimNode): string[] {
  const m = node.meta ?? {};
  const lines: string[] = [];
  const push = (label: string, v: unknown) => {
    if (v !== undefined && v !== null && String(v).length > 0)
      lines.push(`${label}: ${v}`);
  };
  switch (node.group) {
    case "session":
      push("Session", m.label ?? node.label);
      push("ID", m.sessionId);
      break;
    case "topic":
      push("Type", m.type);
      if (m.hz != null) push("Rate", `${Number(m.hz).toFixed(1)} Hz`);
      push("Messages", m.msgs);
      break;
    case "sensor":
      push("Sensor", m.sensorType);
      push("Msg type", m.msgType);
      push("Topic", m.topic);
      break;
    case "fault":
    case "outcome":
      push("Kind", m.kind);
      push("Severity", m.severity);
      break;
    case "node":
      push("ROS node", m.rosNode ?? node.label);
      break;
    case "fact":
      push("Fact", m.text ?? node.label);
      push("Category", m.category);
      push("Severity", m.severity);
      break;
    default:
      break;
  }
  return lines;
}

export function KGraphView(): JSX.Element {
  const kgraph = useSessionStore((s) => s.kgraph);
  const sessionId = useSessionStore((s) => s.sessionId);
  const setTabData = useSessionStore((s) => s.setTabData);

  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const linksRef = useRef<SimLink[]>([]);
  const posRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const dragRef = useRef<Drag | null>(null);

  const [size, setSize] = useState({ w: 800, h: 520 });
  const [, setTick] = useState(0);
  const [view, setView] = useState({ tx: 0, ty: 0, k: 1 });
  const [selected, setSelected] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Measure the container.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r && r.width > 0 && r.height > 0)
        setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Build / refresh the simulation when the graph data or size changes.
  useEffect(() => {
    if (!kgraph) return;
    const { w, h } = size;

    // Preserve positions of nodes already laid out (so new facts don't reshuffle).
    const nodes: SimNode[] = kgraph.nodes.map((n: KGraphNode) => {
      const prev = posRef.current.get(n.id);
      const isRoot = n.group === "session";
      return {
        id: n.id,
        label: n.label,
        group: n.group,
        meta: n.meta,
        x: prev?.x ?? n.x ?? w / 2 + (Math.random() - 0.5) * 120,
        y: prev?.y ?? n.y ?? h / 2 + (Math.random() - 0.5) * 120,
        // Pin the session hub to the centre so the graph radiates from it.
        fx: isRoot ? w / 2 : undefined,
        fy: isRoot ? h / 2 : undefined,
      };
    });
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const links: SimLink[] = kgraph.edges
      .filter((e) => byId.has(e.source) && byId.has(e.target))
      .map((e) => ({ source: e.source, target: e.target }));

    nodesRef.current = nodes;
    linksRef.current = links;

    simRef.current?.stop();
    const sim = forceSimulation<SimNode>(nodes)
      .force(
        "link",
        forceLink<SimNode, SimLink>(links)
          .id((d) => d.id)
          .distance(96)
          .strength(0.35),
      )
      .force("charge", forceManyBody<SimNode>().strength(-260))
      .force("center", forceCenter(w / 2, h / 2))
      .force("collide", forceCollide<SimNode>((d) => nodeRadius(d.group) + 26))
      .on("tick", () => {
        for (const n of nodes)
          if (n.x != null && n.y != null)
            posRef.current.set(n.id, { x: n.x, y: n.y });
        setTick((t) => t + 1);
      });
    simRef.current = sim;
    sim.alpha(0.9).restart();

    return () => {
      sim.stop();
    };
    // Rebuild when the node/edge set changes; size handled separately below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kgraph]);

  // Keep the centering force in step with container size without reshuffling.
  useEffect(() => {
    const sim = simRef.current;
    if (!sim) return;
    // Re-pin the session hub to the new centre so it doesn't fight the center
    // force from its old anchor.
    for (const n of nodesRef.current) {
      if (n.group === "session") {
        n.fx = size.w / 2;
        n.fy = size.h / 2;
      }
    }
    sim.force("center", forceCenter(size.w / 2, size.h / 2));
    sim.alpha(0.3).restart();
  }, [size]);

  const screenToGraph = useCallback(
    (clientX: number, clientY: number) => {
      const rect = svgRef.current?.getBoundingClientRect();
      const sx = clientX - (rect?.left ?? 0);
      const sy = clientY - (rect?.top ?? 0);
      return {
        x: (sx - view.tx) / view.k,
        y: (sy - view.ty) / view.k,
      };
    },
    [view],
  );

  // ── Interactions ────────────────────────────────────────────────────────
  const onNodePointerDown = (e: ReactPointerEvent, node: SimNode) => {
    e.stopPropagation();
    svgRef.current?.setPointerCapture(e.pointerId);
    dragRef.current = { kind: "node", node };
    setSelected(node.id);
    const p = screenToGraph(e.clientX, e.clientY);
    node.fx = p.x;
    node.fy = p.y;
    simRef.current?.alphaTarget(0.3).restart();
  };

  const onBackgroundPointerDown = (e: ReactPointerEvent) => {
    svgRef.current?.setPointerCapture(e.pointerId);
    dragRef.current = {
      kind: "pan",
      startX: e.clientX,
      startY: e.clientY,
      tx0: view.tx,
      ty0: view.ty,
    };
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    if (d.kind === "node") {
      const p = screenToGraph(e.clientX, e.clientY);
      d.node.fx = p.x;
      d.node.fy = p.y;
    } else {
      setView((v) => ({
        ...v,
        tx: d.tx0 + (e.clientX - d.startX),
        ty: d.ty0 + (e.clientY - d.startY),
      }));
    }
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    const d = dragRef.current;
    if (d?.kind === "node") {
      // Leave fx/fy set so the node stays pinned where the user dropped it.
      simRef.current?.alphaTarget(0);
    }
    dragRef.current = null;
    svgRef.current?.releasePointerCapture?.(e.pointerId);
  };

  const zoomAround = useCallback((factor: number, cx: number, cy: number) => {
    setView((v) => {
      const k = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.k * factor));
      const scale = k / v.k;
      return {
        k,
        tx: cx - (cx - v.tx) * scale,
        ty: cy - (cy - v.ty) * scale,
      };
    });
  }, []);

  const onWheel = (e: ReactWheelEvent) => {
    const rect = svgRef.current?.getBoundingClientRect();
    const cx = e.clientX - (rect?.left ?? 0);
    const cy = e.clientY - (rect?.top ?? 0);
    zoomAround(e.deltaY < 0 ? 1.12 : 0.89, cx, cy);
  };

  const resetView = () => {
    setView({ tx: 0, ty: 0, k: 1 });
    for (const n of nodesRef.current) {
      if (n.group === "session") {
        // Keep the hub pinned at the centre.
        n.fx = size.w / 2;
        n.fy = size.h / 2;
      } else {
        n.fx = null;
        n.fy = null;
      }
    }
    simRef.current?.alpha(0.8).restart();
  };

  const refresh = async () => {
    if (!sessionId) return;
    setRefreshing(true);
    try {
      const fresh = await api.getKGraph(sessionId);
      setTabData("kgraph", fresh);
    } catch (err) {
      console.error("Failed to refresh knowledge graph:", err);
    } finally {
      setRefreshing(false);
    }
  };

  const selectedNode = useMemo(
    () => nodesRef.current.find((n) => n.id === selected) ?? null,
    // re-evaluate on tick/selection changes
    [selected, kgraph],
  );

  if (!kgraph) {
    return (
      <div className="col flex1" style={{ minHeight: 0 }}>
        <div
          className="row gap-2"
          style={{
            padding: "10px 14px",
            borderBottom: "1px solid var(--color-border-1)",
          }}
        >
          <span className="section-h">Knowledge Graph</span>
        </div>
        <div
          className="flex1 col"
          style={{
            alignItems: "center",
            justifyContent: "center",
            color: "var(--color-text-3)",
            fontSize: 12,
          }}
        >
          No session loaded
        </div>
      </div>
    );
  }

  const nodes = nodesRef.current;
  const links = linksRef.current;
  const byId = new Map(nodes.map((n) => [n.id, n]));

  return (
    <div className="col flex1" style={{ minHeight: 0 }}>
      {/* Toolbar */}
      <div
        className="row gap-2"
        style={{
          padding: "10px 14px",
          borderBottom: "1px solid var(--color-border-1)",
        }}
      >
        <span className="section-h">Knowledge Graph</span>
        <span className="pill sm ghost mono">
          {nodes.length} nodes · {links.length} edges
        </span>
        <div className="flex1" />
        <div className="row gap-1" style={{ marginRight: 8 }}>
          {GROUP_LABELS.map(([k, label]) => (
            <span key={k} className="pill sm ghost">
              <span className="swatch" style={{ background: GROUP_COLOR[k] }} />
              {label}
            </span>
          ))}
        </div>
        <button
          className="btn ghost icon sm"
          title="Zoom in"
          onClick={() => zoomAround(1.2, size.w / 2, size.h / 2)}
        >
          <Icon.Plus size={13} />
        </button>
        <button
          className="btn ghost icon sm"
          title="Zoom out"
          onClick={() => zoomAround(0.83, size.w / 2, size.h / 2)}
        >
          <Icon.Zoom size={13} />
        </button>
        <button className="btn ghost sm" title="Reset view" onClick={resetView}>
          Reset
        </button>
        <button
          className="btn ghost icon sm"
          title="Refresh"
          onClick={() => void refresh()}
        >
          <Icon.Refresh size={13} className={refreshing ? "spin" : undefined} />
        </button>
      </div>

      {/* Force-graph canvas */}
      <div
        ref={wrapRef}
        className="flex1"
        style={{
          position: "relative",
          overflow: "hidden",
          background: "var(--color-map-bg)",
        }}
      >
        <svg
          ref={svgRef}
          width={size.w}
          height={size.h}
          style={{
            position: "absolute",
            inset: 0,
            touchAction: "none",
            cursor: dragRef.current?.kind === "pan" ? "grabbing" : "grab",
          }}
          onPointerDown={onBackgroundPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onWheel={onWheel}
        >
          <defs>
            <marker
              id="kg-arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-border-3)" />
            </marker>
          </defs>

          <g transform={`translate(${view.tx} ${view.ty}) scale(${view.k})`}>
            {/* Edges */}
            {links.map((l, i) => {
              const A =
                typeof l.source === "object"
                  ? (l.source as SimNode)
                  : byId.get(l.source as string);
              const B =
                typeof l.target === "object"
                  ? (l.target as SimNode)
                  : byId.get(l.target as string);
              if (!A || !B || A.x == null || B.x == null) return null;
              return (
                <line
                  key={i}
                  x1={A.x}
                  y1={A.y}
                  x2={B.x}
                  y2={B.y}
                  stroke="var(--color-border-2)"
                  strokeWidth={1.2}
                  markerEnd="url(#kg-arrow)"
                  opacity={0.75}
                />
              );
            })}

            {/* Nodes */}
            {nodes.map((n) => {
              if (n.x == null || n.y == null) return null;
              const r = nodeRadius(n.group);
              const isSel = n.id === selected;
              return (
                <g
                  key={n.id}
                  transform={`translate(${n.x} ${n.y})`}
                  style={{ cursor: "pointer" }}
                  onPointerDown={(e) => onNodePointerDown(e, n)}
                >
                  <circle
                    r={r + (isSel ? 3 : 0)}
                    fill="var(--color-bg-2)"
                    stroke={GROUP_COLOR[n.group]}
                    strokeWidth={isSel ? 2.5 : 1.6}
                  />
                  <circle r={r - 3} fill={GROUP_COLOR[n.group]} />
                  <text
                    x={r + 5}
                    y={4}
                    fontSize={11}
                    fill="var(--color-text-0)"
                    fontFamily="JetBrains Mono, monospace"
                    style={{ pointerEvents: "none", userSelect: "none" }}
                  >
                    {n.label}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>

        {/* Detail panel */}
        {selectedNode ? (
          <div
            className="panel"
            style={{
              position: "absolute",
              bottom: 14,
              left: 14,
              padding: "10px 12px",
              maxWidth: 340,
            }}
          >
            <div
              className="row gap-2"
              style={{ alignItems: "center", marginBottom: 6 }}
            >
              <span
                className="swatch"
                style={{ background: GROUP_COLOR[selectedNode.group] }}
              />
              <span className="section-h">{selectedNode.group}</span>
              <div className="flex1" />
              <button
                className="btn ghost icon sm"
                title="Close"
                onClick={() => setSelected(null)}
              >
                <Icon.X size={11} />
              </button>
            </div>
            <div
              className="mono"
              style={{
                fontSize: 12,
                color: "var(--color-text-0)",
                marginBottom: 4,
                wordBreak: "break-word",
              }}
            >
              {selectedNode.label}
            </div>
            {metaLines(selectedNode).map((line, i) => (
              <div
                key={i}
                style={{
                  fontSize: 11.5,
                  color: "var(--color-text-2)",
                  lineHeight: 1.5,
                  wordBreak: "break-word",
                }}
              >
                {line}
              </div>
            ))}
          </div>
        ) : (
          nodes.length > 0 && (
            <div
              className="panel"
              style={{
                position: "absolute",
                bottom: 14,
                left: 14,
                padding: "8px 12px",
                maxWidth: 320,
                fontSize: 11.5,
                color: "var(--color-text-3)",
              }}
            >
              Drag nodes to arrange · scroll to zoom · drag canvas to pan · click
              a node for details
            </div>
          )
        )}

        {nodes.length === 0 && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "grid",
              placeItems: "center",
              color: "var(--color-text-3)",
              fontSize: 12,
            }}
          >
            No graph extracted for this session yet
          </div>
        )}
      </div>
    </div>
  );
}
