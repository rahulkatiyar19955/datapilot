"""Safety Auditor — lightweight; Phase 5+ ships the rule library."""
from __future__ import annotations

from app.agent.specialists.base import PROMPTS_DIR, BaseSpecialist, SpecialistKind


class SafetyAuditorSpecialist(BaseSpecialist):
    name = "SafetyAuditor"
    kind = SpecialistKind.LIGHT
    prompt_path = PROMPTS_DIR / "safety.md"
    worker_subset = ["planner_failure_inspector", "rosbag_reader"]
    output_schema = {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "violations": {"type": "array"},
            "findings": {"type": "array"},
            "confidence": {"type": "number"},
        },
        "required": ["findings", "confidence"],
    }
