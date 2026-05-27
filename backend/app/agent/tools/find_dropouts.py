"""
Surface sensor / topic dropouts. Phase 3 wrote anomalies into Neo4j with
`kind == <topic>`; we filter those plus any logs containing "dropout"/"no data".
Phase 5 AnomalyDetector deepens this with statistical detection.
"""
from __future__ import annotations

from typing import Any

from app.services.neo4j_client import neo4j_client

WORKER = "anomaly_detector"
NAME = "find_dropouts"
DESCRIPTION = "Find sensor / topic dropout events for a session (with an optional topic filter)."

INPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "session_id": {"type": "string"},
        "topic": {"type": "string"},
        "threshold_ms": {"type": "number", "default": 250},
    },
    "required": ["session_id"],
}

OUTPUT_SCHEMA: dict[str, Any] = {"type": "array"}


def run(args: dict[str, Any]) -> dict[str, Any]:
    cypher = """
    MATCH (s:Session {id: $session_id})-[:HAS_LOG]->(l:Log)
    WHERE (l.msg =~ '(?i).*dropout.*' OR l.msg =~ '(?i).*no data for.*')
      AND ($topic IS NULL OR l.topic = $topic)
    RETURN l.id AS log_id, l.ts AS ts, l.severity AS severity, l.node AS node,
           l.msg AS msg, l.topic AS topic
    ORDER BY l.ts
    """
    try:
        results = neo4j_client.run_query(
            cypher,
            {"session_id": args["session_id"], "topic": args.get("topic")},
        )
        return {"ok": True, "result": results}
    except Exception as exc:
        return {"ok": False, "error": {"code": "neo4j_failed", "message": str(exc), "retryable": True}}
