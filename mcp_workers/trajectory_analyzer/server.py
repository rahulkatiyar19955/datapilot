"""
`trajectory_analyzer` MCP worker.

Wraps the Phase 4 `app.agent.tools.query_topic` plus the `query_topic_rate`
stub. Mirrors the `rosbag_reader` canary's pattern (stdio JSON-RPC for the
MCP transport + an HTTP `/health` on a per-worker port).
"""
from __future__ import annotations

import logging
import os
import sys

from mcp.server.fastmcp import FastMCP

# These imports rely on `backend/` being on PYTHONPATH (set by the Electron
# orchestrator and by `app.agent.mcp_stdio.WorkerHandle._spawn`).
from app.agent.tools import query_topic
from app.agent.tools.stubs import query_topic_rate

from mcp_workers._shared.health import start_health_server
from mcp_workers._shared.wrap_tool import register_tool

logger = logging.getLogger(__name__)

WORKER_NAME = "trajectory_analyzer"
HEALTH_PORT = int(os.environ.get("TRAJECTORY_ANALYZER_HEALTH_PORT", "9002"))

mcp = FastMCP(WORKER_NAME)

# Real tool.
register_tool(mcp, query_topic)
# Phase 5 stub — deepens once velocity / goal-deviation math lands here.
register_tool(mcp, query_topic_rate)


def main() -> None:
    logging.basicConfig(level=logging.INFO, stream=sys.stderr)
    start_health_server(WORKER_NAME, HEALTH_PORT, lambda: 2)
    logger.info("%s MCP server starting on stdio", WORKER_NAME)
    mcp.run()


if __name__ == "__main__":
    main()
