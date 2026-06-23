"""
Security regression tests for issues #60 and #61.

#60 — The key-bearing settings endpoints (`/api/settings/test-key`,
      `/api/settings/models`) must never echo a provider SDK exception
      string back to the client or into logs, because those strings can
      embed the API key / auth header. They must return fixed, key-free
      messages and log only the exception *type*.

#61 — Prompt/response content logging must be opt-in (OFF unless
      `DATAPILOT_PROMPT_LOGGING == "1"`). When disabled, the
      `LoggingLLMClient` wrapper must pass through without writing prompt or
      response content, and the `/api/settings/llm-logs` endpoint must not
      serve prompt contents.

These tests avoid all real network I/O via monkeypatching.
"""
from __future__ import annotations

import asyncio
import logging
import os
from typing import Any, AsyncIterator

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

# A fake secret that must never appear in any client response or log record.
FAKE_SECRET = "sk-SECRET123"


# ---------------------------------------------------------------------------
# Helpers / fakes
# ---------------------------------------------------------------------------


class _FakeAuthError(Exception):
    """Mimics a provider SDK auth error whose message embeds the API key."""

    # Many SDKs (openai, anthropic) expose `status_code` on their error types.
    status_code = 401


class _FakeModels:
    def __init__(self, exc: Exception) -> None:
        self._exc = exc

    async def list(self) -> Any:  # noqa: D401 - mimics SDK signature
        raise self._exc


class _FakeAsyncClient:
    """Stand-in for openai.AsyncOpenAI / anthropic.AsyncAnthropic."""

    def __init__(self, *_args: Any, **_kwargs: Any) -> None:
        # The constructor receives the real (fake) key; we ignore it and make
        # the network call raise an error whose message leaks the key.
        self.models = _FakeModels(
            _FakeAuthError(f"Invalid API key provided: {FAKE_SECRET} in Authorization header")
        )


# ---------------------------------------------------------------------------
# #60 — provider exception strings must not leak to responses or logs
# ---------------------------------------------------------------------------


def test_test_key_does_not_leak_secret_in_response(monkeypatch: pytest.MonkeyPatch) -> None:
    import openai

    monkeypatch.setattr(openai, "AsyncOpenAI", _FakeAsyncClient)

    resp = client.post(
        "/api/settings/test-key",
        json={"provider": "openai", "key": FAKE_SECRET},
    )

    assert resp.status_code == 400
    body = resp.text
    assert FAKE_SECRET not in body
    assert "Authorization" not in body
    # Auth errors get a fixed, key-free message.
    detail = resp.json()["detail"]
    assert detail == "Authentication failed"


def test_test_key_does_not_leak_secret_in_logs(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    import openai

    monkeypatch.setattr(openai, "AsyncOpenAI", _FakeAsyncClient)

    with caplog.at_level(logging.DEBUG):
        resp = client.post(
            "/api/settings/test-key",
            json={"provider": "openai", "key": FAKE_SECRET},
        )

    assert resp.status_code == 400
    for record in caplog.records:
        assert FAKE_SECRET not in record.getMessage()
        assert FAKE_SECRET not in str(record.args)


def test_list_models_does_not_leak_secret_in_response(monkeypatch: pytest.MonkeyPatch) -> None:
    import anthropic

    monkeypatch.setattr(anthropic, "AsyncAnthropic", _FakeAsyncClient)

    resp = client.post(
        "/api/settings/models",
        json={"provider": "anthropic", "key": FAKE_SECRET},
    )

    assert resp.status_code == 400
    assert FAKE_SECRET not in resp.text
    assert "Authorization" not in resp.text


def test_non_auth_error_returns_generic_message(monkeypatch: pytest.MonkeyPatch) -> None:
    """A non-auth provider failure returns a fixed generic message, never the
    raw exception string (which could still embed secrets)."""

    class _FakeBrokenClient:
        def __init__(self, *_a: Any, **_k: Any) -> None:
            self.models = _FakeModels(
                RuntimeError(f"connection blew up, key was {FAKE_SECRET}")
            )

    import openai

    monkeypatch.setattr(openai, "AsyncOpenAI", _FakeBrokenClient)

    resp = client.post(
        "/api/settings/test-key",
        json={"provider": "openai", "key": FAKE_SECRET},
    )

    assert resp.status_code == 400
    assert FAKE_SECRET not in resp.text
    assert resp.json()["detail"] == "Request to provider failed"


# ---------------------------------------------------------------------------
# #61 — prompt/response logging is opt-in (off by default)
# ---------------------------------------------------------------------------


class _FakeInnerClient:
    """Minimal LLMClient stand-in for the logging wrapper."""

    model_id = "fake-model"
    provider = "mock"

    async def complete(self, **_kwargs: Any) -> dict[str, Any]:
        return {
            "content": "the-model-response",
            "tool_calls": [],
            "usage": {"input_tokens": 1, "output_tokens": 1},
            "finish_reason": "stop",
        }


def test_wrapper_does_not_write_content_when_logging_disabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("DATAPILOT_PROMPT_LOGGING", raising=False)

    from app.llm import logging_wrapper

    written: list[dict[str, Any]] = []
    monkeypatch.setattr(logging_wrapper, "_write", lambda entry: written.append(entry))

    wrapper = logging_wrapper.LoggingLLMClient(_FakeInnerClient())

    secret_system = f"SYSTEM PROMPT containing {FAKE_SECRET}"
    result = asyncio.run(
        wrapper.complete(
            system=secret_system,
            messages=[{"role": "user", "content": "secret user message"}],
        )
    )

    # The wrapper still returns the real result transparently.
    assert result["content"] == "the-model-response"
    # But no prompt/response *content* was written.
    for entry in written:
        assert "system" not in entry
        assert "messages" not in entry
        assert "content" not in entry
        assert FAKE_SECRET not in str(entry)


def test_wrapper_writes_content_when_logging_enabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DATAPILOT_PROMPT_LOGGING", "1")

    from app.llm import logging_wrapper

    written: list[dict[str, Any]] = []
    monkeypatch.setattr(logging_wrapper, "_write", lambda entry: written.append(entry))

    wrapper = logging_wrapper.LoggingLLMClient(_FakeInnerClient())

    result = asyncio.run(
        wrapper.complete(
            system="hello system",
            messages=[{"role": "user", "content": "hello user"}],
        )
    )

    assert result["content"] == "the-model-response"
    # Opt-in: now a request entry with the system prompt is written.
    request_entries = [e for e in written if e.get("direction") == "request"]
    assert request_entries, "expected a request log entry when logging enabled"
    assert request_entries[0].get("system") == "hello system"


def test_llm_logs_endpoint_returns_404_when_logging_disabled(
    tmp_path: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("DATAPILOT_PROMPT_LOGGING", raising=False)

    from app.config import settings

    monkeypatch.setattr(settings, "datapilot_data_dir", str(tmp_path))
    # Even if a log file physically exists, the endpoint must not serve it.
    (tmp_path / "llm_prompts.log").write_text(f"leaked {FAKE_SECRET}\n")

    resp = client.get("/api/settings/llm-logs")
    assert resp.status_code == 404
    assert FAKE_SECRET not in resp.text


def test_llm_logs_endpoint_serves_when_logging_enabled(
    tmp_path: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("DATAPILOT_PROMPT_LOGGING", "1")

    from app.config import settings

    monkeypatch.setattr(settings, "datapilot_data_dir", str(tmp_path))
    (tmp_path / "llm_prompts.log").write_text("dummy log line\n")

    resp = client.get("/api/settings/llm-logs")
    assert resp.status_code == 200
    assert resp.text == "dummy log line\n"
