# Phase 0 placeholder. Full image (with mcap, rosbags, neo4j drivers, etc.) lands in Phase 3.
FROM python:3.11-slim

WORKDIR /app

# uv for fast, reproducible installs
RUN pip install --no-cache-dir uv

COPY pyproject.toml ./
# Pre-install CPU-only PyTorch to avoid CUDA / Nvidia runtime wheels (saves ~3.8GB)
RUN uv pip install --system --no-cache --index-url https://download.pytorch.org/whl/cpu torch
# Install core + AI dependencies
RUN uv pip install --system --no-cache -r pyproject.toml --extra ai

COPY app ./app

ENV PYTHONUNBUFFERED=1
EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
