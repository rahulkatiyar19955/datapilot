"""
retrieve_logs — the most-called tool across specialists.

Hybrid RAG:
  1. Vector search in Neo4j over `(:Log).embedding` (cosine, top k*3 candidates)
  2. Apply severity / topic / time-window filters
  3. (Optional re-rank — deferred to Phase 4.5)
  4. For each top-k hit, expand ±5s of neighboring logs via Cypher so the
     LLM has temporal context to reason about lead/lag relationships
"""
from __future__ import annotations

import logging
from typing import Any

from app.services.embeddings import embedding_service
from app.services.neo4j_client import neo4j_client

logger = logging.getLogger(__name__)

WORKER = "rosbag_reader"
NAME = "retrieve_logs"
DESCRIPTION = (
    "Semantic search for logs in the current session. Vector match on the query "
    "string, optionally filtered by severity/topic/time window, with ±5s "
    "neighboring logs included for temporal context."
)

INPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "session_id": {"type": "string"},
        "query": {"type": "string"},
        "k": {"type": "integer", "default": 8, "minimum": 1, "maximum": 50},
        "severity_filter": {
            "type": "array",
            "items": {"type": "string", "enum": ["DEBUG", "INFO", "WARN", "ERROR", "FATAL"]},
            "default": [],
        },
        "topic_filter": {"type": "array", "items": {"type": "string"}, "default": []},
        "time_window_s": {
            "type": "array",
            "items": {"type": "number"},
            "minItems": 2,
            "maxItems": 2,
        },
        "expand_neighbors": {"type": "boolean", "default": True},
    },
    "required": ["session_id", "query"],
}

OUTPUT_SCHEMA: dict[str, Any] = {
    "type": "array",
    "items": {
        "type": "object",
        "properties": {
            "log_id": {"type": "string"},
            "ts": {"type": "string"},
            "severity": {"type": "string"},
            "node": {"type": "string"},
            "msg": {"type": "string"},
            "score": {"type": "number"},
            "neighbors": {"type": "array"},
        },
    },
}


def run(args: dict[str, Any]) -> dict[str, Any]:
    session_id: str = args["session_id"]
    query: str = args["query"]
    k: int = int(args.get("k", 8))
    severity_filter: list[str] = args.get("severity_filter") or []
    topic_filter: list[str] = args.get("topic_filter") or []
    time_window: list[float] | None = args.get("time_window_s")
    expand: bool = args.get("expand_neighbors", True)

    try:
        query_vec = embedding_service.embed_texts([query])[0]
    except Exception as exc:
        logger.exception("embedding failed in retrieve_logs")
        return {"ok": False, "error": {"code": "embed_failed", "message": str(exc), "retryable": True}}

    # 1. Vector index → top k*3 candidates, then filter
    cypher = """
    MATCH (s:Session {id: $session_id})
    CALL db.index.vector.queryNodes('log_embedding_idx', $candidate_k, $query_vec)
    YIELD node, score
    MATCH (s)-[:HAS_LOG]->(node)
    WHERE ($severity_filter = [] OR node.severity IN $severity_filter)
      AND ($topic_filter   = [] OR node.topic    IN $topic_filter)
    RETURN
      node.id        AS log_id,
      node.ts        AS ts,
      node.severity  AS severity,
      node.node      AS node,
      node.msg       AS msg,
      node.topic     AS topic,
      score
    ORDER BY score DESC
    LIMIT $k
    """
    try:
        hits = neo4j_client.run_query(
            cypher,
            {
                "session_id": session_id,
                "query_vec": query_vec,
                "candidate_k": k * 3,
                "severity_filter": severity_filter,
                "topic_filter": topic_filter,
                "k": k,
            },
        )
    except Exception as exc:
        logger.exception("neo4j vector search failed")
        return {"ok": False, "error": {"code": "neo4j_failed", "message": str(exc), "retryable": True}}

    if time_window:
        lo, hi = time_window
        def in_window(ts: str) -> bool:
            try:
                # ts is a stringified HH:MM:SS.mmm — fall back to passing through
                from app.services.causal_rules import log_time_to_seconds
                return lo <= log_time_to_seconds(ts) <= hi
            except Exception:
                return True
        hits = [h for h in hits if in_window(h.get("ts", "0"))]

    if not expand:
        return {"ok": True, "result": hits}

    # 2. Expand ±5s neighbors. One Cypher call per hit keeps it simple; the
    # results are small (≤k items, ≤20 neighbors each) so this is fine.
    expand_cypher = """
    MATCH (s:Session {id: $session_id})-[:HAS_LOG]->(l:Log)
    WHERE abs(
        CASE
          WHEN l.ts CONTAINS ':'
          THEN toFloat(split(l.ts,':')[0])*3600 + toFloat(split(l.ts,':')[1])*60 + toFloat(split(l.ts,':')[2])
          ELSE toFloat(l.ts)
        END -
        $center
    ) <= 5.0
    AND l.id <> $center_log_id
    RETURN l.id AS log_id, l.ts AS ts, l.severity AS severity, l.node AS node, l.msg AS msg
    ORDER BY l.ts
    LIMIT 20
    """
    from app.services.causal_rules import log_time_to_seconds

    expanded = []
    for h in hits:
        center = log_time_to_seconds(h.get("ts", "0"))
        try:
            neighbors = neo4j_client.run_query(
                expand_cypher,
                {"session_id": session_id, "center": center, "center_log_id": h["log_id"]},
            )
        except Exception:
            neighbors = []
        expanded.append({**h, "neighbors": neighbors})

    return {"ok": True, "result": expanded}
