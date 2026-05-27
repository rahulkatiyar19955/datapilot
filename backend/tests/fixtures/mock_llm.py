"""
Deterministic MockLLMClient for Phase 4 tests.

Returns scripted responses keyed on which prompt is in the system message
(`supervisor`, `composer`, `RootCauseAnalyst`, etc.). Supports both
non-streaming and streaming-token calls.
"""
from __future__ import annotations

import json
from typing import Any, AsyncIterator

from app.llm.base import (
    CompletionChunk,
    CompletionResponse,
    Message,
    ToolDef,
)


def _system_kind(system: str) -> str:
    """Detect which agent's prompt this is."""
    if "DataPilot Supervisor" in system:
        return "supervisor"
    if "DataPilot Composer" in system:
        return "composer"
    if "Root Cause Analyst" in system:
        return "rca"
    if "Anomaly Detector" in system:
        return "anomaly"
    if "Performance Profiler" in system:
        return "performance"
    if "Replay Narrator" in system:
        return "replay"
    if "Safety Auditor" in system:
        return "safety"
    if "Release Comparator" in system:
        return "compare"
    return "unknown"


# Canned outputs keyed by system kind. Tests can override via MockLLMClient(overrides={...}).
_DEFAULT_RESPONSES: dict[str, dict[str, Any]] = {
    "supervisor": {
        "plan": [
            {"idx": 0, "specialist": "RootCauseAnalyst", "intent": "Trace the e-brake at t=66.3s back to root cause", "label": "Trace failure chain"},
            {"idx": 1, "specialist": "AnomalyDetector", "intent": "Confirm sensor dropout window", "label": "Confirm dropout"},
        ]
    },
    "rca": {
        "causal": [
            {"label": "/sensors/lidar_a dropout (782 ms)", "log_id": "l_5", "edge_in": None, "edge_out": "TRIGGERED"},
            {"label": "/costmap defensive inflation 0.45m → 0.85m", "log_id": "l_6", "edge_in": "TRIGGERED", "edge_out": "CAUSED"},
            {"label": "/move_base planner aborted", "log_id": "l_8", "edge_in": "CAUSED", "edge_out": "CAUSED"},
            {"label": "/cmd_vel emergency brake", "log_id": "l_9", "edge_in": "CAUSED", "edge_out": None},
        ],
        "findings": [
            {"sev": "critical", "text": "Sensor dropout on /sensors/lidar_a for 782 ms at t=64.2s", "detail": "threshold 250 ms · 3.1× tolerance", "log_ids": ["l_5"]},
            {"sev": "critical", "text": "Planner aborted at t=66.1s — no valid path", "detail": "/move_base · 2 retries", "log_ids": ["l_8"]},
        ],
        "confidence": 0.92,
    },
    "anomaly": {
        "anomalies": [
            {"id": "a_2", "t": 64.2, "kind": "/sensors/lidar_a", "severity": "critical", "source_log_id": "l_5", "confidence": 1.0, "label": "Sensor dropout (782 ms)"},
        ],
        "findings": [
            {"sev": "critical", "text": "Sensor dropout on /sensors/lidar_a for 782 ms", "log_ids": ["l_5"]},
        ],
        "confidence": 0.88,
    },
    "performance": {"regressions": [], "findings": [], "confidence": 0.3},
    "replay": {"narration": [{"t": 64.2, "text": "/sensors/lidar_a stops publishing"}], "findings": [], "confidence": 0.7},
    "safety": {"violations": [], "findings": [], "confidence": 0.3},
    "compare": {"diffs": [], "findings": [], "confidence": 0.3},
    "composer": {"_text": "Navigation aborted because /sensors/lidar_a stopped publishing for 782 ms at t=64.2s, which forced /costmap to inflate defensively. /move_base then failed to find a valid path and engaged the e-brake at t=66.3s."},
    "unknown": {"_text": ""},
}


class MockLLMClient:
    """Implements `LLMClient` Protocol with scripted responses."""

    provider = "mock"

    def __init__(self, model_id: str = "mock-1", overrides: dict[str, Any] | None = None):
        self.model_id = model_id
        self.overrides = overrides or {}
        self.calls: list[dict[str, Any]] = []  # for assertions

    async def complete(
        self,
        *,
        system: str,
        messages: list[Message],
        tools: list[ToolDef] | None = None,
        response_format: dict[str, Any] | None = None,
        temperature: float = 0.2,
        max_tokens: int = 4096,
        stream: bool = False,
    ) -> CompletionResponse | AsyncIterator[CompletionChunk]:
        kind = _system_kind(system)
        self.calls.append({"kind": kind, "messages": messages, "tools": tools})

        canned = self.overrides.get(kind) or _DEFAULT_RESPONSES.get(kind) or {"_text": ""}
        if "_text" in canned:
            content = canned["_text"]
        else:
            content = json.dumps(canned)

        if stream:
            return self._stream(content)
        return {
            "content": content,
            "tool_calls": [],
            "usage": {"input_tokens": 100, "output_tokens": max(20, len(content) // 4)},
            "finish_reason": "stop",
        }

    async def _stream(self, content: str) -> AsyncIterator[CompletionChunk]:
        # Emit in 32-char chunks for streaming smoke tests.
        for i in range(0, len(content), 32):
            yield {"delta_text": content[i:i + 32]}
        yield {"usage": {"input_tokens": 100, "output_tokens": max(20, len(content) // 4)}, "finish_reason": "stop"}


class MockRouter:
    """Drop-in replacement for `LLMRouter` that hands out a MockLLMClient for everything."""

    def __init__(self, client: MockLLMClient | None = None):
        self._client = client or MockLLMClient()

    def for_specialist(self, _name: str):
        return self._client

    def for_supervisor(self):
        return self._client

    def for_composer(self, _model_id: str | None = None):
        return self._client
