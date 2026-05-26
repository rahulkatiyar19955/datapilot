# Technical Decisions - DataPilot

This document outlines the core technical decisions for DataPilot, highlighting the trade-offs, final recommendations, and risk mitigations.

## Guiding Principles

- **Open Source First**: We prioritize robust, active, and community-driven open-source software (OSS) tools and frameworks (such as Next.js, Electron, FastAPI, Neo4j, LangGraph, and ROS 2 integrations).
- **Offline & Local Execution**: We prioritize running analysis pipelines locally to guarantee data privacy, avoid cloud latency on gigabyte-sized files, and ensure the app works in disconnected warehouse environments.

---

## 1. Application Type: Electron Desktop App vs. Next.js Web App vs. Tauri (Rust)

| Technology | Pros | Cons |
| :--- | :--- | :--- |
| **Electron** (Recommended) | - Direct access to the host's file system (no upload limits on rosbags).<br>- Accesses the **Docker socket** (`/var/run/docker.sock`) to orchestrate backend containers.<br>- Full Node.js capability on the main process with a rich ecosystem. | - Large app bundle size (~100MB+).<br>- High memory footprint. |
| **Next.js Web App** | - Light, fast initial load; standard browser deployment. | - Requires uploading massive (often GBs) binary rosbags over the network.<br>- No native access to local Docker engines or local raw files. |
| **Tauri (Rust)** | - Small bundle size (<20MB), low memory footprint. | - Interfacing with Docker SDKs in Rust has a steeper learning curve for a rapid prototype compared to Node's `dockerode`. |

**Decision**: **Electron**. For robotics debugging, engineers want to drag-and-drop massive files stored on their hard drives and parse them locally. Electron provides a mature Node.js environment to communicate with the Docker daemon and launch services on startup, coupled with standard HTML/JS renderer capabilities.

---

## 2. Docker Orchestration: Electron Main Process (Node SDK) vs. Manual CLI (docker-compose)

| Strategy | Pros | Cons |
| :--- | :--- | :--- |
| **Electron Main Process (`dockerode`)** (Recommended) | - **Zero-Config experience**: launches the FastAPI, Neo4j, and MCP worker containers behind the scenes.<br>- Detects connection errors and displays a native **Setup & Troubleshooting Screen** to help the user. | - Requires permission to access `/var/run/docker.sock` on the host machine. |
| **Manual User CLI Setup** | - No Electron container management code required; simpler app footprint. | - Extremely poor developer experience: requires users to manually run commands in their terminal before starting the app. |

**Decision**: **Electron Main Process with `dockerode`**. This ensures the application feels like a native desktop product while maintaining containerized environments for our Python services.

---

## 3. LLM Strategy: Multi-Provider Routing (OpenAI, Gemini, Llama) vs. Cloud-Only APIs

| Strategy | Pros | Cons |
| :--- | :--- | :--- |
| **Multi-Provider Routing** (Recommended) | - **Flexible deployment**: allows cloud APIs (OpenAI, Gemini) for general access, and a local model (Llama via Ollama/Llama.cpp) for offline or air-gapped robotics sites. | - Requires implementing multiple API client connectors and prompting configurations. |
| **Cloud-Only APIs** | - Easiest to configure; high quality of responses out of the box. | - Unusable in offline/field testing; conflicts with robotics teams' security protocols for proprietary data. |

**Decision**: **Multi-Provider Routing (OpenAI, Gemini, Llama)**. Users can select their provider from the UI. When offline, they select Llama (connecting to a local endpoint on port `11434`), and when connected, they can choose OpenAI or Google Gemini.

---

## 4. Database Layer: Hybrid Neo4j + SQLite vs. Milvus vs. others

| Technology | Pros | Cons |
| :--- | :--- | :--- |
| **Hybrid Neo4j + SQLite** (Recommended) | - **Neo4j** models complex causal failure paths and robot component hierarchies.<br>- Native vector search (Neo4j 5.x) allows hybrid queries (semantic + graph structure).<br>- **SQLite** handles lightweight Next.js sessions and LangGraph state checkpoints with zero setup. | - Requires running both a relational DB and a graph DB.<br>- Managing Cypher queries and SQL queries in parallel. |
| **Milvus / pgvector (Vector DB only)** | - Excellent for semantic search of log snippets. | - Misses structured causal relations between components and past failure modes. |

**Decision**: **Hybrid Neo4j + SQLite**. We deploy **Neo4j** in local Docker for the Fleet Knowledge Graph (relationships and vector log search) and **SQLite** locally on the host user data folder for UI metadata, session records, and LangGraph checkpointers.

---

## 5. Worker Interface Contract: Model Context Protocol (MCP) vs. Pydantic Tools vs. gRPC vs. Ad-hoc REST

| Technology | Pros | Cons |
| :--- | :--- | :--- |
| **MCP** (Recommended) | - Standardised by Anthropic/OpenAI; vendor-agnostic.<br>- Exposes schema discovery and native streaming support.<br>- Language-neutral; C++ or Python workers share the same client contracts. | - Small overhead of JSON-RPC schema wrapping. |
| **Pydantic / Python functions** | - Simple and fast for single-process architectures. | - Tightly coupled; cannot run native C++ worker services or scale independent processes. |

**Decision**: **MCP with strict JSON Schema definitions**. Each diagnostic worker is wrapped in an MCP server, ensuring clean decoupling and plug-and-play capability.

---

## 6. Frontend Libraries & Component Selection

| Library Category | Chosen Package | Justification |
| :--- | :--- | :--- |
| **Desktop Shell** | **Electron** | - Inter-Process Communication (IPC) for native file path picking.<br>- Node.js context on Main process. |
| **Docker Client** | **dockerode** | - Allows the Electron Main process to communicate with the Docker Socket via standard Node APIs. |
| **Component Library** | **shadcn/ui** | - React-based standard primitives. |
| **Styling** | **Vanilla CSS** | - Maximum flexibility, responsive, dark-mode terminal layout. |
| **Data Visualization** | **Recharts** | - Renders timeline logs inside the Renderer. |
| **State & Fetching** | **TanStack Query** | - Handles caching and status polling. |

---

## 7. Technical Risk Assessment & Mitigation

### Risk 1: Docker Daemon is not running or socket permission is denied
* *Likelihood*: High
* *Impact*: Critical (Application cannot start local container services)
* *Mitigation*: Implement a **Setup & Troubleshooting Screen** in the Renderer. If Electron Main encounters a socket error on launch, it catches the exception and renders a setup guide instructing the user to start Docker Desktop, enable default socket bindings, or run `chmod` commands on Unix hosts to fix permissions.

### Risk 2: Host hardware resource constraints when running local Llama
* *Likelihood*: Medium
* *Impact*: High (Desktop freezes or crashes due to RAM/CPU exhaustion)
* *Mitigation*: Limit the local Llama connector to support lightweight 4-bit quantized GGUF models (e.g. Llama-3-8B-Instruct-Q4). Recommend that users run Ollama with GPU acceleration enabled, or switch to cloud APIs (OpenAI / Gemini) if local resources are constrained.

### Risk 3: Security vulnerability from mounting the Docker socket
* *Likelihood*: Low
* *Impact*: High (Malicious packages inside Electron could gain root access to the host OS)
* *Mitigation*: Strict context isolation between the Electron Renderer and the Main process. The Renderer has no direct access to Node.js APIs or the Docker socket; it communicates exclusively through a predefined, sanitized IPC bridge (`preload.js`).
