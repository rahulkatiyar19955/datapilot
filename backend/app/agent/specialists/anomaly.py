"""AnomalyDetector — full ReAct over dropouts/outliers/signatures + fallback logs."""
from __future__ import annotations

from app.agent.specialists.base import PROMPTS_DIR, BaseSpecialist, SpecialistKind


class AnomalyDetectorSpecialist(BaseSpecialist):
    name = "AnomalyDetector"
    kind = SpecialistKind.FULL
    prompt_path = PROMPTS_DIR / "anomaly.md"
    worker_subset = ["anomaly_detector", "rosbag_reader"]
    output_schema = {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "anomalies": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "id": {"type": "string"},
                        "t": {"type": "number"},
                        "kind": {"type": "string"},
                        "severity": {"type": "string"},
                        "source_log_id": {"type": ["string", "null"]},
                        "confidence": {"type": "number"},
                        "label": {"type": "string"},
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
                        "log_ids": {"type": "array", "items": {"type": "string"}},
                    },
                    "required": ["sev", "text", "log_ids"],
                },
            },
            "confidence": {"type": "number", "minimum": 0, "maximum": 1},
        },
        "required": ["findings", "confidence"],
    }
