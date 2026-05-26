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

# Renderer runs at file:// in prod and http://localhost:5173 in dev.
# Electron's main process talks to us at http://localhost:8000; the renderer
# may also call directly (same-origin via the Electron protocol or via the
# Vite dev server proxy in dev).
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:8000",
        "file://",
    ],
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
