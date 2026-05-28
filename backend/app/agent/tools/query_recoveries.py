"""Find all recovery behavior invocations recorded in session logs."""
from __future__ import annotations

from typing import Any

from app.services.neo4j_client import neo4j_client

WORKER = "planner_failure_inspector"
NAME = "query_recoveries"
DESCRIPTION = (
    "List all recovery behavior invocations in the session "
    "(clear_costmap, rotate_recovery, oscillation recovery, backup, etc.)."
)

INPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "session_id": {"type": "string"},
    },
    "required": ["session_id"],
}

OUTPUT_SCHEMA: dict[str, Any] = {"type": "array"}


def run(args: dict[str, Any]) -> dict[str, Any]:
    cypher = """
    MATCH (s:Session {id: $session_id})-[:HAS_LOG]->(l:Log)
    WHERE l.msg =~ '(?i).*(recovery|clear.?costmap|rotate.?recovery|'
                        + 'oscillation.?recovery|backup.?recovery|'
                        + 'recovery.?behavior|recovery.?triggered).*'
    RETURN l.id AS log_id, l.ts AS ts, l.node AS node,
           l.severity AS severity, l.msg AS msg, l.topic AS topic
    ORDER BY l.ts
    """
    try:
        results = neo4j_client.run_query(cypher, {"session_id": args["session_id"]})
        return {"ok": True, "result": results}
    except Exception as exc:
        return {"ok": False, "error": {"code": "neo4j_failed", "message": str(exc), "retryable": True}}
