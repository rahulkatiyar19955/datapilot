"""
LIVE_LLM=1 escape hatch — re-runs the golden suite against the real LLM router.

Skipped unless:
  - `LIVE_LLM=1` is set
  - At least one of ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY is configured

This is the manual / on-demand sanity check (not part of default CI). It uses
the same `test_golden_case` assertions but routes through `LLMRouter()` instead
of the MockRouter. Latency tolerance is widened by `runner.run_case` based on
`is_live_mode()`.
"""
from __future__ import annotations

import pytest

from tests.eval.runner import is_live_mode, load_cases, run_case


@pytest.mark.eval
@pytest.mark.live
@pytest.mark.skipif(
    not is_live_mode(),
    reason="set LIVE_LLM=1 plus a provider key (ANTHROPIC_API_KEY etc.) to run",
)
@pytest.mark.parametrize("case", load_cases(), ids=lambda c: c["id"])
def test_golden_case_live(case, seed_canonical_logs):
    """
    Same shape as `test_golden_case`, but `make_router()` returns the real
    `LLMRouter` because `is_live_mode()` is true.
    """
    run = run_case(case)
    expect = case.get("expect", {})

    cap = float(expect.get("e2e_latency_max_s", 30)) * 2
    assert run.latency_s <= cap, (
        f"live {case['id']}: e2e latency {run.latency_s:.2f}s > {cap}s"
    )

    expected_first = expect.get("first_specialist")
    if expected_first:
        assert run.first_specialist == expected_first, (
            f"live {case['id']}: expected first {expected_first}, "
            f"got {run.first_specialist}"
        )

    # Citation grounding: every finding's log_ids resolve.
    cited = run.cited_log_ids
    for log_id in run.all_finding_log_ids:
        assert log_id in cited, (
            f"live {case['id']}: uncited log_id {log_id}"
        )
