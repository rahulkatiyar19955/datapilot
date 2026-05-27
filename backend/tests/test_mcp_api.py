"""
Tests for `/api/mcp/servers` and `/api/mcp/servers/{id}/toggle` (Phase 5).

The endpoint surfaces the 5 workers to the Agents & MCP screen. No workers
are running during tests, so we expect every entry to report `disconnected`
with `tools: 0` — the contract under test is the shape, the count, and the
toggle mutation, not the live health state (that's the transport test's job).
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_list_servers_returns_five_entries():
    resp = client.get("/api/mcp/servers")
    assert resp.status_code == 200
    body = resp.json()

    assert isinstance(body, list)
    assert len(body) == 5

    ids = {entry["id"] for entry in body}
    assert ids == {
        "rosbag_reader",
        "trajectory_analyzer",
        "planner_failure_inspector",
        "anomaly_detector",
        "report_composer",
    }

    for entry in body:
        # Contract the renderer relies on.
        assert entry["transport"] == "stdio"
        assert "name" in entry and isinstance(entry["name"], str)
        assert "status" in entry
        assert "tools" in entry and isinstance(entry["tools"], int)
        assert "enabled" in entry
        assert "calls_7d" in entry
        assert "last_error" in entry  # nullable but must be present


def test_toggle_flips_enabled_flag():
    # Capture starting state so we can leave the world clean for sibling tests.
    initial = {e["id"]: e["enabled"] for e in client.get("/api/mcp/servers").json()}
    started_enabled = initial["rosbag_reader"]

    resp = client.post("/api/mcp/servers/rosbag_reader/toggle")
    assert resp.status_code == 200
    body = resp.json()
    assert body == {"id": "rosbag_reader", "enabled": not started_enabled}

    # Status should reflect the toggle (disabled when not enabled).
    listing = client.get("/api/mcp/servers").json()
    rosbag = next(e for e in listing if e["id"] == "rosbag_reader")
    assert rosbag["enabled"] == (not started_enabled)
    if not rosbag["enabled"]:
        assert rosbag["status"] == "disabled"

    # Flip back so other tests in this module see the default.
    client.post("/api/mcp/servers/rosbag_reader/toggle")


def test_toggle_unknown_worker_returns_404():
    resp = client.post("/api/mcp/servers/not_a_worker/toggle")
    assert resp.status_code == 404
