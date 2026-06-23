"""Unit coverage for app.services.embeddings.EmbeddingService.

These tests never download a model or hit OpenAI: the sentence-transformers
import and OpenAI client are both avoided/monkeypatched. We exercise:
- get_embedding_dimension() fallback (1536 when OpenAI configured, else 384).
- embed_texts() empty-input short-circuit, OpenAI batching path (mocked client),
  and local path (mocked local_model) — all without real I/O.
- format_log_text() formatting + defaults.
- Lazy openai_client construction driven by settings.openai_api_key.
"""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from app.services.embeddings import EmbeddingService


# ---------------------------------------------------------------------------
# get_embedding_dimension
# ---------------------------------------------------------------------------

class TestEmbeddingDimension:
    def test_local_fallback_is_384_when_no_openai(self, monkeypatch):
        svc = EmbeddingService()
        # Force the openai_client property to report "not configured" without
        # importing openai or reading real settings.
        monkeypatch.setattr(type(svc), "openai_client",
                            property(lambda self: None))
        assert svc.get_embedding_dimension() == 384

    def test_openai_dimension_is_1536_when_configured(self, monkeypatch):
        svc = EmbeddingService()
        sentinel = MagicMock(name="openai_client")
        monkeypatch.setattr(type(svc), "openai_client",
                            property(lambda self: sentinel))
        assert svc.get_embedding_dimension() == 1536

    def test_dimension_does_not_load_local_model(self, monkeypatch):
        # get_embedding_dimension must never touch local_model (which would try
        # to import/download sentence-transformers). Make local_model explode if
        # accessed, then prove the call still works.
        svc = EmbeddingService()
        monkeypatch.setattr(type(svc), "openai_client",
                            property(lambda self: None))

        def _boom(self):  # pragma: no cover - only runs on regression
            raise AssertionError("local_model must not be loaded here")

        monkeypatch.setattr(type(svc), "local_model", property(_boom))
        assert svc.get_embedding_dimension() == 384


# ---------------------------------------------------------------------------
# openai_client lazy construction
# ---------------------------------------------------------------------------

class TestOpenAIClientProperty:
    def test_returns_none_when_no_api_key(self, monkeypatch):
        import app.services.embeddings as emb
        monkeypatch.setattr(emb.settings, "openai_api_key", None, raising=False)
        svc = EmbeddingService()
        assert svc.openai_client is None

    def test_constructs_client_when_key_present(self, monkeypatch):
        import app.services.embeddings as emb
        monkeypatch.setattr(emb.settings, "openai_api_key", "sk-test", raising=False)

        # Stub the openai module so no real client/import side effects occur.
        fake_client = SimpleNamespace(name="fake")
        fake_openai = SimpleNamespace(OpenAI=MagicMock(return_value=fake_client))
        import sys
        monkeypatch.setitem(sys.modules, "openai", fake_openai)

        svc = EmbeddingService()
        client = svc.openai_client
        assert client is fake_client
        fake_openai.OpenAI.assert_called_once_with(api_key="sk-test")
        # Cached on second access — constructor not called again.
        assert svc.openai_client is fake_client
        fake_openai.OpenAI.assert_called_once()


# ---------------------------------------------------------------------------
# embed_texts
# ---------------------------------------------------------------------------

class TestEmbedTexts:
    def test_empty_input_returns_empty_without_touching_models(self):
        svc = EmbeddingService()
        # No monkeypatching needed: empty list short-circuits before any model.
        assert svc.embed_texts([]) == []

    def test_uses_local_model_when_no_openai(self, monkeypatch):
        svc = EmbeddingService()
        monkeypatch.setattr(type(svc), "openai_client",
                            property(lambda self: None))

        # Local model returns numpy-like rows exposing .tolist().
        fake_vectors = [SimpleNamespace(tolist=lambda: [0.1, 0.2]),
                        SimpleNamespace(tolist=lambda: [0.3, 0.4])]
        fake_model = MagicMock()
        fake_model.encode.return_value = fake_vectors
        monkeypatch.setattr(type(svc), "local_model",
                            property(lambda self: fake_model))

        out = svc.embed_texts(["a", "b"], batch_size=16)
        assert out == [[0.1, 0.2], [0.3, 0.4]]
        fake_model.encode.assert_called_once_with(["a", "b"], batch_size=16)

    def test_uses_openai_and_batches(self, monkeypatch):
        svc = EmbeddingService()

        captured_chunks = []

        def fake_create(input, model):
            captured_chunks.append(list(input))
            data = [SimpleNamespace(embedding=[float(len(t))]) for t in input]
            return SimpleNamespace(data=data)

        fake_client = SimpleNamespace(
            embeddings=SimpleNamespace(create=fake_create)
        )
        monkeypatch.setattr(type(svc), "openai_client",
                            property(lambda self: fake_client))

        texts = ["a", "bb", "ccc", "dddd", "eeeee"]
        out = svc.embed_texts(texts, batch_size=2)
        # 5 texts, batch_size 2 → chunks of [2, 2, 1].
        assert [len(c) for c in captured_chunks] == [2, 2, 1]
        # Returned in original order, one vector each.
        assert out == [[1.0], [2.0], [3.0], [4.0], [5.0]]

    def test_openai_preferred_over_local(self, monkeypatch):
        svc = EmbeddingService()
        fake_client = SimpleNamespace(
            embeddings=SimpleNamespace(
                create=lambda input, model: SimpleNamespace(
                    data=[SimpleNamespace(embedding=[9.0]) for _ in input]
                )
            )
        )
        monkeypatch.setattr(type(svc), "openai_client",
                            property(lambda self: fake_client))

        # If local_model were touched, this would raise.
        def _boom(self):  # pragma: no cover
            raise AssertionError("should not use local model when OpenAI present")

        monkeypatch.setattr(type(svc), "local_model", property(_boom))
        assert svc.embed_texts(["x"]) == [[9.0]]


# ---------------------------------------------------------------------------
# format_log_text
# ---------------------------------------------------------------------------

class TestFormatLogText:
    def test_full_entry(self):
        svc = EmbeddingService()
        out = svc.format_log_text({"sev": "error", "node": "/move_base", "text": "aborted"})
        assert out == "[ERROR] /move_base: aborted"

    def test_uppercases_severity(self):
        svc = EmbeddingService()
        out = svc.format_log_text({"sev": "warn", "node": "/x", "text": "y"})
        assert out.startswith("[WARN]")

    def test_defaults_when_fields_missing(self):
        svc = EmbeddingService()
        out = svc.format_log_text({})
        assert out == "[INFO] unknown: "
