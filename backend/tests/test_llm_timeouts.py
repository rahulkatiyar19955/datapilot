"""Regression coverage for issues #65 / #48 — cloud LLM request timeouts.

Only ``OllamaClient`` historically set a request timeout; the four cloud clients
(Anthropic, OpenAI, Gemini, NIM) constructed their SDK clients with none, so a
hung provider would stall the whole agent turn. These tests assert that every
cloud client passes an explicit, non-None ``timeout`` when constructing its
underlying SDK client, and that ``DATAPILOT_LLM_TIMEOUT`` overrides the default.

No real network: the provider SDK constructors are monkeypatched to record the
kwargs they were called with, so we never instantiate a real client.
"""
from __future__ import annotations

import sys
import types

import pytest

from app.llm import retry as retry_mod
from app.llm.retry import llm_timeout_seconds


# ── llm_timeout_seconds: env parsing ────────────────────────────────────────


def test_default_timeout_when_env_unset(monkeypatch):
    monkeypatch.delenv("DATAPILOT_LLM_TIMEOUT", raising=False)
    assert llm_timeout_seconds() == retry_mod._DEFAULT_LLM_TIMEOUT_SECONDS
    assert llm_timeout_seconds() > 0


def test_env_overrides_default(monkeypatch):
    monkeypatch.setenv("DATAPILOT_LLM_TIMEOUT", "12.5")
    assert llm_timeout_seconds() == 12.5


def test_invalid_env_falls_back_to_default(monkeypatch):
    monkeypatch.setenv("DATAPILOT_LLM_TIMEOUT", "not-a-number")
    assert llm_timeout_seconds() == retry_mod._DEFAULT_LLM_TIMEOUT_SECONDS


def test_nonpositive_env_falls_back_to_default(monkeypatch):
    monkeypatch.setenv("DATAPILOT_LLM_TIMEOUT", "0")
    assert llm_timeout_seconds() == retry_mod._DEFAULT_LLM_TIMEOUT_SECONDS
    monkeypatch.setenv("DATAPILOT_LLM_TIMEOUT", "-5")
    assert llm_timeout_seconds() == retry_mod._DEFAULT_LLM_TIMEOUT_SECONDS


# ── Fake SDK modules (monkeypatched into sys.modules / the lazy import) ──────


class _CapturingClient:
    """Records the kwargs it was constructed with."""

    def __init__(self, **kwargs):
        self.kwargs = kwargs


@pytest.fixture
def fake_openai(monkeypatch):
    """Install a fake ``openai`` module exposing AsyncOpenAI that records kwargs."""
    captured: dict[str, object] = {}

    class _AsyncOpenAI(_CapturingClient):
        def __init__(self, **kwargs):
            super().__init__(**kwargs)
            captured.update(kwargs)

    fake_mod = types.ModuleType("openai")
    fake_mod.AsyncOpenAI = _AsyncOpenAI
    monkeypatch.setitem(sys.modules, "openai", fake_mod)
    return captured


@pytest.fixture
def fake_anthropic(monkeypatch):
    captured: dict[str, object] = {}

    class _AsyncAnthropic(_CapturingClient):
        def __init__(self, **kwargs):
            super().__init__(**kwargs)
            captured.update(kwargs)

    fake_mod = types.ModuleType("anthropic")
    fake_mod.AsyncAnthropic = _AsyncAnthropic
    monkeypatch.setitem(sys.modules, "anthropic", fake_mod)
    return captured


@pytest.fixture
def fake_genai(monkeypatch):
    """Install a fake ``google.genai`` module recording Client kwargs."""
    captured: dict[str, object] = {}

    class _Client(_CapturingClient):
        def __init__(self, **kwargs):
            super().__init__(**kwargs)
            captured.update(kwargs)

    google_mod = types.ModuleType("google")
    genai_mod = types.ModuleType("google.genai")
    genai_mod.Client = _Client
    google_mod.genai = genai_mod
    monkeypatch.setitem(sys.modules, "google", google_mod)
    monkeypatch.setitem(sys.modules, "google.genai", genai_mod)
    return captured


# ── Each cloud client passes a non-None timeout ─────────────────────────────


def test_anthropic_client_sets_timeout(monkeypatch, fake_anthropic):
    monkeypatch.setenv("DATAPILOT_LLM_TIMEOUT", "37")
    from app.llm.anthropic_client import AnthropicClient

    AnthropicClient("claude-test")
    assert "timeout" in fake_anthropic
    assert fake_anthropic["timeout"] is not None
    assert fake_anthropic["timeout"] == 37.0


def test_openai_client_sets_timeout(monkeypatch, fake_openai):
    monkeypatch.setenv("DATAPILOT_LLM_TIMEOUT", "37")
    from app.llm.openai_client import OpenAIClient

    OpenAIClient("gpt-test")
    assert "timeout" in fake_openai
    assert fake_openai["timeout"] is not None
    assert fake_openai["timeout"] == 37.0


def test_nim_client_sets_timeout(monkeypatch, fake_openai):
    monkeypatch.setenv("DATAPILOT_LLM_TIMEOUT", "37")
    from app.llm.nim_client import NimClient

    NimClient("meta/llama-test")
    assert "timeout" in fake_openai
    assert fake_openai["timeout"] is not None
    assert fake_openai["timeout"] == 37.0


def test_gemini_client_sets_timeout(monkeypatch, fake_genai):
    monkeypatch.setenv("DATAPILOT_LLM_TIMEOUT", "37")
    from app.llm.gemini_client import GeminiClient

    GeminiClient("gemini-test")
    assert "http_options" in fake_genai
    http_options = fake_genai["http_options"]
    assert http_options.get("timeout") is not None
    # google-genai expects the timeout in milliseconds.
    assert http_options["timeout"] == int(37.0 * 1000)


def test_cloud_clients_use_default_timeout_when_env_unset(
    monkeypatch, fake_anthropic, fake_openai, fake_genai
):
    """With no env override every cloud client still carries a positive timeout."""
    monkeypatch.delenv("DATAPILOT_LLM_TIMEOUT", raising=False)
    from app.llm.anthropic_client import AnthropicClient
    from app.llm.gemini_client import GeminiClient
    from app.llm.nim_client import NimClient
    from app.llm.openai_client import OpenAIClient

    AnthropicClient("claude-test")
    OpenAIClient("gpt-test")
    NimClient("meta/llama-test")
    GeminiClient("gemini-test")

    assert fake_anthropic["timeout"] == retry_mod._DEFAULT_LLM_TIMEOUT_SECONDS
    # openai + nim share the fake_openai capture; the last constructed wins but
    # both pass the same default, so the assertion holds for both.
    assert fake_openai["timeout"] == retry_mod._DEFAULT_LLM_TIMEOUT_SECONDS
    assert fake_genai["http_options"]["timeout"] == int(
        retry_mod._DEFAULT_LLM_TIMEOUT_SECONDS * 1000
    )
