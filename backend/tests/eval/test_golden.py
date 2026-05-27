"""
Parametrized golden-eval test. One pytest case per entry in `golden.yaml`.

Mock-LLM mode (default): every case runs against the scripted MockLLMClient
responses. Fast, deterministic, runs in CI.

Live mode (LIVE_LLM=1): the same cases run against the real router. Latency
tolerance widens, determinism check is skipped (real models drift slightly
even at temperature=0).
"""
from __future__ import annotations

import pytest

from tests.eval.runner import EvalRun, is_live_mode, load_cases, run_case


@pytest.mark.eval
@pytest.mark.parametrize("case", load_cases(), ids=lambda c: c["id"])
def test_golden_case(case, seed_canonical_logs):
    run = run_case(case)
    expect = case.get("expect", {})

    # 1. Latency
    e2e_max = float(expect.get("e2e_latency_max_s", 30))
    live_max = e2e_max * 2  # wider tolerance for live runs
    cap = live_max if is_live_mode() else e2e_max
    assert run.latency_s <= cap, (
        f"case {case['id']}: e2e latency {run.latency_s:.2f}s exceeded cap {cap}s"
    )

    # 2. First specialist
    expected_first = expect.get("first_specialist")
    if expected_first:
        assert run.first_specialist == expected_first, (
            f"case {case['id']}: expected first specialist {expected_first!r}, "
            f"got {run.first_specialist!r} (invoked: {run.specialists_invoked})"
        )

    # 3. Specialists invoked (subset check — extras are OK)
    expected_invoked = expect.get("specialists_invoked") or []
    for spec in expected_invoked:
        assert spec in run.specialists_invoked, (
            f"case {case['id']}: expected {spec} in invoked specialists "
            f"{run.specialists_invoked}"
        )

    # 4. Causal chain hops (only checked when set)
    min_hops = expect.get("causal_chain_min_hops")
    if min_hops is not None:
        assert run.causal_chain_hops >= int(min_hops), (
            f"case {case['id']}: causal chain too shallow "
            f"({run.causal_chain_hops} hops; expected >= {min_hops})"
        )

    # 5. Citation grounding: every finding's log_ids resolve to a real citation.
    cited = run.cited_log_ids
    for log_id in run.all_finding_log_ids:
        assert log_id in cited, (
            f"case {case['id']}: finding cites log_id {log_id!r} that didn't "
            f"resolve to a citation (cited: {cited})"
        )

    # 6. Must-include citations (set when the canonical chain is known).
    must_include = expect.get("citations_must_include_log_ids") or []
    for log_id in must_include:
        assert log_id in cited, (
            f"case {case['id']}: expected citation for {log_id!r} "
            f"(cited: {cited})"
        )
