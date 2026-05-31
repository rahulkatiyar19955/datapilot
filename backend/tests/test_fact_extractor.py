"""Tests for the conversation fact extractor (parsing + best-effort behavior)."""
from __future__ import annotations

import asyncio
import json
from typing import Any

from app.agent.fact_extractor import extract_facts


class _FakeClient:
    def __init__(self, content: str, raise_exc: bool = False):
        self._content = content
        self._raise = raise_exc
        self.calls: list[dict[str, Any]] = []

    async def complete(self, *, system, messages, tools=None, response_format=None,
                       temperature=0.2, max_tokens=4096, stream=False):
        self.calls.append({"system": system, "messages": messages, "response_format": response_format})
        if self._raise:
            raise RuntimeError("llm down")
        return {"content": self._content, "tool_calls": [], "usage": {"input_tokens": 1, "output_tokens": 1}}


ENVELOPE = {
    "response": "The lidar dropped out for 782 ms at t=64.2s, which aborted the planner.",
    "findings": [{"sev": "critical", "text": "Lidar dropout", "log_ids": ["l_5"]}],
}


def test_extracts_and_normalizes_facts():
    content = json.dumps({"facts": [
        {"text": "The /sensors/lidar_a topic dropped out for 782 ms at t=64.2s.",
         "category": "root_cause", "severity": "critical", "entities": ["/sensors/lidar_a"]},
        {"text": "  ", "severity": "info"},  # blank → dropped
    ]})
    facts = asyncio.run(extract_facts(
        _FakeClient(content), session_summary="filename=x.mcap",
        user_msg="why did it abort?", envelope=ENVELOPE,
    ))
    assert len(facts) == 1
    assert facts[0]["category"] == "root_cause"
    assert facts[0]["entities"] == ["/sensors/lidar_a"]


def test_handles_fenced_json():
    content = "```json\n{\"facts\": [{\"text\": \"A fact.\"}]}\n```"
    facts = asyncio.run(extract_facts(
        _FakeClient(content), session_summary="", user_msg="q", envelope=ENVELOPE,
    ))
    assert facts == [{"text": "A fact.", "category": "general", "severity": "info", "entities": []}]


def test_llm_failure_returns_empty():
    facts = asyncio.run(extract_facts(
        _FakeClient("", raise_exc=True), session_summary="", user_msg="q", envelope=ENVELOPE,
    ))
    assert facts == []


def test_no_response_no_findings_skips_call():
    client = _FakeClient(json.dumps({"facts": []}))
    facts = asyncio.run(extract_facts(
        client, session_summary="", user_msg="q", envelope={"response": "", "findings": []},
    ))
    assert facts == []
    assert client.calls == []  # short-circuited before the LLM call
