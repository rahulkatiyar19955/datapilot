"""MCP-shaped dispatcher contract tests."""
from __future__ import annotations

from app.agent.mcp_client import dispatch, get_tool, list_tools, llm_tool_defs, parse_tool_name


def test_unknown_tool_returns_tool_unavailable():
    out = dispatch("nope", "alsonope", {})
    assert out["ok"] is False
    assert out["error"]["code"] == "tool_unavailable"
    assert out["error"]["retryable"] is False


def test_known_stub_returns_ok_empty():
    # `find_statistical_outliers` is a stub returning {ok: True, result: []}
    out = dispatch("anomaly_detector", "find_statistical_outliers", {"session_id": "X"})
    assert out["ok"] is True
    assert out["result"] == []


def test_list_tools_includes_retrieve_logs():
    names = {(d["worker"], d["name"]) for d in list_tools()}
    assert ("rosbag_reader", "retrieve_logs") in names
    assert ("planner_failure_inspector", "query_causal_chain") in names


def test_get_tool_returns_descriptor():
    desc = get_tool("rosbag_reader", "retrieve_logs")
    assert desc is not None
    assert "session_id" in desc["input_schema"]["properties"]


def test_llm_tool_defs_uses_double_underscore_qualified_name():
    defs = llm_tool_defs(worker_subset=["rosbag_reader"])
    assert any(d["name"] == "rosbag_reader__retrieve_logs" for d in defs)
    # Reverse-parse round-trips.
    worker, name = parse_tool_name("rosbag_reader__retrieve_logs")
    assert worker == "rosbag_reader"
    assert name == "retrieve_logs"
