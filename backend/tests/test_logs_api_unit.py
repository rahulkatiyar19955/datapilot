"""Unit coverage for GET /sessions/{id}/logs hardening.

Covers:
- Vector search over-fetch before severity filter / pagination (issue #78).
- limit/offset query-param bounds + Lucene escaping (issue #67).

Reuses the in-memory-DB TestClient pattern; Neo4j is mocked process-wide by the
autouse `mock_neo4j` fixture, and `embedding_service` is stubbed so no real
model loads.
"""
from __future__ import annotations

import pytest
import pytest_asyncio
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.pool import StaticPool

from app.main import app as fastapi_app
from app.db_sqlite import Base, get_db
import app.api.sessions as sessions_mod
import app.models  # noqa: F401


@pytest_asyncio.fixture
async def db_client(monkeypatch):
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestSession = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async def _override_get_db():
        async with TestSession() as session:
            yield session

    fastapi_app.dependency_overrides[get_db] = _override_get_db

    async def _noop_ingestion(session_id, filepath):
        return None

    monkeypatch.setattr(sessions_mod, "run_ingestion", _noop_ingestion)

    client = TestClient(fastapi_app)
    try:
        yield client
    finally:
        fastapi_app.dependency_overrides.pop(get_db, None)
        await engine.dispose()


def _make_session(client) -> str:
    resp = client.post("/api/sessions/create", json={"filepath": "/abs/lidar_failure.mcap"})
    assert resp.status_code == 202
    return resp.json()["session_id"]


@pytest.fixture
def _stub_embeddings(monkeypatch):
    from app.services.embeddings import embedding_service
    monkeypatch.setattr(embedding_service, "get_embedding_dimension", lambda: 8)
    monkeypatch.setattr(embedding_service, "embed_texts", lambda texts: [[0.0] * 8 for _ in texts])


# ── #78: vector search over-fetch ────────────────────────────────────────────


def test_vector_search_overfetches_candidates_before_filter(db_client, _stub_embeddings):
    """The k-NN query must request MORE than limit+offset neighbours so the
    severity filter + pagination don't starve on wrong-severity top hits."""
    from app.services.neo4j_client import neo4j_client
    neo4j_client.run_query.reset_mock()
    neo4j_client.run_query.return_value = []

    sid = _make_session(db_client)
    resp = db_client.get(f"/api/sessions/{sid}/logs", params={"q": "boom", "limit": 10, "offset": 5})
    assert resp.status_code == 200

    cypher, params = neo4j_client.run_query.call_args[0]
    assert "queryNodes" in cypher
    # Over-fetch: strictly more than the naive limit+offset (=15).
    assert params["vector_limit"] > 15
    assert params["vector_limit"] == (10 + 5) * sessions_mod.VECTOR_OVERFETCH_FACTOR


# ── #67: limit / offset bounds ───────────────────────────────────────────────


def test_logs_rejects_oversized_limit(db_client):
    sid = _make_session(db_client)
    resp = db_client.get(f"/api/sessions/{sid}/logs", params={"limit": 100000})
    assert resp.status_code == 422


def test_logs_rejects_zero_limit(db_client):
    sid = _make_session(db_client)
    resp = db_client.get(f"/api/sessions/{sid}/logs", params={"limit": 0})
    assert resp.status_code == 422


def test_logs_rejects_negative_offset(db_client):
    sid = _make_session(db_client)
    resp = db_client.get(f"/api/sessions/{sid}/logs", params={"offset": -1})
    assert resp.status_code == 422


def test_logs_accepts_in_range_pagination(db_client):
    from app.services.neo4j_client import neo4j_client
    neo4j_client.run_query.return_value = []
    sid = _make_session(db_client)
    resp = db_client.get(f"/api/sessions/{sid}/logs", params={"limit": 500, "offset": 0})
    assert resp.status_code == 200


# ── #67: Lucene escaping ─────────────────────────────────────────────────────


class TestEscapeLucene:
    def test_escapes_special_characters(self):
        from app.api.sessions import _escape_lucene
        out = _escape_lucene('a+b -c (d) "e"')
        # Each special char is backslash-escaped.
        assert r"\+" in out
        assert r"\-" in out
        assert r"\(" in out
        assert r"\)" in out
        assert r"\"" in out

    def test_plain_text_unchanged(self):
        from app.api.sessions import _escape_lucene
        assert _escape_lucene("sensor dropout") == "sensor dropout"
