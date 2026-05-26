# Phase 0 placeholder. Real worker image lands in Phase 5.
FROM python:3.11-slim
WORKDIR /app
COPY pyproject.toml ./
RUN pip install --no-cache-dir mcp
COPY server.py ./
ENV PYTHONUNBUFFERED=1
CMD ["python", "server.py"]
