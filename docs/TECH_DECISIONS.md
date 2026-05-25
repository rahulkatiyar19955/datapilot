# Technical Decisions - DataPilot

This document outlines the core technical decisions for DataPilot, highlighting the trade-offs, final recommendations, and risk mitigations.

## Guiding Principles

- **Open Source First**: We prioritize robust, active, and community-driven open-source software (OSS) tools and frameworks (such as Next.js, FastAPI, Milvus, and ROS 2 ecosystem integrations). This choice ensures long-term viability, flexibility, transparency, and avoids vendor lock-in.
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
| **Python (FastAPI)** (Recommended) | - Direct access to the official `mcap` reader and ROS message parsing packages.<br>- Native ecosystem for LLM SDKs, LangChain, and Milvus.<br>- Fast, typed request handling with Pydantic. | - Higher CPU/Memory footprint compared to compiled languages like Go/C++. |
| **Node.js (Express)** | - Single language stack across frontend and backend. | - Parsing binary ROS serialization formats (CDR, SQLite db3) in Node is poorly supported and requires clunky bindings. |
| **C++** | - High performance, native ROS client (`rclcpp`). | - Slow development velocity. High overhead for simple HTTP servers and AI SDK integration. Unsuited for a 1-week hackathon. |

**Decision**: **Python + FastAPI**. The ability to use Python’s native bag-parsing libraries and AI toolkits is non-negotiable for a fast-paced hackathon.

---

## 3. Database: Milvus vs. SQLite + ChromaDB vs. PostgreSQL + pgvector

| Technology | Pros | Cons |
| :--- | :--- | :--- |
| **Milvus** (Recommended) | - Production-grade, highly scalable vector database built for massive datasets.<br>- Advanced indexing algorithms and high QPS (Queries Per Second).<br>- Cloud-native architecture with Milvus Lite available for local development. | - Higher operational complexity compared to a purely embedded database. |
| **SQLite + ChromaDB (Local)** | - Zero configuration required.<br>- Extremely portable; spin up and destroy instantly in containers. | - Not built for massive concurrent writes or enterprise-scale production workloads. |
| **PostgreSQL + pgvector** | - Enterprise-grade relational and vector storage in one database system. | - Requires spinning up and configuring a PostgreSQL service container, database migrations, and schema management. |

**Decision**: **Milvus**. To ensure the application is production-ready and can handle large-scale vector search operations efficiently, Milvus replaces ChromaDB. It provides the necessary scalability, high availability, and performance for enterprise deployments, while Milvus Lite ensures local developer ergonomics remain smooth.

---

## 4. AI/LLM Strategy: Small Context RAG vs. Large Context Window Ingestion

Since rosbags can contain thousands of log statements, how do we present this text data to the LLM?

| Strategy | Pros | Cons |
| :--- | :--- | :--- |
| **Hybrid RAG & Log Filtering** (Recommended) | - Low API latency.<br>- Minimal token costs.<br>- Can handle bags of any duration.<br>- High accuracy by pinpointing specific windows. | - If the vector search misses the error context, the LLM won't see it. |
| **Raw Text Context Dump** (Feed entire log) | - The LLM sees everything, including subtle chronological trends. | - Huge token costs.<br>- High latency (often >30 seconds for GPT/Claude to read 100k tokens).<br>- Hits token rate limits easily. |

**Decision**: **Hybrid RAG & Log Filtering**. 
1. *Ingestion Filtering*: We filter out all `INFO` and `DEBUG` logs unless specifically queried. Only `WARN`, `ERROR`, and `FATAL` logs are stored in the SQL database for timeline display and semantic indexing in Milvus. This reduces the raw log size by **90-95%**.
2. *Context Construction*: When the user asks a question, we query the SQL database for warnings/errors in the timeline, search Milvus for semantically similar logs, and feed the top ~50-100 consolidated logs to the LLM context.

---

## 5. Rosbag File Storage: Local Directory vs. AWS S3 / Cloud Storage

| Storage | Pros | Cons |
| :--- | :--- | :--- |
| **Local File Directory** (Recommended) | - Zero cost, works offline.<br>- Fast, local read/write IO speeds.<br>- Simple Docker volume configuration. | - Storage is limited to local disk space (fine for MVP). |
| **AWS S3** | - Scales to infinite storage. | - Requires AWS credentials, internet connectivity, and introduces upload latency. |

**Decision**: **Local File Directory**. The backend will write uploads to a `./data/uploads` folder. This keeps the application 100% offline-compatible, which is crucial if the hackathon venue has spotty Wi-Fi.

---

## 6. Real-Time Communication: REST Polling vs. WebSockets

During bag uploading and parsing, the frontend needs to show progress.

| Strategy | Pros | Cons |
| :--- | :--- | :--- |
| **REST Polling** (Recommended) | - Extremely simple to implement on both frontend and backend.<br>- Highly reliable; no connection dropouts. | - Slight delay (e.g. 1-2 seconds) between progress updates.<br>- Extra HTTP requests. |
| **WebSockets** | - Real-time progress updates and low-latency log streaming. | - Higher state management complexity.<br>- Connection drops require retry logic. |

**Decision**: **REST Polling**. The frontend will poll the `/api/sessions/{session_id}/status` endpoint every 1.5 seconds. For a 1-week timeline, avoiding WebSocket handshake issues is a smart tradeoff.

---

## 7. Frontend Libraries & Component Selection

To ensure rapid development without building complex UI controls from scratch, the frontend will leverage a curated set of production-ready library packages:

| Library Category | Chosen Package | Justification |
| :--- | :--- | :--- |
| **Component Library** | **shadcn/ui** (Radix UI) | - Built on Radix UI primitives for full keyboard accessibility.<br>- Copied directly into the codebase to allow full customizability/styling to match our terminal theme. |
| **Styling** | **Tailwind CSS** | - Extremely fast styling via utility classes.<br>- Integrates seamlessly with Next.js and shadcn/ui. |
| **Icons** | **Lucide React** | - Rich collection of modern, clean, SVG-based icons matching standard dashboard designs. |
| **Data Visualization** | **Recharts** | - Highly customizable React-wrapped SVG charting library.<br>- Perfect for building interactive timeline scatter/bar charts with custom tooltips. |
| **Animations** | **Framer Motion** | - Industry-standard React animation library.<br>- Essential for smooth transitions on file drop, chat response streams, and side panels. |
| **State & Fetching** | **TanStack Query** (React Query) | - Handles server-state caching, automatic retries, and REST status polling. |
| **Markdown / Code Parsing** | **react-markdown** + **react-syntax-highlighter** | - Converts the LLM chat outputs (Markdown format) into structured HTML.<br>- Correctly formats ROS config scripts, C++, or Python code snippets with syntax highlighting. |
| **File Upload** | **react-dropzone** | - Simplifies handling file drag-and-drop state, file constraints, and error validation on the frontend. |

---

## 8. Technical Risk Assessment & Mitigation

### Risk 1: Binary ROS 2 Bag formats vary (`.db3` sqlite vs `.mcap`)
* *Likelihood*: High
* *Impact*: High (Parser crashes when judges upload their own bags)
* *Mitigation*: Emphasize **MCAP** format as the primary standard (since it includes embedded schemas). Provide a simple fallback script in Python using raw SQLite reading for `.db3` bags. Provide 3 pre-validated sample bags in the repo so the demo is guaranteed to work out-of-the-box.

### Risk 2: Parsing speeds are too slow for large bags
* *Likelihood*: Medium
* *Impact*: Medium (Long upload/processing spinners frustrate judges)
* *Mitigation*: Limit the bag upload size to **200MB** in the frontend and API. Write the parser using stream generators (`mcap.reader`) so that it parses log records sequentially without loading the entire binary file into memory.

### Risk 3: LLM generates plausible but fake ROS fixes (Hallucination)
* *Likelihood*: High
* *Impact*: Medium (Robotics engineers will notice incorrect parameter recommendations)
* *Mitigation*: Strictly control LLM outputs with system prompts. Instruct the AI model to state *"I cannot determine the root cause"* if it is not found in the logs, and force the model to quote exact log lines and timestamps in its response block.
