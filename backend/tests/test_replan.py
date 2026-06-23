"""Unit coverage for app.agent.replan.replan_node.

Reuses the deterministic MockRouter (mock LLM) from tests.fixtures.mock_llm.
The autouse `mock_neo4j` fixture keeps everything offline.

These tests characterize CURRENT behavior, including the replan-cap off-by-one.

NOTE (issues #53/#54): the replan cap interacts with the `partial` flag in an
off-by-one way.
  - `replan_node` increments `replan_count` FIRST, then bails to the composer
    only when the *post-increment* count is STRICTLY GREATER than MAX_REPLANS
    (== 5). So the bail fires when the incoming count was already 5 → new
    count 6. That means up to 6 replan invocations can run (counts 1..6), with
    the 6th being the bail-out, not 5.
  - The bail-out path sets `final = {"partial": True}` directly, bypassing the
    composer entirely (so no prose response is produced on overflow).
"""
from __future__ import annotations

import asyncio
import json
from typing import Any

import pytest

from app.agent.replan import replan_node
from app.agent.state import MAX_REPLANS, GraphState
from tests.fixtures.mock_llm import MockLLMClient, MockRouter


def _base_state(**over: Any) -> GraphState:
    state: GraphState = {
        "session_id": "s1",
        "user_message": "why did it stop?",
        "plan": [],
        "plan_idx": 0,
        "specialist_outputs": {},
        "replan_count": 0,
        "audit_trail": [],
    }
    state.update(over)  # type: ignore[typeddict-item]
    return state


# The supervisor prompt is what replan asks the mock for; MockRouter detects
# "DataPilot Supervisor" in the system prompt and returns the canned plan.
def _router_with_plan(plan: list[dict[str, Any]] | None = None) -> MockRouter:
    if plan is None:
        return MockRouter()
    client = MockLLMClient(overrides={"supervisor": {"plan": plan}})
    return MockRouter(client)


# ── Happy path: rewrite remaining steps ──────────────────────────────────────


def test_replan_increments_count():
    router = _router_with_plan([])
    out = asyncio.run(replan_node(_base_state(replan_count=0), router=router))
    assert out["replan_count"] == 1


def test_replan_keeps_done_steps_and_appends_rewritten_tail():
    done = [
        {"idx": 0, "specialist": "RootCauseAnalyst", "intent": "x", "done": True},
    ]
    new_plan = [
        {"specialist": "AnomalyDetector", "intent": "recheck dropout", "label": "Recheck"},
    ]
    router = _router_with_plan(new_plan)
    out = asyncio.run(replan_node(_base_state(plan=done, replan_count=1), router=router))

    plan = out["plan"]
    assert len(plan) == 2
    # The completed step is preserved verbatim.
    assert plan[0]["specialist"] == "RootCauseAnalyst"
    assert plan[0].get("done") is True
    # The rewritten tail is reindexed after the completed steps and not done.
    assert plan[1]["specialist"] == "AnomalyDetector"
    assert plan[1]["idx"] == 1
    assert plan[1]["done"] is False
    # plan_idx is set to the count of completed steps.
    assert out["plan_idx"] == 1


def test_replan_label_truncated_to_60_chars():
    long_label = "Z" * 200
    router = _router_with_plan(
        [{"specialist": "AnomalyDetector", "intent": "i", "label": long_label}]
    )
    out = asyncio.run(replan_node(_base_state(replan_count=1), router=router))
    assert len(out["plan"][0]["label"]) == 60


def test_replan_label_falls_back_to_intent():
    router = _router_with_plan([{"specialist": "AnomalyDetector", "intent": "fallback intent"}])
    out = asyncio.run(replan_node(_base_state(replan_count=1), router=router))
    assert out["plan"][0]["label"] == "fallback intent"


def test_replan_skips_items_without_specialist():
    router = _router_with_plan(
        [
            {"intent": "no specialist here"},     # dropped
            "not even a dict",                     # dropped
            {"specialist": "SafetyAuditor", "intent": "ok"},
        ]
    )
    out = asyncio.run(replan_node(_base_state(replan_count=1), router=router))
    assert len(out["plan"]) == 1
    assert out["plan"][0]["specialist"] == "SafetyAuditor"


def test_replan_records_audit_with_token_usage():
    router = _router_with_plan([{"specialist": "AnomalyDetector", "intent": "i"}])
    out = asyncio.run(replan_node(_base_state(replan_count=2), router=router))
    audit = out["audit_trail"]
    assert len(audit) == 1
    ev = audit[0]
    assert ev["step_kind"] == "replan"
    assert "tokens_in" in ev and "tokens_out" in ev
    assert "replan #3" in ev["result_summary"]


# ── Edge: malformed LLM output ───────────────────────────────────────────────


def test_replan_handles_non_json_llm_output():
    # Mock returns a "_text" (non-JSON) blob → json.loads raises → new_steps=[].
    client = MockLLMClient(overrides={"supervisor": {"_text": "totally not json"}})
    router = MockRouter(client)
    out = asyncio.run(replan_node(_base_state(replan_count=1), router=router))
    # No rewritten steps; plan equals just the completed (none here).
    assert out["plan"] == []


# ── Off-by-one / overflow (issues #53/#54) ───────────────────────────────────


def test_replan_does_not_bail_at_max_replans_boundary():
    """Incoming count == MAX_REPLANS-1 (4) → new count 5, which is NOT > 5,
    so this is still a normal replan, not the overflow bail."""
    router = _router_with_plan([{"specialist": "AnomalyDetector", "intent": "i"}])
    out = asyncio.run(replan_node(_base_state(replan_count=MAX_REPLANS - 1), router=router))
    assert out["replan_count"] == MAX_REPLANS  # 5
    # Normal path emits a "plan" key; bail-out path does not.
    assert "plan" in out
    assert out.get("final") is None


def test_replan_bails_to_partial_only_after_exceeding_cap():
    """NOTE (issues #53/#54): the bail fires when incoming count == MAX_REPLANS
    (5) → new count 6 (> 5). So a 6th replan invocation happens, and only then
    does it short-circuit to composer with partial=True. The cap is effectively
    one higher than the documented 5."""
    out = asyncio.run(
        replan_node(_base_state(replan_count=MAX_REPLANS), router=MockRouter())
    )
    assert out["replan_count"] == MAX_REPLANS + 1  # 6
    assert out["final"] == {"partial": True}
    # Bail-out path does NOT rebuild the plan.
    assert "plan" not in out
    assert out["audit_trail"][0]["step_kind"] == "replan"
    assert "cap exceeded" in out["audit_trail"][0]["result_summary"]


def test_replan_bail_preserves_existing_final():
    """On overflow, if a `final` already exists it is left untouched (set to
    None in the returned delta so the reducer keeps the prior value)."""
    existing = {"response": "already composed", "partial": False}
    out = asyncio.run(
        replan_node(
            _base_state(replan_count=MAX_REPLANS, final=existing),  # type: ignore[arg-type]
            router=MockRouter(),
        )
    )
    # When final is already set, replan returns final=None (no overwrite intent).
    assert out["final"] is None
