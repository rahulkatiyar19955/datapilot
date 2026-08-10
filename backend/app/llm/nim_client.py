"""NVIDIA NIM client — OpenAI-compatible endpoint at integrate.api.nvidia.com."""
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
# Shared OpenAI-compatible mapping (issue #77) — re-exported for callers/tests
# that reference these via the client module.
from app.llm.openai_compat import _to_openai_messages, _to_openai_tools
from app.llm.retry import llm_timeout_seconds, retry_async

logger = logging.getLogger(__name__)

_NIM_BASE_URL = "https://integrate.api.nvidia.com/v1"


class NimClient:
    """NVIDIA NIM chat completions client.

    Uses the OpenAI Python SDK against NVIDIA's OpenAI-compatible endpoint.
    Supports all models available at integrate.api.nvidia.com, identified by
    their org/model-name format (e.g. ``deepseek-ai/deepseek-r1``,
    ``meta/llama-3.3-70b-instruct``).
    """

    provider = "nvidia"

    def __init__(self, model_id: str):
        import openai
        self.model_id = model_id
        # Explicit per-request timeout (seconds) so a hung provider can't stall
        # the agent turn indefinitely (#65/#48).
        self._client = openai.AsyncOpenAI(
            api_key=settings.nvidia_api_key or "",
            base_url=_NIM_BASE_URL,
            timeout=llm_timeout_seconds(),
        )

    @retry_async()
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
            # NIM supports json_object mode; full json_schema depends on model.
            # Use json_object as a safe fallback to avoid 422s on older models.
            kwargs["response_format"] = {"type": "json_object"}

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
                "input_tokens": resp.usage.prompt_tokens if resp.usage else 0,
                "output_tokens": resp.usage.completion_tokens if resp.usage else 0,
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
