"""Performance Profiler — FULL ReAct specialist; grounds rates/counts in real data."""
from __future__ import annotations

from app.agent.specialists.base import PROMPTS_DIR, BaseSpecialist, SpecialistKind


class PerformanceProfilerSpecialist(BaseSpecialist):
    name = "PerformanceProfiler"
    kind = SpecialistKind.FULL
    prompt_path = PROMPTS_DIR / "performance.md"
    worker_subset = ["trajectory_analyzer", "anomaly_detector", "rosbag_reader"]
    output_schema = {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "regressions": {"type": "array"},
            "findings": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "sev": {"type": "string"},
                        "text": {"type": "string"},
                        "log_ids": {"type": "array", "items": {"type": "string"}},
                    },
                    "required": ["sev", "text", "log_ids"],
                },
            },
            "confidence": {"type": "number"},
        },
        "required": ["findings", "confidence"],
    }
