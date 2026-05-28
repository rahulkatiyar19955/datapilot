# `mcap-parser` service.
#
# Dedicated MCAP / ROS bag parser with multi-encoding support
# (CDR, Foxglove protobuf). Keeps heavy parsing deps isolated from
# the main backend image.
#
# Build context: repo root (docker build -f mcap_parser/Dockerfile .)
FROM python:3.11-slim

WORKDIR /app

# uv for fast, reproducible installs.
RUN pip install --no-cache-dir uv

COPY mcap_parser/requirements.txt ./requirements.txt
RUN uv pip install --system --no-cache -r requirements.txt

COPY mcap_parser/ ./mcap_parser/

ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1

EXPOSE 8100

HEALTHCHECK --interval=5s --timeout=5s --retries=12 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8100/health', timeout=2).status==200 else 1)"

CMD ["python", "-m", "uvicorn", "mcap_parser.app:app", "--host", "0.0.0.0", "--port", "8100"]
