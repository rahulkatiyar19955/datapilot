"""
DataPilot MCP worker stub: report_composer.

Phase 0 — registers no tools; just stays alive so the Electron
orchestrator's health check (Phase 1) sees a running container.
Real tools land in Phase 5 — see docs/implementation.md §5.
"""
from __future__ import annotations

import asyncio
import sys

WORKER_NAME = "report_composer"


async def main() -> None:
    sys.stderr.write(f"[{WORKER_NAME}] phase-0 stub started; awaiting Phase 5 tools\n")
    sys.stderr.flush()
    # Stay alive forever so docker-compose healthchecks see a running container.
    while True:
        await asyncio.sleep(3600)


if __name__ == "__main__":
    asyncio.run(main())
