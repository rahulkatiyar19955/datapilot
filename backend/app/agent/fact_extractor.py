"""
Dedicated LLM step that distils durable, reusable facts from a chat turn so they
can be written into the knowledge graph (Neo4j `:Fact` nodes) and reused later
without re-reading the bag.

Runs after the user-visible answer has streamed, so it adds no latency to the
response. Best-effort: any failure returns an empty list and the turn proceeds.
"""
from __future__ import annotations

import json
import logging
from typing import Any

from app.llm.base import LLMClient

logger = logging.getLogger(__name__)

MAX_FACTS = 5

_SYSTEM = (
    "You distil DURABLE, REUSABLE facts about a robotics run from a Q&A exchange "
    "about a rosbag. Capture only knowledge worth remembering later without "
    "re-reading the data: root causes, confirmed sensor/topic behaviour, numeric "
    "thresholds, failure chains, and component relationships. IGNORE pleasantries, "
    "restated questions, UI chatter, and anything not grounded in the answer. "
    "Each fact must be a single standalone sentence. Return at most "
    f"{MAX_FACTS} facts; return an empty list if nothing is worth keeping."
)

_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "facts": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "text": {"type": "string"},
                    "category": {
                        "type": "string",
                        "description": "e.g. root_cause, sensor, performance, safety, topology",
                    },
                    "severity": {"type": "string", "enum": ["info", "warning", "critical"]},
                    "entities": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "topic names, sensor names, or node names this fact is about",
                    },
                },
                "required": ["text"],
            },
        },
    },
    "required": ["facts"],
}


def _parse(text: str) -> list[dict[str, Any]]:
    text = (text or "").strip()
    if not text:
        return []
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text
        if text.endswith("```"):
            text = text[: text.rfind("```")]
    text = text.strip()
    try:
        obj = json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start == -1 or end <= start:
            return []
        try:
            obj = json.loads(text[start : end + 1])
        except json.JSONDecodeError:
            return []
    facts = obj.get("facts") if isinstance(obj, dict) else None
    if not isinstance(facts, list):
        return []
    out: list[dict[str, Any]] = []
    for f in facts[:MAX_FACTS]:
        if not isinstance(f, dict):
            continue
        txt = (f.get("text") or "").strip()
        if not txt:
            continue
        ents = f.get("entities")
        out.append({
            "text": txt,
            "category": (f.get("category") or "general").strip(),
            "severity": (f.get("severity") or "info").strip(),
            "entities": [str(e).strip() for e in ents if str(e).strip()] if isinstance(ents, list) else [],
        })
    return out


async def extract_facts(
    client: LLMClient,
    *,
    session_summary: str,
    user_msg: str,
    envelope: dict[str, Any],
) -> list[dict[str, Any]]:
    """Extract durable facts from a completed chat turn. Never raises."""
    response = (envelope.get("response") or "").strip()
    findings = envelope.get("findings") or []
    if not response and not findings:
        return []

    findings_txt = "\n".join(
        f"- [{(f.get('sev') or 'info')}] {f.get('text', '')}"
        for f in findings
        if isinstance(f, dict)
    )
    user = (
        f"Session: {session_summary}\n\n"
        f"User asked: {user_msg}\n\n"
        f"Assistant answered:\n{response}\n\n"
        f"Structured findings:\n{findings_txt or '(none)'}\n\n"
        "Extract the durable facts as the JSON object matching your schema."
    )
    try:
        resp = await client.complete(
            system=_SYSTEM,
            messages=[{"role": "user", "content": user}],
            response_format=_SCHEMA,
            temperature=0.1,
        )
        assert isinstance(resp, dict)
        return _parse(resp.get("content", ""))
    except Exception:
        logger.exception("fact extraction failed")
        return []
