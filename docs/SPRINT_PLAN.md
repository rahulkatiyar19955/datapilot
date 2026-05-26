# 7-Day Sprint Plan - DataPilot

This plan organizes the 1-week build timeline for a 4-person team. It prioritizes achieving a working end-to-end local Electron desktop application by Day 4, leaving ample buffer for Docker socket integration, local LLM compatibility, E2E testing, and pitch/demo preparation.

---

## 👥 Team Roles & Responsibilities

* **Dev 1: Lead Desktop Engineer & Orchestrator**
  * Electron main process configuration, IPC bridge APIs, native OS file picker integration, Docker socket daemon orchestration via `dockerode`.
* **Dev 2: Frontend Desktop UI Engineer**
  * Electron renderer UI design, dashboard terminal layout using Vanilla CSS, Recharts logs visualization, local LLM selector settings, and Docker troubleshooting guide screens.
* **Dev 3: ML, Knowledge Graph & API Router Specialist**
  * Neo4j DB container seeding (nodes, vectors), multi-provider LLM API router (OpenAI, Gemini, local Llama), and Python-based MCP worker server configurations.
* **Dev 4: DevOps, Packaging & Integration (PM/Fullstack)**
  * Docker Compose container builds, local directory mount permissions, Electron desktop packaging configuration (`electron-builder`), and QA test bag runs.

---

## 📅 Day-by-Day Execution Plan

### Day 1: Electron App Setup & Docker Connection
* **Daily Goal**: Establish the desktop app skeleton and verify connection to the local Docker socket.
* **🔴 Non-Negotiable Outcome**: Electron app shell launches, Main process connects to `/var/run/docker.sock`, and spins up the local Neo4j database container.
* **Task Allocation**:
  * **Dev 1**: Scaffold Electron project (main process setup, preload script, renderer project directories), implement `dockerode` connection logic.
  * **Dev 2**: Configure Next.js/React static build settings inside Electron Renderer, set up base Vanilla CSS variables, and design main app dashboard layouts.
  * **Dev 3**: Configure the local Neo4j DB Docker Compose configuration and verify cloud API connections (OpenAI/Gemini).
  * **Dev 4**: Set up dev environment packaging configs and create a base `docker-compose.yml` for FastAPI, Neo4j, and the 5 worker microservices.

---

### Day 2: Docker Verification, Setup UI & Native File Selector
* **Daily Goal**: Build the Docker socket check, Setup screens, and file picker IPC.
* **🔴 Non-Negotiable Outcome**: If Docker is off, Electron renders the Setup Guide screen; if Docker is running, the app starts container services and permits picking local MCAP paths via OS file dialogs.
* **Task Allocation**:
  * **Dev 1**: Code the Main process startup sequence: query Docker status, boot containers, and map native OS file selection dialog paths over IPC.
  * **Dev 2**: Implement the **Setup & Troubleshooting Screen** (instructions for starting Docker Desktop, enabling default socket usage, and permissions guide).
  * **Dev 3**: Code the base structures for local LLM requests (Ollama/Llama.cpp local ports) and define MCP tool schemas.
  * **Dev 4**: Pull required Docker base images, configure local host directory mounts, and organize test bags in `./sample_bags`.

---

### Day 3: Ingestion Pipeline & Host Storage
* **Daily Goal**: Ingest local files into the containerized databases and draw the logs timeline.
* **🔴 Non-Negotiable Outcome**: Clicking a file on the host indexes the metadata in SQLite, parses logs to the Neo4j database container, and draws message severity counts on the UI timeline.
* **Task Allocation**:
  * **Dev 1**: Configure local directory mounting into the FastAPI parser container. Save session files to SQLite.
  * **Dev 2**: Code `LogTimeline` component with Recharts, fetching data from local port `8000`.
  * **Dev 3**: Write Neo4j ingestion drivers (parsing logs directly from the mounted filepath, generating embeddings, indexing).
  * **Dev 4**: Build FastAPI local metadata endpoints (`/api/sessions/{id}` and `/api/sessions/{id}/timeline`).

---

### Day 4: LangGraph Orchestration & Model Toggles (MVP Goal)
* **Daily Goal**: Integrate the LangGraph state machine and LLM router.
* **🔴 Non-Negotiable Outcome**: Typing in the chat terminal routes the prompt to either cloud APIs (OpenAI, Gemini) or local Llama, running the plan-and-execute loop locally.
* **Task Allocation**:
  * **Dev 1**: Integrate the LangGraph orchestrator loop inside the FastAPI container. Use SQLite on the host user-data folder for checkpoints.
  * **Dev 2**: Design `ChatTerminal` with a settings toggle panel (API providers: OpenAI, Gemini, Llama; input fields for API keys; local endpoint URL configurations).
  * **Dev 3**: Implement the LLM Router inside FastAPI to handle OpenAI, Google Gemini, and Llama connection protocols.
  * **Dev 4**: Integrate the local MCP client connection and run E2E chat runs using the host file selection.

---

### Day 5: Decoupled MCP Worker Services
* **Daily Goal**: Build independent containerized worker microservices.
* **🔴 Non-Negotiable Outcome**: Five separate MCP worker containers running locally, responding to JSON-RPC tools request payloads.
* **Task Allocation**:
  * **Dev 1**: Expose agent execution audit trail JSON payload (planner steps, tool execution statuses) to Electron Renderer.
  * **Dev 2**: Bind timeline click events to pre-populate chat queries with relative timestamps.
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
* **Daily Goal**: Compile presentation assets and clean the codebase.
* **🔴 Non-Negotiable Outcome**: 3-minute video showing the desktop app loading a bag, detecting errors with Llama/OpenAI, and a finalized pitch deck.
* **Task Allocation**:
  * **Dev 1 & 3**: Clean up the codebase, add docstrings, verify no credentials or host-specific paths are hardcoded.
  * **Dev 2**: Double-check renderer responsive sizing, alignment, and hover feedback.
  * **Dev 4 (Lead)**: Record the 3-minute desktop app walkthrough, compile the Pitch Deck (highlighting data privacy, local Docker orchestration, and LLM flexibility), submit.

---

## 🛡️ Risk Buffering Strategy

1. **Docker Permission Blocks**: If macOS/Windows Docker socket bindings fail, Electron will prompt the user with a setup panel that contains step-by-step shell commands, rather than silently failing or crashing.
2. **Local GPU Availability**: If local Llama execution is too slow, the UI prominently defaults to OpenAI or Gemini cloud APIs, keeping Llama as an optional air-gapped configuration.
3. **Strict Friday Freeze**: No new features are allowed to be added after Thursday midnight (End of Day 5). Days 6 and 7 are reserved strictly for packaging, stability, and demo recording.
