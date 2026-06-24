"""Issues #39 / #32 — backend reads API keys from a bind-mounted secret file
instead of receiving them via `Env` (docker inspect) or a renderer->HTTP POST.

`load_secrets_file` parses a JSON `{provider: key}` file written by the Electron
main process and applies each key through the existing atomic `_apply_key_update`
setter (which also clears the router cache). It must be fully best-effort: a
missing, unreadable, or malformed file applies nothing and never raises.
"""
from __future__ import annotations

import json


def test_load_secrets_file_applies_keys(tmp_path, monkeypatch):
    from app.config import settings
    from app.api.settings_api import load_secrets_file

    monkeypatch.setattr(settings, "anthropic_api_key", None, raising=False)
    monkeypatch.setattr(settings, "openai_api_key", None, raising=False)
    monkeypatch.setattr(settings, "gemini_api_key", None, raising=False)

    secret_file = tmp_path / "keys.json"
    secret_file.write_text(
        json.dumps({"anthropic": "sk-ant", "openai": "sk-oai", "google": "g-key"})
    )

    applied = load_secrets_file(str(secret_file))

    assert applied == 3
    assert settings.anthropic_api_key == "sk-ant"
    assert settings.openai_api_key == "sk-oai"
    # 'google' maps to gemini_api_key via _apply_key_update.
    assert settings.gemini_api_key == "g-key"


def test_load_secrets_file_missing_file_is_noop(monkeypatch):
    from app.api.settings_api import load_secrets_file

    assert load_secrets_file("/nonexistent/path/keys.json") == 0


def test_load_secrets_file_malformed_json_is_noop(tmp_path):
    from app.api.settings_api import load_secrets_file

    bad = tmp_path / "bad.json"
    bad.write_text("{ not valid json ")
    assert load_secrets_file(str(bad)) == 0


def test_load_secrets_file_ignores_blank_and_non_string_values(tmp_path, monkeypatch):
    from app.config import settings
    from app.api.settings_api import load_secrets_file

    monkeypatch.setattr(settings, "anthropic_api_key", None, raising=False)
    monkeypatch.setattr(settings, "nvidia_api_key", None, raising=False)

    secret_file = tmp_path / "keys.json"
    secret_file.write_text(
        json.dumps({"anthropic": "  sk-ant  ", "openai": "", "nvidia": 123})
    )

    applied = load_secrets_file(str(secret_file))

    assert applied == 1
    assert settings.anthropic_api_key == "sk-ant"
    assert settings.nvidia_api_key is None


def test_load_secrets_file_rejects_non_object_top_level(tmp_path):
    from app.api.settings_api import load_secrets_file

    arr = tmp_path / "arr.json"
    arr.write_text(json.dumps(["anthropic", "sk-ant"]))
    assert load_secrets_file(str(arr)) == 0
