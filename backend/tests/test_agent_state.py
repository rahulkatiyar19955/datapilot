"""TypedDict shape contracts for the agent state types."""
from __future__ import annotations

from app.agent.state import (
    MAX_REPLANS,
    PER_SESSION_TOKEN_CAP,
    PER_TURN_TOKEN_CAP,
    AuditEvent,
    CausalStep,
    ChatMessageEnvelope,
    Citation,
    Finding,
    GraphState,
    SpecResult,
    SpecStep,
    UsageMetrics,
)


def test_constants_match_spec():
    assert MAX_REPLANS == 5
    assert PER_TURN_TOKEN_CAP == 25_000
    assert PER_SESSION_TOKEN_CAP == 200_000


def test_spec_step_minimal():
    step = SpecStep(idx=0, specialist="RootCauseAnalyst", intent="trace failure")
    assert step["idx"] == 0
    assert step["specialist"] == "RootCauseAnalyst"


def test_finding_must_have_log_ids_field():
    f = Finding(sev="critical", text="dropout", log_ids=["l_1", "l_2"])
    assert f["log_ids"] == ["l_1", "l_2"]


def test_envelope_shape_includes_required_fields():
    env = ChatMessageEnvelope(response="hi", plan=[], findings=[], causal=[], audit_trail=[], citations=[])
    assert env["response"] == "hi"
    assert env.get("plan") == []
    assert env.get("findings") == []
    assert env.get("causal") == []
