"""
Builds the knowledge-graph JSON (KGraphResponse shape) from the data already
parsed/ingested: sensors, anomalies, log lines, and causal edges.

The result is a list of nodes (id, label, group, x, y) and edges ([source, target])
that the frontend KGraphView.tsx renders.
"""
from __future__ import annotations

from typing import Any


_TIER_X = {
    "sensor": 110,
    "fault": 310,
    "node": 490,
    "outcome": 660,
}
_Y_START = 80
_Y_STEP = 120


def build_kgraph(
    sensors: list[dict[str, Any]],
    anomalies: list[dict[str, Any]],
    logs: list[dict[str, Any]],
    causal_edges: list[dict[str, Any]],
) -> dict[str, Any]:
    """
    Returns {"nodes": [...], "edges": [...]} ready to be JSON-serialised into
    SessionRecord.kgraph_json.
    """
    nodes: list[dict[str, Any]] = []
    node_ids: set[str] = set()

    def _add(nid: str, label: str, group: str) -> None:
        if nid not in node_ids:
            tier_count = sum(1 for n in nodes if n["group"] == group)
            nodes.append({
                "id": nid,
                "label": label[:30],           # truncate for display
                "group": group,
                "x": _TIER_X[group],
                "y": _Y_START + tier_count * _Y_STEP,
            })
            node_ids.add(nid)

    # 1. Sensor nodes
    for s in sensors:
        name = s.get("name") or s.get("topic") or s.get("id") or ""
        if name:
            _add(f"sensor_{name}", name, "sensor")

    # 2. Fault nodes — one per unique anomaly kind
    seen_kinds: set[str] = set()
    for a in anomalies:
        kind = a.get("kind") or a.get("type") or "anomaly"
        if kind not in seen_kinds:
            seen_kinds.add(kind)
            _add(f"fault_{kind}", kind, "fault")

    # 3. ROS node nodes — unique nodes from ERROR/FATAL logs
    seen_ros_nodes: set[str] = set()
    for log in logs:
        sev = (log.get("sev") or log.get("severity") or "").upper()
        if sev in ("ERROR", "FATAL"):
            ros_node = log.get("node") or log.get("source") or ""
            if ros_node and ros_node not in seen_ros_nodes:
                seen_ros_nodes.add(ros_node)
                _add(f"node_{ros_node}", ros_node, "node")

    # 4. Outcome nodes — critical anomalies that aren't already fault nodes
    for a in anomalies:
        if (a.get("severity") or "").lower() == "critical":
            kind = a.get("kind") or a.get("type") or "critical"
            oid = f"outcome_{kind}"
            if oid not in node_ids:
                _add(oid, kind + " [critical]", "outcome")

    # If we have no nodes, return empty graph rather than clutter
    if not nodes:
        return {"nodes": [], "edges": []}

    # 5. Edges from causal rules: map log IDs → kgraph node IDs
    log_id_to_node: dict[str, str] = {}
    for log in logs:
        lid = log.get("id") or ""
        ros_node = log.get("node") or log.get("source") or ""
        if lid and ros_node:
            kgraph_nid = f"node_{ros_node}"
            if kgraph_nid in node_ids:
                log_id_to_node[lid] = kgraph_nid

    seen_edges: set[tuple[str, str]] = set()
    edges: list[list[str]] = []

    for e in causal_edges:
        etype = e.get("type", "")
        if etype == "CONCURRENT_WITH":
            continue  # skip noise; only show directed causal edges
        src_log = e.get("source_id", "")
        tgt_log = e.get("target_id", "")
        src_node = log_id_to_node.get(src_log)
        tgt_node = log_id_to_node.get(tgt_log)
        if src_node and tgt_node and src_node != tgt_node:
            key = (src_node, tgt_node)
            if key not in seen_edges:
                seen_edges.add(key)
                edges.append([src_node, tgt_node])

    # Also link sensors → their matching fault/node nodes by topic name
    for s in sensors:
        topic = s.get("topic") or ""
        snode_id = f"sensor_{s.get('name') or s.get('topic') or ''}"
        if snode_id not in node_ids:
            continue
        for log in logs:
            if log.get("topic") == topic:
                ros_node = log.get("node") or ""
                tgt = f"node_{ros_node}"
                if tgt in node_ids:
                    key = (snode_id, tgt)
                    if key not in seen_edges:
                        seen_edges.add(key)
                        edges.append([snode_id, tgt])
                    break

    return {"nodes": nodes, "edges": edges}
