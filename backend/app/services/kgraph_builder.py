"""
Builds the knowledge-graph JSON (KGraphResponse shape) from the data already
parsed/ingested: sensors, topics, anomalies, log lines, and causal edges.

The result is a list of nodes (id, label, group, x, y, meta) and edges
([source, target]) that the frontend KGraphView.tsx renders. The frontend now
runs a force-directed layout, so x/y are only a harmless initial seed; `meta`
carries the per-node detail surfaced on hover (topic/sensor type, Hz, etc.).
"""
from __future__ import annotations

from typing import Any


_TIER_X = {
    "sensor": 110,
    "topic": 230,
    "fault": 380,
    "node": 520,
    "outcome": 660,
}
_Y_START = 80
_Y_STEP = 120


def attach_session_root(
    graph: dict[str, Any],
    session_id: str | None,
    label: str | None = None,
) -> dict[str, Any]:
    """Anchor every node to a single Session hub node (id == session_id).

    Adds a `session`-group root node (if absent) and a direct edge from it to
    every other node that isn't already linked to it, so the graph is one
    connected component centred on the session. Idempotent — safe to call again
    after merging in extra nodes (e.g. conversation facts).
    """
    nodes = graph.get("nodes", [])
    edges = graph.get("edges", [])
    if not session_id or not nodes:
        return graph

    node_ids = {n["id"] for n in nodes}
    if session_id not in node_ids:
        nodes.insert(0, {
            "id": session_id,
            "label": (label or "session")[:30],
            "group": "session",
            "x": 400,
            "y": 280,
            "meta": {"sessionId": session_id, "label": label or ""},
        })
        node_ids.add(session_id)

    connected: set[str] = set()
    for e in edges:
        if e[0] == session_id:
            connected.add(e[1])
        elif e[1] == session_id:
            connected.add(e[0])

    for n in nodes:
        nid = n["id"]
        if nid != session_id and nid not in connected:
            edges.append([session_id, nid])
            connected.add(nid)

    graph["nodes"] = nodes
    graph["edges"] = edges
    return graph


def build_kgraph(
    sensors: list[dict[str, Any]],
    anomalies: list[dict[str, Any]],
    logs: list[dict[str, Any]],
    causal_edges: list[dict[str, Any]],
    topics: list[dict[str, Any]] | None = None,
    session_id: str | None = None,
    session_label: str | None = None,
) -> dict[str, Any]:
    """
    Returns {"nodes": [...], "edges": [...]} ready to be JSON-serialised into
    SessionRecord.kgraph_json.
    """
    topics = topics or []
    nodes: list[dict[str, Any]] = []
    node_ids: set[str] = set()

    def _add(nid: str, label: str, group: str, meta: dict[str, Any] | None = None) -> None:
        if nid not in node_ids:
            tier_count = sum(1 for n in nodes if n["group"] == group)
            nodes.append({
                "id": nid,
                "label": label[:30],           # truncate for display
                "group": group,
                "x": _TIER_X.get(group, 400),
                "y": _Y_START + tier_count * _Y_STEP,
                "meta": meta or {},
            })
            node_ids.add(nid)

    # 1. Sensor nodes
    for s in sensors:
        name = s.get("name") or s.get("topic") or s.get("id") or ""
        if name:
            _add(
                f"sensor_{name}",
                name,
                "sensor",
                {
                    "sensorType": s.get("type") or "sensor",
                    "msgType": s.get("msg_type") or "",
                    "topic": s.get("topic") or "",
                },
            )

    # 2. Topic nodes — carry message type / Hz / message count
    for t in topics:
        name = t.get("name") or ""
        if not name:
            continue
        _add(
            f"topic_{name}",
            name,
            "topic",
            {
                "type": t.get("type") or "",
                "hz": t.get("hz"),
                "msgs": t.get("msgs") if t.get("msgs") is not None else t.get("total_messages"),
            },
        )

    # 3. Fault nodes — one per unique anomaly kind
    seen_kinds: set[str] = set()
    for a in anomalies:
        kind = a.get("kind") or a.get("type") or "anomaly"
        if kind not in seen_kinds:
            seen_kinds.add(kind)
            _add(
                f"fault_{kind}",
                kind,
                "fault",
                {"kind": kind, "severity": a.get("severity") or "warning"},
            )

    # 4. ROS node nodes — unique nodes from ERROR/FATAL logs
    seen_ros_nodes: set[str] = set()
    for log in logs:
        sev = (log.get("sev") or log.get("severity") or "").upper()
        if sev in ("ERROR", "FATAL"):
            ros_node = log.get("node") or log.get("source") or ""
            if ros_node and ros_node not in seen_ros_nodes:
                seen_ros_nodes.add(ros_node)
                _add(f"node_{ros_node}", ros_node, "node", {"rosNode": ros_node})

    # 5. Outcome nodes — critical anomalies that aren't already fault nodes
    for a in anomalies:
        if (a.get("severity") or "").lower() == "critical":
            kind = a.get("kind") or a.get("type") or "critical"
            oid = f"outcome_{kind}"
            if oid not in node_ids:
                _add(
                    oid,
                    kind + " [critical]",
                    "outcome",
                    {"kind": kind, "severity": "critical"},
                )

    # If we have no nodes, return empty graph rather than clutter
    if not nodes:
        return {"nodes": [], "edges": []}

    seen_edges: set[tuple[str, str]] = set()
    edges: list[list[str]] = []

    def _add_edge(src: str, tgt: str) -> None:
        if src in node_ids and tgt in node_ids and src != tgt:
            key = (src, tgt)
            if key not in seen_edges:
                seen_edges.add(key)
                edges.append([src, tgt])

    # 6. Edges from causal rules: map log IDs → kgraph node IDs
    log_id_to_node: dict[str, str] = {}
    for log in logs:
        lid = log.get("id") or ""
        ros_node = log.get("node") or log.get("source") or ""
        if lid and ros_node:
            kgraph_nid = f"node_{ros_node}"
            if kgraph_nid in node_ids:
                log_id_to_node[lid] = kgraph_nid

    for e in causal_edges:
        etype = e.get("type", "")
        if etype == "CONCURRENT_WITH":
            continue  # skip noise; only show directed causal edges
        src_node = log_id_to_node.get(e.get("source_id", ""))
        tgt_node = log_id_to_node.get(e.get("target_id", ""))
        if src_node and tgt_node:
            _add_edge(src_node, tgt_node)

    # 7. Sensor → Topic edges (a sensor publishes on its topic)
    for s in sensors:
        topic = s.get("topic") or ""
        # Build the id with the same fallback used when the node was created.
        snode_id = f"sensor_{s.get('name') or s.get('topic') or s.get('id') or ''}"
        if topic and snode_id in node_ids:
            _add_edge(snode_id, f"topic_{topic}")

    # 8. Sensor → ROS-node edges by topic name (a node that logged about the topic)
    for s in sensors:
        topic = s.get("topic") or ""
        snode_id = f"sensor_{s.get('name') or s.get('topic') or s.get('id') or ''}"
        if snode_id not in node_ids:
            continue
        for log in logs:
            if log.get("topic") == topic:
                tgt = f"node_{log.get('node') or ''}"
                if tgt in node_ids:
                    _add_edge(snode_id, tgt)
                    break

    return attach_session_root({"nodes": nodes, "edges": edges}, session_id, session_label)
