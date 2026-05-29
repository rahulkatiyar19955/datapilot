# `rosbag_reader` MCP worker (Phase 5).
#
# Build context: the **repo root** (so the image can pull in `backend/` + the
# shared helpers). See docker-compose.yml's `build.context: .` for this worker.
FROM python:3.11-slim

WORKDIR /app

# uv for fast, reproducible installs (matches the backend's pattern).
RUN pip install --no-cache-dir uv

COPY backend/pyproject.toml ./backend/pyproject.toml
# Pre-install CPU-only PyTorch to avoid CUDA / Nvidia runtime wheels (saves ~3.8GB)
RUN uv pip install --system --no-cache --index-url https://download.pytorch.org/whl/cpu torch
# Install core + AI dependencies (needs embeddings for retrieve_logs)
RUN uv pip install --system --no-cache -r ./backend/pyproject.toml --extra ai

# Copy the code we actually need at runtime.
COPY backend/app           ./backend/app
COPY mcp_workers/_shared   ./mcp_workers/_shared
COPY mcp_workers/__init__.py ./mcp_workers/__init__.py
COPY mcp_workers/rosbag_reader ./mcp_workers/rosbag_reader

ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app/backend:/app

EXPOSE 9001

CMD ["python", "-m", "mcp_workers.rosbag_reader.server"]
