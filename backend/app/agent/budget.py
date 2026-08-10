"""
Per-turn / per-session token accounting.

Numbers come from `docs/implementation.md` §14:
  - PER_TURN_TOKEN_CAP = 25_000
  - PER_SESSION_TOKEN_CAP = 200_000
  - TRANSCRIPT_COMPACT_THRESHOLD = 40_000
"""
from __future__ import annotations

from app.agent.state import (
    PER_SESSION_TOKEN_CAP,
    PER_TURN_TOKEN_CAP,
    AuditEvent,
)


def total_tokens_in_audit(audit: list[AuditEvent]) -> int:
    """Sum input + output tokens across every audit step that recorded usage."""
    total = 0
    for ev in audit:
        total += int(ev.get("tokens_in", 0) or 0)
        total += int(ev.get("tokens_out", 0) or 0)
    return total


def estimate_cost_usd(audit: list[AuditEvent]) -> float:
    """
    Rough cost estimate. Real per-model rates land in Phase 4.5 — for now we
    assume a $1 / 1M tokens blend so the renderer can show a non-zero figure.
    """
    return round(total_tokens_in_audit(audit) / 1_000_000.0, 4)


def per_turn_cap_exceeded(audit: list[AuditEvent]) -> bool:
    """True once this turn's audit usage has reached the per-turn token cap
    (issue #42). Callers route the turn to the composer (marked partial) so a
    pathological turn can't dispatch/replan without a ceiling."""
    return total_tokens_in_audit(audit) >= PER_TURN_TOKEN_CAP


def session_cap_exceeded(prior_session_tokens: int) -> bool:
    """True once a session's cumulative usage has reached the per-session token
    cap (issue #42). Summed from prior `SessionCostRecord` rows before a turn."""
    return int(prior_session_tokens or 0) >= PER_SESSION_TOKEN_CAP
