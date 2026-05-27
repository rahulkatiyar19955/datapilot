"""
Composer node — final synthesis. Produces the `ChatMessageEnvelope` payload
that gets streamed back to the renderer as the SSE `final` event.

Validation rule: every Finding must cite at least one `log_id` that resolves
to an actual `(:Log)` node in Neo4j for this session. Uncited findings are
dropped (and reported in the audit trail) rather than allowed through —
this is the citation grounding contract from `docs/implementation.md` §4.10.
"""
from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import Any

from app.agent.budget import estimate_cost_usd
from app.agent.state import (
    AuditEvent,
    CausalStep,
    ChatMessageEnvelope,
    Citation,
    Finding,
    GraphState,
    UsageMetrics,
)
from app.llm.router import LLMRouter
from app.services.neo4j_client import neo4j_client

logger = logging.getLogger(__name__)

PROMPT_PATH = Path(__file__).parent / "prompts" / "composer.md"


def _collect_findings(state: GraphState) -> tuple[list[Finding], list[str]]:
    findings: list[Finding] = []
    dropped: list[str] = []
    for spec_result in (state.get("specialist_outputs") or {}).values():
        for f in spec_result.get("findings", []):
            if not isinstance(f, dict):
                continue
            if not f.get("log_ids"):
                dropped.append(f.get("text", "")[:60])
                continue
            findings.append(f)  # type: ignore[arg-type]
    return findings, dropped


def _collect_causal(state: GraphState) -> list[CausalStep]:
    """Prefer RCA's causal chain; fall back to empty."""
    outputs = state.get("specialist_outputs") or {}
    rca = outputs.get("RootCauseAnalyst") or {}
    return list(rca.get("causal") or [])


def _resolve_citations(session_id: str, findings: list[Finding]) -> list[Citation]:
    """Look up the cited log_ids and return a Citation list."""
    all_ids: list[str] = []
    for f in findings:
        all_ids.extend(f.get("log_ids", []))
    if not all_ids:
        return []
    cypher = """
    MATCH (s:Session {id: $session_id})-[:HAS_LOG]->(l:Log)
    WHERE l.id IN $log_ids
    RETURN l.id AS log_id, l.ts AS ts, l.node AS node, l.msg AS msg
    """
    try:
        rows = neo4j_client.run_query(cypher, {"session_id": session_id, "log_ids": list(set(all_ids))})
    except Exception:
        logger.exception("composer: citation resolution failed")
        return []

    from app.services.causal_rules import log_time_to_seconds
    return [
        Citation(
            log_id=r["log_id"],
            ts=log_time_to_seconds(r.get("ts", "0")),
            node=r.get("node", ""),
            snippet=(r.get("msg", "") or "")[:140],
        )
        for r in rows
    ]


def _filter_uncited(findings: list[Finding], valid_log_ids: set[str]) -> tuple[list[Finding], list[str]]:
    """Drop findings whose log_ids don't resolve in Neo4j."""
    kept: list[Finding] = []
    dropped: list[str] = []
    for f in findings:
        if any(lid in valid_log_ids for lid in f.get("log_ids", [])):
            kept.append(f)
        else:
            dropped.append(f.get("text", "")[:60])
    return kept, dropped


async def composer_node(state: GraphState, *, router: LLMRouter) -> dict[str, Any]:
    started = time.perf_counter()
    session_id = state["session_id"]
    audit: list[AuditEvent] = []

    # 1. Gather findings + causal chain across specialists.
    findings, uncited = _collect_findings(state)
    causal = _collect_causal(state)

    # 2. Resolve citations in Neo4j and filter findings whose log_ids vanished.
    citations = _resolve_citations(session_id, findings)
    valid_log_ids = {c["log_id"] for c in citations}
    findings, more_uncited = _filter_uncited(findings, valid_log_ids)
    uncited.extend(more_uncited)
    if uncited:
        audit.append({
            "step_kind": "compose",
            "ts": time.perf_counter(),
            "result_summary": f"dropped {len(uncited)} uncited finding(s): {uncited[:3]}",
        })

    # 3. Ask the composer LLM to write the prose response.
    composer_client = router.for_composer()
    session_summary = state.get("session_summary", "") if isinstance(state, dict) else ""
    facts = {
        "user_question": state["user_message"],
        "session_summary": session_summary,
        "plan": state.get("plan", []),
        "findings": findings,
        "causal": causal,
        "citations": [{"log_id": c["log_id"], "ts": c["ts"], "node": c["node"]} for c in citations],
    }
    resp = await composer_client.complete(
        system=PROMPT_PATH.read_text(encoding="utf-8"),
        messages=[{
            "role": "user",
            "content": (
                "Compose the response. Facts you may use (everything else is "
                f"hearsay — do NOT invent log_ids):\n\n{json.dumps(facts, indent=2)}"
            ),
        }],
        temperature=0.2,
        max_tokens=1024,
    )
    assert isinstance(resp, dict)
    response_text = resp["content"]

    audit.append({
        "step_kind": "compose",
        "ts": time.perf_counter(),
        "tokens_in": resp["usage"]["input_tokens"],
        "tokens_out": resp["usage"]["output_tokens"],
    })

    # 4. Assemble final envelope.
    full_audit = list(state.get("audit_trail") or []) + audit
    usage = UsageMetrics(
        tokens_in=sum(int(e.get("tokens_in", 0) or 0) for e in full_audit),
        tokens_out=sum(int(e.get("tokens_out", 0) or 0) for e in full_audit),
        est_cost_usd=estimate_cost_usd(full_audit),
    )

    envelope: ChatMessageEnvelope = ChatMessageEnvelope(
        response=response_text,
        plan=list(state.get("plan") or []),
        findings=findings,
        causal=causal,
        audit_trail=full_audit,
        citations=citations,
        usage=usage,
        partial=bool(state.get("replan_count", 0) > 5),
    )

    return {"final": envelope, "audit_trail": audit}
