# `report_composer` MCP worker (Phase 5).
#
# Build context: the **repo root** (so the image can pull in `backend/` + the
# shared helpers). See docker-compose.yml's `build.context: .` for this worker.
FROM python:3.11-slim

WORKDIR /app

# uv for fast, reproducible installs (matches the backend's pattern).
RUN pip install --no-cache-dir uv

# Install the backend's runtime deps. The worker reuses `app.agent.tools.*`
# and `app.services.*` so we want the same dependency set.
COPY backend/pyproject.toml ./backend/pyproject.toml
RUN uv pip install --system --no-cache -r ./backend/pyproject.toml

# Copy the code we actually need at runtime.
COPY backend/app           ./backend/app
COPY mcp_workers/_shared   ./mcp_workers/_shared
COPY mcp_workers/__init__.py ./mcp_workers/__init__.py
COPY mcp_workers/report_composer ./mcp_workers/report_composer

ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app/backend:/app

EXPOSE 9005

CMD ["python", "-m", "mcp_workers.report_composer.server"]
