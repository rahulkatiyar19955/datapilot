"""
query_graph — general-purpose read-only Cypher tool for session graph exploration.

Gives specialists full read access to the Neo4j session graph so they can answer
questions about any bag, including bags that have no /rosout log messages.

Node labels:  Session, Log, Topic, Anomaly, Frame
Relationships:
  (Session)-[:HAS_LOG]->(Log)
  (Session)-[:HAS_TOPIC]->(Topic)
  (Session)-[:HAS_ANOMALY]->(Anomaly)
  (Frame {session_id})-[:CHILD_OF]->(Frame {session_id})

session_id is always injected into params automatically — queries MUST reference
$session_id in their MATCH/WHERE clause to scope results to this session.
"""
from __future__ import annotations

import re
from typing import Any

from app.services.neo4j_client import neo4j_client

WORKER = "rosbag_reader"
NAME = "query_graph"
DESCRIPTION = (
    "Run a read-only Cypher query against the Neo4j session graph. "
    "Always include $session_id in your MATCH/WHERE clause. "
    "Node labels: Session, Log, Topic, Anomaly, Frame. "
    "Rels: (Session)-[:HAS_LOG]->(Log), (Session)-[:HAS_TOPIC]->(Topic), "
    "(Session)-[:HAS_ANOMALY]->(Anomaly), (Frame)-[:CHILD_OF]->(Frame). "
    "Example — list all topics: "
    "MATCH (s:Session {id: $session_id})-[:HAS_TOPIC]->(t:Topic) "
    "RETURN t.name AS name, t.type AS type, t.hz AS hz, t.total_messages AS msgs "
    "ORDER BY t.total_messages DESC"
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

# Write-operation keywords that must never appear in a query submitted to this tool.
_WRITE_PATTERN = re.compile(
    r"\b(CREATE|MERGE|SET|DELETE|REMOVE|DROP|DETACH|CALL\s+apoc\.)\b",
    re.IGNORECASE,
)


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
                "message": "Only read-only Cypher is allowed. Remove CREATE/MERGE/SET/DELETE/REMOVE/DROP.",
                "retryable": False,
            },
        }

    # Append LIMIT if the query doesn't already have one.
    if not re.search(r"\bLIMIT\b", cypher, re.IGNORECASE):
        cypher = f"{cypher}\nLIMIT {limit}"

    params = {**extra_params, "session_id": session_id}

    try:
        rows = neo4j_client.run_query(cypher, params)
        return {"ok": True, "result": rows}
    except Exception as exc:
        return {
            "ok": False,
            "error": {"code": "neo4j_failed", "message": str(exc), "retryable": True},
        }
