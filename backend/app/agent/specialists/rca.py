"""Root Cause Analyst — full plan-then-execute over the causal graph + logs."""
from __future__ import annotations

from app.agent.specialists.base import PROMPTS_DIR, BaseSpecialist, SpecialistKind


class RootCauseAnalystSpecialist(BaseSpecialist):
    name = "RootCauseAnalyst"
    kind = SpecialistKind.FULL
    prompt_path = PROMPTS_DIR / "rca.md"
    worker_subset = ["rosbag_reader", "planner_failure_inspector", "trajectory_analyzer"]
    output_schema = {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "causal": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "label": {"type": "string"},
                        "log_id": {"type": "string"},
                        "edge_in": {"type": ["string", "null"]},
                        "edge_out": {"type": ["string", "null"]},
                    },
                },
            },
            "findings": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "sev": {"type": "string", "enum": ["critical", "warning", "info", "success"]},
                        "text": {"type": "string"},
                        "detail": {"type": "string"},
                        "log_ids": {"type": "array", "items": {"type": "string"}},
                    },
                    "required": ["sev", "text", "log_ids"],
                },
            },
            "confidence": {"type": "number", "minimum": 0, "maximum": 1},
        },
        "required": ["findings", "confidence"],
    }
