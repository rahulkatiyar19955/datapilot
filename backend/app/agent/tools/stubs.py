"""
Stub tools — registered today so specialists' tool catalogs are complete,
deepened in Phase 5 (AnomalyDetector / PerformanceProfiler / SafetyAuditor /
ReleaseComparator workers).

Each returns `{ok: true, result: []}` (or an empty dict) so specialists can
call them in their plans without crashing. The MCP-shape contract makes the
Phase 5 swap a body-level change, not a callsite change.
"""
from __future__ import annotations

from typing import Any

_EMPTY_RESULT: dict[str, Any] = {"ok": True, "result": []}


def _make_stub(worker: str, name: str, description: str, schema_props: dict[str, Any]):
    module = type("StubModule", (), {})
    module.WORKER = worker
    module.NAME = name
    module.DESCRIPTION = description
    module.INPUT_SCHEMA = {
        "type": "object",
        "additionalProperties": False,
        "properties": schema_props,
        "required": ["session_id"],
    }
    module.OUTPUT_SCHEMA = {"type": "array"}
    module.run = lambda _args: _EMPTY_RESULT
    return module


find_outliers = _make_stub(
    "anomaly_detector",
    "find_statistical_outliers",
    "Statistical outliers on a numerical topic field (z-score / IQR). Phase 5 deepens this.",
    {
        "session_id": {"type": "string"},
        "topic": {"type": "string"},
        "field": {"type": "string"},
        "method": {"type": "string", "enum": ["zscore", "iqr"], "default": "zscore"},
        "threshold": {"type": "number", "default": 3.0},
    },
)

find_signatures = _make_stub(
    "anomaly_detector",
    "find_signature_matches",
    "Match a named anomaly signature against the session. Phase 5 ships a real signature library.",
    {"session_id": {"type": "string"}, "signature_id": {"type": "string"}},
)

query_topic_rate = _make_stub(
    "trajectory_analyzer",
    "query_topic_rate",
    "Compute Hz over time for a topic. Phase 5 deepens this.",
    {"session_id": {"type": "string"}, "topic": {"type": "string"}, "bucket_s": {"type": "number", "default": 1.0}},
)

compute_node_cpu = _make_stub(
    "anomaly_detector",
    "compute_node_cpu",
    "Per-node CPU usage from /diagnostics. Phase 5 parses real diagnostics.",
    {"session_id": {"type": "string"}, "node": {"type": "string"}},
)

find_rate_regressions = _make_stub(
    "anomaly_detector",
    "find_rate_regressions",
    "Detect topic-rate regressions vs baseline. Phase 5 vs Phase 10 territory.",
    {"session_id": {"type": "string"}, "baseline_session_id": {"type": "string"}},
)

query_commands = _make_stub(
    "planner_failure_inspector",
    "query_commands",
    "Recent commanded velocities / actions. Phase 5 deepens this.",
    {"session_id": {"type": "string"}, "t_from": {"type": "number"}, "t_to": {"type": "number"}},
)

query_recoveries = _make_stub(
    "planner_failure_inspector",
    "query_recoveries",
    "Recovery behavior invocations. Phase 5 deepens this.",
    {"session_id": {"type": "string"}},
)

query_safety_rules = _make_stub(
    "planner_failure_inspector",
    "query_safety_rules",
    "ISO 26262 / 21448 safety rule checks. Phase 5 ships the rule set.",
    {"session_id": {"type": "string"}},
)

compare_metric_distributions = _make_stub(
    "anomaly_detector",
    "compare_metric_distributions",
    "Compare metric distributions across two sessions. Phase 10 cross-session work.",
    {"session_id_a": {"type": "string"}, "session_id_b": {"type": "string"}, "metric": {"type": "string"}},
)

compare_log_signatures = _make_stub(
    "anomaly_detector",
    "compare_log_signatures",
    "Compare log signatures across two sessions. Phase 10 cross-session work.",
    {"session_id_a": {"type": "string"}, "session_id_b": {"type": "string"}},
)

read_diagnostics = _make_stub(
    "rosbag_reader",
    "read_diagnostics",
    "Parse /diagnostics DiagnosticArray status entries. Phase 5 ships real parsing.",
    {"session_id": {"type": "string"}, "t_from": {"type": "number"}, "t_to": {"type": "number"}},
)

format_causal_chain = _make_stub(
    "report_composer",
    "format_causal_chain",
    "Render a causal chain as the tree-drawing-character form used in the Copilot UI.",
    {"session_id": {"type": "string"}},
)
