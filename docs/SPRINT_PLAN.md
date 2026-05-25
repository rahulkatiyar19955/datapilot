# 7-Day Sprint Plan - DataPilot

This plan organizes the 1-week build timeline for a 4-person team. It prioritizes achieving a working end-to-end MVP by Day 4, leaving ample buffer for UI polish, testing, and pitch/demo preparation.

---

## 👥 Team Roles & Responsibilities

* **Dev 1: Lead Backend & Parser**
  * Core FastAPI development, file system handling, SQLite setup, MCAP/ROS 2 binary parsing logic.
* **Dev 2: Frontend Engineer**
  * Next.js dashboard development, UI layout (Tailwind), timeline charts (Recharts), API integration.
* **Dev 3: ML & AI Specialist**
  * Vector database indexing (Milvus), RAG search logic, context retrieval strategies, prompt engineering, LLM API client.
* **Dev 4: DevOps, Integration & Demo Prep (PM/Fullstack)**
  * Docker Compose packaging, sample bag generation, end-to-end QA testing, pitch deck, demo video recording.

---

## 📅 Day-by-Day Execution Plan

### Day 1: Infrastructure Setup & Skeletons
* **Daily Goal**: Establish the dev environment and deploy a connected "Hello World" monorepo.
* **🔴 Non-Negotiable Outcome**: Both Next.js and FastAPI services running locally in Docker Compose and successfully communicating via a test HTTP endpoint.
* **Task Allocation**:
  * **Dev 1**: Create FastAPI project structure, write Pydantic schemas, and set up database/folder skeletons.
  * **Dev 2**: Scaffold Next.js + TS project, install dependencies (Tailwind, Lucide React, Axios), and design main app shell.
  * **Dev 3**: Spin up local Milvus instance, verify embedding API keys (OpenAI/Anthropic), and prototype embedding test script.
  * **Dev 4**: Write `Dockerfile` configurations, orchestrate `docker-compose.yml`, configure `.env.example`, and write `setup.sh`.

---

### Day 2: Rosbag Ingestion & File Upload UI
* **Daily Goal**: Build the pipeline to ingest ROS 2 files and upload them from the UI.
* **🔴 Non-Negotiable Outcome**: Frontend uploads an `.mcap` file to the backend, which parses the file headers and returns basic metadata.
* **Task Allocation**:
  * **Dev 1**: Write `app/services/parser.py` using python `mcap` library to parse bag header, topics list, duration, and extract raw `/rosout` messages.
  * **Dev 2**: Design `UploadZone.tsx` utilizing a drag-and-drop file interface with a functional upload progress bar.
  * **Dev 3**: Write text chunking strategies for ROS logs (e.g. grouping by time windows or nodes) and write test schema for Milvus.
  * **Dev 4**: Source 3 distinct sample rosbags (lidar failure, tf drift, navigation abort). Verify they are under 150MB. Set up `./sample_bags` directory.

---

### Day 3: Ingestion Pipeline Integration & Timeline Base
* **Daily Goal**: Connect parsing data directly to database storage and feed log counts to the UI timeline.
* **🔴 Non-Negotiable Outcome**: Uploading a bag automatically populates SQLite with filtered logs (warnings/errors) and Milvus with vector embeddings, rendering a mock timeline.
* **Task Allocation**:
  * **Dev 1**: Wire FastAPI upload endpoint to trigger background parsing. Save metadata to `sessions` table and filtered logs to `filtered_logs` table.
  * **Dev 2**: Implement `LogTimeline.tsx` using Recharts to visualize message counts grouped by error levels (Info, Warn, Error).
  * **Dev 3**: Develop vector database insertion pipeline. Automatically vectorize and write logs to Milvus as they are parsed.
  * **Dev 4**: Build the `/api/sessions/{id}` endpoint to return metadata summaries (topics, robot name, start/end timestamps).

---

### Day 4: RAG Pipeline Integration & Chat Interface (MVP Goal)
* **Daily Goal**: Establish the core AI chat debugging loop.
* **🔴 Non-Negotiable Outcome**: A user can type a question about a parsed bag, and the backend retrieves relevant logs, sends them to the LLM, and displays the response.
* **Task Allocation**:
  * **Dev 1**: Create `/api/sessions/{id}/chat` endpoint. Coordinate calls between Milvus vector retriever and LLM service.
  * **Dev 2**: Build `ChatTerminal.tsx` (terminal styling, markdown parsing, scrolling window, loading states). Connect it to the backend chat API.
  * **Dev 3**: Code the RAG context retrieval logic. Implement a hybrid approach: query Milvus for semantic match AND fetch SQL warnings near relevant timestamps. Craft system prompt.
  * **Dev 4**: Conduct end-to-end verification. Test querying *"Why did the robot stop?"* against the lidar failure sample bag. Document prompt responses.

---

### Day 5: Timeline Interaction & Quick Health Check
* **Daily Goal**: Enable direct visual interactions on the timeline and generate automated reports.
* **🔴 Non-Negotiable Outcome**: Clicking on an error spike in the timeline zooms the log view and updates the chat context; automated report prints on file upload.
* **Task Allocation**:
  * **Dev 1**: Develop `/api/sessions/{id}/timeline` endpoint returning precise error/warning timestamps.
  * **Dev 2**: Bind timeline click-handlers to update chat prompts (e.g. clicking a spike pre-fills: *"What happened at timestamp 14.2s?"*).
  * **Dev 3**: Code the "Quick Diagnostics Report" service—an LLM agent that scans the global error list on upload to write a 3-bullet summary of the issue.
  * **Dev 4**: Connect report output to UI. Audit application styling (colors, typography, spacing) for a premium dark-mode dashboard look.

---

### Day 6: Feature Freeze, Optimizations & Bug Hunt
* **Daily Goal**: Lock features down and ensure 100% reliability of the demo stack.
* **🔴 Non-Negotiable Outcome**: Stable, fully frozen build that runs anywhere with a single docker-compose command, including pre-loaded demo bag configurations.
* **Task Allocation**:
  * **All Devs**: Rigorous testing. Upload invalid files, ask weird questions, reload pages midway. Squash all critical edge-case crashes.
  * **Dev 1 & 3**: Add response caching for identical chat questions. Optimize prompt size to decrease LLM latency below 10 seconds.
  * **Dev 2 & 4**: Implement "Pre-loaded Demo" buttons on the homepage. If clicked, the system bypasses file upload and loads a pre-parsed session immediately.

---

### Day 7: Demo Video, Pitch Deck & Presentation Prep
* **Daily Goal**: Package the project and create presentation assets.
* **🔴 Non-Negotiable Outcome**: High-quality 3-minute video screencast, completed slide deck, and code repository clean-up.
* **Task Allocation**:
  * **Dev 1 & 3**: Clean up the codebase, add docstrings, verify `.gitignore` doesn't leak secrets/API keys.
  * **Dev 2**: Verify UI visual consistency. Ensure there are no broken links, spelling errors, or visual glitches.
  * **Dev 4 (Lead)**: Record and edit the 3-minute demo video. Structure and write the Pitch Deck slides (Problem, Solution, Architecture, Market/Vision, Team).
  * **All Devs**: Conduct a mock QA session, verify README quick-start works on a clean system, and submit the hackathon entry.

---

## 🛡️ Risk Buffering Strategy

1. **Fallback for Missing ROS Bags (Day 4 Buffer)**: If creating custom MCAP files takes too long, we will use plain text CSV log lists mimicking standard rosbag terminal output to test the parser.
2. **Offline Resilience**: The RAG database is local/embedded (Milvus Lite + SQLite). Only LLM calls hit the internet, minimizing dependence on slow conference Wi-Fi.
3. **Strict Friday Freeze**: No new features are allowed to be added after Thursday midnight (End of Day 5). Days 6 and 7 are reserved strictly for stability, design polish, and storytelling.
