"""
Security tests for issue #64 — CORS restriction + env-gated API token auth.

Two independent protections live in ``app.main`` / ``app.auth``:

  1. CORS is restricted to the Electron renderer (loopback origins + file://),
     so an arbitrary web page (e.g. https://evil.com) cannot read API responses.
  2. A shared-secret token gate that is OFF unless ``DATAPILOT_API_TOKEN`` is set.
     When set, protected endpoints require the token; health/docs stay open.

These use FastAPI's TestClient (no real network). DB init + the Neo4j mock come
from the module-level fixture below and the autouse fixture in ``conftest.py``.
"""
from __future__ import annotations

import asyncio

import pytest
from fastapi.testclient import TestClient

from app.db_sqlite import init_db
from app.main import app

# A protected (non-exempt) endpoint: listing sessions hits the API surface that
# the token gate must guard. Resolves to GET /api/sessions.
PROTECTED_PATH = "/api/sessions"


@pytest.fixture(scope="module", autouse=True)
def setup_database():
    """Create the local SQLite schema once so protected endpoints can respond."""
    asyncio.run(init_db())


client = TestClient(app)


# ── CORS ────────────────────────────────────────────────────────────────────


def test_cors_does_not_allow_arbitrary_origin():
    """A cross-site request from evil.com must NOT be granted CORS access.

    Starlette's CORSMiddleware only emits access-control-allow-origin when the
    Origin matches the policy, and it never echoes a disallowed origin nor a
    wildcard here. So the header is either absent or, at minimum, not evil.com/*.
    """
    resp = client.get(
        PROTECTED_PATH,
        headers={"Origin": "https://evil.com"},
    )
    allow_origin = resp.headers.get("access-control-allow-origin")
    assert allow_origin != "*"
    assert allow_origin != "https://evil.com"
    assert allow_origin is None  # disallowed origin => no CORS grant at all


def test_cors_preflight_rejects_arbitrary_origin():
    """An OPTIONS preflight from evil.com must not be approved."""
    resp = client.options(
        PROTECTED_PATH,
        headers={
            "Origin": "https://evil.com",
            "Access-Control-Request-Method": "GET",
        },
    )
    allow_origin = resp.headers.get("access-control-allow-origin")
    assert allow_origin != "*"
    assert allow_origin != "https://evil.com"


def test_cors_allows_vite_dev_origin():
    """The Vite renderer origin (loopback) IS allowed."""
    resp = client.get(
        PROTECTED_PATH,
        headers={"Origin": "http://localhost:5173"},
    )
    assert resp.headers.get("access-control-allow-origin") == "http://localhost:5173"


def test_cors_preflight_allows_vite_dev_origin():
    """Preflight for the Vite renderer origin is approved with that origin echoed."""
    resp = client.options(
        PROTECTED_PATH,
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert resp.headers.get("access-control-allow-origin") == "http://localhost:5173"


def test_cors_allows_packaged_renderer_null_origin():
    """The packaged renderer loads from file:// and sends `Origin: null`."""
    resp = client.get(
        PROTECTED_PATH,
        headers={"Origin": "null"},
    )
    assert resp.headers.get("access-control-allow-origin") == "null"


# ── Token auth (env-gated) ───────────────────────────────────────────────────


def test_protected_endpoint_requires_token_when_env_set(monkeypatch):
    """With the token configured, a protected request WITHOUT it is rejected 401."""
    monkeypatch.setenv("DATAPILOT_API_TOKEN", "secret123")
    resp = client.get(PROTECTED_PATH)
    assert resp.status_code == 401


def test_protected_endpoint_accepts_bearer_token(monkeypatch):
    """With the correct Bearer token, the request is NOT rejected as unauthorized."""
    monkeypatch.setenv("DATAPILOT_API_TOKEN", "secret123")
    resp = client.get(
        PROTECTED_PATH,
        headers={"Authorization": "Bearer secret123"},
    )
    assert resp.status_code != 401


def test_protected_endpoint_accepts_x_token_header(monkeypatch):
    """The X-DataPilot-Token header is also accepted as a credential."""
    monkeypatch.setenv("DATAPILOT_API_TOKEN", "secret123")
    resp = client.get(
        PROTECTED_PATH,
        headers={"X-DataPilot-Token": "secret123"},
    )
    assert resp.status_code != 401


def test_protected_endpoint_rejects_wrong_token(monkeypatch):
    """A present-but-wrong token is rejected 401."""
    monkeypatch.setenv("DATAPILOT_API_TOKEN", "secret123")
    resp = client.get(
        PROTECTED_PATH,
        headers={"Authorization": "Bearer wrong-token"},
    )
    assert resp.status_code == 401


def test_health_works_without_token_when_env_set(monkeypatch):
    """Health/readiness stays open even when a token is configured."""
    monkeypatch.setenv("DATAPILOT_API_TOKEN", "secret123")
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_docs_and_openapi_exempt_when_env_set(monkeypatch):
    """Interactive docs + OpenAPI schema remain reachable without a token."""
    monkeypatch.setenv("DATAPILOT_API_TOKEN", "secret123")
    assert client.get("/openapi.json").status_code == 200
    assert client.get("/docs").status_code == 200


def test_auth_disabled_when_env_unset(monkeypatch):
    """Backward compatible: with no token configured, no auth is enforced."""
    monkeypatch.delenv("DATAPILOT_API_TOKEN", raising=False)
    resp = client.get(PROTECTED_PATH)
    assert resp.status_code != 401
