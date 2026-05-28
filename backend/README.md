# DataPilot Backend Service

The DataPilot backend is a local-first service built with **FastAPI** and **LangGraph**. It manages telemetry ingestion (converting and parsing ROS 2 bag files into Neo4j and SQLite databases) and powers the multi-agent reasoning copilot.

---

## 🚀 Setup & Run Locally

### 1. Prerequisites
Ensure you have installed:
* **Python 3.11+**
* [**uv**](https://github.com/astral-sh/uv) (strongly recommended for fast, reproducible dependency installation)
* **Docker Desktop** (running local database services)

### 2. Local Environment Setup
Synchronize dependencies and create a local virtual environment:
```bash
cd backend
uv sync --all-extras
```

### 3. Running Database Services
The FastAPI backend depends on **Neo4j** (and SQLite). You can boot the database instance from the root of the project:
```bash
# From the project root
docker compose up -d neo4j
```

### 4. Run the Dev Server
Start the API server with auto-reload enabled:
```bash
# From the backend/ directory
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```
Once started, you can access the interactive API docs at [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs).

---

## 📦 Container Build (Docker)

DataPilot's desktop application orbits around a containerized stack. To build the backend image manually for Electron consumption:

```bash
# From the project root or backend/ directory
docker build -t datapilot/backend:local ./backend
```

---

## 🧪 Testing & Validation

The backend uses `pytest` for all unit, integration, and evaluation tests.

### Run Unit and Integration Tests
To run the standard fast test suite (excludes LLM/eval/live tests):
```bash
cd backend
uv run pytest
```

### Run Evaluation Suite (Golden Trajectory Tests)
To run the deterministic agent trajectory checks:
```bash
# Via backend directory
uv run pytest -m eval -v

# Or via npm/pnpm from the project root
pnpm eval
```

### Run Live LLM Integration Tests
To run evaluations against live cloud LLM APIs:
```bash
# From the backend directory
LIVE_LLM=1 ANTHROPIC_API_KEY="your-key-here" uv run pytest -m "eval or live" -v

# Or via npm/pnpm from the project root
pnpm eval:live
```

---

## 🧹 Code Quality & Linting

Format and lint the python codebase using `ruff`:
```bash
# Check formatting and lint errors
uv run ruff check .

# Auto-fix lint violations
uv run ruff check --fix .
```
