"""Release Comparator — lightweight; Phase 10 deepens with real cross-session diffs."""
from __future__ import annotations

from app.agent.specialists.base import PROMPTS_DIR, BaseSpecialist, SpecialistKind


class ReleaseComparatorSpecialist(BaseSpecialist):
    name = "ReleaseComparator"
    kind = SpecialistKind.LIGHT
    prompt_path = PROMPTS_DIR / "compare.md"
    worker_subset = ["anomaly_detector", "rosbag_reader"]
    output_schema = {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "diffs": {"type": "array"},
            "findings": {"type": "array"},
            "confidence": {"type": "number"},
        },
        "required": ["findings", "confidence"],
    }
