"""Compare per-topic publish rates between two sessions and surface regressions."""
from __future__ import annotations

from typing import Any

from app.services.neo4j_client import neo4j_client

WORKER = "anomaly_detector"
NAME = "find_rate_regressions"
DESCRIPTION = (
    "Compare topic publish rates (Hz) between the current session and a baseline "
    "session. Returns topics whose Hz has regressed by more than 20%."
)

INPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "session_id": {"type": "string"},
        "baseline_session_id": {"type": "string"},
    },
    "required": ["session_id", "baseline_session_id"],
}

OUTPUT_SCHEMA: dict[str, Any] = {"type": "array"}


def run(args: dict[str, Any]) -> dict[str, Any]:
    cypher = """
    MATCH (s1:Session {id: $session_id})-[:HAS_TOPIC]->(t1:Topic)
    MATCH (s2:Session {id: $baseline_session_id})-[:HAS_TOPIC]->(t2:Topic {name: t1.name})
    WHERE t2.hz > 0
    WITH t1, t2,
         (t1.hz - t2.hz) / t2.hz AS delta_ratio
    WHERE delta_ratio < -0.20
    RETURN t1.name AS topic,
           t1.hz AS current_hz,
           t2.hz AS baseline_hz,
           round(delta_ratio * 100, 1) AS regression_pct
    ORDER BY regression_pct ASC
    """
    try:
        results = neo4j_client.run_query(
            cypher,
            {
                "session_id": args["session_id"],
                "baseline_session_id": args["baseline_session_id"],
            },
        )
        return {"ok": True, "result": results}
    except Exception as exc:
        return {"ok": False, "error": {"code": "neo4j_failed", "message": str(exc), "retryable": True}}
