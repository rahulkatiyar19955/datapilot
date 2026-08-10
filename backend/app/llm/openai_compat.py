"""Shared OpenAI-compatible request mapping.

The OpenAI and NVIDIA-NIM clients both target the OpenAI chat-completions wire
shape, so the message/tool translation is identical. Keep it in one place so the
two clients can't drift (issue #77).
"""
from __future__ import annotations

import json
from typing import Any

from app.llm.base import Message, ToolDef


def _to_openai_tools(tools: list[ToolDef]) -> list[dict[str, Any]]:
    return [
        {
            "type": "function",
            "function": {
                "name": t["name"],
                "description": t["description"],
                "parameters": t["parameters"],
            },
        }
        for t in tools
    ]


def _to_openai_messages(system: str, messages: list[Message]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = [{"role": "system", "content": system}]
    for m in messages:
        role = m["role"]
        if role == "system":
            continue
        if role == "assistant" and m.get("tool_calls"):
            out.append({
                "role": "assistant",
                "content": m.get("content") or None,
                "tool_calls": [
                    {
                        "id": tc["id"],
                        "type": "function",
                        "function": {"name": tc["name"], "arguments": json.dumps(tc["arguments"])},
                    }
                    for tc in m["tool_calls"]
                ],
            })
        elif role == "tool":
            out.append({
                "role": "tool",
                "tool_call_id": m["tool_call_id"],
                "content": m.get("content", ""),
            })
        else:
            out.append({"role": role, "content": m.get("content", "")})
    return out
