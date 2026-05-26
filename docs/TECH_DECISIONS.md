# Technical Decisions - DataPilot

This document outlines the core technical decisions for DataPilot, highlighting the trade-offs, final recommendations, and risk mitigations.

## Guiding Principles

- **Open Source First**: We prioritize robust, active, and community-driven open-source software (OSS) tools and frameworks (such as Next.js, FastAPI, Neo4j, LangGraph, and ROS 2 ecosystem integrations). This choice ensures long-term viability, flexibility, transparency, and avoids vendor lock-in.
- **Production Readiness**: We choose mature architectures and toolings suited for scalable, high-performance real-world deployment.

---

## 1. Frontend Framework: Next.js vs. React (with Vite) vs. Vanilla HTML/JS

| Technology | Pros | Cons |
| :--- | :--- | :--- |
| **Next.js** (Recommended) | - Production-ready with built-in performance optimizations.<br>- Server-side rendering (SSR) and React Server Components (RSC) for better loading times.<br>- Rich ecosystem for charting and UI components. | - Steeper learning curve than a basic Vite setup.<br>- Deployment configuration is more involved than static serving. |
| **React + Vite** | - Extremely fast startup & HMR (Hot Module Replacement).<br>- Clean, single-page app (SPA) output. | - Lacks built-in SSR/SEO optimizations out of the box.<br>- Requires separate backend project routing/cors configuration. |
| **Vanilla HTML/JS** | - Zero build step. | - Maintaining dynamic UI state (chat window, interactive timelines, upload states) becomes verbose and error-prone. |

**Decision**: **Next.js**. As the project pivots towards a production-ready stack, Next.js provides the robust architecture, rendering optimizations, and scalable foundation required for an enterprise-grade application.

---

## 2. Backend Language & Framework: Python (FastAPI) vs. Node.js (Express) vs. C++

| Technology | Pros | Cons |
| :--- | :--- | :--- |
| **Python (FastAPI)** (Recommended) | - Direct access to the official `mcap` reader and ROS message parsing packages.<br>- Native ecosystem for LLM SDKs, LangGraph, and Neo4j drivers.<br>- Fast, typed request handling with Pydantic. | - Higher CPU/Memory footprint compared to compiled languages like Go/C++. |
| **Node.js (Express)** | - Single language stack across frontend and backend. | - Parsing binary ROS serialization formats (CDR, SQLite db3) in Node is poorly supported and requires clunky bindings. |
| **C++** | - High performance, native ROS client (`rclcpp`). | - Slow development velocity. High overhead for simple HTTP servers and AI SDK integration. Unsuited for a rapid prototype. |

**Decision**: **Python + FastAPI**. The ability to use Python’s native bag-parsing libraries and AI toolkits is non-negotiable for rapid development.

---

## 3. Database Layer: Hybrid Neo4j + SQLite vs. Milvus vs. SQLite + ChromaDB vs. PostgreSQL + pgvector

| Technology | Pros | Cons |
| :--- | :--- | :--- |
| **Hybrid Neo4j + SQLite** (Recommended) | - **Neo4j** models complex causal failure paths and robot component hierarchies.<br>- Native vector search (Neo4j 5.x) allows hybrid queries (semantic + graph structure).<br>- **SQLite** handles lightweight Next.js sessions and LangGraph state checkpoints with zero setup. | - Requires running both a relational DB and a graph DB.<br>- Managing Cypher queries and SQL queries in parallel. |
| **Milvus / pgvector (Vector DB only)** | - Excellent for semantic search of log snippets. | - Misses structured causal relations between components and past failure modes. |
| **Relational (PostgreSQL/SQLite only)** | - Standard query structure, simple setup. | - Cannot efficiently traverse multi-hop chains (e.g. sensor → component → failure → incident). |

**Decision**: **Hybrid Neo4j + SQLite**. We deploy **Neo4j** for the Fleet Knowledge Graph (relationships and vector log search) and **SQLite** for lightweight local UI metadata, chat histories, and LangGraph checkpointers.

---

## 4. Orchestration Strategy: LangGraph vs. OpenAI Agents SDK vs. AutoGen / CrewAI vs. Custom State Machine

| Technology | Pros | Cons |
| :--- | :--- | :--- |
| **LangGraph (core)** (Recommended) | - Graph-based state management with conditional edges (re-planning support).<br>- Standard SQLite saver for checkpointing, replay, and human-in-the-loop controls.<br>- Model-agnostic and production-proven. | - Steeper learning curve for graph definition and state schema. |
| **OpenAI Agents SDK** | - Very simple for isolated, repetitive tasks (e.g., summarization). | - Lacks control over complex multi-step planning and state checkpointing. |
| **AutoGen / CrewAI** | - Multi-agent conversation-based approach. | - Chatty, less predictable execution paths; hard to trace for diagnostic safety. |
| **Custom State Machine** | - Complete control over the plan-execute loop. | - Requires building retry logic, time-travel, and telemetry tracking from scratch. |

**Decision**: **LangGraph** (embedded in FastAPI) for core orchestration. We use a hybrid approach where simple sub-tasks (like summary composing) may use the OpenAI SDK internally, but the parent state machine is managed in LangGraph.

---

## 5. Worker Interface Contract: Model Context Protocol (MCP) vs. Pydantic Tools vs. gRPC vs. Ad-hoc REST

| Technology | Pros | Cons |
| :--- | :--- | :--- |
| **MCP** (Recommended) | - Standardised by Anthropic/OpenAI; vendor-agnostic.<br>- Exposes schema discovery and native streaming support.<br>- Language-neutral; C++ or Python workers share the same client contracts. | - Small overhead of JSON-RPC schema wrapping. |
| **Pydantic / Python functions** | - Simple and fast for single-process architectures. | - Tightly coupled; cannot run native C++ worker services or scale independent processes. |
| **gRPC / Protobuf** | - Fast, type-safe serialization. | - Over-engineered for early stages; LLMs cannot directly read Protobuf descriptors without conversion. |
| **Ad-hoc HTTP REST** | - Simple HTTP endpoints. | - Lacks standardised discovery and tool schema negotiation. |

**Decision**: **MCP with strict JSON Schema definitions**. Each diagnostic worker is wrapped in an MCP server, ensuring clean decoupling and plug-and-play capability.

---

## 6. MCP Worker Deployment: Separate Services vs. Single Server vs. Local Stdio Subprocesses

| Strategy | Pros | Cons |
| :--- | :--- | :--- |
| **Separate MCP Servers** (Recommended) | - Absolute modularity: workers run on separate containers, isolating failures (e.g., C++ crash doesn't block other tools).<br>- Individual scaling and deployment. | - Network overhead and managing multiple ports. |
| **Single Multi-tool MCP Server** | - One process, one network port to manage. | - Harder to scale components independently or run heterogeneous languages (Python vs C++). |
| **Local Stdio Subprocesses** | - Zero network port management. | - Backend and workers must share the exact same container environment and host dependencies. |

**Decision**: **Separate MCP Servers**. To support true production grade architecture, the 5 workers run as independent microservices communicating with the FastAPI orchestrator via Server-Sent Events (SSE).

---

## 7. Rosbag File Storage: Local Directory vs. AWS S3 / Cloud Storage

| Storage | Pros | Cons |
| :--- | :--- | :--- |
| **Local File Directory** (Recommended) | - Zero cost, works offline.<br>- Fast, local read/write IO speeds.<br>- Simple Docker volume configuration. | - Storage is limited to local disk space. |
| **AWS S3** | - Scales to infinite storage. | - Requires AWS credentials, internet connectivity, and introduces upload latency. |

**Decision**: **Local File Directory**. The backend writes uploads to `./data/uploads`. This keeps the application 100% offline-compatible, critical for spotty conference/demo Wi-Fi.

---

## 8. Real-Time Communication: REST Polling vs. WebSockets

| Strategy | Pros | Cons |
| :--- | :--- | :--- |
| **REST Polling** (Recommended) | - Extremely simple to implement on both frontend and backend.<br>- Highly reliable; no connection dropouts. | - Slight delay (e.g. 1-2 seconds) between progress updates.<br>- Extra HTTP requests. |
| **WebSockets** | - Real-time progress updates and low-latency log streaming. | - Higher state management complexity.<br>- Connection drops require retry logic. |

**Decision**: **REST Polling**. The frontend polls the status endpoint every 1.5 seconds during parsing. Once parsing finishes, the orchestrator chat endpoint returns the entire audit trail and diagnostic logs in the final response.

---

## 9. Frontend Libraries & Component Selection

| Library Category | Chosen Package | Justification |
| :--- | :--- | :--- |
| **Component Library** | **shadcn/ui** (Radix UI) | - Built on Radix UI primitives for full keyboard accessibility.<br>- Copied directly into the codebase for direct customization. |
| **Styling** | **Vanilla CSS** | - Maximum flexibility, responsive, dark-mode terminal layout.<br>- Zero build setup issues or framework coupling. |
| **Icons** | **Lucide React** | - Rich collection of modern, clean, SVG-based icons. |
| **Data Visualization** | **Recharts** | - Highly customizable React-wrapped SVG charting library.<br>- Perfect for interactive timeline scatter/bar charts with click handlers. |
| **Animations** | **Framer Motion** | - Industry-standard React animation library.<br>- Essential for smooth transitions on file drop, chat response streams, and side panels. |
| **State & Fetching** | **TanStack Query** (React Query) | - Handles server-state caching, automatic retries, and REST status polling. |
| **Markdown / Code Parsing** | **react-markdown** + **react-syntax-highlighter** | - Converts the LLM chat outputs into structured HTML with syntax highlighting. |
| **File Upload** | **react-dropzone** | - Simplifies handling file drag-and-drop state, file constraints, and error validation. |

---

## 10. Technical Risk Assessment & Mitigation

### Risk 1: Binary ROS 2 Bag formats vary (`.db3` sqlite vs `.mcap`)
* *Likelihood*: High
* *Impact*: High (Parser crashes when judges upload their own bags)
* *Mitigation*: Emphasize **MCAP** format as the primary standard (since it includes embedded schemas). Provide a fallback parser in Python using raw SQLite reading for `.db3` bags.

### Risk 2: MCP service connection dropouts or latency spikes
* *Likelihood*: Medium
* *Impact*: High (Orchestrator fails to execute analysis plan)
* *Mitigation*: Implement standard timeouts (e.g. 5 seconds) and automatic retries for MCP client calls. If a worker goes offline, the LangGraph Planner node should receive a failure token and attempt to replan using alternative tools.

### Risk 3: LLM goes into an infinite loop in the Plan-and-Execute cycle
* *Likelihood*: Medium
* *Impact*: High (High API token cost, slow response, or backend timeout)
* *Mitigation*: Hard-code a maximum limit of **5 replan iterations** in the LangGraph execution loop. If the limit is reached, terminate execution and pass the accumulated observation state to the Report Composer.

### Risk 4: Neo4j database cold start or missing graph nodes
* *Likelihood*: Medium
* *Impact*: Medium (Causal RAG fails to locate similar incidents)
* *Mitigation*: Write a robust database initialization script (`seed.py`) that executes Cypher queries on startup to create constraints and populate default nodes (`Robot-12`, typical `FailureModes`, and relationships).
