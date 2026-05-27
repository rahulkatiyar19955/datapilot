"""Anthropic Claude client."""
from __future__ import annotations

import json
import logging
from typing import Any, AsyncIterator

from app.config import settings
from app.llm.base import (
    CompletionChunk,
    CompletionResponse,
    LLMClient,
    Message,
    ToolCall,
    ToolDef,
)

logger = logging.getLogger(__name__)


def _to_anthropic_tools(tools: list[ToolDef]) -> list[dict[str, Any]]:
    return [
        {"name": t["name"], "description": t["description"], "input_schema": t["parameters"]}
        for t in tools
    ]


def _to_anthropic_messages(messages: list[Message]) -> list[dict[str, Any]]:
    """Map our wire format → Anthropic's content-block format."""
    out: list[dict[str, Any]] = []
    for m in messages:
        role = m["role"]
        if role == "system":
            # Anthropic takes system as a top-level param, not in messages.
            continue
        if role == "assistant" and m.get("tool_calls"):
            blocks: list[dict[str, Any]] = []
            if m.get("content"):
                blocks.append({"type": "text", "text": m["content"]})
            for tc in m["tool_calls"]:
                blocks.append({
                    "type": "tool_use",
                    "id": tc["id"],
                    "name": tc["name"],
                    "input": tc["arguments"],
                })
            out.append({"role": "assistant", "content": blocks})
        elif role == "tool":
            out.append({
                "role": "user",
                "content": [{
                    "type": "tool_result",
                    "tool_use_id": m["tool_call_id"],
                    "content": m.get("content", ""),
                }],
            })
        else:
            out.append({"role": role, "content": m.get("content", "")})
    return out


class AnthropicClient:
    provider = "anthropic"

    def __init__(self, model_id: str):
        # Lazy import so the agent layer can load without the SDK.
        import anthropic
        self.model_id = model_id
        self._client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

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
        # Anthropic doesn't have a native JSON-Schema response_format. If the
        # caller passed one, rider it into the system prompt.
        sys_prompt = system
        if response_format:
            sys_prompt = (
                system
                + "\n\nYou MUST respond with a single valid JSON object matching this schema:\n"
                + json.dumps(response_format, indent=2)
            )

        common_kwargs = {
            "model": self.model_id,
            "system": sys_prompt,
            "messages": _to_anthropic_messages(messages),
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        if tools:
            common_kwargs["tools"] = _to_anthropic_tools(tools)

        if stream:
            return self._stream(common_kwargs)

        resp = await self._client.messages.create(**common_kwargs)
        text_parts: list[str] = []
        tool_calls: list[ToolCall] = []
        for block in resp.content:
            if block.type == "text":
                text_parts.append(block.text)
            elif block.type == "tool_use":
                tool_calls.append({
                    "id": block.id,
                    "name": block.name,
                    "arguments": block.input or {},
                })
        return {
            "content": "".join(text_parts),
            "tool_calls": tool_calls,
            "usage": {
                "input_tokens": resp.usage.input_tokens,
                "output_tokens": resp.usage.output_tokens,
            },
            "finish_reason": resp.stop_reason or "stop",
        }

    async def _stream(self, kwargs: dict[str, Any]) -> AsyncIterator[CompletionChunk]:
        async with self._client.messages.stream(**kwargs) as stream:
            async for event in stream:
                if event.type == "content_block_delta" and getattr(event.delta, "type", None) == "text_delta":
                    yield {"delta_text": event.delta.text}
            final = await stream.get_final_message()
            yield {
                "usage": {
                    "input_tokens": final.usage.input_tokens,
                    "output_tokens": final.usage.output_tokens,
                },
                "finish_reason": final.stop_reason or "stop",
            }
