"""Unit coverage for `app.llm.router`.

Covers the pure provider-inference helpers, the provider-key presence check,
specialist/supervisor/composer resolution and fallback cascades, the in-memory
specialist override store, and the `get_router` lru_cache lifecycle.

`_build_client` is monkeypatched throughout to a sentinel factory so no provider
SDK is imported and no network client is constructed — we only assert *which*
(provider, model_id) the router selected.
"""
from __future__ import annotations

import pytest

from app.llm import router as router_mod
from app.llm.router import (
    DEFAULT_COMPOSER_MODEL,
    DEFAULT_SPECIALIST_MODELS,
    LLMRouter,
    SUPERVISOR_CASCADE,
    _provider_for_model,
    _provider_key_present,
    get_router,
    set_specialist_override,
)


# ── Fakes / fixtures ───────────────────────────────────────────────────────


class _FakeClient:
    """Stand-in for the LoggingLLMClient-wrapped provider client."""

    def __init__(self, provider: str, model_id: str):
        self.provider = provider
        self.model_id = model_id

    def __repr__(self):  # pragma: no cover - debugging aid
        return f"_FakeClient({self.provider!r}, {self.model_id!r})"


@pytest.fixture
def fake_build(monkeypatch):
    """Replace _build_client so router selection is observable without SDKs."""

    def _factory(provider: str, model_id: str):
        return _FakeClient(provider, model_id)

    monkeypatch.setattr(router_mod, "_build_client", _factory)
    return _factory


@pytest.fixture
def clear_keys(monkeypatch):
    """Start every router test from a clean slate: no provider keys, no defaults."""
    monkeypatch.setattr(router_mod.settings, "anthropic_api_key", None, raising=False)
    monkeypatch.setattr(router_mod.settings, "openai_api_key", None, raising=False)
    monkeypatch.setattr(router_mod.settings, "gemini_api_key", None, raising=False)
    monkeypatch.setattr(router_mod.settings, "nvidia_api_key", None, raising=False)
    monkeypatch.setattr(router_mod.settings, "default_model", None, raising=False)
    monkeypatch.setattr(router_mod.settings, "default_provider", None, raising=False)


@pytest.fixture(autouse=True)
def restore_override_store():
    """Snapshot & restore the module-level override store + lru_cache so tests
    don't leak state into each other (or into other test modules)."""
    saved = dict(router_mod._specialist_overrides)
    get_router.cache_clear()
    yield
    router_mod._specialist_overrides.clear()
    router_mod._specialist_overrides.update(saved)
    get_router.cache_clear()


# ── _provider_for_model ────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "model_id,expected",
    [
        ("claude-haiku-4-5-20251001", "anthropic"),
        ("Claude-Opus", "anthropic"),
        ("gpt-5-mini", "openai"),
        ("GPT-4o", "openai"),
        ("o1-preview", "openai"),
        ("o3-mini", "openai"),
        ("gemini-3.1-flash-lite", "gemini"),
        ("meta/llama-3.3-70b-instruct", "nvidia"),
        ("deepseek-ai/deepseek-r1", "nvidia"),
        ("llama3.2", "ollama"),
        ("qwen2.5", "ollama"),
        ("mistral", "ollama"),
    ],
)
def test_provider_for_model(model_id, expected):
    assert _provider_for_model(model_id) == expected


# ── _provider_key_present ──────────────────────────────────────────────────


def test_provider_key_present_anthropic(monkeypatch, clear_keys):
    assert _provider_key_present("anthropic") is False
    monkeypatch.setattr(router_mod.settings, "anthropic_api_key", "sk-x", raising=False)
    assert _provider_key_present("anthropic") is True


def test_provider_key_present_openai(monkeypatch, clear_keys):
    assert _provider_key_present("openai") is False
    monkeypatch.setattr(router_mod.settings, "openai_api_key", "sk-x", raising=False)
    assert _provider_key_present("openai") is True


def test_provider_key_present_gemini_and_google_alias(monkeypatch, clear_keys):
    assert _provider_key_present("gemini") is False
    assert _provider_key_present("google") is False
    monkeypatch.setattr(router_mod.settings, "gemini_api_key", "g-x", raising=False)
    assert _provider_key_present("gemini") is True
    assert _provider_key_present("google") is True


def test_provider_key_present_nvidia(monkeypatch, clear_keys):
    assert _provider_key_present("nvidia") is False
    monkeypatch.setattr(router_mod.settings, "nvidia_api_key", "nv-x", raising=False)
    assert _provider_key_present("nvidia") is True


def test_provider_key_present_ollama_always_true(clear_keys):
    # NOTE: Ollama unconditionally reports its key as present even though no
    # endpoint is verified. The router relies on this so the supervisor cascade
    # always terminates; the call is allowed to fail later at runtime. This is
    # an intentional quirk worth flagging (see router.py:95).
    assert _provider_key_present("ollama") is True


def test_provider_key_present_unknown_provider_false(clear_keys):
    assert _provider_key_present("totally-made-up") is False


# ── for_specialist ─────────────────────────────────────────────────────────


def test_for_specialist_uses_explicit_override(fake_build, clear_keys, monkeypatch):
    monkeypatch.setattr(router_mod.settings, "anthropic_api_key", "sk", raising=False)
    r = LLMRouter(overrides={"RootCauseAnalyst": "claude-haiku-4-5-20251001"})
    client = r.for_specialist("RootCauseAnalyst")
    assert client.provider == "anthropic"
    assert client.model_id == "claude-haiku-4-5-20251001"


def test_for_specialist_uses_default_model(fake_build, clear_keys, monkeypatch):
    monkeypatch.setattr(router_mod.settings, "default_model", "gpt-5-mini", raising=False)
    monkeypatch.setattr(router_mod.settings, "openai_api_key", "sk", raising=False)
    r = LLMRouter()
    client = r.for_specialist("AnomalyDetector")
    assert client.provider == "openai"
    assert client.model_id == "gpt-5-mini"


def test_for_specialist_uses_hardcoded_fallback_model(fake_build, clear_keys, monkeypatch):
    # No override, no default_model -> DEFAULT_SPECIALIST_MODELS (gemini).
    monkeypatch.setattr(router_mod.settings, "gemini_api_key", "g", raising=False)
    r = LLMRouter()
    client = r.for_specialist("SafetyAuditor")
    assert client.model_id == DEFAULT_SPECIALIST_MODELS["SafetyAuditor"]
    assert client.provider == "gemini"


def test_for_specialist_raises_when_no_model_configured(fake_build, clear_keys):
    # Unknown specialist + no default -> nothing resolves -> ValueError.
    r = LLMRouter()
    with pytest.raises(ValueError, match="No model configured"):
        r.for_specialist("NotARealSpecialist")


def test_for_specialist_falls_back_when_provider_key_absent(fake_build, clear_keys, monkeypatch):
    # Wants anthropic (override), but only ollama "key" is present -> cascade
    # picks ollama (always present), skipping the preferred provider.
    r = LLMRouter(overrides={"RootCauseAnalyst": "claude-haiku-4-5-20251001"})
    client = r.for_specialist("RootCauseAnalyst")
    assert client.provider == "ollama"


def test_for_specialist_fallback_prefers_default_provider(fake_build, clear_keys, monkeypatch):
    # Preferred provider (anthropic) key missing, but openai key present and is
    # the user's default_provider -> fallback should choose openai.
    monkeypatch.setattr(router_mod.settings, "default_provider", "openai", raising=False)
    monkeypatch.setattr(router_mod.settings, "openai_api_key", "sk", raising=False)
    r = LLMRouter(overrides={"RootCauseAnalyst": "claude-x"})
    client = r.for_specialist("RootCauseAnalyst")
    assert client.provider == "openai"


# ── for_supervisor ─────────────────────────────────────────────────────────


def test_for_supervisor_walks_cascade_to_ollama(fake_build, clear_keys):
    # No keys present -> cascade falls through to ollama (always present).
    r = LLMRouter()
    client = r.for_supervisor()
    assert client.provider == "ollama"
    assert client.model_id == "llama3.2"


def test_for_supervisor_prefers_default_provider(fake_build, clear_keys, monkeypatch):
    monkeypatch.setattr(router_mod.settings, "default_provider", "openai", raising=False)
    monkeypatch.setattr(router_mod.settings, "openai_api_key", "sk", raising=False)
    monkeypatch.setattr(router_mod.settings, "anthropic_api_key", "sk", raising=False)
    r = LLMRouter()
    client = r.for_supervisor()
    # default_provider openai chosen even though anthropic comes first in cascade.
    assert client.provider == "openai"
    assert client.model_id == "gpt-5-mini"


def test_for_supervisor_google_alias_maps_to_gemini(fake_build, clear_keys, monkeypatch):
    monkeypatch.setattr(router_mod.settings, "default_provider", "google", raising=False)
    monkeypatch.setattr(router_mod.settings, "gemini_api_key", "g", raising=False)
    r = LLMRouter()
    client = r.for_supervisor()
    assert client.provider == "gemini"


def test_for_supervisor_picks_first_present_in_cascade_order(fake_build, clear_keys, monkeypatch):
    # No default_provider; first cascade entry with a present key wins.
    monkeypatch.setattr(router_mod.settings, "openai_api_key", "sk", raising=False)
    r = LLMRouter()
    client = r.for_supervisor()
    # anthropic (no key) skipped, openai is next in the cascade.
    assert client.provider == "openai"


# ── for_composer ───────────────────────────────────────────────────────────


def test_for_composer_uses_explicit_model(fake_build, clear_keys, monkeypatch):
    monkeypatch.setattr(router_mod.settings, "openai_api_key", "sk", raising=False)
    r = LLMRouter()
    client = r.for_composer("gpt-5-mini")
    assert client.provider == "openai"
    assert client.model_id == "gpt-5-mini"


def test_for_composer_uses_default_model(fake_build, clear_keys, monkeypatch):
    monkeypatch.setattr(router_mod.settings, "default_model", "claude-haiku-4-5-20251001", raising=False)
    monkeypatch.setattr(router_mod.settings, "anthropic_api_key", "sk", raising=False)
    r = LLMRouter()
    client = r.for_composer()
    assert client.provider == "anthropic"


def test_for_composer_default_model_constant_when_unset(fake_build, clear_keys, monkeypatch):
    monkeypatch.setattr(router_mod.settings, "gemini_api_key", "g", raising=False)
    r = LLMRouter()
    client = r.for_composer()
    assert client.model_id == DEFAULT_COMPOSER_MODEL
    assert client.provider == "gemini"


def test_for_composer_falls_back_to_supervisor_when_provider_absent(fake_build, clear_keys):
    # default composer model is gemini but no gemini key -> falls back to the
    # supervisor cascade, which terminates at ollama.
    r = LLMRouter()
    client = r.for_composer()
    assert client.provider == "ollama"


# ── set_specialist_override + get_router cache ─────────────────────────────


def test_set_specialist_override_adds_and_removes():
    set_specialist_override("RootCauseAnalyst", "claude-x")
    assert router_mod._specialist_overrides["RootCauseAnalyst"] == "claude-x"
    set_specialist_override("RootCauseAnalyst", None)
    assert "RootCauseAnalyst" not in router_mod._specialist_overrides


def test_set_specialist_override_invalidates_router_cache():
    first = get_router()
    second = get_router()
    assert first is second  # cached singleton
    set_specialist_override("AnomalyDetector", "gpt-5-mini")
    third = get_router()
    assert third is not first  # cache_clear() forced a rebuild
    # The rebuilt router carries the new override snapshot.
    assert third._overrides.get("AnomalyDetector") == "gpt-5-mini"


def test_get_router_is_cached_singleton():
    get_router.cache_clear()
    a = get_router()
    b = get_router()
    assert a is b
    assert isinstance(a, LLMRouter)


def test_supervisor_cascade_shape_is_provider_model_pairs():
    # Guard the cascade contract the router walks.
    assert SUPERVISOR_CASCADE[0] == ("anthropic", "claude-haiku-4-5-20251001")
    assert SUPERVISOR_CASCADE[-1] == ("ollama", "llama3.2")
    for provider, model_id in SUPERVISOR_CASCADE:
        assert isinstance(provider, str) and isinstance(model_id, str)
