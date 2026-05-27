"""
`rosbag_reader` MCP worker.

Wraps the Phase 4 `app.agent.tools.{retrieve_logs, read_tf_chain}` functions
plus the `read_diagnostics` stub. Exposes both:
  - stdio JSON-RPC (the primary MCP transport `mcp_client._dispatch_stdio` uses)
  - HTTP `/health` on port 9001 (the Agents & MCP screen polls this)
"""
from __future__ import annotations

import logging
import os
import sys

from mcp.server.fastmcp import FastMCP

# These imports rely on `backend/` being on PYTHONPATH (set by the Electron
# orchestrator and by `app.agent.mcp_stdio.WorkerHandle._spawn`).
from app.agent.tools import retrieve_logs, read_tf_chain
from app.agent.tools.stubs import read_diagnostics

from mcp_workers._shared.health import start_health_server
from mcp_workers._shared.wrap_tool import register_tool

logger = logging.getLogger(__name__)

WORKER_NAME = "rosbag_reader"
HEALTH_PORT = int(os.environ.get("ROSBAG_READER_HEALTH_PORT", "9001"))

mcp = FastMCP(WORKER_NAME)

# Real tools.
register_tool(mcp, retrieve_logs)
register_tool(mcp, read_tf_chain)
# Phase 5 stub (Phase 5+ deepens once mcap/DiagnosticArray parsing lands here).
register_tool(mcp, read_diagnostics)


def main() -> None:
    logging.basicConfig(level=logging.INFO, stream=sys.stderr)
    start_health_server(WORKER_NAME, HEALTH_PORT, lambda: 3)
    logger.info("%s MCP server starting on stdio", WORKER_NAME)
    mcp.run()


if __name__ == "__main__":
    main()
