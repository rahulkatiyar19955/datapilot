# Phase 0 placeholder. Full image (with mcap, rosbags, neo4j drivers, etc.) lands in Phase 3.
FROM python:3.11-slim

WORKDIR /app

# uv for fast, reproducible installs
RUN pip install --no-cache-dir uv

COPY pyproject.toml ./
RUN uv pip install --system --no-cache .

COPY app ./app

ENV PYTHONUNBUFFERED=1
EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
