"""
Lightweight, env-gated shared-secret auth for the DataPilot backend (issue #64).

DataPilot is a local-first desktop app: the FastAPI service is only meant to be
reached by the Electron renderer over loopback. CORS (configured in ``main.py``)
is the always-on browser protection. This module adds a defense-in-depth token
check so that, when a secret is provisioned, even same-origin/non-browser callers
must present it.

Design notes:
  * The token is read from ``DATAPILOT_API_TOKEN`` **per request**, never cached
    at import time. This keeps tests and the dev flow working (unset => allow all)
    and lets the Electron main process set the secret at launch without a rebuild.
  * Health/readiness and the interactive docs/OpenAPI endpoints are exempt so the
    orchestrator's liveness probe and ``/docs`` keep working without a token.
  * Comparison uses :func:`secrets.compare_digest` to avoid timing side channels.
"""
from __future__ import annotations

import os
import secrets

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

#: Environment variable holding the shared secret. When unset, auth is disabled
#: (backward compatible with existing tests and the current dev flow).
API_TOKEN_ENV = "DATAPILOT_API_TOKEN"

#: Header carrying ``Bearer <token>`` credentials.
AUTHORIZATION_HEADER = "Authorization"

#: Alternative, simpler header carrying the raw token.
TOKEN_HEADER = "X-DataPilot-Token"

#: Exact paths that never require a token (liveness + service root).
_EXEMPT_PATHS: frozenset[str] = frozenset({"/", "/health"})

#: Path prefixes that never require a token (interactive docs + OpenAPI schema).
_EXEMPT_PREFIXES: tuple[str, ...] = ("/docs", "/redoc", "/openapi")


def _expected_token() -> str | None:
    """Return the configured token, or ``None`` when auth is disabled.

    Read fresh from the environment on every call so the value is never frozen
    at import time. An empty/whitespace-only value is treated as unset.
    """
    raw = os.environ.get(API_TOKEN_ENV)
    if raw is None:
        return None
    token = raw.strip()
    return token or None


def _is_exempt(path: str) -> bool:
    """True for health/readiness and docs/openapi paths (no token required)."""
    if path in _EXEMPT_PATHS:
        return True
    return any(path == p or path.startswith(p) for p in _EXEMPT_PREFIXES)


def _presented_token(request: Request) -> str | None:
    """Extract a caller-supplied token from either supported header."""
    auth = request.headers.get(AUTHORIZATION_HEADER)
    if auth:
        scheme, _, credentials = auth.partition(" ")
        if scheme.lower() == "bearer" and credentials.strip():
            return credentials.strip()
    direct = request.headers.get(TOKEN_HEADER)
    if direct and direct.strip():
        return direct.strip()
    return None


class APITokenMiddleware(BaseHTTPMiddleware):
    """Reject requests lacking a valid shared secret when one is configured.

    No-op when ``DATAPILOT_API_TOKEN`` is unset. CORS preflight requests
    (``OPTIONS``) and the exempt health/docs paths always pass through so the
    browser preflight and the orchestrator probe are never blocked.
    """

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        expected = _expected_token()

        # Auth disabled (default) -> behave exactly as before.
        if expected is None:
            return await call_next(request)

        # Never gate CORS preflight; the browser sends it without credentials.
        if request.method == "OPTIONS":
            return await call_next(request)

        # Health/readiness and docs/openapi stay open even when a token is set.
        if _is_exempt(request.url.path):
            return await call_next(request)

        presented = _presented_token(request)
        if presented is None or not secrets.compare_digest(presented, expected):
            return JSONResponse(
                status_code=401,
                content={"detail": "Invalid or missing API token."},
                headers={"WWW-Authenticate": "Bearer"},
            )

        return await call_next(request)
