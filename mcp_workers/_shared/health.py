"""
Tiny HTTP `/health` server, spun up on a daemon thread alongside the worker's
stdio loop. Used by `backend/app/api/mcp.py::GET /api/mcp/servers` to discover
each worker's status independently of the stdio handshake.
"""
from __future__ import annotations

import json
import logging
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Callable

logger = logging.getLogger(__name__)


def start_health_server(worker_name: str, port: int, tool_count_fn: Callable[[], int]) -> None:
    """Spawn a daemon HTTP server on `port`. Non-blocking.

    Endpoints:
      GET /health  → {"worker": str, "status": "ok", "tools": int}
    """

    class Handler(BaseHTTPRequestHandler):
        def address_string(self):  # type: ignore[override]
            # `BaseHTTPRequestHandler.address_string` does a reverse DNS lookup
            # by default. On Docker networks (and any host with slow / missing
            # DNS) that lookup can stall multiple seconds, blowing past the
            # backend's 1.5s health-probe timeout and flipping the worker's UI
            # status to `disconnected`. Returning the raw IP keeps probes snappy.
            return self.client_address[0]

        def do_GET(self):
            if self.path != "/health":
                self.send_response(404)
                self.end_headers()
                return
            body = json.dumps({
                "worker": worker_name,
                "status": "ok",
                "tools": tool_count_fn(),
            }).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args, **kwargs):
            # Silence access logging — workers run with stdout consumed by the
            # MCP transport; we don't want noise on stderr either.
            pass

    def _serve():
        try:
            srv = ThreadingHTTPServer(("0.0.0.0", port), Handler)
            logger.info("health server for %s listening on :%d", worker_name, port)
            srv.serve_forever()
        except Exception:
            logger.exception("health server for %s crashed", worker_name)

    threading.Thread(target=_serve, daemon=True, name=f"health-{worker_name}").start()
