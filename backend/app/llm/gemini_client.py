"""Google Gemini client."""
from __future__ import annotations

import asyncio
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


def _to_gemini_function_declarations(tools: list[ToolDef]) -> list[dict[str, Any]]:
    return [
        {"name": t["name"], "description": t["description"], "parameters": t["parameters"]}
        for t in tools
    ]


def _to_gemini_contents(messages: list[Message]) -> list[dict[str, Any]]:
    contents: list[dict[str, Any]] = []
    for m in messages:
        role = m["role"]
        if role == "system":
            continue
        # Gemini uses 'user' and 'model' for assistant
        gem_role = "model" if role == "assistant" else "user"
        if role == "assistant" and m.get("tool_calls"):
            parts: list[dict[str, Any]] = []
            if m.get("content"):
                parts.append({"text": m["content"]})
            for tc in m["tool_calls"]:
                parts.append({"function_call": {"name": tc["name"], "args": tc["arguments"]}})
        elif role == "tool":
            parts = [{
                "function_response": {
                    "name": m.get("name", "tool"),
                    "response": {"content": m.get("content", "")},
                }
            }]
        else:
            parts = [{"text": m.get("content", "")}]

        # Gemini rejects consecutive turns with the same role — merge parts instead.
        if contents and contents[-1]["role"] == gem_role:
            contents[-1]["parts"].extend(parts)
        else:
            contents.append({"role": gem_role, "parts": parts})
    return contents


class GeminiClient:
    provider = "gemini"

    def __init__(self, model_id: str):
        import google.generativeai as genai
        genai.configure(api_key=settings.gemini_api_key)
        self.model_id = model_id
        self._genai = genai
        
        # Parse actual model name and thinking configuration settings
        self.actual_model_name = model_id
        self.thinking_level = None
        
        if "gemini-3.5-flash" in model_id:
            self.actual_model_name = "gemini-3.5-flash"
            if "medium" in model_id.lower():
                self.thinking_level = "MEDIUM"
            elif "high" in model_id.lower():
                self.thinking_level = "HIGH"
        elif "gemini-3.1-pro" in model_id:
            self.actual_model_name = "gemini-3.1-pro-preview"

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
        generation_config: dict[str, Any] = {
            "temperature": temperature,
            "max_output_tokens": max_tokens,
        }
        if response_format:
            generation_config["response_mime_type"] = "application/json"
            generation_config["response_schema"] = response_format

        if self.thinking_level:
            generation_config["thinking_config"] = {
                "thinking_level": self.thinking_level
            }

        model = self._genai.GenerativeModel(
            model_name=self.actual_model_name,
            system_instruction=system,
            generation_config=generation_config,
            tools=[{"function_declarations": _to_gemini_function_declarations(tools)}] if tools else None,
        )

        contents = _to_gemini_contents(messages)

        if stream:
            return self._stream(model, contents)

        # google-generativeai is sync; run in a thread to keep the event loop free.
        resp = await asyncio.to_thread(model.generate_content, contents)
        text = resp.text or "" if hasattr(resp, "text") else ""
        tool_calls: list[ToolCall] = []
        for candidate in getattr(resp, "candidates", []) or []:
            for part in getattr(candidate.content, "parts", []) or []:
                fc = getattr(part, "function_call", None)
                if fc:
                    tool_calls.append({
                        "id": f"gemini_{fc.name}_{len(tool_calls)}",
                        "name": fc.name,
                        "arguments": dict(fc.args) if fc.args else {},
                    })

        usage = getattr(resp, "usage_metadata", None)
        return {
            "content": text,
            "tool_calls": tool_calls,
            "usage": {
                "input_tokens": getattr(usage, "prompt_token_count", 0) if usage else 0,
                "output_tokens": getattr(usage, "candidates_token_count", 0) if usage else 0,
            },
            "finish_reason": "stop",
        }

    async def _stream(self, model: Any, contents: list[dict[str, Any]]) -> AsyncIterator[CompletionChunk]:
        # google-generativeai's stream is sync — iterate in a thread.
        loop = asyncio.get_event_loop()
        stream = await loop.run_in_executor(None, lambda: model.generate_content(contents, stream=True))
        last_usage: dict[str, int] | None = None
        for chunk in stream:
            if hasattr(chunk, "text") and chunk.text:
                yield {"delta_text": chunk.text}
            if hasattr(chunk, "usage_metadata") and chunk.usage_metadata:
                last_usage = {
                    "input_tokens": getattr(chunk.usage_metadata, "prompt_token_count", 0),
                    "output_tokens": getattr(chunk.usage_metadata, "candidates_token_count", 0),
                }
        yield {"usage": last_usage or {"input_tokens": 0, "output_tokens": 0}, "finish_reason": "stop"}
