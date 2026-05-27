"""
Replan node — rewrite the remaining plan when a specialist returns low
confidence, a tool error, or a contradiction.

Cap: 5 replans per turn (`docs/implementation.md` §4.3). On overflow, the
graph proceeds straight to the composer with `partial=True`.
"""
from __future__ import annotations

import json
import logging
import time
from typing import Any

from app.agent.state import MAX_REPLANS, GraphState, SpecStep
from app.agent.supervisor import PLAN_SCHEMA, PROMPT_PATH as SUPERVISOR_PROMPT
from app.llm.router import LLMRouter

logger = logging.getLogger(__name__)


async def replan_node(state: GraphState, *, router: LLMRouter) -> dict[str, Any]:
    started = time.perf_counter()
    replan_count = int(state.get("replan_count", 0)) + 1
    if replan_count > MAX_REPLANS:
        # Bail to composer with partial flag.
        return {
            "replan_count": replan_count,
            "final": {"partial": True} if state.get("final") is None else None,
            "audit_trail": [{
                "step_kind": "replan",
                "ts": started,
                "result_summary": f"replan cap exceeded ({MAX_REPLANS}); composing partial",
            }],
        }

    client = router.for_supervisor()

    done_plan = state.get("plan", [])
    outputs = state.get("specialist_outputs", {})
    def _obs_line(step: dict) -> str:
        out = outputs.get(step["specialist"]) or {}
        line = f"- {step['specialist']}: confidence={out.get('confidence', 'N/A')}"
        if out.get("error"):
            line += f", error={out['error']}"
        return line

    observations_summary = "\n".join(
        _obs_line(step) for step in done_plan if step.get("done")
    )

    user_msg = (
        f"User question: {state['user_message']}\n\n"
        f"Plan so far:\n{json.dumps(done_plan, indent=2)}\n\n"
        f"Observations (per completed step):\n{observations_summary}\n\n"
        f"At least one specialist returned low confidence or a tool error. "
        f"Rewrite the REMAINING steps (those not marked done) to recover. "
        f"Respond ONLY with the JSON {{plan: [...]}} object — include only the new remaining steps."
    )

    resp = await client.complete(
        system=SUPERVISOR_PROMPT.read_text(encoding="utf-8"),
        messages=[{"role": "user", "content": user_msg}],
        response_format=PLAN_SCHEMA,
        temperature=0.2,
        max_tokens=1024,
    )
    assert isinstance(resp, dict)

    try:
        parsed = json.loads(resp["content"])
        new_steps = parsed.get("plan", [])
    except json.JSONDecodeError:
        new_steps = []

    # Build the new full plan: keep done steps as-is, replace pending tail.
    completed = [s for s in done_plan if s.get("done")]
    next_idx = len(completed)
    rewritten: list[SpecStep] = []
    for i, item in enumerate(new_steps):
        if not isinstance(item, dict) or not item.get("specialist"):
            continue
        rewritten.append(SpecStep(
            idx=next_idx + i,
            specialist=item["specialist"],
            intent=item.get("intent", ""),
            label=item.get("label", item.get("intent", ""))[:60],
            done=False,
        ))

    new_plan = completed + rewritten

    audit_event = {
        "step_kind": "replan",
        "ts": started,
        "tokens_in": resp["usage"]["input_tokens"],
        "tokens_out": resp["usage"]["output_tokens"],
        "result_summary": f"replan #{replan_count}: {len(rewritten)} new steps",
    }
    return {
        "plan": new_plan,
        "plan_idx": next_idx,
        "replan_count": replan_count,
        "audit_trail": [audit_event],
    }
