# DataPilot Agent Guide

This file is the working guide for AI coding agents and developers contributing to DataPilot. Use it to keep changes aligned with the product docs, architecture, and intended developer workflow.

## Project Snapshot

DataPilot is an Electron desktop app for robotics engineers debugging ROS 2 robot failures locally. The app lets a user pick a local `.mcap` or `.db3` rosbag, indexes diagnostics and telemetry, renders timelines, and answers natural-language debugging questions with grounded timestamps, nodes, and suggested fixes.

The product principle is local-first robotics debugging: large robot logs stay on the engineer's machine, with Docker-managed backend services and optional cloud or local LLM routing.

## Source Of Truth

Read these before making architectural changes:

- `docs/implementation.md`: current implementation plan and authoritative stack.
- `docs/ARCHITECTURE.md`: system architecture, data flow, API design, database notes.
- `docs/TECH_DECISIONS.md`: decisions and trade-offs.
- `docs/PRD.md`: product scope, user stories, and success criteria.
- `docs/SPRINT_PLAN.md`: hackathon 7-day calendar and parallel team mapping. Not stack-authoritative.
- `mock_design/`: visual and interaction source of truth for the renderer UI.

Treat `docs/FOLDER_STRUCTURE.md` and parts of `README.md` as older planning docs when they conflict with `docs/implementation.md`. In particular, the current implementation plan chooses Vite + React 19 inside Electron rather than Next.js, and Neo4j + SQLite rather than a Milvus-only vector stack.

**When AGENT.md and implementation.md disagree, implementation.md wins.**

## Intended Tech Stack

- Desktop shell: Electron, packaged with `electron-builder`.
- Build tool: `electron-vite` (single config for main + preload + renderer).
- Renderer: Vite + React 19, TypeScript, Tailwind v4 (OKLCH `@theme` tokens), shadcn/ui primitives, lucide-react icons. Fonts via `@fontsource/inter` + `@fontsource/jetbrains-mono`.
- Renderer state: zustand for screen/app state, TanStack Query for server state.
- Main process: Node.js + TypeScript, `dockerode` for Docker socket orchestration.
- IPC: typed contracts in `src/shared/ipc.ts`, exposed through a narrow preload bridge.
- Backend: FastAPI + Python 3.11+, LangGraph, SQLAlchemy, Pydantic. Chat endpoint streams over SSE.
- Databases: SQLite for sessions/checkpoints/settings; Neo4j for fleet graph, causal edges, and vector search.
- Workers: five MCP services in separate containers (RosbagReader, TrajectoryAnalyzer, PlannerFailureInspector, AnomalyDetector, ReportComposer).
- LLM providers: Anthropic, OpenAI, Gemini, and local Ollama — all four ship. Per-specialist default models, user-overridable from the Agents screen. Supervisor is hard-coded to a cheap-fast model.
- Package manager: pnpm for Node; uv for Python.
- Runtime/development: Docker Desktop or Docker Engine for local service orchestration.

*See implementation.md §1.0 (stack decision), §1.2 (repo layout), §4.7 (model routing).*

## Target Repo Layout

The planned structure is a single root Node package plus separate Python service directories:

```text
package.json           single Node package, no workspaces
pnpm-lock.yaml
electron.vite.config.ts
electron-builder.yml
tsconfig.json          references the two below
tsconfig.node.json     main + preload (Node target)
tsconfig.web.json      renderer (DOM target)
docker-compose.yml     consumed by the Electron orchestrator, not invoked manually
src/
  main/       Electron main process, Docker orchestration, IPC handlers
  preload/    contextBridge API exposed to renderer
  renderer/   React app, screens, components, stores, styles
  shared/     shared IPC/API/types imported across processes
backend/      FastAPI + LangGraph service
mcp_workers/  RosbagReader, TrajectoryAnalyzer, PlannerFailureInspector, AnomalyDetector, ReportComposer
mock_design/  design source of truth
docs/         planning and architecture docs
sample_bags/  small demo bags only
scripts/      local dev and validation helpers
```

If the current repo has not yet been scaffolded, create files in this direction rather than reviving the older split `frontend/` Next.js plan.

*See implementation.md §1.2.*

## Developer Workflow

Prefer this setup once the scaffold exists:

```bash
pnpm install
pnpm dev
```

Useful validation commands:

```bash
pnpm lint
pnpm typecheck
pnpm test
docker compose config
```

Backend workflow once `backend/` exists:

```bash
cd backend
uv sync
uv run uvicorn app.main:app --reload
```

Docker is normally orchestrated by Electron through `dockerode`. `docker compose` is still useful for validating YAML and debugging containers, but the end-user experience should not require manually starting backend services.

## Architecture Rules

- Keep the renderer sandboxed: `contextIsolation: true`, `nodeIntegration: false`. The only renderer→main path is the preload bridge (`window.datapilot.*`).
- Put all cross-process contracts in `src/shared/`. Renderer, preload, and main must import the same channel and payload types.
- Expose only specific methods through `contextBridge.exposeInMainWorld('datapilot', ...)`.
- Keep Docker orchestration in the main process, not in the renderer.
- Store user-entered API keys with Electron `safeStorage`. Do not log keys or commit `.env` values.
- Keep original rosbag files on the host filesystem. Pass absolute host paths through IPC/API and mount host paths into containers as needed.
- Use SQLite for local sessions, LangGraph checkpoints, and settings. Use Neo4j for fleet relationships, causal-edge graph, and vector/semantic log lookup.
- Keep MCP workers decoupled. Add worker tools through explicit JSON Schema contracts instead of direct imports into the API service.
- Agent loops are bounded (replan cap 5, token cap 25k/turn) and emit a typed `AuditEvent[]` consumed by the renderer's Audit Trail panel.

*See implementation.md §4.8 (audit trail), §13 (failure modes).*

## Multi-Agent System

The agent layer is the product's differentiator. Internalize this before touching `backend/app/agent/`:

- **Topology**: a **supervisor** (cheap-fast model) plans → a **dispatcher** invokes 6 specialists sequentially → a **composer** synthesizes → SSE-streamed envelope to the renderer.
- **The 6 specialists** (each with its own system prompt, curated MCP tool subset, and default model):
  - `RootCauseAnalyst` — root-cause tracing across logs, causal edges, planner aborts.
  - `AnomalyDetector` — sensor dropouts, statistical outliers, signature matches.
  - `PerformanceProfiler` — topic rate regressions, CPU/RAM trends.
  - `ReplayNarrator` — time-indexed narration over TF + logs.
  - `SafetyAuditor` — command-history and recovery-history violations.
  - `ReleaseComparator` — diff metric distributions between bag sets.
- **Plan-then-execute** with a hard cap of **5 replans**. The supervisor produces the full plan up-front; SSE emits the `plan` event in <2 s so the Copilot UI can render the steps immediately.
- **Citation grounding is mandatory.** Every `Finding` must reference at least one `log_id` resolvable in Neo4j. Uncited findings are rejected by the Composer.
- **Token budget**: 25k tokens per turn, 200k per session. Exceeding triggers replan or transcript compaction.
- **Causal chain comes from Neo4j**, not LLM speculation — a YAML rules engine writes typed edges (`CAUSED`, `TRIGGERED`, `CONCURRENT_WITH`) at ingestion; the RCA specialist Cypher-queries them.
- **Hybrid RAG**: per-log embeddings + ±5 s Cypher neighbor expansion around each vector hit.
- **Memory**: full transcript + plan history per session via the LangGraph SQLite checkpointer. Survives Electron restart.

*See implementation.md §3 (ingestion + causal rules), §4 (multi-agent orchestration), §4.5 (eval harness), §13 (failure modes), §14 (token budgeting).*

## Frontend Rules

- Match `mock_design/` first. The app should feel like a native robotics diagnostics desktop tool, not a marketing site.
- Use the rail-driven screen model from the implementation plan: Copilot, Fleet, Replay, Agents, Settings, plus global ⌘K search and setup fallback.
- All chart visualizations (Timeline, Metric, Map, KGraph, MiniTimeline) are bespoke React+SVG components ported from the mock. Do not introduce Recharts or any other chart library.
- Theme tokens are OKLCH via Tailwind v4 `@theme`; `data-theme="light"|"dark"` on `<html>` flips them. Persisted via `localStorage["datapilot.theme"]`.
- Prefer lucide-react icons for icon buttons and tool controls.
- Do not add URL routing; screen state belongs in a zustand store (`useUIStore`).
- Use shadcn/ui primitives when they fit, but preserve the custom desktop visual language from the mock.
- Keep charting and telemetry views stable in size so hover states, labels, and dynamic content do not shift the layout.
- Never show raw Docker, parser, or LLM failures as unhandled exceptions. Surface clear recovery states in the setup or diagnostics UI.

*See implementation.md §2 (UI primitives + design system), §6 (Copilot Workspace).*

## Backend Rules

- Keep FastAPI response schemas explicit with Pydantic.
- Parser code should prioritize `/rosout`, `/diagnostics`, TF, controller state, planner failures, and timestamp fidelity.
- Never send full raw bags or unbounded logs to an LLM. Retrieve concise, cited context first.
- LLM answers must cite at least one `log_id` resolvable for the session. Uncited findings are rejected by the Composer.
- MCP tools return `{ok: true, result}` or `{ok: false, error: {code, message, retryable}}`. Latency budget per tool call: <2 s p95.
- Local Llama/Ollama should be treated as first-class for air-gapped workflows.
- Use async HTTP clients for provider and worker calls where appropriate.
- Design APIs under `http://localhost:8000/api`. Chat endpoint streams over SSE; non-chat endpoints return JSON.

*See implementation.md §4.10 (chat endpoint), §5.6 (MCP tool contracts).*

## Testing Expectations

For small doc-only changes, a read-through is enough. For code changes, run the narrowest useful checks first, then broaden when behavior crosses process boundaries.

Minimum expectations by area:

- Renderer changes: lint/typecheck and a local Electron smoke test when available. For visual changes, diff against the corresponding `mock_design/*.jsx` file in both light and dark themes.
- IPC/main changes: typecheck plus a manual check that preload, renderer, and main contracts still agree.
- Docker orchestration: `docker compose config` and a Docker-ready/Docker-off startup check.
- Backend changes: Python tests or focused `uv run` checks, plus FastAPI OpenAPI/schema sanity where relevant.
- Parser/RAG changes: validate with at least one sample bag or fixture and confirm cited timestamps are preserved.
- Agent / specialist / prompt changes: run the golden eval harness (`pnpm eval` or `uv run pytest backend/tests/eval`). Citation grounding must be 100%; supervisor routing trajectory must match expectations.
- Packaging changes: run the package/build command for the affected platform if feasible.

*See implementation.md §4.5 (eval harness), §15 (verification matrix).*

## Common Gotchas

- The docs contain historical stack drift. Follow `docs/implementation.md` when there is a conflict.
- Avoid Milvus-only assumptions. The current plan is Neo4j + SQLite.
- Do not mount the Docker socket into renderer-accessible code.
- Do not commit large rosbags, generated databases, secrets, `node_modules`, `.venv`, `dist`, or packaged app output.
- Do not silently fall back from local file paths to browser uploads; local path access is core to the desktop product.

See also: **Anti-patterns** below for irreversible decisions that must not be revisited casually.

## Anti-patterns

Three course-corrections expensive enough to warrant explicit rules:

1. **No Next.js, no `next/font`, no App Router.** The renderer is Vite + React 19. SSR is irrelevant inside an Electron window and URL routing is unused. Loading fonts uses `@fontsource/*` packages bundled by Vite. (A CI bot already caught one `next/font` slip — don't make it two.) *See implementation.md §1.0.*
2. **No URL routing in the renderer.** Screen state is a `useUIStore` zustand value driven by the rail. Do not introduce `react-router`, TanStack Router, or hash-based routing.
3. **No splitting `electron/` and `frontend/` into separate packages.** The repo is a single unified Node package under `src/{main,preload,renderer,shared}/` built with `electron-vite`. The shared-types story in `src/shared/ipc.ts` is the main reason this was unified — splitting them brings the IPC-contract-drift problem back.

## Contribution Style

- Keep changes small and aligned with the current phase.
- Reference the relevant implementation.md phase number in PR titles or commits (e.g., "Phase 4.2: add SafetyAuditor specialist").
- Update docs when architectural decisions change.
- Prefer typed boundaries over convention-only contracts.
- Add concise comments only where the implementation is non-obvious.
- Preserve user privacy and local-first behavior as product requirements, not optional polish.
