"""
Supervisor node — plans how to answer a question by listing specialist steps.

Always uses the cheap-fast model from the router cascade. Output is a strict
JSON object {plan: [SpecStep, ...]} — schema-enforced via response_format.
"""
from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import Any

from app.agent.state import GraphState, SpecStep
from app.llm.router import LLMRouter

logger = logging.getLogger(__name__)

PROMPT_PATH = Path(__file__).parent / "prompts" / "supervisor.md"

VALID_SPECIALISTS = {
    "RootCauseAnalyst",
    "AnomalyDetector",
    "PerformanceProfiler",
    "ReplayNarrator",
    "SafetyAuditor",
    "ReleaseComparator",
}

PLAN_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "plan": {
            "type": "array",
            "minItems": 1,
            "maxItems": 6,
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "idx": {"type": "integer"},
                    "specialist": {"type": "string", "enum": list(VALID_SPECIALISTS)},
                    "intent": {"type": "string"},
                    "label": {"type": "string"},
                },
                "required": ["idx", "specialist", "intent"],
            },
        }
    },
    "required": ["plan"],
}


def _session_summary_from_state(state: GraphState) -> str:
    """Render the session metadata that the LLM should know about."""
    # In Phase 4 we receive only session_id in state.session_id. The dispatcher
    # enriches with metadata pulled from SQLite before invoking the supervisor.
    return state.get("session_summary", "") if isinstance(state, dict) else ""


async def supervisor_node(state: GraphState, *, router: LLMRouter) -> dict[str, Any]:
    started = time.perf_counter()
    client = router.for_supervisor()

    transcript_snippet = ""
    transcript = state.get("transcript") or []
    if transcript:
        # Last 6 turns to keep context small for the cheap-fast model.
        for turn in transcript[-6:]:
            transcript_snippet += f"\n[{turn['role']}] {turn['content']}"

    user_msg = (
        f"Session metadata:\n{_session_summary_from_state(state)}\n\n"
        f"Conversation so far:{transcript_snippet or ' (new session)'}\n\n"
        f"Current question: {state['user_message']}\n\n"
        "Plan the specialist steps. Respond ONLY with the JSON object."
    )

    resp = await client.complete(
        system=PROMPT_PATH.read_text(encoding="utf-8"),
        messages=[{"role": "user", "content": user_msg}],
        response_format=PLAN_SCHEMA,
        temperature=0.1,
        max_tokens=1024,
    )
    assert isinstance(resp, dict)

    try:
        parsed = json.loads(resp["content"])
        plan_items = parsed.get("plan", [])
    except json.JSONDecodeError:
        logger.error("supervisor returned non-JSON: %r", resp["content"][:200])
        plan_items = []

    # Normalize: ensure each step has idx, specialist, intent + valid specialist.
    plan: list[SpecStep] = []
    for i, item in enumerate(plan_items):
        if not isinstance(item, dict):
            continue
        specialist = item.get("specialist")
        if specialist not in VALID_SPECIALISTS:
            continue
        plan.append(SpecStep(
            idx=i,
            specialist=specialist,
            intent=item.get("intent", ""),
            label=item.get("label", item.get("intent", ""))[:60],
            done=False,
        ))

    if not plan:
        # Fallback: always invoke RCA for "why" questions, AnomalyDetector otherwise.
        msg = state["user_message"].lower()
        fallback = "RootCauseAnalyst" if "why" in msg or "cause" in msg else "AnomalyDetector"
        plan = [SpecStep(idx=0, specialist=fallback, intent=state["user_message"], label="Investigate", done=False)]

    audit_event = {
        "step_kind": "supervisor_plan",
        "specialist": None,
        "ts": started,
        "tokens_in": resp["usage"]["input_tokens"],
        "tokens_out": resp["usage"]["output_tokens"],
        "result_summary": f"plan: {len(plan)} steps",
    }
    return {"plan": plan, "plan_idx": 0, "audit_trail": [audit_event]}
