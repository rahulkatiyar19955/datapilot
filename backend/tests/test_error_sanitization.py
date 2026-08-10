"""Error responses must never leak raw exception strings (issue #63).

Exception text routinely embeds internal bolt URIs, worker hosts, and file
paths. The SSE chat error events, the MCP health probe, and a global handler
must all emit a fixed, sanitized shape with a correlation id instead.
"""
from __future__ import annotations

import asyncio
import json

from unittest.mock import AsyncMock, MagicMock


SECRET = "bolt://neo4j:supersecret@10.0.0.5:7687"


# ── global exception handler (main.py) ───────────────────────────────────────


def test_global_handler_returns_sanitized_shape():
    from app.main import internal_error_handler

    req = MagicMock()
    req.url.path = "/api/sessions/x/chat"
    req.method = "POST"

    resp = asyncio.run(internal_error_handler(req, RuntimeError(SECRET)))
    assert resp.status_code == 500
    body = json.loads(resp.body)
    assert body["error"] == "internal_error"
    assert isinstance(body["correlation_id"], str) and body["correlation_id"]
    # The raw exception text must not appear anywhere in the response.
    assert SECRET not in resp.body.decode()


# ── chat SSE error events (chat.py) ──────────────────────────────────────────


def test_chat_error_event_is_sanitized():
    from app.api.chat import _error_event

    frame = _error_event("graph_error", RuntimeError(SECRET), recoverable=False)
    assert frame["event"] == "error"
    data = json.loads(frame["data"])
    assert data["code"] == "graph_error"
    assert data["recoverable"] is False
    assert "correlation_id" in data and data["correlation_id"]
    # Generic, key-free message; no raw exception text.
    assert SECRET not in frame["data"]
    assert SECRET not in data["message"]


# ── MCP health probe (mcp.py) ────────────────────────────────────────────────


def test_probe_health_does_not_leak_exception_text():
    from app.api import mcp

    client = MagicMock()
    client.get = AsyncMock(side_effect=RuntimeError(SECRET))

    out = asyncio.run(mcp._probe_health(client, "rosbag_reader"))
    assert out["status"] == "error"
    # last_error must be a fixed string, never the raw exception text.
    assert out["last_error"] is None or SECRET not in str(out["last_error"])
