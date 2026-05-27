"""
`report_composer` MCP worker.

Phase 5 ships the `format_causal_chain` stub here; the composer's other
formatting helpers (findings card, recommendations) currently live inline in
`app.agent.composer` and migrate behind this transport in a future phase.
Mirrors the canary worker pattern: stdio JSON-RPC + HTTP `/health`.
"""
from __future__ import annotations

import logging
import os
import sys

from mcp.server.fastmcp import FastMCP

from app.agent.tools.stubs import format_causal_chain

from mcp_workers._shared.health import start_health_server
from mcp_workers._shared.wrap_tool import register_tool

logger = logging.getLogger(__name__)

WORKER_NAME = "report_composer"
HEALTH_PORT = int(os.environ.get("REPORT_COMPOSER_HEALTH_PORT", "9005"))

mcp = FastMCP(WORKER_NAME)

# Phase 5 stub — the composer's tree-character formatter ships behind MCP here.
register_tool(mcp, format_causal_chain)


def main() -> None:
    logging.basicConfig(level=logging.INFO, stream=sys.stderr)
    start_health_server(WORKER_NAME, HEALTH_PORT, lambda: 1)
    logger.info("%s MCP server starting on stdio", WORKER_NAME)
    mcp.run()


if __name__ == "__main__":
    main()
