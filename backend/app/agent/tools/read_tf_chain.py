"""Return the TF frame parent/child relationships for the session."""
from __future__ import annotations

from typing import Any

from app.services.neo4j_client import neo4j_client

WORKER = "rosbag_reader"
NAME = "read_tf_chain"
DESCRIPTION = "Return the TF frame hierarchy (parent → child relationships) for the session."

INPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {"session_id": {"type": "string"}},
    "required": ["session_id"],
}

OUTPUT_SCHEMA: dict[str, Any] = {"type": "array"}


def run(args: dict[str, Any]) -> dict[str, Any]:
    cypher = """
    MATCH (f:Frame {session_id: $session_id})-[:CHILD_OF]->(p:Frame {session_id: $session_id})
    RETURN f.name AS child, p.name AS parent
    """
    try:
        results = neo4j_client.run_query(cypher, {"session_id": args["session_id"]})
        return {"ok": True, "result": results}
    except Exception as exc:
        return {"ok": False, "error": {"code": "neo4j_failed", "message": str(exc), "retryable": True}}
