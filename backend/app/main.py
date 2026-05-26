"""
DataPilot FastAPI entrypoint.

Phase 0 — exposes only /health. Real session, chat, fleet, MCP, and search
routers land in Phases 3+.
"""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="DataPilot Backend",
    version="0.1.0",
    description="Local-first ROS 2 debugging copilot — FastAPI + LangGraph.",
)

# This is a local-first backend that only listens on the user's machine.
# In production the renderer loads via file:// which sends Origin: null (not a
# real origin), so an enumerated allow-list cannot match. allow_credentials is
# False, so wildcard origins are safe.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    """Liveness probe. The Electron orchestrator polls this on stack boot."""
    return {"status": "ok", "phase": "0", "service": "datapilot-backend"}


@app.get("/")
async def root() -> dict[str, str]:
    return {"name": "DataPilot Backend", "version": "0.1.0", "docs": "/docs"}
