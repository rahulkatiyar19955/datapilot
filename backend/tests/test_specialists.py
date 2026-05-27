"""Each specialist returns its structured output schema against the mock LLM."""
from __future__ import annotations

import asyncio

import pytest

from app.agent.specialists.defaults import SPECIALIST_REGISTRY
from tests.fixtures.mock_llm import MockRouter


@pytest.mark.parametrize("name", list(SPECIALIST_REGISTRY.keys()))
def test_specialist_runs_and_returns_findings_shape(name):
    specialist = SPECIALIST_REGISTRY[name]
    router = MockRouter()
    result, audit = asyncio.run(specialist.run(
        router=router,
        session_id="s1",
        intent="investigate",
        session_summary="filename=lidar_failure.mcap",
    ))
    # Every specialist must return findings + confidence keys.
    assert "findings" in result
    assert "confidence" in result
    assert isinstance(result["confidence"], (int, float))
    assert 0.0 <= result["confidence"] <= 1.0
    # Audit trail recorded the specialist_start event.
    assert audit[0]["step_kind"] == "specialist_start"
    assert audit[0]["specialist"] == name


def test_rca_returns_causal_chain():
    specialist = SPECIALIST_REGISTRY["RootCauseAnalyst"]
    router = MockRouter()
    result, _ = asyncio.run(specialist.run(
        router=router,
        session_id="s1",
        intent="trace failure",
        session_summary="",
    ))
    assert "causal" in result
    assert len(result["causal"]) >= 2
    # Causal steps reference real log_ids.
    assert all("log_id" in step for step in result["causal"])
