# 7-Day Sprint Plan - DataPilot

This plan organizes the 1-week build timeline for a 4-person team. It prioritizes achieving a working end-to-end multi-agent prototype by Day 4, leaving ample buffer for MCP service integration, UI polish, testing, and pitch/demo preparation.

---

## 👥 Team Roles & Responsibilities

* **Dev 1: Lead Backend & Orchestrator**
  * FastAPI server routes, SQLite database setup, LangGraph state machine integration, SQLite checkpointer configuration.
* **Dev 2: Frontend Engineer**
  * Next.js dashboard development, terminal layout design (Vanilla CSS), timeline charts (Recharts), API integration, and audit trail/execution step UI.
* **Dev 3: ML, Knowledge Graph & MCP Specialist**
  * Neo4j property graph setup (nodes, relationships, indexes), native vector indexing, MCP tool schema generation, and independent MCP worker microservice coding.
* **Dev 4: DevOps, Integration & Demo Prep (PM/Fullstack)**
  * Docker Compose multi-container orchestration, network binding setup, sample bag ingestion orchestration, E2E QA testing, pitch deck, and demo video production.

---

## 📅 Day-by-Day Execution Plan

### Day 1: Infrastructure Setup & Skeletons
* **Daily Goal**: Establish the multi-container dev environment and verify base communications.
* **🔴 Non-Negotiable Outcome**: Next.js, FastAPI, and Neo4j services running locally in Docker Compose and successfully communicating.
* **Task Allocation**:
  * **Dev 1**: Set up FastAPI skeleton, write Pydantic schemas, and define SQLite database connection.
  * **Dev 2**: Scaffold Next.js + TS project, initialize Vanilla CSS styling theme, and construct main app shell.
  * **Dev 3**: Spin up local Neo4j Docker container, verify embedding API keys (OpenAI/Anthropic), and write graph constraint scripts.
  * **Dev 4**: Write Dockerfiles for frontend, backend, and database; configure `docker-compose.yml` skeleton (including stub configs for the 5 MCP workers).

---

### Day 2: MCP Server Contracts & Drag-and-Drop Ingestion
* **Daily Goal**: Define MCP worker schemas and build the file upload pipeline.
* **🔴 Non-Negotiable Outcome**: Frontend uploads an `.mcap` file to the backend, which parses headers and returns metadata; MCP schemas are finalized.
* **Task Allocation**:
  * **Dev 1**: Write background upload handlers. Ingest bag headers, topics, duration, and save metadata to SQLite.
  * **Dev 2**: Design `UploadZone` utilizing a drag-and-drop file interface with a functional upload progress bar.
  * **Dev 3**: Define the strict JSON input/output schemas for the 5 MCP workers. Write base Python MCP wrappers.
  * **Dev 4**: Source 3 distinct sample rosbags (lidar failure, tf drift, navigation abort). Verify they are under 150MB. Set up `./sample_bags` directory.

---

### Day 3: Ingestion to Databases & Timeline Base
* **Daily Goal**: Populate relational and graph databases from ingestion and display log count charts.
* **🔴 Non-Negotiable Outcome**: Uploading a bag writes metadata/checkpoints to SQLite, populates the Neo4j graph with Incident nodes, and displays a severity timeline in the UI.
* **Task Allocation**:
  * **Dev 1**: Extract critical logs (WARN/ERROR/FATAL) from the bag during ingestion and populate SQLite `filtered_logs` tables.
  * **Dev 2**: Implement `LogTimeline` using Recharts to visualize message counts grouped by error levels.
  * **Dev 3**: Code Neo4j database writers to parse logs, generate embeddings, insert vector index records, and link incident nodes to robot runs.
  * **Dev 4**: Build the `/api/sessions/{id}` metadata and `/api/sessions/{id}/timeline` endpoints.

---

### Day 4: LangGraph Orchestrator Integration (MVP Goal)
* **Daily Goal**: Code the main LangGraph multi-agent diagnostic loop.
* **🔴 Non-Negotiable Outcome**: A user can ask a diagnostic question; the backend Planner, Executor, and Finalizer nodes run in LangGraph and log execution steps.
* **Task Allocation**:
  * **Dev 1**: Code the LangGraph state machine (Planner, Executor, Replan, Finalizer) embedded inside FastAPI. Configure SQLite checkpointer.
  * **Dev 2**: Build `ChatTerminal` component displaying markdown, citation hovercard links, and a collapsible "Agent Audit Trail" showing executed steps.
  * **Dev 3**: Implement the MCP Client Manager inside FastAPI to connect to mock MCP servers and execute tool schemas.
  * **Dev 4**: Connect frontend chat form to the `/api/sessions/{id}/chat` endpoint and verify the plan-and-execute sequence logs correctly.

---

### Day 5: Decoupled MCP Worker Services Implementation
* **Daily Goal**: Replace mock MCP workers with independent microservices.
* **🔴 Non-Negotiable Outcome**: Five separate MCP worker processes running as independent services, resolving real ROS bag files and telemetry data.
* **Task Allocation**:
  * **Dev 1**: Code execution progress updates in LangGraph and expose intermediate step outputs to the API layer.
  * **Dev 2**: Bind timeline clicks to auto-fill chat prompts (e.g. clicking a timeline spike pre-fills: *"Diagnose system failure around timestamp 14.8s"*).
  * **Dev 3**: Code the logic for the 5 independent MCP worker services: `RosbagReader`, `TrajectoryAnalyzer`, `PlannerFailureInspector`, `AnomalyDetector`, and `ReportComposer`.
  * **Dev 4**: Build Dockerfiles for each of the 5 MCP microservices, update `docker-compose.yml` to run all 5 containers, and resolve internal network ports.

---

### Day 6: Dynamic Replanning, Caching & Bug Hunt
* **Daily Goal**: Configure dynamic loops, control limits, and run E2E diagnostics.
* **🔴 Non-Negotiable Outcome**: Stable, fully frozen build that handles worker failure, gates infinite replan loops, and parses similar incidents via Neo4j.
* **Task Allocation**:
  * **All Devs**: Rigorous testing. Mock worker disconnects, test large questions, and verify gVisor-based sandbox safety for telemetry parsing.
  * **Dev 1**: Implement execution constraints (maximum 5 replans) in LangGraph. Add response caching for identical chat questions.
  * **Dev 2**: Polish Next.js pages with Vanilla CSS to ensure visual excellence, premium animations, and a cohesive terminal design.
  * **Dev 3**: Implement a Neo4j causal query helper (wrapping raw Cypher querying behind safety checks). Seed Neo4j with robot-12 metadata and incident history on startup.
  * **Dev 4**: Implement the "Pre-loaded Demo" buttons on the UI homepage to load pre-parsed incident databases immediately.

---

### Day 7: Demo Video, Pitch Deck & Presentation Prep
* **Daily Goal**: Package the project and create presentation assets.
* **🔴 Non-Negotiable Outcome**: High-quality 3-minute video screencast, completed pitch deck, and clean code repository.
* **Task Allocation**:
  * **Dev 1 & 3**: Clean up the codebase, add docstrings, and verify `.gitignore` doesn't leak secrets or API keys.
  * **Dev 2**: Review UI visual consistency (responsive layouts, typography alignment, and clear hover interactions).
  * **Dev 4 (Lead)**: Record and edit the 3-minute demo video. Structure and write the Pitch Deck slides (Problem, Solution, Agent Architecture, Fleet KG, Team).
  * **All Devs**: Run a mock Q&A session and submit the hackathon entry.

---

## 🛡️ Risk Buffering Strategy

1. **MCP Port Overlap (Day 5 Buffer)**: If managing 5 network services becomes problematic, we will fall back to using a single multi-tool MCP server for all 5 tools as a single process under port `5001`.
2. **Offline Resilience**: The database layer uses local containerized Neo4j and SQLite files. Only LLM API calls hit the internet, preserving performance during the demo.
3. **Strict Friday Freeze**: No new features are allowed to be added after Thursday midnight (End of Day 5). Days 6 and 7 are reserved strictly for stability, design polish, and storytelling.
