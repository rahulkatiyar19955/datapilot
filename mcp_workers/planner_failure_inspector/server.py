"""
`planner_failure_inspector` MCP worker.

Wraps Phase 4's real `app.agent.tools.{find_aborts, query_causal_chain}` plus
the `query_commands`, `query_recoveries`, `query_safety_rules` stubs. Mirrors
the canary worker pattern: stdio JSON-RPC + HTTP `/health` on per-worker port.
"""
from __future__ import annotations

import logging
import os
import sys

from mcp.server.fastmcp import FastMCP

from app.agent.tools import find_aborts, query_causal_chain
from app.agent.tools.stubs import (
    query_commands,
    query_recoveries,
    query_safety_rules,
)

from mcp_workers._shared.health import start_health_server
from mcp_workers._shared.wrap_tool import register_tool

logger = logging.getLogger(__name__)

WORKER_NAME = "planner_failure_inspector"
HEALTH_PORT = int(os.environ.get("PLANNER_FAILURE_INSPECTOR_HEALTH_PORT", "9003"))

mcp = FastMCP(WORKER_NAME)

# Real tools.
register_tool(mcp, find_aborts)
register_tool(mcp, query_causal_chain)
# Phase 5 stubs (Phase 5+ deepens once real planner-state parsing lands here).
register_tool(mcp, query_commands)
register_tool(mcp, query_recoveries)
register_tool(mcp, query_safety_rules)


def main() -> None:
    logging.basicConfig(level=logging.INFO, stream=sys.stderr)
    start_health_server(WORKER_NAME, HEALTH_PORT, lambda: 5)
    logger.info("%s MCP server starting on stdio", WORKER_NAME)
    mcp.run()


if __name__ == "__main__":
    main()
