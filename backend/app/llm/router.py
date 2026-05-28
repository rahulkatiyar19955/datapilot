"""
Routes specialist / supervisor / composer requests to the right LLM client.

The router reads:
  - Per-specialist model_id overrides from the SQLite `agent_models` table
    (populated by the Settings → Agents drawer in Phase 11).
  - Provider API keys from `app.config.settings`.

Provider preference is "whichever key is configured wins", with a documented
cascade for the cheap-fast supervisor model.
"""
from __future__ import annotations

import logging
from functools import lru_cache
from typing import Optional

from app.config import settings
from app.llm.base import LLMClient

logger = logging.getLogger(__name__)

# Default specialist → model_id mapping. Settings → Agents drawer overrides
# these per session by writing to the `agent_models` SQLite table.
DEFAULT_SPECIALIST_MODELS: dict[str, str] = {
    "RootCauseAnalyst":   "claude-sonnet-4-5-20250929",
    "AnomalyDetector":    "claude-sonnet-4-5-20250929",
    "PerformanceProfiler": "gpt-5",
    "ReplayNarrator":     "deepseek-ai/deepseek-r1",
    "SafetyAuditor":      "claude-opus-4-1-20250805",
    "ReleaseComparator":  "claude-sonnet-4-5-20250929",
}

# Cheap-fast supervisor cascade. We pick the first whose provider key is
# present so latency stays predictable regardless of what the user chose for
# composers/specialists.
SUPERVISOR_CASCADE: list[tuple[str, str]] = [
    ("anthropic", "claude-haiku-4-5-20251001"),
    ("openai",    "gpt-5-mini"),
    ("nvidia",    "meta/llama-3.3-70b-instruct"),
    ("gemini",    "gemini-3.5-flash"),
    ("ollama",    "llama3.2"),
]


# Default composer model when none is configured.
DEFAULT_COMPOSER_MODEL = "claude-sonnet-4-5-20250929"


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
    if provider == "gemini":
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
        return AnthropicClient(model_id=model_id)
    if provider == "openai":
        from app.llm.openai_client import OpenAIClient
        return OpenAIClient(model_id=model_id)
    if provider == "gemini":
        from app.llm.gemini_client import GeminiClient
        return GeminiClient(model_id=model_id)
    if provider == "nvidia":
        from app.llm.nim_client import NimClient
        return NimClient(model_id=model_id)
    if provider == "ollama":
        from app.llm.ollama_client import OllamaClient
        return OllamaClient(model_id=model_id)
    raise ValueError(f"Unknown LLM provider: {provider}")


class LLMRouter:
    """
    Resolves an LLMClient for each agent role.

    Stateless — the cache is module-level via `_build_client` calls. Phase 11
    will pass a `db` session so the router reads `agent_models` overrides;
    Phase 4 hard-codes from `DEFAULT_SPECIALIST_MODELS`.
    """

    def __init__(self, overrides: Optional[dict[str, str]] = None):
        # Per-specialist model overrides loaded from SQLite agent_models table.
        self._overrides = overrides or {}

    def for_specialist(self, name: str) -> LLMClient:
        model_id = self._overrides.get(name) or DEFAULT_SPECIALIST_MODELS.get(name)
        if not model_id:
            raise ValueError(f"No model configured for specialist {name!r}")
        provider = _provider_for_model(model_id)
        if not _provider_key_present(provider):
            # Fall back to whatever provider IS configured, keeping the role's
            # tier (sonnet/opus/etc.) approximately preserved.
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
        target = model_id or DEFAULT_COMPOSER_MODEL
        provider = _provider_for_model(target)
        if _provider_key_present(provider):
            return _build_client(provider, target)
        logger.warning("Composer provider %r not configured; falling back", provider)
        return self.for_supervisor()

    def _fallback_for_role(self, preferred_provider: str, _name: str) -> LLMClient:
        """When a specialist's preferred provider has no key, walk the cascade.
        Tries the user's default_provider before the hardcoded order."""
        default = settings.default_provider
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
    """Module-level singleton; tests override by injecting a fake router."""
    return LLMRouter()
