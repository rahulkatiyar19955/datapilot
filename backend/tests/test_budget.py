"""Unit coverage for app.agent.budget — token accounting + cost estimate.

These tests characterize the CURRENT flat-rate behavior.

NOTE (issue #42): the budget is never *enforced* anywhere — `estimate_cost_usd`
and `total_tokens_in_audit` are reporting-only. There is no caller in the agent
graph that aborts a turn when PER_TURN_TOKEN_CAP / PER_SESSION_TOKEN_CAP is
exceeded. These tests only assert the reporting math, since enforcement does
not exist to test.
"""
from __future__ import annotations

from app.agent.budget import (
    estimate_cost_usd,
    per_turn_cap_exceeded,
    session_cap_exceeded,
    total_tokens_in_audit,
)
from app.agent.state import (
    PER_SESSION_TOKEN_CAP,
    PER_TURN_TOKEN_CAP,
    AuditEvent,
)


# ── enforcement helpers (issue #42) ──────────────────────────────────────────


def test_per_turn_cap_not_exceeded_under_budget():
    audit: list[AuditEvent] = [{"step_kind": "compose", "tokens_in": 100, "tokens_out": 50}]
    assert per_turn_cap_exceeded(audit) is False


def test_per_turn_cap_exceeded_at_or_over_cap():
    audit: list[AuditEvent] = [{"step_kind": "compose", "tokens_in": PER_TURN_TOKEN_CAP, "tokens_out": 0}]
    assert per_turn_cap_exceeded(audit) is True


def test_session_cap_not_exceeded_under_budget():
    assert session_cap_exceeded(PER_SESSION_TOKEN_CAP - 1) is False


def test_session_cap_exceeded_at_or_over_cap():
    assert session_cap_exceeded(PER_SESSION_TOKEN_CAP) is True
    assert session_cap_exceeded(PER_SESSION_TOKEN_CAP * 3) is True


# ── total_tokens_in_audit ────────────────────────────────────────────────────


def test_total_tokens_empty_audit_is_zero():
    assert total_tokens_in_audit([]) == 0


def test_total_tokens_sums_in_and_out():
    audit: list[AuditEvent] = [
        {"step_kind": "compose", "tokens_in": 100, "tokens_out": 20},
        {"step_kind": "compose", "tokens_in": 50, "tokens_out": 30},
    ]
    # 100 + 20 + 50 + 30
    assert total_tokens_in_audit(audit) == 200


def test_total_tokens_skips_events_without_usage():
    audit: list[AuditEvent] = [
        {"step_kind": "specialist_start"},          # no token keys
        {"step_kind": "compose", "tokens_in": 10, "tokens_out": 5},
    ]
    assert total_tokens_in_audit(audit) == 15


def test_total_tokens_treats_none_usage_as_zero():
    # tokens_in/out explicitly None must not raise — coerced to 0.
    audit: list[AuditEvent] = [
        {"step_kind": "compose", "tokens_in": None, "tokens_out": None},  # type: ignore[typeddict-item]
        {"step_kind": "compose", "tokens_in": 7, "tokens_out": 0},
    ]
    assert total_tokens_in_audit(audit) == 7


def test_total_tokens_partial_usage_only_in():
    audit: list[AuditEvent] = [
        {"step_kind": "compose", "tokens_in": 42},  # tokens_out missing
    ]
    assert total_tokens_in_audit(audit) == 42


def test_total_tokens_coerces_numeric_strings():
    # Implementation does int(...) so numeric-string usage is tolerated.
    audit: list[AuditEvent] = [
        {"step_kind": "compose", "tokens_in": "100", "tokens_out": "5"},  # type: ignore[typeddict-item]
    ]
    assert total_tokens_in_audit(audit) == 105


# ── estimate_cost_usd ────────────────────────────────────────────────────────


def test_estimate_cost_zero_for_empty_audit():
    assert estimate_cost_usd([]) == 0.0


def test_estimate_cost_flat_rate_one_dollar_per_million():
    # 1,000,000 tokens at the flat $1 / 1M blend == $1.0.
    audit: list[AuditEvent] = [
        {"step_kind": "compose", "tokens_in": 600_000, "tokens_out": 400_000},
    ]
    assert estimate_cost_usd(audit) == 1.0


def test_estimate_cost_rounds_to_four_places():
    # 1234 tokens / 1e6 == 0.001234 → rounds to 0.0012.
    audit: list[AuditEvent] = [
        {"step_kind": "compose", "tokens_in": 1000, "tokens_out": 234},
    ]
    assert estimate_cost_usd(audit) == 0.0012


def test_estimate_cost_tiny_usage_rounds_to_zero():
    # 100 tokens → 0.0001 → 0.0001 (still representable at 4dp).
    audit: list[AuditEvent] = [{"step_kind": "compose", "tokens_in": 100, "tokens_out": 0}]
    assert estimate_cost_usd(audit) == 0.0001
    # 10 tokens → 0.00001 → rounds to 0.0 at 4dp.
    audit2: list[AuditEvent] = [{"step_kind": "compose", "tokens_in": 10, "tokens_out": 0}]
    assert estimate_cost_usd(audit2) == 0.0


def test_estimate_cost_does_not_enforce_caps():
    """NOTE (issue #42): going far over PER_TURN / PER_SESSION caps still just
    reports a cost — nothing clamps, raises, or flags the overflow."""
    over_session = PER_SESSION_TOKEN_CAP * 10
    audit: list[AuditEvent] = [
        {"step_kind": "compose", "tokens_in": over_session, "tokens_out": 0},
    ]
    # No exception, no clamping — just the flat-rate number.
    assert total_tokens_in_audit(audit) == over_session
    assert estimate_cost_usd(audit) == round(over_session / 1_000_000.0, 4)
    # Sanity: this is well past the per-turn cap and nothing prevents it.
    assert over_session > PER_TURN_TOKEN_CAP
