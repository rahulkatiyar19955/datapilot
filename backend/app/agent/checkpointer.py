"""
LangGraph SQLite checkpointer — one thread per session_id.

Survives process restart; persists at `${DATAPILOT_DATA_DIR}/agent_checkpoints.sqlite`
(separate file from the main app SQLite so LangGraph's WAL doesn't compete
with our app writes).
"""
from __future__ import annotations

import logging
import os
from contextlib import contextmanager
from pathlib import Path
from typing import Any

from app.config import settings

logger = logging.getLogger(__name__)

_CHECKPOINTER_PATH = Path(settings.datapilot_data_dir) / "agent_checkpoints.sqlite"


def _ensure_dir() -> None:
    os.makedirs(settings.datapilot_data_dir, exist_ok=True)


def get_checkpointer():
    """
    Return a LangGraph SqliteSaver bound to the agent checkpoints DB.

    Imported lazily so the agent module can be loaded for tests that don't
    actually use persistence (they pass `checkpointer=None` to compile).
    """
    _ensure_dir()
    try:
        from langgraph.checkpoint.sqlite import SqliteSaver
    except ImportError:
        logger.warning("langgraph-checkpoint-sqlite not installed — persistence disabled")
        return None
    # SqliteSaver.from_conn_string() returns a context manager — but we want a
    # long-lived saver tied to the FastAPI process lifetime. Open the conn here.
    saver = SqliteSaver.from_conn_string(str(_CHECKPOINTER_PATH))
    return saver


@contextmanager
def checkpointer_context():
    """Lifespan-friendly context manager for `app.main.lifespan`."""
    saver_cm = get_checkpointer()
    if saver_cm is None:
        yield None
        return
    with saver_cm as saver:
        yield saver
