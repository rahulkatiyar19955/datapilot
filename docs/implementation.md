# DataPilot — Phase-wise Implementation Plan

> A single executable plan that takes the repo from `docs/` + `LICENSE` to a packaged Electron desktop installer matching the mock_design.

---

## 1. Overview

DataPilot is an **Electron desktop app** that orchestrates a local Docker stack (FastAPI + LangGraph + Neo4j + 5 MCP workers) to debug ROS rosbags entirely on the engineer's machine. All chart visualizations are bespoke inline SVG, theme tokens are OKLCH, and the UI ships **six** top-level screens.

### 1.1 Document map

| Concern | Source of truth |
| :--- | :--- |
| Product scope, user stories, success criteria | [`PRD.md`](PRD.md) |
| System architecture, data flow, API spec, DB schema | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Stack choices and risk mitigations | [`TECH_DECISIONS.md`](TECH_DECISIONS.md) |
| Visual / interaction design — **the UI source of truth** | [`mock_design/`](../mock_design) |
| Hackathon 7-day calendar (parallel team mapping) | [`SPRINT_PLAN.md`](SPRINT_PLAN.md) |
| Execution plan (this document) | `implementation.md` |
| **Stale — to be regenerated** | `FOLDER_STRUCTURE.md` |

### 1.2 Authoritative repo layout

A **single unified Node package** (`src/`) holds the Electron main process, preload, and React renderer. Cross-process types live in `src/shared/` and are imported by both main and renderer, so IPC contracts can't drift. Build tooling: [`electron-vite`](https://electron-vite.org) — one config drives main + preload + renderer with HMR. Renderer is Vite + React 19 (no Next.js: SSR is irrelevant inside an Electron window, and a dual-build pipeline is the main reason people end up splitting `electron/` and `frontend/`).

`backend/` and `mcp_workers/` stay separate because they are Python services that run in their own Docker containers — they have nothing in common with the Node build.

```
datapilot/
├── .env.example
├── .gitignore
├── package.json                   # single Node package (no workspaces)
├── electron.vite.config.ts        # unified main / preload / renderer build
├── electron-builder.yml
├── tsconfig.json                  # base config, references the three below
├── tsconfig.node.json             # main + preload (Node target)
├── tsconfig.web.json              # renderer (DOM target)
├── docker-compose.yml             # consumed by Electron orchestrator, NOT invoked manually
├── README.md
│
├── src/
│   ├── main/                      # Electron main process (Node, TypeScript)
│   │   ├── index.ts               # app lifecycle, single-instance lock, BrowserWindow
│   │   ├── dockerOrchestrator.ts  # dockerode wrapper, ensureStackUp/Down
│   │   ├── ipcHandlers.ts         # registers all ipcMain.handle()s
│   │   ├── safeStorage.ts         # encrypted API key store
│   │   └── windows.ts             # frameless window factory + custom title bar plumbing
│   │
│   ├── preload/
│   │   └── index.ts               # contextBridge.exposeInMainWorld('datapilot', …)
│   │
│   ├── renderer/                  # React 19 + Vite + Tailwind v4 + shadcn/ui
│   │   ├── index.html
│   │   ├── main.tsx               # React entry, mounts <App />
│   │   ├── App.tsx                # rail-driven screen switcher (matches mock app.jsx)
│   │   ├── screens/
│   │   │   ├── Copilot.tsx        # 01 Copilot Workspace
│   │   │   ├── Fleet.tsx          # 02 Fleet Dashboard
│   │   │   ├── Replay.tsx         # 03 Replay
│   │   │   ├── Agents.tsx         # 04 Agents & MCP
│   │   │   ├── Settings.tsx       # 06 Settings
│   │   │   ├── Setup.tsx          # Docker setup & troubleshooting fallback
│   │   │   └── DesignSystem.tsx
│   │   ├── components/
│   │   │   ├── chrome/            # WindowChrome, Titlebar, Traffic, Rail, RailButton
│   │   │   ├── ui/                # Pill, Button, Card, Panel, Tabs, Input, Toggle, …
│   │   │   ├── copilot/           # CopilotPanel, ChatMessage, PlanCard, FindingsCard, CausalChain
│   │   │   ├── workspace/         # Workspace, TimelineView, MetricPlot, MapView, LogView, KGraphView, TopicsPanel
│   │   │   ├── fleet/             # RobotCard, FleetGrid, FleetHeader, StatusDot, Sparkline
│   │   │   ├── replay/            # ReplayHeader, MapView2D, VideoTile, ScrubberBar, SpeedControl
│   │   │   ├── agents/            # AgentCard, MCPServerRow, AgentList, MCPList
│   │   │   ├── settings/          # Sidebar, SectionCard, Row, KeyInput, ModelPicker, DockerStatus, …
│   │   │   ├── search/            # SearchOverlay, SearchResultCard, MiniTimeline, QuerySuggestions
│   │   │   └── Icon.tsx           # lucide-react re-exports under mock's Icon.* namespace
│   │   ├── hooks/                 # useChat, useSession, useGlobalShortcut, useTheme, useIPC
│   │   ├── services/              # api.ts (typed REST clients to FastAPI), fleet.ts
│   │   ├── stores/                # zustand stores for cross-screen state (selected event t, theme, etc.)
│   │   └── styles/
│   │       └── globals.css        # @theme block with OKLCH tokens (ported from mock)
│   │
│   └── shared/                    # imported by both main and renderer
│       ├── ipc.ts                 # typed IPC channel definitions + payload types
│       ├── api.ts                 # backend API response types (mirror Pydantic schemas)
│       └── mock-types.ts          # mock-aligned types (TimelineEvent, Topic, Log, Robot, …)
│
├── backend/                       # FastAPI + LangGraph (Python, separate Docker image)
│   ├── Dockerfile
│   ├── pyproject.toml             # uv-managed
│   └── app/
│       ├── main.py
│       ├── config.py
│       ├── db_sqlite.py
│       ├── models.py              # SQLAlchemy models
│       ├── schemas.py             # Pydantic
│       ├── api/
│       │   ├── sessions.py
│       │   ├── chat.py
│       │   ├── fleet.py
│       │   ├── mcp.py
│       │   └── search.py
│       ├── services/
│       │   ├── parser.py
│       │   ├── neo4j_client.py
│       │   └── embeddings.py
│       ├── agent/
│       │   ├── graph.py
│       │   ├── nodes.py
│       │   ├── checkpointer.py
│       │   └── mcp_client.py
│       └── llm/
│           ├── router.py
│           ├── openai_client.py
│           ├── anthropic_client.py
│           ├── gemini_client.py
│           └── ollama_client.py
│
├── mcp_workers/                   # 5 Python MCP servers, one container each
│   ├── rosbag_reader/
│   ├── trajectory_analyzer/
│   ├── planner_failure_inspector/
│   ├── anomaly_detector/
│   └── report_composer/
│
├── sample_bags/                   # bundled into the installer
│   ├── README.md
│   ├── lidar_failure.mcap
│   ├── nav_drift_failure.mcap
│   └── controller_abort.mcap
│
├── scripts/
│   ├── seed-demo.ts
│   └── visual-diff.ts
│
├── mock_design/                   # design source of truth (kept in repo)
└── docs/                          # planning artifacts
```

### 1.3 Screen inventory (mock parity)

The renderer is a single Vite + React bundle loaded inside Electron. There is **no router** — screen switching is rail-driven via a `screen` zustand store, matching the mock's `app.jsx` (`const [screen, setScreen] = useState('copilot')`). Each screen is a React component, not a route.

| # | Screen | Component | Mock file |
| :- | :- | :- | :- |
| 01 | Copilot Workspace (chat + 5 tabs + topics rail) | `screens/Copilot.tsx` | `copilot.jsx`, `workspace.jsx` |
| 02 | Fleet Dashboard | `screens/Fleet.tsx` | `fleet.jsx` |
| 03 | Replay | `screens/Replay.tsx` | `replay.jsx` |
| 04 | Agents & MCP | `screens/Agents.tsx` | `agents.jsx` |
| 05 | ⌘K Semantic Search overlay | `components/search/SearchOverlay.tsx` (modal, global) | `search.jsx` |
| 06 | Settings | `screens/Settings.tsx` | `settings.jsx` |
| — | Setup & Troubleshooting fallback | `screens/Setup.tsx` | (new; styled per mock primitives) |

---

## 2. Prerequisites & Environment

### 2.1 Host tools

- Node **24**, pnpm **9+**
- Python **3.11+** (`uv` for project mgmt)
- Docker Desktop **4.30+** (or Docker Engine 26+ on Linux)
- Optional: Ollama (for local Llama testing)

### 2.2 Docker socket access

- macOS/Linux: `/var/run/docker.sock` (group-writable or chmod'd)
- Windows: `\\.\pipe\docker_engine`
- Setup screen surfaces fix-it shell commands if access is denied.

### 2.3 `.env.example`

```env
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GEMINI_API_KEY=
OLLAMA_HOST=http://host.docker.internal:11434
NEO4J_PASSWORD=datapilot-local
```

Keys entered via the Settings → Models screen are encrypted with Electron's `safeStorage` and stored in SQLite — `.env` is only a fallback for dev.

---

## Phase 0 — Repo Scaffold

**Goal**: empty repo → single unified Node package with electron-vite, plus the standalone Python backend and worker stubs; Electron boots a blank window with HMR.

### Tasks

1. **Single Node package at the repo root** — no pnpm workspaces. `package.json` lists Electron + Vite + React + Tailwind + shadcn dependencies together. One `pnpm-lock.yaml`, one `node_modules`.
2. Bootstrap with `pnpm create @quick-start/electron@latest datapilot -- --template react-ts` (electron-vite's official template), then strip the example renderer and replace with the empty `src/` layout from §1.2.
3. Install renderer libs: `tailwindcss@^4`, `@tailwindcss/vite`, `lucide-react`, `zustand`, `@tanstack/react-query`, `clsx`, `class-variance-authority`, shadcn-ui via `pnpm dlx shadcn@latest init`.
4. `electron.vite.config.ts` defines three Vite configs:
   - `main` → `src/main/index.ts`, externalizes `dockerode`, `electron`
   - `preload` → `src/preload/index.ts`
   - `renderer` → root `src/renderer/`, plugins `[react(), tailwindcss()]`
5. Path aliases (in all three tsconfigs):
   - `@main/*` → `src/main/*`
   - `@renderer/*` → `src/renderer/*`
   - `@shared/*` → `src/shared/*`
6. Scaffold `backend/` with `uv init` and add: `fastapi`, `uvicorn[standard]`, `sqlalchemy`, `pydantic`, `neo4j`, `mcap`, `mcap-ros2-support`, `rosbags`, `langgraph`, `langchain-core`, `openai`, `anthropic`, `google-generativeai`, `httpx`, `sentence-transformers`.
7. Stub `mcp_workers/<name>/` directories with a placeholder `server.py` + Dockerfile (no tools yet).
8. Root `.gitignore` (node_modules, out, dist, .venv, __pycache__, *.db, sample_bags/large_*).
9. Root `docker-compose.yml` documenting the stack (Neo4j, FastAPI, 5 workers) — read by Electron's orchestrator for image and env metadata, never invoked by the user directly.
10. README quick-start: `pnpm install && pnpm dev`.

### Exit criteria

- `pnpm install` succeeds with zero peer-dep warnings.
- `pnpm dev` runs all three pipelines (main, preload, renderer) under one process, opens a frameless Electron window with "DataPilot — loading…", and HMR works when editing a renderer component.
- `docker compose config` validates the YAML.

---

## Phase 1 — Foundation: Electron Shell + Docker Socket Orchestration

**Goal**: Electron launches → connects to Docker → boots Neo4j + FastAPI + 5 workers → renders the dashboard. On failure, shows a styled Setup screen.

### Files

- `src/main/index.ts` — app lifecycle, single-instance lock, frameless `BrowserWindow` with `titleBarStyle: 'hidden'`, custom traffic-light region.
- `src/main/dockerOrchestrator.ts` — `dockerode`-based wrapper. Methods: `verifySocket()`, `ensureNetwork()`, `ensureImages()`, `ensureStackUp()`, `ensureStackDown()`, `streamLogs(container)`, `getStatus()`.
- `src/preload/index.ts` — `contextBridge.exposeInMainWorld('datapilot', { … })` with a typed surface (no raw `ipcRenderer`). Channel names + payload types imported from `@shared/ipc.ts` so the renderer's TypeScript guarantees the contract.
- `src/main/ipcHandlers.ts` — `ipcMain.handle()` registrations for `docker:status`, `docker:retry`, `file:pickBag`, `theme:get|set`, `settings:get|set`, `keychain:get|set`, `shell:openPath`. Same `@shared/ipc.ts` import keeps the two ends in sync.
- `src/shared/ipc.ts` — single source of truth for IPC channel names and request/response payload types.
- `src/renderer/screens/Setup.tsx` — Setup & Troubleshooting fallback, styled with Phase-2 primitives.

### Orchestration sequence

`ensureStackUp()`:

1. Detect platform socket path; verify reachable.
2. Create network `datapilot-net` if missing.
3. Pull images if missing (`neo4j:5-community`, `datapilot/backend:local`, `datapilot/mcp-*:local` — built locally on first run).
4. Start Neo4j with auth + APOC plugin → poll `:7474` until 200 (max 30s).
5. Start FastAPI with bind mount `--mount type=bind,src=<user-home>,dst=/host,readonly` → poll `/health` until 200 (max 15s).
6. Start each of the 5 MCP workers → wait for stdio handshake or HTTP health (max 10s each, parallel).
7. Emit `docker:ready` IPC; renderer transitions from Setup → main app.

`ensureStackDown()` runs on `before-quit`: SIGTERM → 5s grace → SIGKILL. Volumes survive.

### Title bar behavior (mock parity)

- Frameless window; custom `Titlebar` component with `-webkit-app-region: drag`.
- Traffic-light dots (red/yellow/amber) are real macOS controls on macOS, painted clones on Windows/Linux.
- Center: `<b>DataPilot</b> · <session-filename> — <robot-name> incident` (empty until a bag is loaded).
- Right: theme toggle (sun/moon), version pill (`v0.18.4`), `local` status pill.

### Setup screen failure modes

| Mode | Detection | Remediation shown |
| :--- | :--- | :--- |
| Daemon off | Socket exists but ECONNREFUSED | "Open Docker Desktop" button + `open -a Docker` |
| Permission denied | EACCES on socket | `sudo chmod 666 /var/run/docker.sock` (Linux only) |
| Image pull failed | Pull error in event stream | Network check + retry button |
| Port conflict (`:7474`, `:7687`, `:8000`) | Bind failure | `lsof -i :7474` command + reassign-ports button |

### Exit criteria

- Docker running → stack boots and dashboard renders in under 15 s on a warm cache.
- Docker stopped → Setup screen renders in under 3 s with a working **Retry** button.
- Frameless window with mock title-bar matches mock visually in both themes.

---

## Phase 2 — UI Primitives & Design System (Mock Port)

**Run before any screen work** so subsequent screens compose from a shared kit, not bespoke styles.

### 2.1 Design tokens — `src/renderer/styles/globals.css`

Port `mock_design/styles.css` verbatim into Tailwind v4 `@theme` (imported once from `main.tsx`):

```css
@import "tailwindcss";

@theme {
  --color-bg-0: oklch(0.16 0.012 240);
  --color-bg-1: oklch(0.195 0.012 240);
  --color-bg-2: oklch(0.225 0.013 240);
  --color-bg-3: oklch(0.265 0.014 240);
  --color-bg-4: oklch(0.31 0.014 240);
  --color-border-1: oklch(0.30 0.012 240);
  --color-border-2: oklch(0.36 0.013 240);
  --color-border-3: oklch(0.46 0.014 240);
  --color-text-0: oklch(0.96 0.005 240);
  --color-text-1: oklch(0.86 0.006 240);
  --color-text-2: oklch(0.66 0.010 240);
  --color-text-3: oklch(0.50 0.012 240);
  --color-accent: oklch(0.74 0.17 235);
  --color-accent-dim: oklch(0.42 0.10 235);
  --color-ok: oklch(0.78 0.17 150);
  --color-warn: oklch(0.80 0.15 80);
  --color-danger: oklch(0.70 0.20 25);
  --color-magenta: oklch(0.70 0.18 330);
  --font-ui: 'Inter', -apple-system, system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', 'SF Mono', ui-monospace, monospace;
  /* …full token set from mock */
}

[data-theme="light"] {
  --color-bg-0: oklch(0.985 0.003 240);
  /* …light overrides */
}
```

Fonts loaded with `next/font` (Inter + JetBrains Mono).

### 2.2 Primitive components — `src/renderer/components/`

- **Chrome**: `WindowChrome`, `Titlebar`, `Traffic`, `Rail`, `RailButton` (active indicator bar, badge dot)
- **Atoms**: `Pill` (variants: default, sm, ghost, ok, warn, danger, accent), `Button` (default, primary, ghost, icon, sm), `Card`, `Panel`, `SectionHeader`, `Input` (with leading icon, ⌘K hint slot), `Tabs`/`Tab` (with count chip), `Toggle`, `SeverityDot`, `StatusDot`, `Sparkline`.
- **Icons**: `Icon.tsx` re-exports lucide-react under the mock's `Icon.*` namespace: `Chat`, `Fleet`, `Search`, `Replay`, `Bot`, `Settings`, `Sparkles`, `Sun`, `Moon`, `Play`, `Pause`, `Clock`, `Activity`, `Map`, `Terminal`, `Graph`, `Plus`, `X`, `Send`, `Mic`, `Upload`, `Download`, `Share`, `Filter`, `Refresh`, `Zoom`, `Layers`, `ArrowRight`, `Check`, `Alert`, `File`, `Wifi`, `Battery`, `Cpu`, `Box`, `Database`, `Key`, `Code`, `Pin`. Custom inline SVG fills the few that lucide lacks.

### 2.3 Theming behavior

- `useTheme` hook reads `data-theme` attribute on `<html>` and persists to `localStorage` (`datapilot.theme`).
- IPC `theme:set` lets the Electron main process sync OS-level title-bar styling (macOS `vibrancy`, Windows accent color) when the user toggles.

### 2.4 Validation screen — `DesignSystem.tsx`

A dev-only screen (reachable by setting `screen='design-system'` via a hidden ⌘⇧D keyboard shortcut) renders one of every primitive in both themes side-by-side for visual diff. Excluded from production builds via `import.meta.env.DEV`.

### Exit criteria

- `DesignSystem` screen matches mock screenshots within 5 % pixel diff in both themes.
- Tailwind utility classes (`bg-bg-2`, `text-text-1`, `border-border-1`) resolve to the OKLCH tokens.

---

## Phase 3 — Ingestion Pipeline (Backend + Neo4j Knowledge Graph)

**Goal**: produce a **knowledge graph the agent can reason about** — not just a log table. Ingestion runs four stages in order: **parse → embed → infer causal edges → index**. The output is what every specialist agent in Phase 4 queries against.

### 3.1 Parser layer

Files: `backend/app/services/parser.py`, `backend/app/services/tf_parser.py`.

- `mcap` + `mcap-ros2-support` for `.mcap`; `rosbags` for `.db3`.
- Extracts:
  - **`/rosout` messages** — timestamp, severity, node, msg, file/line (when present).
  - **`/diagnostics` (DiagnosticArray)** — status, level, hardware_id, name, message, key-value pairs. These feed AnomalyDetector signature matching.
  - **`/tf`, `/tf_static`** — full frame chain and transform timeline. Enables Replay Narrator + frame-drift detection.
  - **Topic catalog** — name, type, hz, total_messages, total_bytes.
  - **Numerical signal samples** — `/cmd_vel`, `/odom`, `/scan` rate, `/perception/objects` confidence, `/diagnostics` CPU%. Downsampled to ≤10 Hz to keep DB size bounded.
- Output structured dicts match `mock_design/data.jsx` shapes verbatim (`TIMELINE_EVENTS`, `TOPICS`, `LOGS`, `KGRAPH`).

### 3.2 Embedding layer

File: `backend/app/services/embeddings.py`.

- **Per-log embeddings** for INFO/WARN/ERROR/FATAL. DEBUG logs are stored but not embedded (cost optimization — they rarely matter for diagnosis).
- Embedding text format: `"[{severity}] {node}: {message}"` — short, citation-friendly. Metadata (timestamp, topic) lives on the graph node, not in the embedded text.
- Pluggable model:
  - **Default**: OpenAI `text-embedding-3-small` (1536-dim).
  - **Fallback**: local `sentence-transformers/all-MiniLM-L6-v2` (384-dim). Always bundled — ingestion never fails for lack of an API key.
- Batched (128 per call); progress emitted via `GET /api/sessions/{id}` status poll.

### 3.3 Causal rules engine

A **YAML-driven rules engine** writes typed causal edges into Neo4j during ingestion. This is the foundation the RCA specialist queries via Cypher in Phase 4 — without it, "causal chain" would be pure LLM speculation.

- File: `backend/app/rules/causal.yaml` — committed to the repo, hot-reloadable in dev.
- Evaluator: `backend/app/services/causal_rules.py`. Algorithm: for each rule, build an index of logs matching `cause` (regex × node-glob × severity filter), then scan in time order looking for `effect` matches within `window_ms`. O(n log n) per rule.
- Ships with ~12 hand-curated rules covering the 3 sample-bag failure modes (lidar dropout, nav drift, controller abort). New rules added in Phase 4.5 when eval surfaces missed cases.

Schema (excerpt — full file ships with 12 rules):

```yaml
rules:
  - id: sensor_dropout_inflates_costmap
    cause:
      log_pattern: "no data for \\d+ms"     # regex
      node_glob: "/sensors*"
      severity: ["ERROR"]
    effect:
      log_pattern: "defensive inflation|inflation radius applied"
      node_glob: "/costmap*"
    window_ms: 2000                          # cause precedes effect within 2s
    confidence: 0.92
    edge_type: TRIGGERED
    evidence_required: 2                     # ≥2 effect messages within window

  - id: costmap_inflation_aborts_planner
    cause: { log_pattern: "inflation radius applied", node_glob: "/costmap*" }
    effect: { log_pattern: "Planner aborted|no valid path", node_glob: "/move_base*" }
    window_ms: 3000
    confidence: 0.88
    edge_type: CAUSED

  - id: planner_abort_triggers_ebrake
    cause: { log_pattern: "Planner aborted", node_glob: "/move_base*" }
    effect: { log_pattern: "emergency brake|velocity command zeroed", node_glob: "/cmd_vel*" }
    window_ms: 500
    confidence: 0.98
    edge_type: CAUSED
```

### 3.4 Neo4j schema

Nodes:

```
(:Session  {id, filename, started_at, robot_id, duration_s})
(:Log      {id, ts, severity, node, msg, topic, embedding, type})
(:Topic    {name, type, hz, total_messages})
(:Anomaly  {id, ts, kind, severity, source_log_id, confidence})  # written by AnomalyDetector worker
(:Frame    {name, parent})                                        # TF chain
(:Run      {id, robot_id, date, env, anomaly_count, tags})        # cross-session search
```

Relationships:

```
(:Session)-[:HAS_LOG]->(:Log)
(:Session)-[:HAS_TOPIC]->(:Topic)
(:Session)-[:HAS_ANOMALY]->(:Anomaly)
(:Log)-[:CAUSED         {rule_id, confidence, lag_ms}]->(:Log)
(:Log)-[:TRIGGERED      {rule_id, confidence, lag_ms}]->(:Log)
(:Log)-[:CONCURRENT_WITH {lag_ms}]->(:Log)                        # ±50ms automatic
(:Anomaly)-[:DERIVED_FROM]->(:Log)
(:Frame)-[:CHILD_OF]->(:Frame)
```

Indexes:

- **Vector index** on `(:Log).embedding` — dimension matches active embedding model (1536 OpenAI / 384 MiniLM).
- B-tree on `(:Log).ts`, `(:Log).severity`, `(:Log).node`.
- Full-text on `(:Log).msg` — for ⌘K lexical-fallback search.

### 3.5 Storage

- SQLite at `/data/db.sqlite` inside the container, bind-mounted to `~/Library/Application Support/datapilot/` (macOS), `%APPDATA%\datapilot\` (Windows), `~/.local/share/datapilot/` (Linux).
- SQL schema per [`ARCHITECTURE.md`](ARCHITECTURE.md) §5 plus three new tables:
  - `agent_models` (specialist → model_id mapping; mutable from Agents screen)
  - `session_costs` (tokens_in, tokens_out, est_cost_usd per turn — for Settings → About display)
  - `langgraph_checkpoints` (managed by LangGraph SQLite saver; survives Electron restart)

### 3.6 Files

- `backend/app/main.py`, `config.py`, `db_sqlite.py`, `models.py`, `schemas.py`
- `backend/app/api/sessions.py`
- `backend/app/services/parser.py`, `tf_parser.py`, `embeddings.py`, `neo4j_client.py`, `causal_rules.py`
- `backend/app/rules/causal.yaml`

### 3.7 Endpoints (all under `/api`)

| Method | Path | Returns |
| :--- | :--- | :--- |
| POST | `/sessions/create` | `202 {session_id, status: 'processing'}` |
| GET | `/sessions/{id}` | metadata + status + counts (drives title bar + Copilot context chips) |
| GET | `/sessions/{id}/timeline` | array of `TIMELINE_EVENTS` (mock-aligned) |
| GET | `/sessions/{id}/topics` | array of `TOPICS` |
| GET | `/sessions/{id}/logs?severity=&q=&limit=&offset=` | paginated logs (q does vector search; falls back to FT) |
| GET | `/sessions/{id}/kgraph?window_from=&window_to=` | `{nodes, edges}` for the KGraph tab |
| GET | `/sessions/{id}/causal-chain?event_id=` | full upstream chain into one log node (used by RCA specialist) |
| GET | `/sessions/{id}/anomalies` | precomputed anomalies from AnomalyDetector |
| GET | `/sessions/{id}/replay?from=&to=&hz=` | time-indexed frames (pose, tf, cmd_vel) |

Ingestion is async: `/create` returns immediately; status flips to `ready` after parse + embed + rules + index all complete.

### 3.8 Exit criteria

- A 50 MB sample bag ingests in **< 15 s** end-to-end.
- For `lidar_failure.mcap`, the Cypher query `MATCH p=(:Log)-[:CAUSED|TRIGGERED*1..6]->(:Log {msg: "emergency brake engaged"}) RETURN p` returns the expected 4-hop chain.
- KGraph endpoint returns the same node/edge shape that `mock_design/data.jsx` `DP.KGRAPH` uses — frontend needs zero adapters.
- ≥80% of WARN/ERROR logs in the sample bags have at least one incoming or outgoing causal edge (graph coverage check).

---

## Phase 4 — Multi-Agent Orchestration (CORE)

**Goal**: a **supervisor + 6 specialist agents** LangGraph system that produces grounded, citation-rich, structured diagnoses. This is the differentiated product — the desktop shell is just the runway.

### 4.1 Graph topology

```
                       ┌───────────────────────┐
       user query ────►│  Supervisor (planner) │  (cheap-fast model — haiku/mini/flash)
                       └──────────┬────────────┘
                                  │ Plan = [SpecStep, …]
                                  ▼
        ┌──────────────────────────────────────────────────┐
        │           Sequential specialist dispatch          │
        │                                                   │
        │  ┌─────────────┐  ┌──────────────┐  ┌────────────┐│
        │  │ RCA Agent   │→ │ Anomaly Det. │→ │ Performance││ ...
        │  └─────────────┘  └──────────────┘  └────────────┘│
        │     each: plan-then-execute over its tool subset  │
        └──────────────────┬───────────────────────────────┘
                           │ aggregated specialist outputs
                           ▼
                ┌──────────────────────┐
                │ Composer (synthesis) │  (user's default model)
                └──────────┬───────────┘
                           │ {response, plan, findings, causal, citations, audit_trail}
                           ▼
                       SSE stream ─► renderer
```

- **Supervisor** receives `user_message` + session context + prior transcript → emits an ordered `Plan` of `SpecStep{specialist, intent, expected_outputs}` items.
- **Dispatcher** walks the plan sequentially, invoking each specialist's subgraph with the supervisor's intent + accumulated observations.
- **Replan node** can rewrite the remaining plan when a specialist returns low confidence, a tool error, or contradicts an earlier finding (max 5 replans).
- **Composer** synthesizes everything into the envelope that maps 1:1 onto the mock's `ChatMessage` rendering.

LangGraph state:

```python
class GraphState(TypedDict, total=False):
    session_id: str
    user_message: str
    transcript: list[Turn]                  # full history of this session
    plan: list[SpecStep]
    plan_idx: int
    specialist_outputs: dict[str, SpecResult]
    retrieval_context: list[LogCitation]
    replan_count: int                        # cap = 5
    final: ChatMessageEnvelope | None
    audit_trail: list[AuditEvent]
    token_budget_remaining: int              # see § Token Budgeting
```

### 4.2 The 6 specialists

Each specialist is a self-contained LangGraph subgraph with: a system prompt, a curated tool subset, a default model, and an output schema. They live under `backend/app/agent/specialists/`.

| Specialist | Default model | Tools (MCP, Phase 5) | Output shape |
| :--- | :--- | :--- | :--- |
| `RootCauseAnalyst` | `claude-sonnet-4.5` | `retrieve_logs`, `query_causal_chain`, `query_topic`, `find_aborts` | `{causal: list[CausalStep], findings: list[Finding], confidence: float}` |
| `AnomalyDetector` | `claude-sonnet-4.5` | `find_dropouts`, `find_statistical_outliers`, `find_signature_matches` | `{anomalies: list[Anomaly]}` |
| `PerformanceProfiler` | `gpt-5` | `query_topic_rate`, `compute_node_cpu`, `find_rate_regressions` | `{regressions: list[Regression]}` |
| `ReplayNarrator` | `gemini-2.5-pro` | `read_tf_chain`, `retrieve_logs`, `query_topic` | `{narration: list[NarrationFrame]}` (time-indexed) |
| `SafetyAuditor` | `claude-opus-4` | `query_commands`, `query_recoveries`, `query_safety_rules` | `{violations: list[SafetyViolation]}` |
| `ReleaseComparator` | `claude-sonnet-4.5` | `compare_metric_distributions`, `compare_log_signatures` | `{diffs: list[ReleaseDiff]}` |

Defaults are stored in `backend/app/agent/specialists/defaults.py`, persisted to SQLite `agent_models`, and mutable per-specialist via the Agents screen drawer (Phase 9).

System-prompt structure (all specialists): role declaration, output-schema reminder, **citation requirement** ("every claim must reference a `log_id` or `anomaly_id` from your tool outputs — uncited claims are rejected by the Composer"), bounded scope ("do not speculate beyond tool outputs"). Prompts versioned in `backend/app/agent/prompts/specialists/*.md`.

Each specialist runs as **plan-then-execute internally too**: a 3–10 step internal plan; the supervisor only sees the final structured output; the audit trail records the inner steps.

### 4.3 Plan-then-execute mechanics

1. Supervisor produces `Plan: [SpecStep('RootCauseAnalyst', 'Trace stop event at t=66.3s back to root cause'), SpecStep('AnomalyDetector', 'Confirm sensor dropout window'), …]`.
2. Plan is emitted to the renderer **immediately** via SSE — the Copilot's Plan card renders all steps with `done: false`. Perceived responsiveness < 2 s.
3. Dispatcher walks the plan. For each step:
   - SSE `step-start {idx, specialist}` → Plan card flips that step's indicator to `running…`.
   - Specialist's internal ReAct loop emits `step-progress {idx, label, tool?}` events as it picks tools.
   - On completion, SSE `step-done {idx, output_summary, confidence}` → Plan card flips to done.
4. **Replan triggers** (any one):
   - Specialist returns `confidence < 0.4`.
   - Specialist returns `error: 'tool_unavailable'`.
   - Specialist output contradicts an earlier finding (Composer pre-check rejects the assembly).
   - Token-budget projection shows next step would exceed the per-turn cap.
5. Replan node calls the supervisor LLM with the existing plan + observations and asks for a rewrite of the **remaining** steps (already-completed steps are immutable). `replan_count` increments. Cap = 5. On overflow, Composer runs with `partial: true` and the renderer surfaces a banner.
6. Composer produces the final envelope; SSE `final` emits it.

### 4.4 Streaming protocol

SSE on `POST /api/sessions/{id}/chat`. Event types:

```
event: plan          data: {plan: [{specialist, intent, idx}, …]}
event: step-start    data: {idx, specialist}
event: step-progress data: {idx, label, tool?: string}
event: step-done     data: {idx, output_summary, confidence}
event: replan        data: {reason, new_plan: […]}
event: token         data: {text: "…"}             # token-by-token streaming of Composer prose
event: final         data: {response, plan, findings, causal, audit_trail, citations, usage}
event: error         data: {code, message, recoverable: bool}
```

Renderer consumes via `useChat` hook → updates Plan card state live, streams Composer tokens into the assistant bubble, and finally swaps in the structured Findings/Causal/AuditTrail cards from the `final` payload.

### 4.5 RAG retrieval — the shared `retrieve_logs` tool

The most-called tool across specialists, so it gets dedicated design:

```python
async def retrieve_logs(
    query: str,
    session_id: str,
    k: int = 8,
    severity_filter: list[str] | None = None,
    topic_filter: list[str] | None = None,
    time_window_s: tuple[float, float] | None = None,
    expand_neighbors: bool = True,
) -> list[LogCitation]:
    # 1. Vector search in Neo4j (cosine, k*3 candidates)
    # 2. Apply filters
    # 3. Re-rank with Cohere/Voyage if configured, else keep vector order
    # 4. For each top-k hit, if expand_neighbors:
    #      MATCH (l:Log)-[:HAS_LOG]-(s {id: session_id})
    #      WHERE abs(l.ts - hit.ts) < 5.0
    #      ORDER BY l.ts LIMIT 20
    # 5. Return [LogCitation{log_id, ts, severity, node, msg, score, neighbors[]}]
```

Re-ranking is **optional and pluggable** — vector order is used if no rerank API is configured. The ±5s neighbor expansion is what makes this "hybrid RAG" — vector picks the right region, graph expansion gives the LLM contiguous temporal context so it can reason about lead/lag relationships.

### 4.6 Memory & checkpointing

- LangGraph SQLite checkpointer at `/data/db.sqlite` (`langgraph_checkpoints` table). One thread per `session_id`.
- **Full transcript + plan history** loaded into supervisor context for every turn — best continuity ("compare to what you said about lidar earlier").
- If transcript > 40k tokens, supervisor's cheap-fast model compacts turns older than (current − 5) into a single "session summary" message that replaces them.
- Session checkpoints survive Electron restart — closing the app mid-conversation and reopening resumes exactly where the user left off.

### 4.7 Model routing

`backend/app/llm/router.py`:

```python
class LLMRouter:
    def for_specialist(self, name: str) -> LLMClient: ...   # reads agent_models table
    def for_supervisor(self) -> LLMClient: ...              # always cheap-fast, never user-pickable
    def for_composer(self) -> LLMClient: ...                # = user's chosen default
```

Supervisor model selection cascade (auto-picks based on which keys the user has configured):

1. `claude-haiku-4.5` (if Anthropic key)
2. `gpt-5-mini` (if OpenAI key)
3. `gemini-2.5-flash` (if Gemini key)
4. local `llama-3.3-8b` via Ollama (always available as last resort)

Hard-coding the supervisor on a fast cheap model keeps perceived latency predictable regardless of what the user picks as their composer default.

Provider clients implement a uniform interface:

```python
class LLMClient(Protocol):
    async def complete(
        self, *,
        system: str,
        messages: list[Message],
        tools: list[ToolDef] | None = None,
        response_format: JSONSchema | None = None,
        stream: bool = False,
    ) -> CompletionResponse | AsyncIterator[CompletionChunk]: ...
```

Tool-call normalization happens inside each client (OpenAI tool_calls ↔ Anthropic tool_use ↔ Gemini function_call ↔ Ollama prompt-format fallback). Specialist code stays provider-agnostic.

### 4.8 Audit trail

Every node emits AuditEvents to `state.audit_trail`. Shape mirrors the mock's Audit Trail side panel directly:

```python
class AuditEvent(TypedDict):
    step_kind: Literal[
        "supervisor_plan", "specialist_start", "tool_call", "tool_result",
        "replan", "compose", "error"
    ]
    specialist: str | None
    tool: str | None
    args_summary: str            # truncated to 200 chars
    result_summary: str          # truncated to 400 chars
    tokens_in: int
    tokens_out: int
    latency_ms: int
    ts: float
```

### 4.9 Settings persistence (API keys)

- Keys entered in the Settings screen flow IPC → main process → `safeStorage.encryptString` → stored in SQLite `settings` table.
- Backend reads decrypted values via a one-shot IPC handshake at FastAPI start; **never logged, never echoed back to the renderer once stored**.

### 4.10 Chat endpoint

`POST /api/sessions/{id}/chat` (SSE response).

Request:

```json
{
  "message": "Why did navigation abort?",
  "composer_provider": "anthropic",
  "composer_model": "claude-sonnet-4.5"
}
```

(Specialist provider/model overrides come from the persisted `agent_models` table — not from this request body.)

Response is the SSE stream from §4.4. The terminal `final` event payload:

```json
{
  "response": "Markdown prose from Composer…",
  "plan": [{"label": "Locate stop event in /cmd_vel", "done": true}, …],
  "findings": [{"sev": "critical", "text": "…", "detail": "…", "log_ids": ["l_64200"]}, …],
  "causal": [
    {"label": "/sensors/lidar_a dropout (782 ms)", "log_id": "l_64200", "edge_in": null, "edge_out": "TRIGGERED"},
    {"label": "/costmap defensive inflation (0.85m)", "log_id": "l_65000", "edge_in": "TRIGGERED", "edge_out": "CAUSED"},
    …
  ],
  "audit_trail": [{"step_kind": "tool_call", "tool": "retrieve_logs", "args_summary": "…", "result_summary": "…", "tokens_in": 412, "tokens_out": 38, "latency_ms": 281}, …],
  "citations": [{"log_id": "l_64200", "ts": 64.2, "node": "/sensors", "snippet": "…"}, …],
  "usage": {"tokens_in": 18420, "tokens_out": 2104, "est_cost_usd": 0.087},
  "partial": false
}
```

### 4.11 Files

- `backend/app/api/chat.py` — SSE endpoint, wraps the LangGraph runner
- `backend/app/agent/graph.py` — top-level LangGraph wiring
- `backend/app/agent/supervisor.py` — planner node
- `backend/app/agent/dispatcher.py` — sequential step runner
- `backend/app/agent/composer.py` — final synthesis node
- `backend/app/agent/replan.py` — replan node
- `backend/app/agent/specialists/{rca,anomaly,performance,replay_narrator,safety,release_compare}.py`
- `backend/app/agent/specialists/defaults.py` — model defaults
- `backend/app/agent/state.py` — TypedDicts (`GraphState`, `SpecStep`, `SpecResult`, `AuditEvent`, …)
- `backend/app/agent/prompts/{supervisor,composer,specialists/*}.md` — versioned prompts (one file per specialist)
- `backend/app/agent/checkpointer.py` — LangGraph SQLite saver setup
- `backend/app/agent/mcp_client.py` — unified tool dispatcher; uses in-process fallback for the Phase-4-pre-Phase-5 window
- `backend/app/agent/budget.py` — per-turn token accounting
- `backend/app/llm/{router,openai_client,anthropic_client,gemini_client,ollama_client}.py`

### 4.12 Exit criteria

- "Why did navigation abort?" against `lidar_failure.mcap` produces the canonical 4-hop causal chain with citations on every step in **< 30 s** end-to-end.
- All 6 specialists are invoked at least once across the 3 sample-bag eval queries (Phase 4.5).
- Audit trail records every tool call with token usage; total tokens per turn **< 25k** (cost cap enforced).
- SSE stream emits the `plan` event in **< 2 s** after request start (perceived responsiveness target).
- All 4 LLM providers (Anthropic, OpenAI, Gemini, Ollama) can be set as the Composer default and produce structurally consistent envelopes — assertion-tested with golden traces.
- Killing the Composer mid-stream produces an `error: recoverable=true` event; client can retry without losing accumulated specialist findings.
- Replan cap enforced: forcing 6 consecutive low-confidence specialist outputs yields a `partial: true` response, not a runaway loop.

---

## Phase 4.5 — Agent Eval Harness

**Goal**: testable, reproducible agent quality. Hackathon demos break without this; production iteration is impossible without it.

### Golden eval set

File: `backend/tests/eval/golden.yaml` — per-sample-bag golden questions with expected behavior.

```yaml
- bag: lidar_failure.mcap
  question: "Why did navigation abort?"
  expect:
    specialists_invoked: [RootCauseAnalyst, AnomalyDetector]
    causal_chain_min_hops: 3
    citations_must_include_log_ids: [lidar_dropout_64200, costmap_inflation_65000, planner_abort_66100]
    confidence_min: 0.8
    e2e_latency_max_s: 30

- bag: nav_drift_failure.mcap
  question: "Is this a hardware or software issue?"
  expect:
    specialists_invoked: [RootCauseAnalyst, PerformanceProfiler]
    response_must_classify_as: software
    confidence_min: 0.6

- bag: controller_abort.mcap
  question: "Generate a replay narration for the failure window"
  expect:
    specialists_invoked: [ReplayNarrator, RootCauseAnalyst]
    narration_frames_min: 5
    narration_frames_must_span_s: [60, 80]
```

### Runner

- `uv run pytest backend/tests/eval/` — spins up the stack, ingests the listed bag, runs each question, asserts golden conditions.
- Also accessible from the repo root as `pnpm eval` (runs the pytest command through a Node script that ensures Docker stack is up first).

### Trajectory tests

Assert that the **supervisor's routing decisions** are stable:

- "performance regression" questions → `PerformanceProfiler` invoked first.
- "what happened" / "why did X fail" questions → `RootCauseAnalyst` invoked first.
- "is this safe" / "did we violate any rules" questions → `SafetyAuditor` invoked.
- Same-question repeats yield identical specialist ordering (within ±1 reordering for ties).

### Citation grounding check

Every `Finding` in the response **must** have at least one `log_id` that resolves to a real `(:Log)` node for that session. The eval runner fails the run if any finding is uncited or any cited `log_id` is missing in Neo4j. This enforces PRD §5's "zero hallucinations regarding ROS parameters" goal.

### Determinism mode

- Runs with `temperature=0` and a fixed seed where the provider supports it (OpenAI, Gemini).
- Tolerates ±10% latency variance between identical runs.
- Two consecutive runs of the same question must produce identical specialist invocation order and identical causal chain edges (text prose may differ slightly).

### Exit criteria

- All golden questions pass against all 3 sample bags.
- Citation grounding check is 100% (no uncited findings).
- Repeated runs of the same question are deterministic for routing + causal chain.

---

## Phase 5 — MCP Workers (Tool Layer)

**Goal**: replace the in-process Phase 4 tools with **5 standalone MCP servers**, each in its own Docker container. The agent dispatches over JSON-RPC. Specialists call them via `mcp_client.dispatch(worker, tool, args)` — same call sites as Phase 4, transparent swap.

### Cross-cutting conventions

- Each worker uses the official `mcp` Python SDK (FastMCP).
- Each mounts `/host` **read-only** — tools never write to disk or to Neo4j.
- Each exposes **stdio transport** (piped to FastAPI by the Electron orchestrator) **and** an **HTTP health endpoint** on a dedicated port (so the Agents & MCP screen can health-check independently).
- Every tool returns either `{ok: true, result: …}` or `{ok: false, error: {code, message, retryable: bool}}`. The agent's `mcp_client` translates `ok: false` into a typed exception specialists handle.
- Input schemas are **strict JSON Schema** with `additionalProperties: false`. Discoverable via `mcp/listTools`.
- **Latency budget**: each tool call **< 2 s p95**. Tools needing more must paginate.

### 5.1 `rosbag_reader`

| Tool | Input (summary) | Output | Primary caller |
| :--- | :--- | :--- | :--- |
| `extract_topic_schemas` | `{session_id}` | `[{name, type, hz, total}]` | all specialists (cached) |
| `read_diagnostics` | `{session_id, t_from?, t_to?}` | `[DiagnosticStatus]` | RCA, Anomaly |
| `read_tf_chain` | `{session_id, t?}` | `[{parent, child, transform}]` | ReplayNarrator |

### 5.2 `trajectory_analyzer`

| Tool | Input | Output | Primary caller |
| :--- | :--- | :--- | :--- |
| `compute_velocities` | `{session_id, t_from, t_to, source: 'odom'\|'cmd_vel'}` | `[{t, vx, vy, vyaw}]` | RCA, Performance |
| `compute_goal_deviation` | `{session_id, goal_topic, actual_topic}` | `[{t, perp_dist}]` | RCA |
| `query_topic` | `{session_id, topic, t_from, t_to, sample_hz?}` | `[{t, value}]` | all |

### 5.3 `planner_failure_inspector`

| Tool | Input | Output | Primary caller |
| :--- | :--- | :--- | :--- |
| `inspect_planner_state` | `{session_id, t}` | `{state, plan_id, retries, costmap_summary}` | RCA |
| `find_aborts` | `{session_id, t_from?, t_to?}` | `[{t, node, reason, retries}]` | RCA |
| `query_causal_chain` | `{session_id, event_log_id, max_hops: 6}` | `[{log_id, edge_type, lag_ms, confidence}]` (Cypher path) | RCA |

### 5.4 `anomaly_detector`

| Tool | Input | Output | Primary caller |
| :--- | :--- | :--- | :--- |
| `find_dropouts` | `{session_id, topic, threshold_ms}` | `[{t, duration_ms}]` | Anomaly, RCA |
| `find_statistical_outliers` | `{session_id, topic, field, method: 'zscore'\|'iqr', threshold}` | `[{t, value, z}]` | Anomaly, Performance |
| `find_signature_matches` | `{session_id, signature_id}` | `[{t, evidence}]` | Anomaly, Safety |

Signature library: `mcp_workers/anomaly_detector/signatures/*.yaml`. Each signature is a multi-condition rule (regex on logs + value ranges on topics + time window). Same authoring conventions as the causal rules in Phase 3.3.

### 5.5 `report_composer`

The Composer node usually does final synthesis itself, but this worker handles **deterministic formatting** tasks the LLM is bad at (typography of tree characters, JSON shape validation, recommendation generation from a template library):

| Tool | Input | Output | Primary caller |
| :--- | :--- | :--- | :--- |
| `format_causal_chain` | `{steps: list[CausalStep]}` | tree-drawing-character string (`┌─ ├─ └─` form the mock uses) | Composer |
| `compose_findings_card` | `{findings: list[Finding]}` | UI-ready JSON | Composer |
| `compose_recommendations` | `{causal_chain, retrieved_docs?}` | `[Recommendation]` (from template library + LLM polish) | Composer |

### 5.6 Files

- `mcp_workers/<name>/{Dockerfile,server.py,pyproject.toml}` for each of the 5 workers
- `mcp_workers/<name>/tools/*.py` — one file per tool
- `mcp_workers/<name>/tests/test_*.py` — unit tests covering both `ok` and `error` paths for every tool
- `mcp_workers/anomaly_detector/signatures/*.yaml` — signature library
- `backend/app/agent/mcp_client.py` — unified dispatcher, replaces the Phase 4 in-process fallback

### 5.7 Orchestrator integration

- Electron's `ensureStackUp()` boots all 5 workers in parallel with FastAPI; health-check waits for each `mcp/initialize` handshake (max 10s each).
- `GET /api/mcp/servers` returns: `{id, name, transport, status: 'connected'|'disabled'|'error', tools: int, calls_7d: int, last_error?: string}`.
- `POST /api/mcp/servers/{id}/toggle` enables/disables a worker; disabled workers are hidden from the specialists' tool catalogs on the next chat turn.

### 5.8 Exit criteria

- Stopping any worker mid-chat → the calling specialist receives `tool_unavailable`, replan triggers, the response degrades gracefully (one less finding, never a 500). Banner appears in the Copilot panel within 2 s.
- The transparent swap from in-process tools to MCP doesn't change chat responses — verified with golden-trace regression from Phase 4.5.
- Every tool has a unit test exercising both `ok` and `error` paths.
- `mcp/listTools` on each worker returns at least one tool with a valid JSON Schema.

---

## Phase 6 — Screen 01: Copilot Workspace (Flagship)

Layout: Rail (56) + CopilotPanel (420) + Workspace (flex) + TopicsPanel (240). Matches `mock_design/app.jsx` exactly.

### 6.1 Shell

- `src/renderer/App.tsx` composes `WindowChrome` + `Rail` + screen switcher (`switch (screen)`), matching mock `app.jsx` structure exactly.
- `src/renderer/screens/Copilot.tsx` holds the two-panel layout for the Copilot screen specifically.
- Rail buttons (Copilot, Fleet, Search, Replay, Bot, Settings) drive a top-level `screen` state via the `useUIStore` zustand store in `src/renderer/stores/ui.ts`.
- ⌘K binds to the Search overlay (Phase 10).

### 6.2 Copilot panel

- Context chips: current bag pill (with remove `×`), `robot-12` accent pill, duration/topics ghost pill.
- Message list: `system | user | assistant` variants. Assistant messages compose `PlanCard`, `FindingsCard` (severity dots), `CausalChain` (tree-drawing characters), and action chips that fire `jumpFromChat(target)` to update the workspace tab + scroll position.
- Quick-action chips above the command bar: Upload, Connect live, Search past, Compare releases.
- Command bar: textarea + Mic/Attach icons + ⌘↵ send. Streams responses via SSE, updating Plan step states (`running…` → `done`) in real time.

### 6.3 Workspace shell

- Data-source bar: Rosbag/Live-robot tab toggle, filename pill, `parsed` + `indexed by AI` pills, Replay/Share/Download.
- Tabs: `Timeline | Metrics | Map | Logs | Knowledge Graph` with counts.
- Right rail: `TopicsPanel` (virtualized list of `TOPICS` with hz + msg counts).

### 6.4 Timeline tab

- Toolbar: section header, range pill, Zoom-to-anomalies, Filter, Refresh.
- Density overview strip (50 buckets colored by max severity).
- 3 lanes (`Logs`, `Sensors`, `Anomalies`) with tick row (00:00–01:40), grid lines, clickable event dots (circle for log/sensor, rounded square for anomaly). Severity → color (critical=danger, warning=warn, info=accent).
- Selected-event card: severity dot, `t=`, topic, label, Pin + Plot buttons, inference hint.

### 6.5 Metrics tab

- 2×2 grid of `MetricPlot` SVG components: lidar latency, cmd_vel linear.x, perception confidence, cpu_load. Each renders an area-filled line with optional anomaly band rectangle and y-axis label column.
- "Add metric" / "Overlay baseline" toolbar buttons.

### 6.6 Map tab

- SVG canvas with grid pattern (40 px + 200 px), workspace bounds, obstacle blocks, costmap inflation (concentric `danger`-tinted circles), planned (dashed accent) vs actual (solid warn) path, waypoints with `goal · bay_3_dock` label on the last one, pulsing e-brake marker with animated `<circle>`.
- HUD overlays: frame chain (top-left), viewport extents (bottom-right).

### 6.7 Logs tab

- Toolbar: section header, semantic-search `Input` with `⌘K` hint, severity pill filters (`ERROR ·3`, `WARN ·3`, `INFO ·5`, `DEBUG ·1`).
- Virtualized table: Timestamp | Severity | Node | Message. Mono font, sticky header.

### 6.8 Knowledge Graph tab

- SVG canvas with dotted grid pattern, arrow markers, nodes drawn as rounded rectangles with a group-colored dot + JetBrains-Mono label. Edges drawn as arrows; dashed for sensor/dropout edges.
- Legend pills along the toolbar: Sensors, Nodes, States, Faults, Outcomes.
- Bottom-left inference card: "Sensor dropout cascaded through costmap inflation to a planner abort. Confidence: 0.94. Explored 24 alternate paths, ruled out 18."

### 6.9 Topics rail

- Virtualized list (240 px wide). Each row: monospace topic name, short type, hz (accent), msg count (dim mono).

### Cross-cutting

- Selected-event `t` is shared state (zustand) consumed by Timeline + Replay so cross-screen navigation seeks correctly.
- Action chips (`Jump to timeline`, `See causal graph`, `Metric: lidar latency`) update the workspace tab + scroll to the relevant artifact.

### Exit criteria

- Drag-and-drop a sample bag → workspace populates within 15 s → asking the canned navigation question yields a real answer with working action chips that route to the right tab and event.
- Visual diff against `mock_design` for each tab is within 5 %.

---

## Phase 7 — Screen 02: Fleet Dashboard

### Files

- `src/renderer/screens/Fleet.tsx`
- `src/renderer/components/fleet/{RobotCard,FleetGrid,FleetHeader,StatusDot,Sparkline}.tsx`
- `src/renderer/services/fleet.ts`
- `backend/app/api/fleet.py`

### MVP data source

- `GET /api/fleet/robots` returns the fixture from `mock_design/data.jsx` `ROBOTS`. The backend reads this from a JSON file under `backend/app/fixtures/`. When a real fleet feed exists, replace the implementation behind the same endpoint.

### Components

- `RobotCard`: `StatusDot` (with status-colored glow), monospace name, model, site row, current task line, 2-column metric grid (battery + CPU progress bars, uptime, sparkline). Critical cards get a `danger`-tinted border.
- `FleetHeader`: title row, filter chips (status × site × model × env), search input, "Add robot" affordance (disabled with tooltip for MVP).
- `FleetGrid`: responsive grid (3–4 columns) using CSS grid `auto-fill, minmax(280px, 1fr)`.
- Clicking a card opens a side detail panel placeholder.

### Exit criteria

- 12 robots from fixture render at 60 fps; filters apply instantly.
- Status-dot glow and battery/CPU progress bars match mock in both themes.

---

## Phase 8 — Screen 03: Replay

### Files

- `src/renderer/screens/Replay.tsx`
- `src/renderer/components/replay/{ReplayHeader,MapView2D,VideoTile,ScrubberBar,SpeedControl}.tsx`
- Backend: `GET /api/sessions/{id}/replay` endpoint added in Phase 3.

### Behavior

- Synchronized scrubber + 2D map showing animated TF + robot pose along the trajectory.
- Video tiles are placeholders ("camera_front", "camera_rear") rendering a JetBrains-Mono "no decode" plate until real video extraction lands post-MVP.
- Speed control: 0.5×, 1×, 2×, 5×.
- Buttons: play/pause, Share session (stub → toast), Export MP4 (stub → toast).
- Playhead `t` is the same zustand value the Workspace Timeline uses, enabling cross-screen seek.

### Exit criteria

- Scrubbing or autoplay moves the robot smoothly along the planned-vs-actual path at 60 fps.
- Selecting an event in Copilot's Timeline tab then switching to Replay seeks to that exact timestamp.

---

## Phase 9 — Screen 04: Agents & MCP

### Files

- `src/renderer/screens/Agents.tsx`
- `src/renderer/components/agents/{AgentCard,MCPServerRow,AgentList,MCPList,AgentDrawer}.tsx`

### Internal agents (the 5 MCP workers)

- One `AgentCard` per worker, with `Toggle`, model badge, description, 7-day call count pill, last-error pill if any.
- Toggling disables the worker's tool-list contribution in the next chat turn.

### External MCP servers (mock-style affordance only)

- Empty-state panel with disabled "+ Add server" button and a "Learn about external MCPs →" link to a doc page.
- The mock's Slack / Linear / Foxglove / S3 / Git rows are **not** shipped — only the affordance.

### Per-agent drawer

- Enable/disable toggle, default-model picker (reads providers from Settings), recent tool calls (last 20 from `audit_trail`), test-run button.

### Exit criteria

- Disabling AnomalyDetector then re-running the canned chat shows it absent from the audit trail.
- Worker process death reflects in the screen within 2 s.

---

## Phase 10 — Screen 05: ⌘K Semantic Search

### Files

- `src/renderer/components/search/{SearchOverlay,SearchResultCard,MiniTimeline,QuerySuggestions}.tsx`
- `src/renderer/hooks/useGlobalShortcut.ts`
- `backend/app/api/search.py`

### Behavior

- ⌘K (Ctrl+K) opens a centered modal from any screen. Esc closes. Arrow keys + Enter navigate results.
- Query routes:
  - Within active session: `GET /api/sessions/{id}/logs?q=…` (Neo4j vector search).
  - Across past runs: `GET /api/runs/search?q=…` — backed by a fixture matching `mock_design/data.jsx` `PAST_RUNS` for MVP; replace with a real cross-session index post-MVP.
- `SearchResultCard`: run id, robot, date, duration, title, `MiniTimeline` (20 buckets with anomaly markers), environment pill, anomaly-count pill, tag pills.
- Suggestions panel under the input (default examples + recent queries from `localStorage`).

### Exit criteria

- ⌘K opens overlay in under 100 ms from any screen.
- Query "lidar dropout" returns the seeded failure run with anomaly markers in the correct buckets.
- Click on a result loads that session into Copilot.

---

## Phase 11 — Screen 06: Settings

### Files

- `src/renderer/screens/Settings.tsx`
- `src/renderer/components/settings/{Sidebar,SectionCard,Row,KeyInput,ModelPicker,DockerStatus,StoragePanel,ShortcutsGrid,AboutPanel}.tsx`

### Sections (mock parity)

| Section | Contents |
| :--- | :--- |
| **General** | Theme (system/dark/light), language, telemetry opt-out, startup behavior |
| **Models & API Keys** | Provider cards: Anthropic (Claude), OpenAI, Gemini, Ollama (local), Custom OpenAI-compatible. Each: `KeyInput` (reveal toggle), endpoint override, default-model picker, "Set as default" pill, test-connection button. Stored via `safeStorage`. |
| **Docker & Runtime** | Live status from `docker:status` IPC, image versions, mount path display, **Restart stack** button, log stream toggle |
| **Storage & Data** | Data directory path (opens in OS file manager), DB size, **Clear cache**, **Export session** |
| **Shortcuts** | Read-only grid: ⌘K, ⌘↵, Esc, theme toggle, navigation rail bindings |
| **About** | App version, license, GitHub link, third-party notices |

### Behavior

- Setting a new default provider in Models updates the Copilot panel header pill (`claude-sonnet-4.5` ↔ `gpt-5`, etc.) and the next chat call routes there.
- Test-connection: pings the provider with a 5-token completion and shows latency + token count.

### Exit criteria

- Configuring an OpenAI key, marking it default, and sending a new chat — audit trail confirms it routed to OpenAI.
- API keys never appear in logs, stdout, or DevTools network panel after entry (`safeStorage` always wraps).

---

## Phase 12 — Packaging, Demo Bags & Acceptance

### Files

- `electron-builder.yml`
- `scripts/seed-demo.ts`, `scripts/visual-diff.ts`
- `sample_bags/README.md`

### Packaging

- `electron-builder` targets: macOS DMG (arm64 + x64), Windows NSIS, Linux AppImage.
- `extraResources` bundles `sample_bags/` and the prebuilt Docker images as compressed tarballs (`docker save`) so first-run doesn't need a registry pull.
- Code signing and notarization are **documented but skipped** for the hackathon build.

### Demo bags

- 2–3 hand-synthesized failure bags from `turtlebot3` sim:
  - `lidar_failure.mcap` — lidar driver dropout → costmap inflation → planner abort.
  - `nav_drift_failure.mcap` — high odometry covariance, TF drift over 60 s.
  - `controller_abort.mcap` — recovery-loop retry exhaustion.
- 1 public Nav2 sample bag for variety.
- `sample_bags/README.md` documents each scenario and the expected DataPilot diagnosis.

### First-run flow

1. Docker check. If missing → Setup screen with copy-paste remedies.
2. Otherwise, dashboard with prominent **Load demo bag** CTA pointing at `sample_bags/lidar_failure.mcap`.

### Acceptance

- Scripted run of PRD §5 success criteria: parse < 15 s, citation-grounded chat, E2E < 30 s.
- Visual diff (`scripts/visual-diff.ts`) compares full-screen captures of all 6 screens against `mock_design` references; fail if pixel diff > 5 %.

### Exit criteria

- Fresh macOS user double-clicks the DMG → completes Docker setup if needed → loads demo bag → asks the canned question → reads a correct diagnosis. Total elapsed time under 2 min.

---

## 13. Failure Modes & Fallbacks

The agent layer must degrade gracefully — a flaky LLM provider or a dead worker should never produce a 500. Each row is exercised by a test in `backend/tests/test_resilience.py`.

| Failure | Detection | Fallback behavior |
| :--- | :--- | :--- |
| **Neo4j down** | Cypher query exception | Composer returns partial response noting "graph context unavailable"; vector search continues against an in-memory cache (last 100 embeddings per session). KGraph tab shows skeleton. |
| **LLM rate limit (429/503)** | provider HTTP error | Exponential backoff, max 3 retries. If user's chosen Composer provider stays exhausted, supervisor falls back to any other configured provider and the renderer surfaces a banner ("Switched from OpenAI → Anthropic due to rate limit"). |
| **MCP worker timeout (> 10 s)** | task wait timeout | Worker marked unhealthy in `mcp_client`, replan triggered with that tool excluded. Agents screen status flips to `error` with last-error string. |
| **Embedding model unavailable** | startup probe fails | Falls back to local MiniLM (always bundled in the FastAPI image); ingestion proceeds with reduced 384-dim vector index. |
| **Docker socket lost mid-session** | `dockerode` `error` event | Renderer shows reconnect banner; running chat finishes from cached context; new chat blocked until reconnect succeeds. |
| **Composer streaming interrupted** | client disconnect | Server continues computing to completion; result available via `GET /sessions/{id}/chat/last` so the client can reconnect-and-resume. |
| **Token budget exceeded mid-plan** | budget tracker | Replan into a smaller plan; if no smaller plan possible, Composer runs with `partial: true` and a "context exceeded budget" banner. |

---

## 14. Token & Cost Budgeting

| Cap | Value | Behavior at limit |
| :--- | :--- | :--- |
| Per-turn token cap | 25,000 (in + out across supervisor + all specialists + composer) | Replan into a smaller plan before exceeding |
| Per-session token cap | 200,000 | Warn at 80%, hard-block at 100% with "Start new session" CTA |
| Context-window compaction trigger | transcript > 40k tokens | Supervisor's cheap-fast model summarizes turns ≤(now − 5) into a single "session summary" message that replaces them in context |
| Specialist short-circuit | confidence ≥ 0.9 from first internal step | Specialist terminates early without using its full internal budget |
| Cost telemetry | every chat response | `usage: {tokens_in, tokens_out, est_cost_usd}` in the SSE `final` event; running totals shown in Settings → About |

Token accounting lives in `backend/app/agent/budget.py`. Every node updates `state.token_budget_remaining` after its LLM call; the dispatcher checks the remaining budget before invoking the next step.

---

## 15. Verification — End-to-End Checks per Phase

| Phase | How to verify |
| :--- | :--- |
| 0 | `pnpm install && pnpm dev` opens blank window; `docker compose config` validates |
| 1 | Kill Docker → Setup screen; restart Docker → stack boots, dashboard loads |
| 2 | DesignSystem screen matches mock in both themes; Tailwind utilities resolve to OKLCH tokens |
| 3 | `pytest backend/tests/test_ingestion.py` — for `lidar_failure.mcap`, assert the 4-hop causal chain query returns the expected path; ≥80% of WARN/ERROR logs have at least one causal edge; ingestion completes < 15s |
| 4 | `POST /chat` SSE stream emits `plan` event < 2s; full envelope has `plan[]`, `findings[]`, `causal[]`, `citations[]`, `audit_trail[]`, `usage`; every finding has a `log_id` that resolves in Neo4j |
| 4.5 | `pnpm eval` — all golden questions pass; supervisor routing trajectory matches expected per question; citation grounding is 100%; rerun with `temperature=0` yields identical routing + causal chain |
| 5 | Per-worker `pytest mcp_workers/<name>/tests/` covers ok + error paths for every tool; `docker stop datapilot-anomaly-detector` mid-chat → graceful banner within 2s; golden-trace regression unchanged after the in-process→MCP swap |
| 6 | Manual walk-through of all 5 workspace tabs + action chips against a real diagnosis |
| 7–11 | Per-screen visual diff against mock; both themes; no console errors |
| 12 | DMG install on fresh VM; full demo flow in < 2 min |

---

## 16. Out-of-Scope (Tracked Follow-ups)

- Reflexion / self-critique loop on top of the supervisor (could swap in later for higher accuracy at the cost of latency).
- **Parallel specialist invocation** (deferred until sequential is rock-solid — Phase 4.6).
- Token-streaming UI for specialist outputs (currently only the Composer streams tokens; specialists stream step-status only).
- LLM-derived causal edges (the YAML rules engine handles the 3 sample-bag failure modes; ML augmentation comes later).
- Cross-session vector index for ⌘K "search all past runs" (fixture-backed for MVP).
- Live ROS topic streaming (mock's "Live robot" toggle ships as a stub pill).
- Real fleet data feed (fixture-backed for MVP).
- 3rd-party MCP integrations (Slack / Linear / Foxglove / S3 / Git) — affordance only.
- Storybook, visual-regression CI, Playwright E2E.
- Code signing and notarization.
- Regenerate `FOLDER_STRUCTURE.md` to match §1.2 (today's `FOLDER_STRUCTURE.md` describes the old web architecture and should be deleted or rewritten).
- Multi-bag comparison view (`PRD.md` Could-Have).
- RViz / Foxglove plugin (`PRD.md` Could-Have).
- User accounts, RBAC (`PRD.md` Won't-Have).
