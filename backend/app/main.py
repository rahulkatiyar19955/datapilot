"""
DataPilot FastAPI entrypoint.

Phase 3 — ingestion pipeline + session endpoints. Chat / fleet / MCP / search
routers land in Phases 4+.
"""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db_sqlite import init_db
from app.api.sessions import router as sessions_router
from app.api.chat import router as chat_router
from app.api.mcp import router as mcp_router
from app.api.settings_api import router as settings_router
from app.services.neo4j_client import neo4j_client



@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Startup: initialize local SQLite schema (create-if-not-exists).
    await init_db()
    yield
    # Shutdown: close the shared Neo4j driver so its connection pool
    # releases sockets back to the OS rather than relying on GC.
    try:
        neo4j_client.close()
    except Exception:
        # Best-effort — don't block process exit on teardown errors.
        pass
    # Phase 5: tear down any persistent MCP worker subprocesses we spawned via
    # the stdio transport. Safe to call even when no workers were launched.
    try:
        from app.agent.mcp_stdio import worker_pool
        worker_pool.shutdown()
    except Exception:
        pass


app = FastAPI(
    title="DataPilot Backend",
    version="0.1.0",
    description="Local-first ROS 2 debugging copilot — FastAPI + LangGraph.",
    lifespan=lifespan,
)

# This is a local-first backend that only listens on the user's machine.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Register routers
app.include_router(sessions_router, prefix="/api")
app.include_router(chat_router, prefix="/api")
app.include_router(mcp_router, prefix="/api")
app.include_router(settings_router, prefix="/api")



@app.get("/health")
async def health() -> dict[str, str]:
    """Liveness probe. The Electron orchestrator polls this on stack boot."""
    return {"status": "ok", "phase": "3", "service": "datapilot-backend"}


@app.get("/")
async def root() -> dict[str, str]:
    return {"name": "DataPilot Backend", "version": "0.1.0", "docs": "/docs"}
