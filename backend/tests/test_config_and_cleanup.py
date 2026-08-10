"""Issue #77 — minor cleanups & latent footguns.

- config.py migrated to Pydantic-settings v2 (SettingsConfigDict, no `class Config`).
- update_key routes through one atomic setter that ALWAYS clears the router cache.
- _json_default encodes datetime/bytes properly instead of repr-stringifying.
- The shared OpenAI-compatible mapping lives in one module imported by both clients.
"""
from __future__ import annotations

import base64
import json
from datetime import datetime, timezone


# ── config v2 ────────────────────────────────────────────────────────────────


def test_settings_uses_pydantic_v2_config():
    from app.config import Settings
    # v2 uses `model_config` (a dict), not a nested `class Config`.
    assert isinstance(getattr(Settings, "model_config", None), dict)
    assert Settings.model_config.get("extra") == "ignore"


def test_settings_fields_carry_no_deprecated_env_extra():
    # The deprecated `Field(..., env=...)` form stashes {'env': ...} into
    # json_schema_extra (and is ignored by pydantic-settings v2). After the
    # migration no field should carry it.
    from app.config import Settings
    for name, field in Settings.model_fields.items():
        extra = field.json_schema_extra
        if isinstance(extra, dict):
            assert "env" not in extra, f"{name} still uses the deprecated env= mapping"


def test_settings_reads_env_by_field_name(monkeypatch):
    monkeypatch.setenv("NEO4J_URI", "bolt://example:9999")
    from app.config import Settings
    s = Settings(_env_file=None)
    assert s.neo4j_uri == "bolt://example:9999"


# ── atomic key setter clears the router cache for ALL providers ──────────────


def test_update_key_clears_router_cache_for_any_provider(monkeypatch):
    from app.config import settings
    from app.llm import router as router_mod
    from app.api.settings_api import _apply_key_update

    monkeypatch.setattr(settings, "openai_api_key", None, raising=False)

    # Warm the cache so currsize > 0, then a key change must invalidate it.
    router_mod.get_router()
    assert router_mod.get_router.cache_info().currsize >= 1

    _apply_key_update("openai", "sk-test")
    assert router_mod.get_router.cache_info().currsize == 0
    assert settings.openai_api_key == "sk-test"


# ── typed JSON default ───────────────────────────────────────────────────────


def test_json_default_encodes_datetime_as_isoformat():
    from app.api.chat import _json_default
    dt = datetime(2026, 6, 24, 12, 0, tzinfo=timezone.utc)
    assert _json_default(dt) == dt.isoformat()


def test_json_default_encodes_bytes_as_base64():
    from app.api.chat import _json_default
    raw = b"\x00\x01signature"
    assert _json_default(raw) == base64.b64encode(raw).decode("ascii")


# ── deduped OpenAI-compatible mapping ────────────────────────────────────────


def test_openai_compat_helpers_are_shared_single_definition():
    from app.llm import openai_client, nim_client
    # Both clients reference the exact same function objects (one definition).
    assert openai_client._to_openai_messages is nim_client._to_openai_messages
    assert openai_client._to_openai_tools is nim_client._to_openai_tools
