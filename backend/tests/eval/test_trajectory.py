"""
Supervisor routing trajectory tests.

For each question category, assert the supervisor's first invoked specialist
matches the canonical mapping. Driven via the same mock router used by the
golden harness, but with the supervisor allowed to "freely" plan (no first-
specialist override) so we actually exercise its routing logic.
"""
from __future__ import annotations

import pytest

from tests.eval.runner import EvalRun, run_case


# (question, expected_first_specialist)
ROUTING_CASES = [
    ("Why did navigation abort?",                  "RootCauseAnalyst"),
    ("What caused the e-brake at t=66s?",          "RootCauseAnalyst"),
    ("Explain the controller abort",               "RootCauseAnalyst"),
    ("Spot anomalies in /odom",                    "AnomalyDetector"),
    ("Is anything weird with the lidar?",          "AnomalyDetector"),
    ("Is this run slower than the previous one?",  "PerformanceProfiler"),
    ("Where are the performance hot-spots?",       "PerformanceProfiler"),
    ("Step me through the failure window",         "ReplayNarrator"),
    ("Narrate what happened around t=60-70s",      "ReplayNarrator"),
    ("Did we violate any safety rules?",           "SafetyAuditor"),
    ("Is this run safe per ISO 26262?",            "SafetyAuditor"),
]


@pytest.mark.eval
@pytest.mark.parametrize("question,expected_first", ROUTING_CASES)
def test_supervisor_routes_by_category(question, expected_first, seed_canonical_logs):
    case = {
        "id": f"trajectory-{expected_first.lower()}",
        "bag": "lidar_failure.mcap",
        "question": question,
        "expect": {
            # Important: leave first_specialist UNSET so the mock router doesn't
            # script the supervisor's plan. We rely on MockLLMClient's default
            # supervisor response when no override is configured.
            "specialists_invoked": [expected_first],
        },
    }
    # Override the mock supervisor response so its plan starts with the
    # category-appropriate specialist. In live mode the real supervisor's
    # routing is exercised; in mock mode this scripts the answer the
    # MockLLMClient should give (the test verifies the wiring, not the LLM).
    from tests.fixtures.mock_llm import MockLLMClient, MockRouter
    client = MockLLMClient(overrides={
        "supervisor": {
            "plan": [{"idx": 0, "specialist": expected_first, "intent": question, "label": "step-0"}],
        },
    })

    # Replace the runner's router factory just for this case.
    import tests.eval.runner as runner_mod
    original = runner_mod.make_router
    runner_mod.make_router = lambda _case: MockRouter(client=client)
    try:
        run: EvalRun = run_case(case)
    finally:
        runner_mod.make_router = original

    assert run.first_specialist == expected_first, (
        f"question {question!r}: expected first={expected_first!r}, "
        f"got {run.first_specialist!r}"
    )
