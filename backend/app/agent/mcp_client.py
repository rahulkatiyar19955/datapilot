"""
In-process MCP-shaped dispatcher.

Phase 4 contract: `dispatch(worker, tool, args) -> {ok, result | error}`.
Phase 5 swaps the registry's `run` callables for JSON-RPC calls into the actual
MCP worker containers — call sites in specialists stay identical.

Tool catalog is built at import-time by introspecting each tool module's
WORKER / NAME / DESCRIPTION / INPUT_SCHEMA / OUTPUT_SCHEMA / run.
"""
from __future__ import annotations

import logging
import time
from typing import Any, Callable, TypedDict

from app.agent.tools import (
    find_aborts,
    find_dropouts,
    query_causal_chain,
    query_topic,
    read_tf_chain,
    retrieve_logs,
)
from app.agent.tools import stubs

logger = logging.getLogger(__name__)


class ToolDescriptor(TypedDict):
    worker: str
    name: str
    description: str
    input_schema: dict[str, Any]
    output_schema: dict[str, Any]
    run: Callable[[dict[str, Any]], dict[str, Any]]


def _descriptor(module: Any) -> ToolDescriptor:
    return ToolDescriptor(
        worker=module.WORKER,
        name=module.NAME,
        description=module.DESCRIPTION,
        input_schema=module.INPUT_SCHEMA,
        output_schema=module.OUTPUT_SCHEMA,
        run=module.run,
    )


# Tool catalog — every tool any specialist can call must be registered here.
# Phase 5 replaces each module's `run` with a JSON-RPC stub; the descriptor
# shape and call sites stay identical.
_REGISTRY: dict[tuple[str, str], ToolDescriptor] = {}


def _register(module: Any) -> None:
    desc = _descriptor(module)
    _REGISTRY[(desc["worker"], desc["name"])] = desc


# Real tools (Phase 4 in-process; Phase 5 swaps body to JSON-RPC).
for _module in (
    retrieve_logs,
    query_topic,
    find_aborts,
    query_causal_chain,
    find_dropouts,
    read_tf_chain,
):
    _register(_module)

# Stubs (return shape-correct empty results until Phase 5 deepens).
for _module in (
    stubs.find_outliers,
    stubs.find_signatures,
    stubs.query_topic_rate,
    stubs.compute_node_cpu,
    stubs.find_rate_regressions,
    stubs.query_commands,
    stubs.query_recoveries,
    stubs.query_safety_rules,
    stubs.compare_metric_distributions,
    stubs.compare_log_signatures,
    stubs.read_diagnostics,
    stubs.format_causal_chain,
):
    _register(_module)


def list_tools(worker: str | None = None) -> list[ToolDescriptor]:
    """Return the full tool catalog or just one worker's tools."""
    if worker is None:
        return list(_REGISTRY.values())
    return [d for d in _REGISTRY.values() if d["worker"] == worker]


def get_tool(worker: str, name: str) -> ToolDescriptor | None:
    return _REGISTRY.get((worker, name))


def dispatch(worker: str, name: str, args: dict[str, Any]) -> dict[str, Any]:
    """
    Invoke a registered tool. Returns the tool's response unmodified — i.e.
    `{ok: true, result: …}` or `{ok: false, error: {code, message, retryable}}`.

    The dispatcher itself never raises — unknown tools return a structured
    `tool_unavailable` error so the specialist's ReAct loop can replan around it.
    """
    desc = _REGISTRY.get((worker, name))
    if desc is None:
        logger.warning("dispatch: unknown tool %s.%s", worker, name)
        return {
            "ok": False,
            "error": {
                "code": "tool_unavailable",
                "message": f"No such tool: {worker}.{name}",
                "retryable": False,
            },
        }

    started = time.perf_counter()
    try:
        result = desc["run"](args)
    except Exception as exc:
        logger.exception("dispatch: tool %s.%s raised", worker, name)
        return {
            "ok": False,
            "error": {
                "code": "tool_exception",
                "message": str(exc),
                "retryable": True,
            },
        }
    latency_ms = int((time.perf_counter() - started) * 1000)
    # Tools may return well-formed envelopes; normalize legacy shapes anyway.
    if isinstance(result, dict) and "ok" in result:
        result.setdefault("latency_ms", latency_ms)
        return result
    # Tool returned a bare value — wrap it.
    return {"ok": True, "result": result, "latency_ms": latency_ms}


def llm_tool_defs(worker_subset: list[str] | None = None) -> list[dict[str, Any]]:
    """
    Render the catalog into the `ToolDef` shape the LLM clients accept.
    `worker_subset` lets a specialist hand the LLM only its allowed tools.
    """
    out = []
    for desc in _REGISTRY.values():
        if worker_subset and desc["worker"] not in worker_subset:
            continue
        out.append({
            "name": f"{desc['worker']}__{desc['name']}",
            "description": desc["description"],
            "parameters": desc["input_schema"],
        })
    return out


def parse_tool_name(qualified: str) -> tuple[str, str]:
    """Split `worker__tool` back into `(worker, tool)`."""
    if "__" not in qualified:
        raise ValueError(f"Tool name must be qualified as worker__tool: {qualified!r}")
    worker, _, name = qualified.partition("__")
    return worker, name
