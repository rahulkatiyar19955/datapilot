"""
Dispatcher node — walks the plan one step at a time.

Each invocation of `dispatcher_node` advances `plan_idx` by 1 and writes the
specialist's output into `specialist_outputs[specialist_name]`. The graph's
conditional edge then either loops back for the next step, branches to replan
on low confidence, or proceeds to the composer when the plan is exhausted.
"""
from __future__ import annotations

import logging
from typing import Any

from app.agent.specialists.defaults import get_specialist
from app.agent.state import GraphState
from app.llm.router import LLMRouter

logger = logging.getLogger(__name__)

LOW_CONFIDENCE_THRESHOLD = 0.4


async def dispatcher_node(state: GraphState, *, router: LLMRouter) -> dict[str, Any]:
    plan = state.get("plan", [])
    idx = state.get("plan_idx", 0)
    if idx >= len(plan):
        return {}

    step = plan[idx]
    specialist = get_specialist(step["specialist"])
    if specialist is None:
        logger.warning("dispatcher: unknown specialist %s", step["specialist"])
        # Skip this step.
        return {"plan_idx": idx + 1}

    session_summary = state.get("session_summary", "") if isinstance(state, dict) else ""
    result, audit = await specialist.run(
        router=router,
        session_id=state["session_id"],
        intent=step["intent"],
        session_summary=session_summary,
    )

    # Mark the plan step done in place.
    plan_copy = list(plan)
    plan_copy[idx] = {**step, "done": True}

    outputs = dict(state.get("specialist_outputs") or {})
    outputs[step["specialist"]] = result

    return {
        "plan": plan_copy,
        "plan_idx": idx + 1,
        "specialist_outputs": outputs,
        "audit_trail": audit,
    }


def route_after_dispatch(state: GraphState) -> str:
    """
    Conditional edge after dispatcher:
      - 'replan' if the last specialist returned low confidence or tool_unavailable
      - 'dispatcher' if more plan steps remain
      - 'composer' if the plan is exhausted
    """
    plan = state.get("plan", [])
    idx = state.get("plan_idx", 0)
    outputs = state.get("specialist_outputs", {})

    # Inspect the most recent specialist result.
    if plan and idx > 0:
        last_step = plan[idx - 1]
        last_result = outputs.get(last_step["specialist"]) or {}
        confidence = float(last_result.get("confidence", 1.0))
        had_tool_unavailable = bool(last_result.get("error") == "tool_unavailable")
        if confidence < LOW_CONFIDENCE_THRESHOLD or had_tool_unavailable:
            return "replan"

    if idx < len(plan):
        return "dispatcher"
    return "composer"
