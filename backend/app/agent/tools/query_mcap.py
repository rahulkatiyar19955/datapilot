"""
query_mcap — read-only DuckDB SQL over the session's raw MCAP rosbag file.

Complements the Neo4j-backed tools (which only see the ingested summary) by
letting specialists run ad-hoc SQL against the *raw* MCAP file via the bundled
DuckDB `mcap` extension. Use this when you need message-level detail the session
graph doesn't capture (exact payload fields, per-message timestamps, arbitrary
aggregation over a topic).

Available table functions (reference the file with the literal token
`'{mcap_path}'` — it is substituted with the session's MCAP path automatically):

  mcap_scan('{mcap_path}')      -> timestamp, topic, schema, payload_blob,
                                   schema_name, payload_json
  mcap_topics('{mcap_path}')    -> topic, type, count, start, end
  mcap_channels('{mcap_path}')  -> id, topic, schema_id, message_encoding
  mcap_schemas('{mcap_path}')   -> id, name, encoding, data
  rosout('{mcap_path}')         -> timestamp, severity, node, message

`payload_json` is decoded JSON (protobuf / ROS2 cdr / json encodings). Extract
fields with DuckDB JSON paths, e.g. `payload_json->>'$.header.frame_id'`.

Example:
  SELECT topic, count(*) AS n
  FROM mcap_scan('{mcap_path}')
  WHERE topic = '/odom'
  GROUP BY topic
"""
from __future__ import annotations

import json
import os
import platform
import re
import sqlite3
from functools import lru_cache
from typing import Any

from app.config import settings
from app.services.parser import _resolve_path

WORKER = "rosbag_reader"
NAME = "query_mcap"
DESCRIPTION = (
    "Run a read-only DuckDB SQL query against the session's raw MCAP rosbag file. "
    "Use for message-level detail beyond the Neo4j summary (exact payload fields, "
    "per-message timestamps, custom aggregation). Reference the file with the literal "
    "token '{mcap_path}' — it is substituted automatically. Table functions:\n"
    " - mcap_scan('{mcap_path}') -> timestamp, topic, schema, payload_blob, schema_name, payload_json\n"
    " - mcap_topics('{mcap_path}') -> topic, type, count, start, end\n"
    " - mcap_channels('{mcap_path}') -> id, topic, schema_id, message_encoding\n"
    " - mcap_schemas('{mcap_path}') -> id, name, encoding, data\n"
    " - rosout('{mcap_path}') -> timestamp, severity, node, message\n"
    "payload_json is decoded JSON; extract fields with paths like "
    "payload_json->>'$.header.frame_id'. "
    "Example: SELECT topic, count(*) AS n FROM mcap_scan('{mcap_path}') "
    "WHERE topic = '/odom' GROUP BY topic"
)

INPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "session_id": {"type": "string"},
        "sql": {
            "type": "string",
            "description": (
                "Read-only DuckDB SQL. Reference the MCAP file with the literal "
                "token '{mcap_path}'."
            ),
        },
        "limit": {
            "type": "integer",
            "default": 100,
            "minimum": 1,
            "maximum": 500,
            "description": "Max rows to return (applied as LIMIT if not already present).",
        },
    },
    "required": ["session_id", "sql"],
}

OUTPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "ok": {"type": "boolean"},
        "result": {"type": "array"},
    },
}

# Statements/keywords that must never appear in a query submitted to this tool.
# DuckDB-specific dangerous verbs (ATTACH/COPY/INSTALL/LOAD/PRAGMA/SET/EXPORT)
# are blocked alongside the usual write/DDL set.
_WRITE_PATTERN = re.compile(
    r"\b(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|REPLACE|TRUNCATE|MERGE|GRANT|REVOKE"
    r"|ATTACH|DETACH|COPY|INSTALL|LOAD|PRAGMA|SET|RESET|EXPORT|IMPORT|CALL|VACUUM)\b",
    re.IGNORECASE,
)

_MCAP_TOKEN = "{mcap_path}"


def _error(code: str, message: str, retryable: bool) -> dict[str, Any]:
    return {"ok": False, "error": {"code": code, "message": message, "retryable": retryable}}


@lru_cache(maxsize=1)
def _extension_path() -> str | None:
    """Locate the vendored mcap.duckdb_extension for the current platform.

    Layout: backend/app/vendor/mcap/<platform>/mcap.duckdb_extension where
    <platform> is one of linux_amd64, linux_arm64, osx_arm64, osx_amd64.
    """
    system = platform.system().lower()
    machine = platform.machine().lower()
    sys_key = {"linux": "linux", "darwin": "osx"}.get(system, system)
    arch_key = {
        "x86_64": "amd64",
        "amd64": "amd64",
        "aarch64": "arm64",
        "arm64": "arm64",
    }.get(machine, machine)
    plat = f"{sys_key}_{arch_key}"

    # __file__ = backend/app/agent/tools/query_mcap.py → app/ is three levels up.
    app_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    candidate = os.path.join(app_dir, "vendor", "mcap", plat, "mcap.duckdb_extension")
    if os.path.exists(candidate):
        return candidate
    return None


def _lookup_filepath(session_id: str) -> str | None:
    """Read SessionRecord.filepath synchronously (this tool runs in a sync context
    that may itself be inside an event loop, so avoid the async ORM here)."""
    db_path = os.path.abspath(os.path.join(settings.datapilot_data_dir, "db.sqlite"))
    if not os.path.exists(db_path):
        return None
    con = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    try:
        row = con.execute(
            "SELECT filepath FROM sessions WHERE id = ?", (session_id,)
        ).fetchone()
    except sqlite3.Error:
        return None
    finally:
        con.close()
    return row[0] if row else None


def _serialize_cell(value: Any) -> Any:
    """Make a DuckDB cell JSON-serializable for the tool envelope."""
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, (bytes, bytearray, memoryview)):
        return f"<{len(bytes(value))} bytes>"
    if isinstance(value, (list, dict)):
        return value
    return str(value)


def run(args: dict[str, Any]) -> dict[str, Any]:
    session_id: str = args["session_id"]
    sql: str = (args.get("sql") or "").strip()
    limit: int = int(args.get("limit", 100))

    if not sql:
        return _error("missing_sql", "sql is required", False)

    if _WRITE_PATTERN.search(sql):
        return _error(
            "write_blocked",
            "Only read-only SELECT queries are allowed. Remove write/DDL/ATTACH/COPY/"
            "INSTALL/LOAD/PRAGMA/SET statements.",
            False,
        )

    if _MCAP_TOKEN not in sql:
        return _error(
            "missing_mcap_token",
            "Reference the MCAP file using the literal token '{mcap_path}', e.g. "
            "SELECT * FROM mcap_topics('{mcap_path}').",
            False,
        )

    # Resolve the MCAP path for this session.
    filepath = _lookup_filepath(session_id)
    if not filepath:
        return _error("session_not_found", f"No MCAP file for session {session_id}", False)
    resolved = _resolve_path(filepath)
    if not os.path.exists(resolved):
        return _error(
            "file_unavailable",
            f"MCAP file not accessible at {resolved}",
            True,
        )

    # Locate the bundled extension.
    ext_path = _extension_path()
    if not ext_path:
        return _error(
            "extension_unavailable",
            f"No mcap DuckDB extension bundled for platform "
            f"{platform.system()}/{platform.machine()}",
            False,
        )

    # Substitute the path token (single-quote-escaped for the SQL literal) and
    # append a LIMIT when the query doesn't already constrain its output.
    safe_path = resolved.replace("'", "''")
    final_sql = sql.replace(_MCAP_TOKEN, safe_path).rstrip().rstrip(";")
    if not re.search(r"\bLIMIT\b", final_sql, re.IGNORECASE):
        final_sql = f"{final_sql}\nLIMIT {limit}"

    try:
        import duckdb
    except ImportError as exc:
        return _error("duckdb_unavailable", f"duckdb not installed: {exc}", False)

    try:
        # allow_unsigned_extensions is a startup-time setting — it must be passed
        # to connect(config=...); it cannot be changed with SET after the database
        # is running.
        con = duckdb.connect(database=":memory:", config={"allow_unsigned_extensions": "true"})
        try:
            con.load_extension(ext_path)
            con.load_extension("json")
            cursor = con.execute(final_sql)
            columns = [d[0] for d in cursor.description] if cursor.description else []
            rows = [
                {col: _serialize_cell(val) for col, val in zip(columns, record)}
                for record in cursor.fetchall()
            ]
        finally:
            con.close()
    except Exception as exc:
        return _error("duckdb_failed", str(exc), True)

    return {"ok": True, "result": rows}
