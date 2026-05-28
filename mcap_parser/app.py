"""
mcap-parser FastAPI service.

Endpoints
---------
GET  /health  → {"status": "ok"}
POST /parse   → {"filepath": "/host/..."} → parsed session dict
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI
from pydantic import BaseModel

from mcap_parser.parser import parse_bag

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="datapilot-mcap-parser", version="1.0.0")


class ParseRequest(BaseModel):
    filepath: str


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/parse")
def parse(req: ParseRequest) -> dict[str, Any]:
    logger.info("parse request: %s", req.filepath)
    try:
        result = parse_bag(req.filepath)
        return result
    except Exception as exc:
        logger.exception("parse failed for %s", req.filepath)
        return {"ok": False, "error": str(exc)}
