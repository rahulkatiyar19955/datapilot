"""Replay Narrator — lightweight; Phase 5+ deepens with real TF/sensor playback."""
from __future__ import annotations

from app.agent.specialists.base import PROMPTS_DIR, BaseSpecialist, SpecialistKind


class ReplayNarratorSpecialist(BaseSpecialist):
    name = "ReplayNarrator"
    kind = SpecialistKind.LIGHT
    prompt_path = PROMPTS_DIR / "replay.md"
    worker_subset = ["rosbag_reader", "trajectory_analyzer"]
    output_schema = {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "narration": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "t": {"type": "number"},
                        "text": {"type": "string"},
                    },
                    "required": ["t", "text"],
                },
            },
            "findings": {"type": "array"},
            "confidence": {"type": "number"},
        },
        "required": ["narration", "confidence"],
    }
