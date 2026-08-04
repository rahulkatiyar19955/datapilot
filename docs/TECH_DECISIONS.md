# Technical Decisions - DataPilot

This document outlines the core technical decisions for DataPilot, highlighting the trade-offs, final recommendations, and risk mitigations. It preserves the project's decision history, tracking how the stack evolved from a web client prototype into an offline-first Electron application.

## Guiding Principles

- **Open Source First**: We prioritize robust, active, and community-driven open-source software (OSS) tools and frameworks (such as React, Electron, FastAPI, Neo4j, LangGraph, and ROS 2 integrations).
- **Offline & Local Execution**: We prioritize running analysis pipelines locally to guarantee data privacy, avoid cloud latency on gigabyte-sized files, and ensure the app works in disconnected warehouse environments.
- **Visual Parity**: We enforce exact fidelity with the visual design mockups, avoiding layout reflows and dynamic resizing issues.

---

## 1. Client Architecture History

### 1.1 [SUPERCEDED] Frontend Framework: Next.js vs. React (with Vite) vs. Vanilla HTML/JS

| Technology | Pros | Cons |
| :--- | :--- | :--- |
| **Next.js** (Original Choice) | - Production-ready with built-in performance optimizations.<br>- Server-side rendering (SSR) and React Server Components (RSC) for better loading times.<br>- Rich ecosystem for charting and UI components. | - Steeper learning curve than a basic Vite setup.<br>- Deployment configuration is more involved than static serving. |
| **React + Vite** | - Extremely fast startup & HMR (Hot Module Replacement).<br>- Clean, single-page app (SPA) output. | - Lacks built-in SSR/SEO optimizations out of the box.<br>- Requires separate backend project routing/cors configuration. |
| **Vanilla HTML/JS** | - Zero build step. | - Maintaining dynamic UI state (chat window, interactive timelines, upload states) becomes verbose and error-prone. |

* **Original Decision**: **Next.js**. As the project pivoted towards a production-ready stack, Next.js was selected for routing and SSR.
* **Status**: **SUPERCEDED** by Section 1.2.

---

### 1.2 [APPROVED] Desktop Application Shell: Electron (Vite + React 19) vs. Next.js Web App vs. Tauri (Rust)

| Factor | Vite + React 19 (Recommended) | Next.js |
| :--- | :--- | :--- |
| **SSR / Server Components** | - Not needed inside a local Electron window (overkill). | - Adds bundle size and startup overhead. |
| **Routing** | - Screen state belongs in a global `zustand` store (no URL routes needed). | - Designed for URL-based page routing; App Router goes unused. |
| **Build Pipeline** | - A single `electron-vite` config compiles the main process, preload, and renderer together. | - Requires dual compilation: `next build && next export` to static HTML, then loaded in Electron. High risk of build drift. |
| **HMR in Electron** | - Native, instant, and reliable inside the Electron harness. | - Slower; requires wrappers like `nextron`. |
| **Portability** | - Components, Tailwind tokens, and stores can easily migrate to Next.js later if a web client is needed. | - Already aligned, but introduces lock-in early on. |

* **Revised Decision**: **Electron Desktop App with Vite + React 19 (via `electron-vite`)**. Next.js introduces unnecessary build pipeline complexity (dual-compilation and static exporting workarounds) and SSR bloat inside a local desktop app window. Vite + React 19 provides instant HMR, smaller bundle sizes, and a single, unified Node package.

---

## 2. Backend Language & Framework: Python (FastAPI) vs. Node.js (Express) vs. C++

| Technology | Pros | Cons |
| :--- | :--- | :--- |
| **Python (FastAPI)** (Recommended) | - Direct access to the official `mcap` reader and ROS message parsing packages.<br>- Native ecosystem for LLM SDKs, LangGraph, and Neo4j drivers.<br>- Fast, typed request handling with Pydantic. | - Higher CPU/Memory footprint compared to compiled languages like Go/C++. |
| **Node.js (Express)** | - Single language stack across frontend and backend. | - Parsing binary ROS serialization formats (CDR, SQLite db3) in Node is poorly supported and requires clunky bindings. |
| **C++** | - High performance, native ROS client (`rclcpp`). | - Slow development velocity. High overhead for simple HTTP servers and AI SDK integration. Unsuited for a rapid prototype. |

* **Decision**: **Python + FastAPI**. The ability to use Python’s native bag-parsing libraries and AI toolkits is non-negotiable.

---

## 3. Database Layer History

### 3.1 [SUPERCEDED] Database: Milvus vs. SQLite + ChromaDB vs. PostgreSQL + pgvector

| Technology | Pros | Cons |
| :--- | :--- | :--- |
| **Milvus** (Original Choice) | - Production-grade, highly scalable vector database built for massive datasets.<br>- Advanced indexing algorithms and high QPS (Queries Per Second).<br>- Cloud-native architecture with Milvus Lite available for local development. | - Higher operational complexity compared to a purely embedded database. |
| **SQLite + ChromaDB (Local)** | - Zero configuration required.<br>- Extremely portable; spin up and destroy instantly in containers. | - Not built for massive concurrent writes or enterprise-scale production workloads. |
| **PostgreSQL + pgvector** | - Enterprise-grade relational and vector storage in one database system. | - Requires spinning up and configuring a PostgreSQL service container, database migrations, and schema management. |

* **Original Decision**: **Milvus**. Selected for production scalability.
* **Status**: **SUPERCEDED** by Section 3.2.

---

### 3.2 [APPROVED] Hybrid DB Layer: Neo4j Graph Database + SQLite vs. Vector-Only Databases

| Technology | Pros | Cons |
| :--- | :--- | :--- |
| **Hybrid Neo4j + SQLite** (Recommended) | - **Neo4j** models complex causal failure paths and robot component hierarchies.<br>- Native vector search (Neo4j 5.x) allows hybrid queries (semantic + graph structure).<br>- **SQLite** handles lightweight Next.js sessions and LangGraph state checkpoints with zero setup. | - Requires running both a relational DB and a graph DB.<br>- Managing Cypher queries and SQL queries in parallel. |
| **Milvus / pgvector (Vector DB only)** | - Excellent for semantic search of log snippets. | - Misses structured causal relations between components and past failure modes. |

* **Revised Decision**: **Hybrid Neo4j + SQLite**. We deploy **Neo4j** in local Docker for the Fleet Knowledge Graph (relationships and vector log search) and **SQLite** locally on the host user data folder for UI metadata, session records, and LangGraph checkpointers.

---

## 4. Agent and Retrieval Strategy History

### 4.1 [SUPERCEDED] AI/LLM Strategy: Small Context RAG vs. Large Context Window Ingestion

| Strategy | Pros | Cons |
| :--- | :--- | :--- |
| **Hybrid RAG & Log Filtering** (Original Choice) | - Low API latency.<br>- Minimal token costs.<br>- Can handle bags of any duration.<br>- High accuracy by pinpointing specific windows. | - If the vector search misses the error context, the LLM won't see it. |
| **Raw Text Context Dump** | - The LLM sees everything, including subtle chronological trends. | - Huge token costs.<br>- High latency (often >30 seconds for GPT/Claude to read 100k tokens). |

* **Original Decision**: **Hybrid RAG & Log Filtering (FastAPI-only)**. Focused on log filtering and embedding context windows.
* **Status**: **SUPERCEDED** by Section 4.2.

---

### 4.2 [APPROVED] Agentic Orchestration: LangGraph Multi-Agent System vs. Single-Agent Loop

| Strategy | Pros | Cons |
| :--- | :--- | :--- |
| **LangGraph Multi-Agent** (Recommended) | - **Specialist isolation**: 6 dedicated subgraphs (RCA, Anomaly, Performance, Replay, Safety, Release) use targeted tools.<br>- Bounded execution: plan-then-execute with a hard cap of 5 replans.<br>- Robust checkpointers save state on SQLite. | - High design complexity; coordinating multiple agent prompts and schemas. |
| **Single-Agent Loop (ReAct)** | - Simple setup; single LLM routing prompt. | - Prone to infinite loops, token exhaustion, and dilution of system context. |

* **Revised Decision**: **LangGraph Multi-Agent Orchestrator** (embedded in FastAPI). The supervisor coordinates sequential specialists (RCA, Anomaly, Performance, Replay, Safety, Release) and streams execution steps directly to the Electron Renderer.

---

### 4.3 [APPROVED] LLM Connectivity: Multi-Provider Routing (OpenAI, Gemini, Llama) vs. Cloud-Only APIs

| Strategy | Pros | Cons |
| :--- | :--- | :--- |
| **Multi-Provider Routing** (Recommended) | - **Flexible deployment**: allows cloud APIs (OpenAI, Gemini) for general access, and a local model (Llama via Ollama/Llama.cpp) for offline or air-gapped robotics sites. | - Requires implementing multiple API client connectors and prompting configurations. |
| **Cloud-Only APIs** | - Easiest to configure; high quality of responses out of the box. | - Unusable in offline/field testing; conflicts with robotics teams' security protocols for proprietary data. |

* **Decision**: **Multi-Provider Routing (OpenAI, Gemini, Llama)**. Users can select their provider from the UI settings. The supervisor model defaults to a cheap-fast option (Haiku/Mini/Flash) for low latency.

---

### 4.4 [APPROVED] Worker Interface Contract: Model Context Protocol (MCP) vs. Pydantic Tools vs. gRPC

| Technology | Pros | Cons |
| :--- | :--- | :--- |
| **MCP** (Recommended) | - Standardised by Anthropic/OpenAI; vendor-agnostic.<br>- Exposes schema discovery and native streaming support.<br>- Language-neutral; C++ or Python workers share the same client contracts. | - Small overhead of JSON-RPC schema wrapping. |
| **Pydantic / Python functions** | - Simple and fast for single-process architectures. | - Tightly coupled; cannot run native C++ worker services or scale independent processes. |

* **Decision**: **MCP with strict JSON Schema definitions**. Each diagnostic worker is wrapped in an MCP server, ensuring clean decoupling and plug-and-play capability.

---

### 4.5 [APPROVED] MCP Worker Deployment: Separate Services vs. Single Server vs. Local Stdio Subprocesses

| Strategy | Pros | Cons |
| :--- | :--- | :--- |
| **Separate MCP Servers** (Recommended) | - Absolute modularity: workers run on separate containers, isolating failures.<br>- Individual scaling and deployment. | - Network overhead and managing multiple ports. |
| **Single Multi-tool MCP Server** | - One process, one network port to manage. | - Harder to scale components independently or run heterogeneous languages (Python vs C++). |

* **Decision**: **Separate MCP Servers**. The 5 workers run as independent microservices communicating with the FastAPI orchestrator via Server-Sent Events (SSE).

---

### 4.6 [APPROVED] Frontend Charting: Bespoke React + SVG vs. Recharts / Chart.js Libraries

| Strategy | Pros | Cons |
| :--- | :--- | :--- |
| **Bespoke React + SVG** (Recommended) | - **Pixel-perfect visual parity** with the custom mock designs.<br>- Complete layout stability (no dynamic reflows or resizing calculations shifting UI components).<br>- Zero bundle size bloat or external package dependency issues. | - Requires manual coding of axes, gridlines, path lines, and hover vectors. |
| **Recharts / Chart.js** | - Out-of-the-box configurations for tooltips, zoom, and animations. | - High risk of container layout shift.<br>- Introduces large bundle sizes and potential rendering mismatches inside Electron. |

* **Decision**: **Bespoke inline React + SVG Components**. To guarantee visual excellence and stable dashboard performance, all charts (Timeline, Metric, Map, KGraph, MiniTimeline) are built as custom inline SVG drawings. We avoid installing Recharts or other charting libraries.

---

### 4.7 [APPROVED] Repository Structure: Single Node Package vs. pnpm Workspaces

| Strategy | Pros | Cons |
| :--- | :--- | :--- |
| **Single Unified Node Package** (Recommended) | - **Type Integrity**: Shared IPC contracts, payload types, and API definitions live in `src/shared/` and are directly imported by both Main and Renderer.<br>- One `package.json`, one `pnpm-lock.yaml`, and one `node_modules` directory. | - Merges main and renderer dev dependencies into a single package file. |
| **pnpm Workspaces** | - Explicitly isolates dependencies for main and renderer. | - High risk of IPC type contract drift between processes; overhead of linking local packages. |

* **Decision**: **Single Unified Node Package**. To eliminate IPC contract drift and simplify Node setups, the codebase utilizes a unified directory layout under `src/{main,preload,renderer,shared}/` driven by `electron-vite`.

---

### 4.8 [APPROVED] Font Loading: Local @fontsource Packages vs. Cloud / Google Fonts

| Strategy | Pros | Cons |
| :--- | :--- | :--- |
| **Local @fontsource Packages** (Recommended) | - Bundles font files (`.woff2`) directly in the app bundle.<br>- Zero network fetches at runtime; fully offline-resilient.<br>- Avoids Google Fonts runtime hits or Next.js-specific `next/font` imports. | - Increases the offline app distribution package size by a few kilobytes. |
| **Cloud / Google Fonts** | - Standard web imports. | - Fails in offline environments; introduces latency spikes on startup. |

* **Decision**: **@fontsource/inter** and **@fontsource/jetbrains-mono** npm packages. Imported once inside `src/renderer/main.tsx` and compiled locally, ensuring 100% offline functionality.

---

## 5. Rosbag File Storage: Local Directory vs. AWS S3 / Cloud Storage

| Storage | Pros | Cons |
| :--- | :--- | :--- |
| **Local File Directory** (Recommended) | - Zero cost, works offline.<br>- Fast, local read/write IO speeds.<br>- Simple Docker volume configuration. | - Storage is limited to local disk space. |
| **AWS S3** | - Scales to infinite storage. | - Requires AWS credentials, internet connectivity, and introduces upload latency. |

* **Decision**: **Local File Directory**. The backend writes uploads to `./data/uploads`. This keeps the application 100% offline-compatible, critical for spotty conference/demo Wi-Fi.

---

## 6. Real-Time Communication: REST Polling vs. WebSockets

| Strategy | Pros | Cons |
| :--- | :--- | :--- |
| **REST Polling** (Recommended) | - Extremely simple to implement on both frontend and backend.<br>- Highly reliable; no connection dropouts. | - Slight delay (e.g. 1-2 seconds) between progress updates.<br>- Extra HTTP requests. |
| **WebSockets** | - Real-time progress updates and low-latency log streaming. | - Higher state management complexity.<br>- Connection drops require retry logic. |

* **Decision**: **REST Polling**. The frontend polls the status endpoint every 1.5 seconds during parsing. Once parsing finishes, the orchestrator chat endpoint returns the entire audit trail and diagnostic logs in the final response.

---

## 7. Frontend Libraries & Component Selection

This list records both historical selections and active component packages:

| Library Category | Chosen Package / Strategy | Status / Justification |
| :--- | :--- | :--- |
| **Desktop Shell** | **Electron** | **ACTIVE**: Cross-platform shell with Node.js context on the Main process. |
| **Build System** | **electron-vite** | **ACTIVE**: Single configuration driving Main, Preload, and Renderer. |
| **Renderer UI** | **React 19** | **ACTIVE**: Modern UI framework for rendering dynamic states, replacing Next.js. |
| **Component Library** | **shadcn/ui** | **ACTIVE**: Radix-based UI primitives. |
| **Styling** | **Vanilla CSS (Tailwind v4)** | **ACTIVE**: OKLCH tokens declared in Tailwind v4 `@theme` block. |
| **Icons** | **Lucide React** | **ACTIVE**: Standard SVG icons. |
| **Data Visualization** | **Bespoke React + SVG Components** | **ACTIVE**: Custom inline SVG charts, replacing Recharts library. |
| **Data Visualization** | **Recharts** | **SUPERCEDED** by Bespoke SVGs to prevent reflow issues. |
| **State & Fetching** | **TanStack Query** | **ACTIVE**: Handles server-state caching. |
| **State Management** | **zustand** | **ACTIVE**: Rail screen state management, replacing Next.js URL router. |
| **Fonts** | **@fontsource/inter**, **@fontsource/jetbrains-mono** | **ACTIVE**: Bundle fonts locally, replacing `next/font`. |

---

## 8. Technical Risk Assessment & Mitigation

### Risk 1: Binary ROS 2 Bag formats vary (`.db3` sqlite vs `.mcap`)
* *Likelihood*: High
* *Impact*: High (Parser crashes when judges upload their own bags)
* *Mitigation*: Emphasize **MCAP** format as the primary standard (since it includes embedded schemas). Provide a fallback parser in Python using raw SQLite reading for `.db3` bags.

### Risk 2: Docker Daemon is not running or socket permission is denied
* *Likelihood*: High
* *Impact*: Critical (Application cannot start local container services)
* *Mitigation*: Catch socket connection exceptions on launch and render a **Setup & Troubleshooting Screen** (`screens/Setup.tsx`) instructing the user to start Docker Desktop, enable default socket bindings, or run `chmod` permission fixes.

### Risk 3: Host hardware resource constraints when running local Llama
* *Likelihood*: Medium
* *Impact*: High (Desktop freezes or crashes due to RAM/CPU exhaustion)
* *Mitigation*: Limit the local Llama connector to support lightweight 4-bit quantized GGUF models (e.g. Llama-3-8B-Instruct-Q4). Recommend that users run Ollama with GPU acceleration enabled, or switch to cloud APIs (OpenAI / Gemini) if local resources are constrained.

### Risk 4: Security vulnerability from mounting the Docker socket
* *Likelihood*: Low
* *Impact*: High (Malicious packages inside Electron could gain root access to the host OS)
* *Mitigation*: Strict context isolation between the Electron Renderer and the Main process. The Renderer has no direct access to Node.js APIs or the Docker socket; it communicates exclusively through a predefined, sanitized IPC bridge (`preload.js`).

### Risk 5: Memory leak or crash in custom SVG chart rendering
* *Likelihood*: Low
* *Impact*: High (Renderer crashes during dense bag playback)
* *Mitigation*: Bind chart hover and scroll updates through React state throttling. Keep DOM allocations static and redraw path nodes by modifying `d` path attributes directly.

## 9. Desktop Security Hardening

### 9.1 [APPROVED] API key delivery to the backend container: bind-mounted secret file vs. container `Env` vs. renderer→HTTP POST (#39, #32)

**Decision:** The Electron main process writes the user's decrypted provider API keys to a **mode-0600 host file** (`<userData>/secrets/backend-keys.json`) and bind-mounts it **read-only** into the backend container at `/run/datapilot/secrets/backend-keys.json`. The backend reads it at startup (FastAPI `lifespan`) and on `POST /api/settings/reload-secrets` (a no-secret trigger).

**Rejected alternatives:**
* *Inject keys via the container `Env` array* — environment variables are readable through `docker inspect` and `/proc/<pid>/environ` by any local process with Docker access, defeating the at-rest `safeStorage` protection (#32).
* *POST keys from the renderer to `/api/settings/keys` over plain `http://localhost:8000`* — moves the secret out of `safeStorage` onto the renderer process and a local HTTP socket on every key edit (#39).

**Justified exception (per AGENT.md → "Secrets: `safeStorage` only"):** keys still originate in `safeStorage`; only the *privileged main process* ever decrypts them, and only to hand them to the backend out of band. They never traverse the renderer, a local HTTP body, or the system clipboard (the Settings key-copy control was removed). When the user changes a key the main process rewrites the 0600 file and pings the no-secret reload endpoint, so a running backend updates without a restart and without the key crossing the renderer→HTTP boundary.

**Scope note:** the static, local-only Neo4j credential (`datapilot-local`) is intentionally left as a container env var — it is a fixed development credential, not user data, and is hardcoded as the backend default. Per-session Neo4j password generation is tracked separately.

### 9.2 [APPROVED] Docker socket is privileged, not a renderer setting (#31)

The Docker socket connection is root-equivalent. The renderer can no longer write `docker_socket` (rejected by `assertSettableKey` in the `settings:set` handler), and the orchestrator no longer reads the socket from renderer-writable settings. The only override is the `DATAPILOT_DOCKER_SOCKET` environment variable, validated by `validateDockerSocket` (absolute path, no traversal/URL scheme, parent directory on a vetted allow-list) so even a bad env value cannot repoint the daemon connection.

### 9.3 [APPROVED] `storage:usage` is allow-listed and bounded (#37)

The `storage:usage` IPC walk is constrained to an allow-list of roots (userData, the configured cache/bag directories) — rejecting arbitrary-path probing — and runs asynchronously via `fs.promises` with depth and entry caps so a hostile or pathological tree can neither freeze the main thread nor run unbounded.

### 9.4 [APPROVED] Keychain at-rest encoding is tagged; failures surface (#40, #51)

Stored secret blobs are tagged (`v1:enc:`) so the reader never guesses the encoding. When OS encryption is unavailable the keychain **refuses to persist** rather than silently writing recoverable base64, and `keychain:set` returns a typed `{ ok, error }` result so the renderer can surface a failed save instead of believing it succeeded.
