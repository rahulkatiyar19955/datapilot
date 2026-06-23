"""Unit coverage for the OpenAI / NIM message + tool mapping helpers.

`_to_openai_messages` and `_to_openai_tools` are pure functions that translate
DataPilot's provider-agnostic `Message` / `ToolDef` shapes into the OpenAI Chat
Completions wire format. They are the ideal unit-test target — no SDK, no I/O.

NOTE: these helpers are duplicated verbatim across `openai_client.py` and
`nim_client.py`. The two implementations are byte-for-byte identical today; a
parametrized fixture runs every case against BOTH so the duplication can't drift
silently. (Worth extracting into one shared module — flagged for follow-up.)
"""
from __future__ import annotations

import json

import pytest

from app.llm import openai_client, nim_client


# Run every mapping assertion against both duplicated implementations.
@pytest.fixture(params=["openai", "nim"])
def mod(request):
    return openai_client if request.param == "openai" else nim_client


# ── _to_openai_tools ───────────────────────────────────────────────────────


def test_to_openai_tools_wraps_function_schema(mod):
    tools = [
        {
            "name": "read_logs",
            "description": "Read log lines for a session",
            "parameters": {
                "type": "object",
                "properties": {"session_id": {"type": "string"}},
                "required": ["session_id"],
            },
        }
    ]
    out = mod._to_openai_tools(tools)
    assert out == [
        {
            "type": "function",
            "function": {
                "name": "read_logs",
                "description": "Read log lines for a session",
                "parameters": {
                    "type": "object",
                    "properties": {"session_id": {"type": "string"}},
                    "required": ["session_id"],
                },
            },
        }
    ]


def test_to_openai_tools_empty_list(mod):
    assert mod._to_openai_tools([]) == []


def test_to_openai_tools_preserves_order_and_count(mod):
    tools = [
        {"name": "a", "description": "da", "parameters": {}},
        {"name": "b", "description": "db", "parameters": {}},
        {"name": "c", "description": "dc", "parameters": {}},
    ]
    out = mod._to_openai_tools(tools)
    assert [t["function"]["name"] for t in out] == ["a", "b", "c"]
    assert all(t["type"] == "function" for t in out)


# ── _to_openai_messages: system prefixing ──────────────────────────────────


def test_messages_always_prefixed_with_system(mod):
    out = mod._to_openai_messages("you are helpful", [])
    assert out[0] == {"role": "system", "content": "you are helpful"}
    assert len(out) == 1


def test_messages_drops_inline_system_role(mod):
    # An inbound system-role message is discarded; only the `system` arg becomes
    # the system message.
    msgs = [
        {"role": "system", "content": "ignored inline system"},
        {"role": "user", "content": "hi"},
    ]
    out = mod._to_openai_messages("real system", msgs)
    assert out[0] == {"role": "system", "content": "real system"}
    assert out[1] == {"role": "user", "content": "hi"}
    assert len(out) == 2


# ── _to_openai_messages: plain user/assistant ──────────────────────────────


def test_user_and_assistant_messages_mapped(mod):
    msgs = [
        {"role": "user", "content": "what happened?"},
        {"role": "assistant", "content": "the lidar dropped out"},
    ]
    out = mod._to_openai_messages("sys", msgs)
    assert out[1] == {"role": "user", "content": "what happened?"}
    assert out[2] == {"role": "assistant", "content": "the lidar dropped out"}


def test_missing_content_defaults_to_empty_string(mod):
    msgs = [{"role": "user"}]  # no content key
    out = mod._to_openai_messages("sys", msgs)
    assert out[1] == {"role": "user", "content": ""}


# ── _to_openai_messages: assistant with tool calls ─────────────────────────


def test_assistant_tool_calls_serialized(mod):
    msgs = [
        {
            "role": "assistant",
            "content": "let me check",
            "tool_calls": [
                {"id": "call_1", "name": "read_logs", "arguments": {"session_id": "s1", "limit": 5}},
            ],
        }
    ]
    out = mod._to_openai_messages("sys", msgs)
    assistant = out[1]
    assert assistant["role"] == "assistant"
    assert assistant["content"] == "let me check"
    tc = assistant["tool_calls"][0]
    assert tc["id"] == "call_1"
    assert tc["type"] == "function"
    assert tc["function"]["name"] == "read_logs"
    # Arguments are JSON-encoded strings on the wire.
    assert json.loads(tc["function"]["arguments"]) == {"session_id": "s1", "limit": 5}


def test_assistant_tool_call_empty_content_becomes_none(mod):
    msgs = [
        {
            "role": "assistant",
            "content": "",  # falsy -> coerced to None per `m.get("content") or None`
            "tool_calls": [{"id": "c", "name": "f", "arguments": {}}],
        }
    ]
    out = mod._to_openai_messages("sys", msgs)
    assert out[1]["content"] is None


def test_assistant_tool_call_missing_content_is_none(mod):
    msgs = [
        {
            "role": "assistant",
            "tool_calls": [{"id": "c", "name": "f", "arguments": {"x": 1}}],
        }
    ]
    out = mod._to_openai_messages("sys", msgs)
    assert out[1]["content"] is None
    assert json.loads(out[1]["tool_calls"][0]["function"]["arguments"]) == {"x": 1}


def test_assistant_multiple_tool_calls(mod):
    msgs = [
        {
            "role": "assistant",
            "content": None,
            "tool_calls": [
                {"id": "c1", "name": "f1", "arguments": {"a": 1}},
                {"id": "c2", "name": "f2", "arguments": {"b": 2}},
            ],
        }
    ]
    out = mod._to_openai_messages("sys", msgs)
    ids = [tc["id"] for tc in out[1]["tool_calls"]]
    assert ids == ["c1", "c2"]


def test_assistant_without_tool_calls_treated_as_plain(mod):
    # tool_calls absent -> falls through to the plain-message branch.
    msgs = [{"role": "assistant", "content": "plain reply"}]
    out = mod._to_openai_messages("sys", msgs)
    assert out[1] == {"role": "assistant", "content": "plain reply"}
    assert "tool_calls" not in out[1]


# ── _to_openai_messages: tool replies ──────────────────────────────────────


def test_tool_reply_mapped_with_tool_call_id(mod):
    msgs = [
        {"role": "tool", "tool_call_id": "call_1", "content": '{"ok": true}', "name": "read_logs"},
    ]
    out = mod._to_openai_messages("sys", msgs)
    assert out[1] == {
        "role": "tool",
        "tool_call_id": "call_1",
        "content": '{"ok": true}',
    }


def test_tool_reply_missing_content_defaults_empty(mod):
    msgs = [{"role": "tool", "tool_call_id": "call_9"}]
    out = mod._to_openai_messages("sys", msgs)
    assert out[1] == {"role": "tool", "tool_call_id": "call_9", "content": ""}


# ── full multi-turn conversation ───────────────────────────────────────────


def test_full_tool_use_roundtrip(mod):
    msgs = [
        {"role": "user", "content": "diagnose the failure"},
        {
            "role": "assistant",
            "content": None,
            "tool_calls": [{"id": "t1", "name": "read_logs", "arguments": {"session_id": "s"}}],
        },
        {"role": "tool", "tool_call_id": "t1", "content": "log lines..."},
        {"role": "assistant", "content": "root cause found"},
    ]
    out = mod._to_openai_messages("system prompt", msgs)
    roles = [m["role"] for m in out]
    assert roles == ["system", "user", "assistant", "tool", "assistant"]
    assert out[2]["tool_calls"][0]["function"]["name"] == "read_logs"
    assert out[3]["tool_call_id"] == "t1"
    assert out[4] == {"role": "assistant", "content": "root cause found"}


def test_openai_and_nim_helpers_are_equivalent():
    """Belt-and-braces: the two duplicated implementations produce identical
    output for the same input (so we'd catch a drift between them)."""
    system = "sys"
    msgs = [
        {"role": "user", "content": "hi"},
        {
            "role": "assistant",
            "content": None,
            "tool_calls": [{"id": "x", "name": "f", "arguments": {"k": "v"}}],
        },
        {"role": "tool", "tool_call_id": "x", "content": "done"},
    ]
    tools = [{"name": "f", "description": "d", "parameters": {"type": "object"}}]
    assert openai_client._to_openai_messages(system, msgs) == nim_client._to_openai_messages(system, msgs)
    assert openai_client._to_openai_tools(tools) == nim_client._to_openai_tools(tools)
