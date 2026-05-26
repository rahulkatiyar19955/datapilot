# DataPilot Agent Guide

> **Living Document** — Last aligned with `docs/implementation.md` at project Phase 4.  
> **You must** follow every rule in this file. If a rule cannot be followed, stop and explain why to the user before proceeding.  
> **Before starting any task**, review `docs/implementation.md`, the relevant `docs/*.md` files, existing tests for the area you are touching, and at least one existing implementation of the same pattern (e.g., review another specialist before adding one, review another IPC channel before adding one).

---

## Table of Contents

1. [Agent Instructions](#agent-instructions)
2. [Project Snapshot](#project-snapshot)
3. [Decision Hierarchy (Source of Truth)](#decision-hierarchy-source-of-truth)
4. [Quick Start](#quick-start)
5. [Repo Layout](#repo-layout)
6. [Architecture Rules](#architecture-rules)
7. [Frontend Rules](#frontend-rules)
8. [Backend Rules](#backend-rules)
9. [Multi-Agent System](#multi-agent-system)
10. [Testing Expectations](#testing-expectations)
11. [Performance & Resource Budgets](#performance--resource-budgets)
12. [Security & Privacy Guardrails](#security--privacy-guardrails)
13. [Troubleshooting & Common Gotchas](#troubleshooting--common-gotchas)
14. [Anti-Patterns (Irreversible Decisions)](#anti-patterns-irreversible-decisions)
15. [Contribution Style](#contribution-style)

---

## Agent Instructions

- **You must** treat `docs/implementation.md` as the authoritative stack document. When `AGENT.md` and `implementation.md` conflict, `implementation.md` wins.
- **You must** read the relevant docs section (cited below with § references) before modifying code in that area.
- **You must** review existing code of the same type before writing new code:
  - New React component? Review `mock_design/` and an existing screen component.
  - New IPC channel? Review `src/shared/ipc.ts` and an existing handler.
  - New specialist agent? Review `backend/app/agent/` and an existing specialist.
  - New MCP tool? Review an existing worker tool contract.
- **You must** run the narrowest applicable validation command after changes (see [Testing Expectations](#testing-expectations)).
- **You must not** add new major dependencies without stating the trade-off and getting user confirmation.
- **Always** prefer existing dependencies over new ones.
- **Always** use TypeScript strict mode; no `any` without explicit justification.
- **Never** commit secrets, API keys, `.env` files, generated databases, rosbags, `node_modules`, `.venv`, or `dist/`.

---

## Project Snapshot

DataPilot is an **Electron desktop app** for robotics engineers debugging ROS 2 robot failures locally.

Core user flow:
1. Engineer picks a local `.mcap` or `.db3` rosbag.
2. App indexes diagnostics and telemetry into SQLite + Neo4j.
3. App renders timelines, graphs, and maps.
4. Engineer asks natural‑language debugging questions.
5. A multi‑agent backend (FastAPI + LangGraph) answers with **grounded timestamps**, node names, and suggested fixes, streamed over SSE.

**Product principle:** local‑first robotics debugging. Large robot logs stay on the engineer's machine. Backend services are Docker‑managed. LLM routing supports cloud (Anthropic, OpenAI, Gemini) and local (Ollama) providers.

---

## Decision Hierarchy (Source of Truth)

Read these **in this order** when docs conflict:

1. `docs/implementation.md` — authoritative stack, current phase, build decisions.
2. `docs/ARCHITECTURE.md` — system architecture, data flow, API design, DB notes.
3. `docs/TECH_DECISIONS.md` — decisions and trade‑offs.
4. `docs/PRD.md` — product scope, user stories, success criteria.
5. `docs/SPRINT_PLAN.md` — 7‑day calendar and parallel team mapping (not stack‑authoritative).
6. `mock_design/` — visual and interaction source of truth for the renderer UI.
7. `docs/FOLDER_STRUCTURE.md` and parts of `README.md` — older planning docs; use only when they do not conflict with `implementation.md`.

**Key drift correction:** The current implementation uses **Vite + React 19** inside Electron (not Next.js) and **Neo4j + SQLite** (not Milvus‑only).

---

## Quick Start

### Prerequisites
- Docker Desktop or Docker Engine
- Node.js 20+ (pnpm via corepack)
- Python 3.11+ (uv)

### Install & Dev (Electron + Renderer)
```bash
pnpm install
pnpm dev
```

### Validation (run the narrowest first, then broaden)
```bash
pnpm lint
pnpm typecheck
pnpm test
docker compose config
```

### Backend Dev (once `backend/` exists)
```bash
cd backend
uv sync
uv run uvicorn app.main:app --reload
```

> **Note:** Docker is orchestrated by the Electron **main process** via `dockerode`. `docker compose` is only for validating YAML or debugging containers. The end‑user must never manually start backend services.

---

## Repo Layout

Single unified Node package; Python services live in sibling directories.

```text
package.json              # single Node package, no workspaces
pnpm-lock.yaml
electron.vite.config.ts   # main + preload + renderer
electron-builder.yml
tsconfig.json             # references tsconfig.node.json + tsconfig.web.json
tsconfig.node.json        # main + preload (Node target)
tsconfig.web.json         # renderer (DOM target)
docker-compose.yml        # consumed by Electron orchestrator, not manually
src/
  main/       # Electron main process, Docker orchestration, IPC handlers
  preload/    # contextBridge API exposed to renderer
  renderer/   # React 19 app, screens, components, stores, styles
  shared/     # IPC/API/types imported across processes
backend/      # FastAPI + LangGraph service
mcp_workers/  # RosbagReader, TrajectoryAnalyzer, PlannerFailureInspector,
              # AnomalyDetector, ReportComposer
mock_design/  # design source of truth
docs/         # planning and architecture docs
sample_bags/  # small demo bags only
scripts/      # local dev and validation helpers
```

---

## Architecture Rules

### Process Boundaries
- **Renderer sandbox:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- The **only** renderer→main path is the preload bridge (`window.datapilot.*`).
- **Never** expose raw `ipcRenderer`, `fs`, `child_process`, or `require` to the renderer.
- All cross‑process contracts live in `src/shared/ipc.ts`. Renderer, preload, and main **must** import the same channel and payload types.
- Expose only specific, typed methods through `contextBridge.exposeInMainWorld('datapilot', ...)`.

### IPC Validation
- **Always** validate IPC payloads in `ipcMain.handle` handlers. Use Zod or explicit TypeScript guards.
- Treat every IPC message as untrusted input from a potentially compromised renderer.

### Docker & Orchestration
- Keep Docker orchestration **in the main process only**.
- **Do not** mount the Docker socket into renderer‑accessible code.
- `dockerode` is the orchestration library. `docker-compose.yml` is the service definition.
- Keep original rosbag files on the host filesystem. Pass **absolute host paths** through IPC/API and mount host paths into containers as needed.
- **Never** silently fall back from local file paths to browser uploads; local path access is core to the desktop product.

### Databases
- **SQLite:** sessions, LangGraph checkpoints, settings.
- **Neo4j:** fleet relationships, causal edges, vector/semantic log lookup.
- **Do not** assume Milvus. The vector stack is Neo4j.

### Secrets
- Store user‑entered API keys with Electron `safeStorage`.
- **Never** log keys or commit `.env` values.
- If you need a placeholder, use `.env.example` with empty values and document required keys in `docs/`.

---

## Frontend Rules

### Stack & Libraries
- **Renderer:** Vite + React 19 + TypeScript.
- **Styling:** Tailwind v4 with OKLCH `@theme` tokens. Theme switch via `data-theme="light"|"dark"` on `<html>`, persisted in `localStorage["datapilot.theme"]`.
- **Fonts:** `@fontsource/inter` + `@fontsource/jetbrains-mono`. No `next/font`.
- **Icons:** `lucide-react` only.
- **Primitives:** `shadcn/ui` when they fit; preserve the custom desktop visual language from `mock_design/`.
- **State:**
  - `zustand` for screen / app state.
  - TanStack Query for server state.
- **No URL routing.** Screen state belongs in a zustand store (`useUIStore`). Do **not** introduce `react-router`, TanStack Router, or hash‑based routing.

### UI / UX Requirements
- Match `mock_design/` first. The app should feel like a **native robotics diagnostics desktop tool**, not a marketing site.
- All chart visualizations (Timeline, Metric, Map, KGraph, MiniTimeline) are **bespoke React+SVG components** ported from the mock.  
  **Do not** introduce Recharts, D3 (unless already present), or any other chart library.
- Keep charting and telemetry views **stable in size** so hover states, labels, and dynamic content do not shift the layout.
- **Accessibility:** semantic HTML, keyboard navigation, focus management, `aria-label` on icon buttons. Test with keyboard only before declaring a feature complete.
- **Never** show raw Docker, parser, or LLM failures as unhandled exceptions. Surface clear recovery states in the setup or diagnostics UI.

### Component Patterns
- Prefer composition over inheritance.
- Keep components focused; split at ~250 lines.
- Use React 19 Actions / `useActionState` for form‑like interactions where appropriate.
- Let the React Compiler handle memoization; avoid manual `React.memo`, `useMemo`, `useCallback` unless profiling proves a need.

---

## Backend Rules

### API Design
- FastAPI response schemas must be explicit Pydantic models.
- Design APIs under `http://localhost:8000/api`.
- Chat endpoint streams over **SSE**; non‑chat endpoints return JSON.

### Parser & Data Handling
- Parser code should prioritize `/rosout`, `/diagnostics`, TF, controller state, planner failures, and **timestamp fidelity**.
- **Never** send full raw bags or unbounded logs to an LLM. Retrieve concise, cited context first.

### LLM Output & Grounding
- **Every `Finding` must cite at least one `log_id`** resolvable in Neo4j for the session.
- Uncited findings are **rejected by the Composer**.
- Local Llama / Ollama is a **first‑class** provider for air‑gapped workflows.

### MCP Tool Contracts
- MCP tools return `{ok: true, result}` or `{ok: false, error: {code, message, retryable}}`.
- Latency budget per tool call: **<< 2 s p95**.
- Add worker tools through explicit **JSON Schema contracts** instead of direct imports into the API service.
- Keep MCP workers decoupled.

### Async & I/O
- Use async HTTP clients for provider and worker calls where appropriate.

---

## Multi-Agent System

> See `docs/implementation.md` §3, §4, §4.5, §4.8, §13, §14.

### Topology
1. **Supervisor** (cheap‑fast model, hard‑coded) plans the execution graph.
2. **Dispatcher** invokes 6 specialists sequentially.
3. **Composer** synthesizes findings into the final streamed answer.
4. **SSE** emits a typed envelope to the renderer.

### The 6 Specialists
Each specialist has its own system prompt, curated MCP tool subset, and default model (user‑overridable from the Agents screen):

| Specialist | Responsibility |
|---|---|
| `RootCauseAnalyst` | Root‑cause tracing across logs, causal edges, planner aborts |
| `AnomalyDetector` | Sensor dropouts, statistical outliers, signature matches |
| `PerformanceProfiler` | Topic rate regressions, CPU/RAM trends |
| `ReplayNarrator` | Time‑indexed narration over TF + logs |
| `SafetyAuditor` | Command‑history and recovery‑history violations |
| `ReleaseComparator` | Diff metric distributions between bag sets |

### Execution Constraints
- **Plan‑then‑execute.** Supervisor produces the full plan up‑front.
- **Hard cap:** 5 replans per session.
- **SSE must emit the `plan` event in < 2 s** so the Copilot UI can render steps immediately.
- **Token budget:** 25 k tokens per turn, 200 k per session. Exceeding triggers replan or transcript compaction.

### Citation & Causality
- **Causal chains come from Neo4j**, not LLM speculation.
- A YAML rules engine writes typed edges (`CAUSED`, `TRIGGERED`, `CONCURRENT_WITH`) at ingestion.
- The RCA specialist Cypher‑queries them.
- **Hybrid RAG:** per‑log embeddings + ±5 s Cypher neighbor expansion around each vector hit.

### Memory & Audit
- Full transcript + plan history per session via the LangGraph SQLite checkpointer. Survives Electron restart.
- Agent loops emit typed `AuditEvent[]` consumed by the renderer's Audit Trail panel.

---

## Testing Expectations

Run the **narrowest useful check first**, then broaden when behavior crosses process boundaries.

| Area | Minimum Validation |
|---|---|
| **Renderer changes** | `pnpm lint` + `pnpm typecheck` + local Electron smoke test. For visual changes, diff against `mock_design/*.jsx` in both light and dark themes. |
| **IPC / main changes** | `pnpm typecheck` + manual check that preload, renderer, and main contracts still agree (`src/shared/ipc.ts`). |
| **Docker orchestration** | `docker compose config` + Docker‑ready / Docker‑off startup check. |
| **Backend changes** | Python tests or focused `uv run` checks + FastAPI OpenAPI/schema sanity. |
| **Parser / RAG changes** | Validate with at least one sample bag or fixture. Confirm cited timestamps are preserved. |
| **Agent / specialist / prompt changes** | Run the golden eval harness (`pnpm eval` or `uv run pytest backend/tests/eval`). **Citation grounding must be 100 %.** Supervisor routing trajectory must match expectations. |
| **Packaging changes** | Run the package/build command for the affected platform if feasible. |

---

## Performance & Resource Budgets

### Electron
- **Memory:** Empty app ~150–200 MB; target with UI and state ~300–500 MB. Aggressively unmount unused views.
- **Binary size:** Expect ~150–200 MB installer. Avoid bundling unnecessary native binaries.
- **First paint:** Target < 2 s on mid‑tier hardware.

### Frontend
- Chart SVGs should render without forcing layout thrash.
- Use `transform` and `opacity` for animations; avoid animating `width`/`height`/`top`/`left`.

### Backend
- **MCP tool p95 latency:** < 2 s.
- **Supervisor plan emission:** < 2 s.
- **Token budget:** 25 k/turn, 200 k/session.

---

## Security & Privacy Guardrails

- **Local‑first is a product requirement, not optional polish.** Large rosbags must not be uploaded to cloud without explicit user action.
- **Zero‑trust IPC:** validate every payload.
- **Secrets:** `safeStorage` only. No logging, no `.env` commits.
- **Renderer sandbox:** never disable `contextIsolation` or enable `nodeIntegration` for a library convenience. Rewrite the integration in the main process instead.
- **ASAR integrity:** enable integrity validation (Electron v30+) in production builds.
- **Auto‑update:** design update manifests to be versioned; stage canary rollouts.

---

## Troubleshooting & Common Gotchas

1. **Docs contain historical stack drift.** Always follow `docs/implementation.md` when there is a conflict.
2. **No Milvus assumptions.** The vector stack is Neo4j.
3. **Do not mount the Docker socket into renderer code.**
4. **Do not commit large rosbags**, generated databases, secrets, `node_modules`, `.venv`, `dist`, or packaged app output.
5. **Do not silently fall back from local file paths to browser uploads.**
6. **Native module breaks on Electron upgrade** — hide every native dependency behind a TypeScript service interface so you can swap the implementation without rewriting callers.
7. **If a library demands `nodeIntegration`,** rewrite the integration in the main process and expose a narrow typed surface to the renderer.

---

## Anti-Patterns (Irreversible Decisions)

These three corrections are expensive enough to warrant explicit, permanent rules:

1. **No Next.js, no `next/font`, no App Router.**  
   The renderer is Vite + React 19. SSR is irrelevant inside an Electron window and URL routing is unused. Loading fonts uses `@fontsource/*` packages bundled by Vite. *(A CI bot already caught one `next/font` slip — don't make it two.)*  
   *See `implementation.md` §1.0.*

2. **No URL routing in the renderer.**  
   Screen state is a `useUIStore` zustand value driven by the rail. Do not introduce `react-router`, TanStack Router, or hash‑based routing.

3. **No splitting `electron/` and `frontend/` into separate packages.**  
   The repo is a single unified Node package under `src/{main,preload,renderer,shared}/` built with `electron-vite`. The shared‑types story in `src/shared/ipc.ts` is the main reason this was unified — splitting them brings the IPC‑contract‑drift problem back.

---

## Contribution Style

- **Keep changes small** and aligned with the current phase.
- **Reference the implementation.md phase number** in PR titles or commits (e.g., `Phase 4.2: add SafetyAuditor specialist`).
- **Update docs** when architectural decisions change.
- **Prefer typed boundaries** over convention‑only contracts.
- **Add concise comments** only where the implementation is non‑obvious.
- **Preserve user privacy and local‑first behavior** as product requirements.

### Before Submitting Agent Output
- [ ] Lint / typecheck passes for the affected area.
- [ ] No new secrets or `.env` values committed.
- [ ] No `any` types introduced without justification.
- [ ] If you added a dependency, you stated the trade‑off.
- [ ] If you touched UI, you checked light + dark themes.
- [ ] If you touched IPC, preload + main + renderer contracts agree.
- [ ] If you touched agents, citation grounding is preserved.
```

---