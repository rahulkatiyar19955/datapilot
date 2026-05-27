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


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Startup: initialize local SQLite schema (create-if-not-exists).
    await init_db()
    yield
    # Shutdown: nothing to release; Neo4j driver lifetimes are per-call,
    # SQLite engine is cleaned by the async runtime.


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


@app.get("/health")
async def health() -> dict[str, str]:
    """Liveness probe. The Electron orchestrator polls this on stack boot."""
    return {"status": "ok", "phase": "3", "service": "datapilot-backend"}


@app.get("/")
async def root() -> dict[str, str]:
    return {"name": "DataPilot Backend", "version": "0.1.0", "docs": "/docs"}
