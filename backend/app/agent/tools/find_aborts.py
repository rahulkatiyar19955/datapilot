"""Find planner / controller abort events in the session."""
from __future__ import annotations

from typing import Any

from app.services.neo4j_client import neo4j_client

WORKER = "planner_failure_inspector"
NAME = "find_aborts"
DESCRIPTION = "Locate planner / move_base / controller abort log events with timestamps."

INPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "session_id": {"type": "string"},
        "t_from": {"type": "number"},
        "t_to": {"type": "number"},
    },
    "required": ["session_id"],
}

OUTPUT_SCHEMA: dict[str, Any] = {"type": "array"}


def run(args: dict[str, Any]) -> dict[str, Any]:
    cypher = """
    MATCH (s:Session {id: $session_id})-[:HAS_LOG]->(l:Log)
    WHERE l.severity IN ['ERROR','FATAL']
      AND (l.msg CONTAINS 'abort' OR l.msg CONTAINS 'Aborting' OR l.msg CONTAINS 'aborted')
    RETURN l.id AS log_id, l.ts AS ts, l.node AS node, l.msg AS msg, l.severity AS severity
    ORDER BY l.ts
    """
    try:
        results = neo4j_client.run_query(cypher, {"session_id": args["session_id"]})
        return {"ok": True, "result": results}
    except Exception as exc:
        return {"ok": False, "error": {"code": "neo4j_failed", "message": str(exc), "retryable": True}}
