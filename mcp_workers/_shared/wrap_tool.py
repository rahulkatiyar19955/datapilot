"""
Adapt `backend/app/agent/tools/<name>.py` modules into FastMCP tool registrations.

Each tool module exports `NAME`, `DESCRIPTION`, `INPUT_SCHEMA`, and `run(args)`.
This helper registers them on a `FastMCP` instance with one call per module.

The MCP-spec response for `tools/call` is a list of content blocks; our
convention is to return our `{ok, result | error}` envelope as JSON inside a
single `text` block. `app.agent.mcp_stdio.WorkerHandle.call_tool` decodes that.
"""
from __future__ import annotations

import json
import logging
from typing import Any, Callable

logger = logging.getLogger(__name__)


def register_tool(mcp: Any, module: Any) -> None:
    """Wire `module.run` as an MCP tool on `mcp`.

    `mcp` is an `mcp.server.fastmcp.FastMCP` instance. We use the `add_tool`
    public API directly so the wrapper can stringify the envelope (mcp's
    `@mcp.tool` decorator expects a Python return value, not a wire format).
    """
    name = module.NAME
    description = module.DESCRIPTION

    def _runner(**kwargs: Any) -> str:
        try:
            envelope = module.run(kwargs)
        except Exception as exc:
            logger.exception("worker tool %s raised", name)
            envelope = {
                "ok": False,
                "error": {"code": "tool_exception", "message": str(exc), "retryable": True},
            }
        # MCP `tools/call` content blocks are strings; pack the envelope as JSON.
        return json.dumps(envelope, default=str)

    # FastMCP accepts a callable + an optional input schema. We pull the schema
    # from the module so it matches the in-process registry exactly.
    try:
        mcp.add_tool(
            _runner,
            name=name,
            description=description,
        )
    except TypeError:
        # Older FastMCP signatures: fall back to decorator form.
        mcp.tool(name=name, description=description)(_runner)
