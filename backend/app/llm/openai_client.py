"""OpenAI / Chat Completions client."""
from __future__ import annotations

import json
import logging
from typing import Any, AsyncIterator

from app.config import settings
from app.llm.base import (
    CompletionChunk,
    CompletionResponse,
    Message,
    ToolCall,
    ToolDef,
)

logger = logging.getLogger(__name__)


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


class OpenAIClient:
    provider = "openai"

    def __init__(self, model_id: str):
        import openai
        self.model_id = model_id
        self._client = openai.AsyncOpenAI(api_key=settings.openai_api_key)

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
        kwargs: dict[str, Any] = {
            "model": self.model_id,
            "messages": _to_openai_messages(system, messages),
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        if tools:
            kwargs["tools"] = _to_openai_tools(tools)
        if response_format:
            kwargs["response_format"] = {
                "type": "json_schema",
                "json_schema": {"name": "structured_output", "schema": response_format},
            }

        if stream:
            return self._stream(kwargs)

        resp = await self._client.chat.completions.create(**kwargs)
        choice = resp.choices[0]
        tool_calls: list[ToolCall] = []
        for tc in choice.message.tool_calls or []:
            try:
                args = json.loads(tc.function.arguments or "{}")
            except json.JSONDecodeError:
                args = {}
            tool_calls.append({"id": tc.id, "name": tc.function.name, "arguments": args})
        return {
            "content": choice.message.content or "",
            "tool_calls": tool_calls,
            "usage": {
                "input_tokens": resp.usage.prompt_tokens,
                "output_tokens": resp.usage.completion_tokens,
            },
            "finish_reason": choice.finish_reason or "stop",
        }

    async def _stream(self, kwargs: dict[str, Any]) -> AsyncIterator[CompletionChunk]:
        kwargs["stream"] = True
        kwargs["stream_options"] = {"include_usage": True}
        last_usage: dict[str, int] | None = None
        last_finish: str | None = None
        async for chunk in await self._client.chat.completions.create(**kwargs):
            if chunk.choices:
                delta = chunk.choices[0].delta
                if delta.content:
                    yield {"delta_text": delta.content}
                if chunk.choices[0].finish_reason:
                    last_finish = chunk.choices[0].finish_reason
            if chunk.usage:
                last_usage = {
                    "input_tokens": chunk.usage.prompt_tokens,
                    "output_tokens": chunk.usage.completion_tokens,
                }
        yield {"usage": last_usage or {"input_tokens": 0, "output_tokens": 0}, "finish_reason": last_finish or "stop"}
