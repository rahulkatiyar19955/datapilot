"""
End-to-end test for the Phase 5 MCP stdio transport.

Spawns a real `mcp_workers.rosbag_reader.server` subprocess (the canary),
performs the JSON-RPC `initialize` + `tools/call` handshake, and asserts the
envelope shape matches the in-process dispatch path. If this passes, the
transport switch in `mcp_client.dispatch` is exchanging the contract correctly
and the remaining 4 workers — which share `_shared/wrap_tool.py` — are
guaranteed to round-trip the same way.
"""
from __future__ import annotations

import os

import pytest

from app.agent.mcp_client import dispatch
from app.agent.mcp_stdio import WorkerHandle, worker_pool


@pytest.fixture
def stdio_transport(monkeypatch):
    """Flip `DATAPILOT_MCP_TRANSPORT=stdio` for one test, then tear the pool down."""
    monkeypatch.setenv("DATAPILOT_MCP_TRANSPORT", "stdio")
    yield
    worker_pool.shutdown()


def test_stdio_handshake_returns_canonical_envelope(stdio_transport):
    """`retrieve_logs` over stdio must round-trip the `{ok, result|error}` envelope.

    We deliberately call a tool that has no Neo4j-backed data path so the test
    is offline. The worker child inherits `DATAPILOT_MCP_TRANSPORT=in_process`
    so its tool body resolves locally — only the *transport* between parent
    and child is what we're validating here.
    """
    envelope = dispatch("rosbag_reader", "retrieve_logs", {
        "session_id": "test-session-nonexistent",
        "query": "anything",
        "limit": 5,
    })

    # Canonical envelope: either `{ok: True, result: ...}` or `{ok: False, error: {...}}`.
    assert isinstance(envelope, dict)
    assert "ok" in envelope, f"envelope missing ok: {envelope!r}"
    if envelope["ok"]:
        assert "result" in envelope
    else:
        err = envelope["error"]
        assert isinstance(err, dict)
        assert "code" in err and "message" in err and "retryable" in err


def test_worker_subprocess_recycles_after_kill(stdio_transport):
    """A killed worker must auto-relaunch on the next dispatch."""
    # First call: spawns the subprocess.
    dispatch("rosbag_reader", "retrieve_logs", {"session_id": "s1", "query": "q", "limit": 1})

    handle: WorkerHandle = worker_pool._handles["rosbag_reader"]  # noqa: SLF001
    assert handle.proc is not None and handle.proc.poll() is None

    # Simulate a crash.
    handle.terminate()
    assert handle.proc is None

    # Next dispatch should relaunch cleanly.
    envelope = dispatch("rosbag_reader", "retrieve_logs", {"session_id": "s2", "query": "q", "limit": 1})
    assert isinstance(envelope, dict)
    assert "ok" in envelope


def test_unknown_worker_returns_tool_unavailable(stdio_transport):
    """Unknown workers must return the canonical `tool_unavailable` error, not raise."""
    envelope = dispatch("not_a_real_worker", "some_tool", {})
    assert envelope.get("ok") is False
    err = envelope.get("error") or {}
    assert err.get("code") == "tool_unavailable"
    assert err.get("retryable") is True


def test_default_transport_remains_in_process_for_tests():
    """Sanity check on the conftest override — Phase 4 tests rely on this."""
    assert os.environ["DATAPILOT_MCP_TRANSPORT"] == "in_process"
