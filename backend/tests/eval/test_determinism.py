"""
Determinism — two-run idempotence at temperature=0 with a fixed seed.

In mock-mode the LLM responses are scripted so determinism is exact (same input
→ same output bytes). In live mode (LIVE_LLM=1) this test is skipped because
even temperature=0 real models drift slightly.

Asserts:
  - identical specialist invocation order across two runs
  - identical causal chain (set of (edge_in, edge_out, label) triples)
  - response prose differs by at most ~10% Levenshtein distance
"""
from __future__ import annotations

import random

import pytest

from tests.eval.runner import is_live_mode, run_case


@pytest.fixture(autouse=True)
def _fixed_seed():
    random.seed(42)
    yield
    random.seed()  # restore default


def _causal_triples(run) -> set[tuple[str | None, str | None, str]]:
    """Hashable representation of a causal chain for set-equality."""
    return {
        (step.get("edge_in"), step.get("edge_out"), step.get("label", ""))
        for step in (run.causal_chain or [])
    }


def _levenshtein(a: str, b: str) -> int:
    """Pure-Python Levenshtein. Adequate for the short prose we compare here."""
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, start=1):
        curr = [i] + [0] * len(b)
        for j, cb in enumerate(b, start=1):
            cost = 0 if ca == cb else 1
            curr[j] = min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
        prev = curr
    return prev[-1]


CASE = {
    "id": "determinism-lidar-why",
    "bag": "lidar_failure.mcap",
    "question": "Why did navigation abort?",
    "expect": {
        "first_specialist": "RootCauseAnalyst",
        "specialists_invoked": ["RootCauseAnalyst", "AnomalyDetector"],
    },
}


@pytest.mark.eval
@pytest.mark.skipif(is_live_mode(), reason="determinism check is mock-mode only")
def test_two_runs_idempotent(seed_canonical_logs):
    run1 = run_case(CASE)
    run2 = run_case(CASE)

    # 1. Specialist invocation order is identical.
    assert run1.specialists_invoked == run2.specialists_invoked, (
        f"specialist order drift: {run1.specialists_invoked} vs {run2.specialists_invoked}"
    )

    # 2. Causal chain triples are identical.
    triples1 = _causal_triples(run1)
    triples2 = _causal_triples(run2)
    assert triples1 == triples2, f"causal chain drift:\n  run1={triples1}\n  run2={triples2}"

    # 3. Response prose drift is small.
    prose1 = run1.final.get("response", "") or ""
    prose2 = run2.final.get("response", "") or ""
    if prose1 or prose2:
        max_drift = max(1, int(max(len(prose1), len(prose2)) * 0.10))
        d = _levenshtein(prose1, prose2)
        assert d <= max_drift, (
            f"response prose drift {d} > {max_drift} (10% of {max(len(prose1), len(prose2))} chars)"
        )
