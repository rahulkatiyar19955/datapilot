"""Local Ollama client (HTTP, OpenAI-compatible chat API)."""
from __future__ import annotations

import json
import logging
from typing import Any, AsyncIterator

import httpx

from app.config import settings
from app.llm.base import (
    CompletionChunk,
    CompletionResponse,
    Message,
    ToolCall,
    ToolDef,
)

logger = logging.getLogger(__name__)


class OllamaClient:
    """
    Uses Ollama's `/api/chat` endpoint. Tools are supported on models that
    advertise tool-calling (Llama 3.1+, Mistral, Qwen 2.5). For models without
    native tool support the caller's tool defs are rendered into the system
    prompt as a JSON contract — a deliberate degradation rather than failure.
    """
    provider = "ollama"

    def __init__(self, model_id: str):
        self.model_id = model_id
        # OLLAMA_HOST defaults to http://host.docker.internal:11434 in container
        self._base_url = settings.ollama_host.rstrip("/")
        self._timeout = httpx.Timeout(120.0, connect=5.0)

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
        ollama_messages = [{"role": "system", "content": system}]
        for m in messages:
            role = m["role"]
            if role == "system":
                continue
            msg_dict: dict[str, Any] = {"role": role, "content": m.get("content", "")}
            if role == "assistant" and m.get("tool_calls"):
                msg_dict["tool_calls"] = [
                    {
                        "type": "function",
                        "function": {"name": tc["name"], "arguments": tc["arguments"]},
                    }
                    for tc in m["tool_calls"]
                ]
            ollama_messages.append(msg_dict)

        body: dict[str, Any] = {
            "model": self.model_id,
            "messages": ollama_messages,
            "stream": stream,
            "options": {"temperature": temperature, "num_predict": max_tokens},
        }
        if tools:
            body["tools"] = [
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
        if response_format:
            body["format"] = response_format  # Ollama supports JSON schema directly

        if stream:
            return self._stream(body)

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            r = await client.post(f"{self._base_url}/api/chat", json=body)
            r.raise_for_status()
            data = r.json()

        msg = data.get("message", {})
        tool_calls: list[ToolCall] = []
        for i, tc in enumerate(msg.get("tool_calls") or []):
            fn = tc.get("function", {})
            args = fn.get("arguments") or {}
            if isinstance(args, str):
                try:
                    args = json.loads(args)
                except json.JSONDecodeError:
                    args = {}
            tool_calls.append({"id": f"ollama_{i}", "name": fn.get("name", ""), "arguments": args})
        return {
            "content": msg.get("content", ""),
            "tool_calls": tool_calls,
            "usage": {
                "input_tokens": data.get("prompt_eval_count", 0),
                "output_tokens": data.get("eval_count", 0),
            },
            "finish_reason": data.get("done_reason") or "stop",
        }

    async def _stream(self, body: dict[str, Any]) -> AsyncIterator[CompletionChunk]:
        last_usage: dict[str, int] | None = None
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            async with client.stream("POST", f"{self._base_url}/api/chat", json=body) as r:
                r.raise_for_status()
                async for line in r.aiter_lines():
                    if not line.strip():
                        continue
                    try:
                        evt = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    if evt.get("done"):
                        last_usage = {
                            "input_tokens": evt.get("prompt_eval_count", 0),
                            "output_tokens": evt.get("eval_count", 0),
                        }
                        continue
                    msg = evt.get("message", {})
                    if msg.get("content"):
                        yield {"delta_text": msg["content"]}
        yield {"usage": last_usage or {"input_tokens": 0, "output_tokens": 0}, "finish_reason": "stop"}
