"""
Routes specialist / supervisor / composer requests to the right LLM client.

The router reads:
  - Per-specialist model_id overrides from the in-memory _specialist_overrides
    dict, which is populated at startup from the SQLite `agent_models` table
    and updated live via the settings API.
  - settings.default_model — the user's chosen global model (synced from UI).
  - Provider API keys from `app.config.settings`.

Precedence for specialist model selection:
  1. Per-specialist override (from agent_models table / settings API)
  2. settings.default_model (user's global default)
  3. DEFAULT_SPECIALIST_MODELS (hardcoded fallback for fresh installs)
"""
from __future__ import annotations

import logging
from functools import lru_cache
from typing import Optional

from app.config import settings
from app.llm.base import LLMClient

logger = logging.getLogger(__name__)

# Fallback specialist → model_id mapping used only when no default_model is
# configured and no per-specialist override is set.  All Anthropic IDs so that
# when Anthropic is absent, _fallback_for_role() cascades to the NIM entry
# (meta/llama-3.3-70b-instruct) which is a valid NIM model.
DEFAULT_SPECIALIST_MODELS: dict[str, str] = {
    "RootCauseAnalyst":    "gemini-3.1-flash-lite",
    "AnomalyDetector":     "gemini-3.1-flash-lite",
    "PerformanceProfiler": "gemini-3.1-flash-lite",
    "ReplayNarrator":      "gemini-3.1-flash-lite",
    "SafetyAuditor":       "gemini-3.1-flash-lite",
    "ReleaseComparator":   "gemini-3.1-flash-lite",
}

# Cheap-fast supervisor cascade. We pick the first whose provider key is
# present, preferring the user's default_provider.
SUPERVISOR_CASCADE: list[tuple[str, str]] = [
    ("anthropic", "claude-haiku-4-5-20251001"),
    ("openai",    "gpt-5-mini"),
    ("nvidia",    "meta/llama-3.3-70b-instruct"),
    ("gemini",    "gemini-3.1-flash-lite"),
    ("ollama",    "llama3.2"),
]

# Default composer model when none is configured.
DEFAULT_COMPOSER_MODEL = "gemini-3.1-flash-lite"

# ---------------------------------------------------------------------------
# In-memory specialist override store — populated at startup from SQLite and
# updated live by the settings API without restarting the process.
# ---------------------------------------------------------------------------
_specialist_overrides: dict[str, str] = {}


def set_specialist_override(specialist: str, model_id: str | None) -> None:
    """Update a per-specialist model override and invalidate the router cache."""
    if model_id:
        _specialist_overrides[specialist] = model_id
    else:
        _specialist_overrides.pop(specialist, None)
    get_router.cache_clear()


def _provider_for_model(model_id: str) -> str:
    """Infer the provider from the model id prefix."""
    m = model_id.lower()
    if m.startswith("claude"):
        return "anthropic"
    if m.startswith("gpt") or m.startswith("o1") or m.startswith("o3"):
        return "openai"
    if m.startswith("gemini"):
        return "gemini"
    # NIM models use org/model-name format: deepseek-ai/, meta/, nvidia/, mistralai/, …
    if "/" in m:
        return "nvidia"
    # Llama / qwen / mistral / etc. → Ollama
    return "ollama"


def _provider_key_present(provider: str) -> bool:
    if provider == "anthropic":
        return bool(settings.anthropic_api_key)
    if provider == "openai":
        return bool(settings.openai_api_key)
    if provider == "gemini" or provider == "google":
        return bool(settings.gemini_api_key)
    if provider == "nvidia":
        return bool(settings.nvidia_api_key)
    if provider == "ollama":
        return True  # Ollama defaults to localhost; we let the call fail at runtime if unreachable
    return False


def _build_client(provider: str, model_id: str) -> LLMClient:
    """Instantiate the per-provider client. Imports are lazy so the agent
    layer can be loaded even when an SDK isn't installed."""
    if provider == "anthropic":
        from app.llm.anthropic_client import AnthropicClient
        client: LLMClient = AnthropicClient(model_id=model_id)
    elif provider == "openai":
        from app.llm.openai_client import OpenAIClient
        client = OpenAIClient(model_id=model_id)
    elif provider == "gemini":
        from app.llm.gemini_client import GeminiClient
        client = GeminiClient(model_id=model_id)
    elif provider == "nvidia":
        from app.llm.nim_client import NimClient
        client = NimClient(model_id=model_id)
    elif provider == "ollama":
        from app.llm.ollama_client import OllamaClient
        client = OllamaClient(model_id=model_id)
    else:
        raise ValueError(f"Unknown LLM provider: {provider}")

    from app.llm.logging_wrapper import LoggingLLMClient
    return LoggingLLMClient(client)


class LLMRouter:
    """
    Resolves an LLMClient for each agent role.

    Stateless — the cache is module-level via `_build_client` calls.
    """

    def __init__(self, overrides: Optional[dict[str, str]] = None):
        self._overrides = overrides or {}

    def for_specialist(self, name: str) -> LLMClient:
        # Precedence: per-specialist override → user's global default → hardcoded fallback
        model_id = (
            self._overrides.get(name)
            or settings.default_model
            or DEFAULT_SPECIALIST_MODELS.get(name)
        )
        if not model_id:
            raise ValueError(f"No model configured for specialist {name!r}")
        provider = _provider_for_model(model_id)
        if not _provider_key_present(provider):
            fallback = self._fallback_for_role(provider, name)
            logger.warning(
                "Provider %r not configured for specialist %s — falling back to %s",
                provider, name, fallback,
            )
            return fallback
        return _build_client(provider, model_id)

    def for_supervisor(self) -> LLMClient:
        """Cheap-fast model selected from the cascade; prefers the user's default provider."""
        preferred = settings.default_provider
        if preferred == "google":
            preferred = "gemini"
        if preferred and _provider_key_present(preferred):
            for provider, model_id in SUPERVISOR_CASCADE:
                if provider == preferred:
                    return _build_client(provider, model_id)
        for provider, model_id in SUPERVISOR_CASCADE:
            if _provider_key_present(provider):
                return _build_client(provider, model_id)
        # Should be unreachable — Ollama always reports "key present".
        raise RuntimeError("No LLM provider available for supervisor")

    def for_composer(self, model_id: Optional[str] = None) -> LLMClient:
        """User's chosen default — falls back to the supervisor cascade."""
        target = model_id or settings.default_model or DEFAULT_COMPOSER_MODEL
        provider = _provider_for_model(target)
        if _provider_key_present(provider):
            return _build_client(provider, target)
        logger.warning("Composer provider %r not configured; falling back", provider)
        return self.for_supervisor()

    def _fallback_for_role(self, preferred_provider: str, _name: str) -> LLMClient:
        """When a specialist's preferred provider has no key, walk the cascade.
        Tries the user's default_provider before the hardcoded order."""
        default = settings.default_provider
        if default == "google":
            default = "gemini"
        if default and default != preferred_provider and _provider_key_present(default):
            for provider, model_id in SUPERVISOR_CASCADE:
                if provider == default:
                    return _build_client(provider, model_id)
        for provider, model_id in SUPERVISOR_CASCADE:
            if provider == preferred_provider:
                continue
            if _provider_key_present(provider):
                return _build_client(provider, model_id)
        raise RuntimeError("No LLM provider available")


@lru_cache(maxsize=1)
def get_router() -> LLMRouter:
    """Module-level singleton; tests override by injecting a fake router.
    Rebuilt whenever set_specialist_override() calls cache_clear()."""
    return LLMRouter(overrides=dict(_specialist_overrides))
