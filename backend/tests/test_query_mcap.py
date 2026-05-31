"""Tests for the query_mcap tool (read-only DuckDB SQL over a session's MCAP).

These run with DATAPILOT_MCP_TRANSPORT=in_process (set in conftest) and a small
committed MCAP fixture. They are skipped automatically if no vendored mcap
extension exists for the current platform (e.g. CI on a platform we haven't
built a binary for yet).
"""
import asyncio
import os

import pytest

from app.agent.tools import query_mcap

FIXTURE = os.path.join(os.path.dirname(__file__), "fixtures", "mcap", "sample.mcap")

# Skip the whole module if we can't load the extension here (no binary for this
# platform) — the tool's behavior is still exercised by the write-block / token
# tests which don't reach DuckDB.
_EXT_AVAILABLE = query_mcap._extension_path() is not None


@pytest.fixture()
def session_id() -> str:
    """Insert a SessionRecord pointing at the MCAP fixture, return its id."""
    from app.db_sqlite import AsyncSessionLocal, init_db
    from app.models import SessionRecord

    sid = "test-mcap-session"

    async def _setup() -> None:
        await init_db()
        async with AsyncSessionLocal() as db:
            existing = await db.get(SessionRecord, sid)
            if existing is None:
                db.add(SessionRecord(id=sid, filename="sample.mcap", filepath=FIXTURE, status="ready"))
                await db.commit()

    asyncio.run(_setup())
    return sid


def test_missing_sql(session_id):
    res = query_mcap.run({"session_id": session_id, "sql": "   "})
    assert res["ok"] is False
    assert res["error"]["code"] == "missing_sql"


def test_write_blocked(session_id):
    res = query_mcap.run({"session_id": session_id, "sql": "DROP TABLE foo"})
    assert res["ok"] is False
    assert res["error"]["code"] == "write_blocked"


@pytest.mark.parametrize(
    "sql",
    [
        "SELECT * FROM read_csv('/etc/passwd')",
        "SELECT * FROM read_csv_auto('/etc/passwd')",
        "SELECT * FROM read_parquet('/secret.parquet')",
        "SELECT * FROM read_json('{mcap_path}')",
        "SELECT * FROM glob('/**')",
        "SELECT content FROM read_text('/proc/self/environ')",
    ],
)
def test_file_read_functions_blocked(session_id, sql):
    """DuckDB's generic file readers must be rejected (LFI / arbitrary file read)."""
    res = query_mcap.run({"session_id": session_id, "sql": sql})
    assert res["ok"] is False
    assert res["error"]["code"] == "write_blocked"


def test_missing_path_token(session_id):
    res = query_mcap.run({"session_id": session_id, "sql": "SELECT 1"})
    assert res["ok"] is False
    assert res["error"]["code"] == "missing_mcap_token"


def test_unknown_session():
    res = query_mcap.run({"session_id": "nope", "sql": "SELECT * FROM mcap_topics('{mcap_path}')"})
    assert res["ok"] is False
    assert res["error"]["code"] == "session_not_found"


@pytest.mark.skipif(not _EXT_AVAILABLE, reason="no vendored mcap extension for this platform")
def test_mcap_topics(session_id):
    res = query_mcap.run(
        {"session_id": session_id, "sql": "SELECT topic, count FROM mcap_topics('{mcap_path}') ORDER BY topic"}
    )
    assert res["ok"] is True, res
    topics = {row["topic"] for row in res["result"]}
    assert {"/odom", "/rosout"} <= topics


@pytest.mark.skipif(not _EXT_AVAILABLE, reason="no vendored mcap extension for this platform")
def test_payload_json_decode(session_id):
    res = query_mcap.run(
        {
            "session_id": session_id,
            "sql": "SELECT payload_json->>'$.severity' AS sev FROM mcap_scan('{mcap_path}') WHERE topic = '/rosout'",
        }
    )
    assert res["ok"] is True, res
    assert any(row.get("sev") == "ERROR" for row in res["result"])


@pytest.mark.skipif(not _EXT_AVAILABLE, reason="no vendored mcap extension for this platform")
def test_auto_limit_applied(session_id):
    # No LIMIT in the query, limit=1 should cap rows.
    res = query_mcap.run(
        {"session_id": session_id, "sql": "SELECT * FROM mcap_scan('{mcap_path}')", "limit": 1}
    )
    assert res["ok"] is True, res
    assert len(res["result"]) == 1


def test_registered_in_catalog():
    from app.agent.mcp_client import get_tool, llm_tool_defs

    assert get_tool("rosbag_reader", "query_mcap") is not None
    names = {d["name"] for d in llm_tool_defs(["rosbag_reader"])}
    assert "rosbag_reader__query_mcap" in names
