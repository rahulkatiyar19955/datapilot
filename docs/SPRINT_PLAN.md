# 7-Day Sprint Plan - DataPilot

This plan organizes the 1-week build timeline for a 4-person team. It prioritizes achieving a working end-to-end local Electron desktop application by Day 4, leaving ample buffer for Docker socket integration, local LLM compatibility, E2E testing, and pitch/demo preparation.

---

## 👥 Team Roles & Responsibilities

* **Dev 1: Lead Desktop Engineer & Orchestrator**
  * Electron main process configuration, typed IPC contracts (`src/shared/ipc.ts`), preload contextBridge api, native file dialogs, and Docker socket management.
* **Dev 2: Frontend Desktop UI Engineer**
  * Electron renderer UI screen components (`src/renderer/screens/`), bespoke React + inline SVG chart views, zustand screen states, local font importing, and styling using Vanilla CSS.
* **Dev 3: ML, Knowledge Graph & API Router Specialist**
  * Neo4j DB container seeding (nodes, vectors), causal rules engine config, SQLite schema tables (`sessions`, `agent_models`, `session_costs`, `langgraph_checkpoints`), and multi-provider LLM API router (OpenAI, Gemini, Llama).
* **Dev 4: DevOps, Packaging & Integration (PM/Fullstack)**
  * Docker Compose container builds, local directory mount permissions, Electron desktop packaging configuration (`electron-builder`), and QA test bag runs.

---

## 📅 Day-by-Day Execution Plan

### Day 1: Electron App Setup & Docker Connection
* **Daily Goal**: Establish the desktop app skeleton and verify connection to the local Docker socket.
* **🔴 Non-Negotiable Outcome**: Electron app shell launches, Main process connects to `/var/run/docker.sock` and spins up the local Neo4j database container.
* **Task Allocation**:
  * **Dev 1**: Scaffold Electron project using `pnpm create @quick-start/electron` (electron-vite React template). Setup `src/main/`, `src/preload/`, `src/renderer/` directories under a single Node package.
  * **Dev 2**: Design the frameless WindowChrome, titlebars, and side rails. Declare Tailwind v4 `@theme` tokens in `src/renderer/styles/globals.css`.
  * **Dev 3**: Configure the local Neo4j DB Docker Compose configuration and verify cloud API connections (OpenAI/Gemini).
  * **Dev 4**: Set up dev environment packaging configs and create a base `docker-compose.yml` for FastAPI, Neo4j, and the 5 worker microservices.

---

### Day 2: Docker Verification, Setup UI & Preload Script
* **Daily Goal**: Build the Docker socket check, Setup screens, and file picker IPC.
* **🔴 Non-Negotiable Outcome**: If Docker is off, Electron renders the Setup Guide screen; if Docker is running, the app starts container services and permits picking local MCAP paths via OS file dialogs.
* **Task Allocation**:
  * **Dev 1**: Code Main process startup sequence using `dockerode`. Implement contextBridge preload scripts using typed IPC channels defined in `src/shared/ipc.ts`.
  * **Dev 2**: Implement the Setup & Troubleshooting Screen (`screens/Setup.tsx`) and install `@fontsource/inter` and `@fontsource/jetbrains-mono` locally.
  * **Dev 3**: Code the base structures for local LLM requests (Ollama/Llama.cpp local ports) and define MCP tool schemas.
  * **Dev 4**: Pull required Docker base images, configure local host directory mounts, and organize test bags in `./sample_bags`.

---

### Day 3: Ingestion Pipeline & Bespoke Timeline Base
* **Daily Goal**: Ingest local files into the containerized databases and draw the logs timeline.
* **🔴 Non-Negotiable Outcome**: Clicking a file on the host indexes the metadata in SQLite, parses logs to the Neo4j database container, and draws message severity counts on a bespoke inline SVG timeline.
* **Task Allocation**:
  * **Dev 1**: Configure local directory mounting into the FastAPI parser container. Save session files to SQLite.
  * **Dev 2**: Code the bespoke `LogTimeline` component as an inline React + SVG component (no external charting libraries) and connect it to local port `8000`.
  * **Dev 3**: Write Neo4j ingestion drivers (parsing logs directly from the mounted filepath, generating embeddings, running causal rules engine, indexing).
  * **Dev 4**: Build FastAPI local metadata endpoints (`/api/sessions/{id}` and `/api/sessions/{id}/timeline`).

---

### Day 4: LangGraph Orchestration & Model Toggles (MVP Goal)
* **Daily Goal**: Integrate the LangGraph state machine and LLM router.
* **🔴 Non-Negotiable Outcome**: Typing in the chat terminal routes the prompt to either cloud APIs (OpenAI, Gemini) or local Llama, running the plan-and-execute loop locally.
* **Task Allocation**:
  * **Dev 1**: Integrate the LangGraph orchestrator loop inside the FastAPI container. Use SQLite on the host user-data folder for checkpoints (`langgraph_checkpoints` table).
  * **Dev 2**: Design `screens/Copilot.tsx` with a model selector panel (OpenAI, Gemini, Llama) linked to SQLite `agent_models` table.
  * **Dev 3**: Implement the LLM Router inside FastAPI to handle OpenAI, Google Gemini, and Llama connection protocols.
  * **Dev 4**: Integrate the local MCP client connection and run E2E chat runs using the host file selection.

---

### Day 5: Decoupled MCP Worker Services
* **Daily Goal**: Build independent containerized worker microservices.
* **🔴 Non-Negotiable Outcome**: Five separate MCP worker containers running locally, responding to JSON-RPC tools request payloads.
* **Task Allocation**:
  * **Dev 1**: Expose agent execution audit trail JSON payload (`AuditEvent[]`) to Electron Renderer over SSE.
  * **Dev 2**: Build the bespoke `MetricPlot` SVG charts to display velocity and CPU usage. Code a hidden keyboard shortcut (`⌘⇧D`) to view the `DesignSystem` verification screen.
  * **Dev 3**: Code the logic for the 5 independent MCP worker services (`RosbagReader`, `TrajectoryAnalyzer`, `PlannerFailureInspector`, `AnomalyDetector`, and `ReportComposer`).
  * **Dev 4**: Create individual Dockerfiles for all 5 MCP workers and append them to the main Docker Compose configuration managed by Electron.

---

### Day 6: Replan Tuning, Caching & Desktop Packaging
* **Daily Goal**: Apply agent loop guards and build the desktop installer.
* **🔴 Non-Negotiable Outcome**: The app blocks infinite replan loops (max 5 iterations), has active response caching, and compiles to a native desktop installer.
* **Task Allocation**:
  * **All Devs**: Build testing: verify app launching with Docker Desktop off, check permission fixes, run diagnostics.
  * **Dev 1**: Code the 5-replan iteration gate in LangGraph. Set up `electron-builder` configuration for building OS packages.
  * **Dev 2**: Refine desktop interface styling using Vanilla CSS (custom title bar, layout sizing, responsive frames).
  * **Dev 3**: Add database constraints, write a Neo4j startup seeding script, and verify local Llama diagnostic output.
  * **Dev 4**: Build demo data launchers. Bundle sample bags with the Electron installer.

---

### Day 7: E2E Video, Pitch Deck & Submission
* **Daily Goal**: Package the project and create presentation assets.
* **🔴 Non-Negotiable Outcome**: 3-minute video showing the desktop app loading a bag, detecting errors with Llama/OpenAI, and a finalized pitch deck.
* **Task Allocation**:
  * **Dev 1 & 3**: Clean up the codebase, add docstrings, verify no credentials or host-specific paths are hardcoded.
  * **Dev 2**: Review UI visual consistency (responsive layouts, typography alignment, and clear hover interactions).
  * **Dev 4 (Lead)**: Record the 3-minute desktop app walkthrough, compile the Pitch Deck, submit.

---

## 🛡️ Risk Buffering Strategy

1. **Docker Permission Blocks**: If macOS/Windows Docker socket bindings fail, Electron will prompt the user with a setup panel that contains step-by-step shell commands.
2. **Local GPU Availability**: If local Llama execution is too slow, the UI prominently defaults to OpenAI or Gemini cloud APIs, keeping Llama as an optional air-gapped configuration.
3. **Strict Friday Freeze**: No new features are allowed to be added after Thursday midnight (End of Day 5). Days 6 and 7 are reserved strictly for packaging, stability, and demo recording.
