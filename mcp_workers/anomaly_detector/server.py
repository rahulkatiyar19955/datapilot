"""
`anomaly_detector` MCP worker.

Wraps Phase 4's real `app.agent.tools.find_dropouts` plus the broad family of
anomaly stubs (statistical outliers, signature matches, per-node CPU, rate
regressions, cross-session comparisons). Mirrors the canary worker pattern:
stdio JSON-RPC + HTTP `/health` on a per-worker port.
"""
from __future__ import annotations

import logging
import os
import sys

from mcp.server.fastmcp import FastMCP

from app.agent.tools import find_dropouts
from app.agent.tools.stubs import (
    find_outliers,
    find_signatures,
    compute_node_cpu,
    find_rate_regressions,
    compare_metric_distributions,
    compare_log_signatures,
)

from mcp_workers._shared.health import start_health_server
from mcp_workers._shared.wrap_tool import register_tool

logger = logging.getLogger(__name__)

WORKER_NAME = "anomaly_detector"
HEALTH_PORT = int(os.environ.get("ANOMALY_DETECTOR_HEALTH_PORT", "9004"))

mcp = FastMCP(WORKER_NAME)

# Real tool.
register_tool(mcp, find_dropouts)
# Phase 5 stubs — deepened as real anomaly math / signatures land here.
register_tool(mcp, find_outliers)
register_tool(mcp, find_signatures)
register_tool(mcp, compute_node_cpu)
register_tool(mcp, find_rate_regressions)
register_tool(mcp, compare_metric_distributions)
register_tool(mcp, compare_log_signatures)


def main() -> None:
    logging.basicConfig(level=logging.INFO, stream=sys.stderr)
    start_health_server(WORKER_NAME, HEALTH_PORT, lambda: 7)
    logger.info("%s MCP server starting on stdio", WORKER_NAME)
    mcp.run()


if __name__ == "__main__":
    main()
