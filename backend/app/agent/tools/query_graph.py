"""
query_graph — general-purpose read-only Cypher tool for session graph exploration.

Gives specialists full read access to the Neo4j session graph so they can answer
questions about any bag, including bags that have no /rosout log messages.

Node labels and their properties:
  - Session: id, filename, robot_id, duration_s, started_at
  - Log: id, ts (timestamp string, format "HH:MM:SS.mmm"), severity, node, msg (log message text - NOT message), topic, type
  - Topic: name, type, hz, total_messages
  - Anomaly: id, ts (timestamp float), kind, severity, source_log_id, confidence, topic, label
  - Frame: name, session_id

Relationships:
  (Session)-[:HAS_LOG]->(Log)
  (Session)-[:HAS_TOPIC]->(Topic)
  (Session)-[:HAS_ANOMALY]->(Anomaly)
  (Frame {session_id})-[:CHILD_OF]->(Frame {session_id})

session_id is always injected into params automatically — queries MUST reference
$session_id in their MATCH/WHERE clause to scope results to this session.
"""
from __future__ import annotations

import os
import re
from typing import Any

from neo4j import Query

from app.services.neo4j_client import neo4j_client

WORKER = "rosbag_reader"
NAME = "query_graph"
DESCRIPTION = (
    "Run a read-only Cypher query against the Neo4j session graph. "
    "Always include $session_id in your MATCH/WHERE clause. "
    "Node labels and their properties:\n"
    " - Session: id, filename, robot_id, duration_s, started_at\n"
    " - Log: id, ts (timestamp string, format \"HH:MM:SS.mmm\"), severity, node, msg (log text - NOT message), topic, type\n"
    " - Topic: name, type, hz, total_messages\n"
    " - Anomaly: id, ts (timestamp float), kind, severity, source_log_id, confidence, topic, label\n"
    " - Frame: name, session_id\n"
    "Relationships:\n"
    " - (Session)-[:HAS_LOG]->(Log)\n"
    " - (Session)-[:HAS_TOPIC]->(Topic)\n"
    " - (Session)-[:HAS_ANOMALY]->(Anomaly)\n"
    " - (Frame)-[:CHILD_OF]->(Frame)\n"
    "Example — list recent logs: "
    "MATCH (s:Session {id: $session_id})-[:HAS_LOG]->(l:Log) "
    "RETURN l.id AS log_id, l.ts AS timestamp, l.severity AS severity, l.msg AS message "
    "LIMIT 10"
)

INPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "session_id": {"type": "string"},
        "cypher": {
            "type": "string",
            "description": "Read-only Cypher query. Must use $session_id parameter.",
        },
        "params": {
            "type": "object",
            "description": "Extra query parameters. session_id is injected automatically.",
            "default": {},
        },
        "limit": {
            "type": "integer",
            "default": 100,
            "minimum": 1,
            "maximum": 500,
            "description": "Max rows to return (applied as LIMIT if not already present).",
        },
    },
    "required": ["session_id", "cypher"],
}

OUTPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "ok": {"type": "boolean"},
        "result": {"type": "array"},
    },
}

# Write/abuse constructs that must never appear in a query submitted to this tool.
# This is the prompt-injection enforcement boundary, so the blocklist mirrors the
# breadth of the sibling query_mcap tool:
#   - write/DDL verbs: CREATE/MERGE/SET/DELETE/REMOVE/DROP/DETACH
#   - procedure calls into the apoc / db.* / dbms.* namespaces (schema/internals
#     enumeration, write procedures, config disclosure)
#   - LOAD CSV (bulk file ingestion / SSRF)
#   - CALL { ... } IN TRANSACTIONS (subquery transactions — a write/abuse vector)
# `\b` word boundaries keep legitimate read substrings working (e.g. a property
# named `created_at` won't match `CREATE`), while the procedure-call and
# multi-word forms are matched explicitly.
_WRITE_PATTERN = re.compile(
    r"\b(CREATE|MERGE|SET|DELETE|REMOVE|DROP|DETACH"
    r"|LOAD\s+CSV"
    r"|IN\s+TRANSACTIONS"
    r"|CALL\s+apoc\."
    r"|CALL\s+db\."
    r"|CALL\s+dbms\.)\b",
    re.IGNORECASE,
)

# Server-side per-query transaction timeout (seconds). Configurable via env var
# with a safe default so a single read can't run past the latency budget; the
# driver aborts the transaction server-side when this elapses.
def _query_timeout_s() -> float:
    raw = os.environ.get("QUERY_GRAPH_TIMEOUT_S", "10")
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return 10.0
    return value if value > 0 else 10.0


def run(args: dict[str, Any]) -> dict[str, Any]:
    session_id: str = args["session_id"]
    cypher: str = args.get("cypher", "").strip()
    extra_params: dict = args.get("params") or {}
    limit: int = int(args.get("limit", 100))

    if not cypher:
        return {"ok": False, "error": {"code": "missing_cypher", "message": "cypher is required", "retryable": False}}

    if _WRITE_PATTERN.search(cypher):
        return {
            "ok": False,
            "error": {
                "code": "write_blocked",
                "message": (
                    "Only read-only Cypher is allowed. Remove write/DDL verbs "
                    "(CREATE/MERGE/SET/DELETE/REMOVE/DROP/DETACH), LOAD CSV, "
                    "CALL { ... } IN TRANSACTIONS, and apoc./db./dbms. procedure calls."
                ),
                "retryable": False,
            },
        }

    # Append LIMIT if the query doesn't already have one. Strip any trailing
    # semicolon first so appending the LIMIT clause can't produce a syntax error.
    cypher = cypher.rstrip().rstrip(";")
    if not re.search(r"\bLIMIT\b", cypher, re.IGNORECASE):
        cypher = f"{cypher}\nLIMIT {limit}"

    params = {**extra_params, "session_id": session_id}

    # Wrap the text in a neo4j.Query carrying a server-side transaction timeout so
    # a single read can't run past the latency budget — the driver aborts the
    # transaction server-side when it elapses. str(Query) is the text, so any
    # downstream string handling in the client still works.
    query = Query(cypher, timeout=_query_timeout_s())

    try:
        rows = neo4j_client.run_query(query, params)
        # Cap the returned rows even if the query slipped past the textual LIMIT
        # check (literal "LIMIT" in a string, subquery, …) so a single query can
        # never return an unbounded set into memory.
        if isinstance(rows, list) and len(rows) > limit:
            rows = rows[:limit]
        return {"ok": True, "result": rows}
    except Exception as exc:
        return {
            "ok": False,
            "error": {"code": "neo4j_failed", "message": str(exc), "retryable": True},
        }
