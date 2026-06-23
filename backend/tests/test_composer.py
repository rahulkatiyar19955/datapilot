"""Unit coverage for app.agent.composer.

Covers:
  - `_collect_findings`        (aggregation across specialists)
  - `_filter_uncited`          (citation grounding rules)
  - `_resolve_citations`       (Cypher lookup with a MOCKED Neo4j)
  - `composer_node`            (end-to-end envelope assembly)

The autouse `mock_neo4j` fixture in conftest already replaces
`neo4j_client.run_query` with a MagicMock returning []. Tests that need rows
override `composer.neo4j_client.run_query` via monkeypatch.

NOTE (issue #50): `_collect_findings` / `_filter_uncited` intentionally KEEP
findings whose `log_ids` list is empty (treated as nominal/summary
observations like "No anomalies detected"). They are never dropped, even
though they carry no citation grounding. These tests pin that behavior.
"""
from __future__ import annotations

import asyncio
from typing import Any

import pytest

from app.agent import composer as composer_mod
from app.agent.composer import (
    _collect_causal,
    _collect_findings,
    _filter_uncited,
    _resolve_citations,
    composer_node,
)
from app.agent.state import GraphState
from tests.fixtures.mock_llm import MockRouter


def _state(**over: Any) -> GraphState:
    state: GraphState = {
        "session_id": "s1",
        "user_message": "why did the robot stop?",
        "session_summary": "filename=lidar_failure.mcap",
        "plan": [{"idx": 0, "specialist": "RootCauseAnalyst", "intent": "trace", "done": True}],
        "plan_idx": 1,
        "specialist_outputs": {},
        "replan_count": 0,
        "audit_trail": [],
    }
    state.update(over)  # type: ignore[typeddict-item]
    return state


# ── _collect_findings ────────────────────────────────────────────────────────


def test_collect_findings_aggregates_across_specialists():
    outputs = {
        "RootCauseAnalyst": {"findings": [{"sev": "critical", "text": "A", "log_ids": ["l_1"]}]},
        "AnomalyDetector": {"findings": [{"sev": "warning", "text": "B", "log_ids": ["l_2"]}]},
    }
    findings, dropped = _collect_findings(_state(specialist_outputs=outputs))
    assert {f["text"] for f in findings} == {"A", "B"}
    # _collect_findings itself drops nothing — that is _filter_uncited's job.
    assert dropped == []


def test_collect_findings_keeps_empty_log_ids():
    """NOTE (issue #50): empty-log_ids findings survive collection."""
    outputs = {
        "AnomalyDetector": {"findings": [{"sev": "info", "text": "No anomalies", "log_ids": []}]},
    }
    findings, _ = _collect_findings(_state(specialist_outputs=outputs))
    assert len(findings) == 1
    assert findings[0]["text"] == "No anomalies"


def test_collect_findings_skips_non_dict_entries():
    outputs = {
        "RootCauseAnalyst": {"findings": ["not a dict", {"sev": "info", "text": "ok", "log_ids": []}]},
    }
    findings, _ = _collect_findings(_state(specialist_outputs=outputs))
    assert len(findings) == 1
    assert findings[0]["text"] == "ok"


def test_collect_findings_empty_when_no_outputs():
    findings, dropped = _collect_findings(_state(specialist_outputs={}))
    assert findings == []
    assert dropped == []


# ── _collect_causal ──────────────────────────────────────────────────────────


def test_collect_causal_prefers_rca_chain():
    outputs = {"RootCauseAnalyst": {"causal": [{"label": "step", "log_id": "l_1"}]}}
    causal = _collect_causal(_state(specialist_outputs=outputs))
    assert causal == [{"label": "step", "log_id": "l_1"}]


def test_collect_causal_empty_without_rca():
    outputs = {"AnomalyDetector": {"causal": [{"label": "ignored"}]}}
    assert _collect_causal(_state(specialist_outputs=outputs)) == []


# ── _filter_uncited (issue #50) ──────────────────────────────────────────────


def test_filter_keeps_findings_with_resolved_log_ids():
    findings = [{"sev": "critical", "text": "A", "log_ids": ["l_1"]}]
    kept, dropped = _filter_uncited(findings, valid_log_ids={"l_1"})
    assert len(kept) == 1
    assert dropped == []


def test_filter_drops_findings_whose_log_ids_dont_resolve():
    findings = [{"sev": "critical", "text": "ghost finding", "log_ids": ["l_404"]}]
    kept, dropped = _filter_uncited(findings, valid_log_ids={"l_1"})
    assert kept == []
    assert dropped == ["ghost finding"]


def test_filter_keeps_finding_if_any_log_id_resolves():
    findings = [{"sev": "warning", "text": "partial", "log_ids": ["l_404", "l_1"]}]
    kept, dropped = _filter_uncited(findings, valid_log_ids={"l_1"})
    assert len(kept) == 1
    assert dropped == []


def test_filter_always_keeps_empty_log_ids_finding():
    """NOTE (issue #50): empty-log_ids findings are never dropped — even with
    an empty valid set."""
    findings = [{"sev": "info", "text": "No issues found", "log_ids": []}]
    kept, dropped = _filter_uncited(findings, valid_log_ids=set())
    assert len(kept) == 1
    assert dropped == []


def test_filter_missing_log_ids_key_treated_as_empty():
    findings = [{"sev": "info", "text": "summary"}]  # no log_ids key at all
    kept, dropped = _filter_uncited(findings, valid_log_ids=set())
    assert len(kept) == 1
    assert dropped == []


# ── _resolve_citations (mocked Neo4j) ────────────────────────────────────────


def test_resolve_citations_empty_when_no_log_ids():
    findings = [{"sev": "info", "text": "x", "log_ids": []}]
    # Should short-circuit without touching Neo4j.
    assert _resolve_citations("s1", findings) == []


def test_resolve_citations_builds_citation_objects(monkeypatch):
    rows = [
        {"log_id": "l_1", "ts": "00:01:04.200", "node": "/move_base", "msg": "planner aborted"},
    ]
    monkeypatch.setattr(composer_mod.neo4j_client, "run_query", lambda *a, **k: rows)
    findings = [{"sev": "critical", "text": "A", "log_ids": ["l_1"]}]
    cites = _resolve_citations("s1", findings)
    assert len(cites) == 1
    c = cites[0]
    assert c["log_id"] == "l_1"
    assert c["node"] == "/move_base"
    assert c["snippet"] == "planner aborted"
    # ts is converted to float seconds (1*60 + 4.2 == 64.2).
    assert abs(c["ts"] - 64.2) < 1e-6


def test_resolve_citations_snippet_truncated_to_140(monkeypatch):
    rows = [{"log_id": "l_1", "ts": "0", "node": "/n", "msg": "x" * 500}]
    monkeypatch.setattr(composer_mod.neo4j_client, "run_query", lambda *a, **k: rows)
    cites = _resolve_citations("s1", [{"sev": "info", "text": "t", "log_ids": ["l_1"]}])
    assert len(cites[0]["snippet"]) == 140


def test_resolve_citations_swallows_neo4j_error(monkeypatch):
    def _boom(*a, **k):
        raise RuntimeError("bolt connection refused")

    monkeypatch.setattr(composer_mod.neo4j_client, "run_query", _boom)
    # Exception path returns [] rather than propagating.
    assert _resolve_citations("s1", [{"sev": "info", "text": "t", "log_ids": ["l_1"]}]) == []


# ── composer_node (end-to-end) ───────────────────────────────────────────────


def test_composer_node_produces_envelope_with_prose(monkeypatch):
    rows = [{"log_id": "l_5", "ts": "00:01:04.200", "node": "/sensors/lidar_a", "msg": "dropout"}]
    monkeypatch.setattr(composer_mod.neo4j_client, "run_query", lambda *a, **k: rows)
    outputs = {
        "RootCauseAnalyst": {
            "findings": [{"sev": "critical", "text": "Sensor dropout", "log_ids": ["l_5"]}],
            "causal": [{"label": "dropout", "log_id": "l_5"}],
        }
    }
    out = asyncio.run(composer_node(_state(specialist_outputs=outputs), router=MockRouter()))
    env = out["final"]
    # Mock composer returns canned prose.
    assert env["response"]
    assert env["findings"][0]["text"] == "Sensor dropout"
    assert env["citations"][0]["log_id"] == "l_5"
    assert env["causal"][0]["label"] == "dropout"
    # Usage metrics aggregated from the audit trail.
    assert env["usage"]["tokens_in"] >= 0
    assert "est_cost_usd" in env["usage"]


def test_composer_node_drops_uncited_and_audits(monkeypatch):
    # Neo4j resolves NOTHING → the cited finding has no valid log_id → dropped.
    monkeypatch.setattr(composer_mod.neo4j_client, "run_query", lambda *a, **k: [])
    outputs = {
        "RootCauseAnalyst": {
            "findings": [{"sev": "critical", "text": "ghost", "log_ids": ["l_404"]}],
        }
    }
    out = asyncio.run(composer_node(_state(specialist_outputs=outputs), router=MockRouter()))
    env = out["final"]
    assert env["findings"] == []
    # A "dropped N uncited" compose audit event was recorded.
    assert any(
        e.get("step_kind") == "compose" and "dropped" in str(e.get("result_summary", ""))
        for e in out["audit_trail"]
    )


def test_composer_node_keeps_empty_log_ids_finding(monkeypatch):
    """NOTE (issue #50): an empty-log_ids 'no issues' finding survives the full
    composer node even though it has no citation."""
    monkeypatch.setattr(composer_mod.neo4j_client, "run_query", lambda *a, **k: [])
    outputs = {"AnomalyDetector": {"findings": [{"sev": "info", "text": "No anomalies", "log_ids": []}]}}
    out = asyncio.run(composer_node(_state(specialist_outputs=outputs), router=MockRouter()))
    texts = [f["text"] for f in out["final"]["findings"]]
    assert "No anomalies" in texts


def test_composer_partial_flag_follows_replan_overflow(monkeypatch):
    """NOTE (issues #53/#54): composer sets partial only when replan_count > 5,
    matching the replan_node bail boundary (6), not MAX_REPLANS (5)."""
    monkeypatch.setattr(composer_mod.neo4j_client, "run_query", lambda *a, **k: [])
    # replan_count == 5 → NOT partial (5 > 5 is False).
    out5 = asyncio.run(composer_node(_state(replan_count=5), router=MockRouter()))
    assert out5["final"]["partial"] is False
    # replan_count == 6 → partial.
    out6 = asyncio.run(composer_node(_state(replan_count=6), router=MockRouter()))
    assert out6["final"]["partial"] is True
