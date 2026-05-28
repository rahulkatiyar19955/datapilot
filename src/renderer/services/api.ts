/**
 * Typed REST client for the DataPilot FastAPI backend.
 * Base URL defaults to localhost:8000 (Docker-mapped port).
 */

import type {
  SessionMeta,
  TimelineEvent,
  TopicInfo,
  LogItem,
  KGraphData,
  KGraphNode,
  KGraphEdge,
  SessionStatus,
} from "@shared/types";

// mockData import removed — all data now comes from the FastAPI backend

const BASE = "http://localhost:8000";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

async function put<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PUT ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

async function del<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`DELETE ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

// ── Raw API response shapes (backend uses snake_case) ─────────────────

interface RawSession {
  id: string;
  filename: string;
  robot_name?: string;
  duration_seconds?: number;
  total_messages?: number;
  topics_list?: string | string[];
  status: string;
}

interface RawTimeline {
  t: number;
  type: string;
  sev: string;
  topic: string;
  label: string;
}

interface RawTopic {
  name: string;
  type: string;
  hz?: number;
  msgs?: number;
}

interface RawLog {
  t?: string;
  node?: string;
  sev?: string;
  text?: string;
}

interface RawKGraph {
  nodes: Array<{
    id: string;
    label: string;
    group: string;
    x?: number;
    y?: number;
  }>;
  edges: Array<string[] | { source: string; target: string }>;
}

// ── Normalizers ───────────────────────────────────────────────────────

function normalizeSession(r: RawSession): SessionMeta {
  let topicsCount = 0;
  if (r.topics_list) {
    if (typeof r.topics_list === "string") {
      try {
        topicsCount = (JSON.parse(r.topics_list) as string[]).length;
      } catch {
        topicsCount = 0;
      }
    } else if (Array.isArray(r.topics_list)) {
      topicsCount = r.topics_list.length;
    }
  }
  return {
    id: r.id,
    filename: r.filename,
    robot: r.robot_name ?? "unknown",
    durationSeconds: r.duration_seconds ?? 0,
    totalMessages: r.total_messages ?? 0,
    topicsCount,
    status: r.status as SessionStatus,
  };
}

// ── Public API ────────────────────────────────────────────────────────

export async function createSession(
  filepath: string,
): Promise<{ session_id: string }> {
  return post<{ session_id: string }>("/api/sessions/create", { filepath });
}

export async function getSession(id: string): Promise<SessionMeta> {
  const raw = await get<RawSession>(`/api/sessions/${id}`);
  return normalizeSession(raw);
}

export async function getTimeline(id: string): Promise<TimelineEvent[]> {
  const raw = await get<RawTimeline[]>(`/api/sessions/${id}/timeline`);
  return raw.map((e) => ({
    t: e.t,
    type: e.type as TimelineEvent["type"],
    sev: e.sev as TimelineEvent["sev"],
    topic: e.topic,
    label: e.label,
  }));
}

export async function getTopics(id: string): Promise<TopicInfo[]> {
  const raw = await get<RawTopic[]>(`/api/sessions/${id}/topics`);
  return raw.map((t) => ({
    name: t.name,
    type: t.type,
    hz: t.hz ?? 0,
    msgs: t.msgs ?? 0,
  }));
}

export async function getLogs(
  id: string,
  opts?: { q?: string; severity?: string; limit?: number; offset?: number },
): Promise<LogItem[]> {
  const params = new URLSearchParams();
  if (opts?.q) params.set("q", opts.q);
  if (opts?.severity) params.set("severity", opts.severity);
  if (opts?.limit != null) params.set("limit", String(opts.limit));
  if (opts?.offset != null) params.set("offset", String(opts.offset));
  const qs = params.toString();
  const path = `/api/sessions/${id}/logs${qs ? `?${qs}` : ""}`;
  const raw = await get<RawLog[]>(path);
  return raw.map((l) => ({
    t: l.t ?? "",
    node: l.node ?? "",
    sev: (l.sev ?? "INFO") as LogItem["sev"],
    text: l.text ?? "",
  }));
}

export async function getKGraph(id: string): Promise<KGraphData> {
  const raw = await get<RawKGraph>(`/api/sessions/${id}/kgraph`);

  // Layout positions: if not provided by backend, spread nodes in a grid.
  const nodes: KGraphNode[] = raw.nodes.map((n, i) => ({
    id: n.id,
    label: n.label,
    group: n.group as KGraphNode["group"],
    x: n.x ?? 110 + (i % 3) * 220,
    y: n.y ?? 70 + Math.floor(i / 3) * 130,
  }));

  const edges: KGraphEdge[] = raw.edges.map((e) => {
    if (Array.isArray(e)) return { source: e[0], target: e[1] };
    return e as KGraphEdge;
  });

  return { nodes, edges };
}

// ── SSE chat streaming ─────────────────────────────────────────────────

export type ChatEventHandler = (event: string, data: unknown) => void;

export function streamChat(
  sessionId: string,
  message: string,
  onEvent: ChatEventHandler,
  composerProvider?: string,
  composerModel?: string,
): AbortController {
  const ac = new AbortController();

  fetch(`${BASE}/api/sessions/${sessionId}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      composer_provider: composerProvider,
      composer_model: composerModel,
    }),
    signal: ac.signal,
  })
    .then((res) => {
      if (!res.body) throw new Error("No response body");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buffer = "";

      const pump = (): void => {
        reader
          .read()
          .then(({ done, value }) => {
            if (done) return;
            buffer += dec.decode(value, { stream: true });
            // SSE messages are separated by double newlines (can be \r\n\r\n or \n\n)
            const parts = buffer.split(/\r?\n\r?\n/);
            buffer = parts.pop() ?? "";
            for (const part of parts) {
              const eventMatch = part.match(/^event: (.+)$/m);
              const dataMatch = part.match(/^data: (.+)$/m);
              if (dataMatch) {
                try {
                  const parsed: unknown = JSON.parse(dataMatch[1]);
                  onEvent(eventMatch?.[1] ?? "message", parsed);
                } catch {
                  // malformed JSON chunk — skip
                }
              }
            }
            pump();
          })
          .catch((err: unknown) => {
            if (err instanceof Error && err.name === "AbortError") return;
            onEvent("error", {
              message: err instanceof Error ? err.message : "Stream read error",
            });
          });
      };

      pump();
    })
    .catch((err: unknown) => {
      if (err instanceof Error && err.name === "AbortError") return;
      onEvent("error", {
        message: err instanceof Error ? err.message : "Network error",
      });
    });

  return ac;
}

export async function getSessions(): Promise<SessionMeta[]> {
  const raw = await get<RawSession[]>("/api/sessions");
  return raw.map(normalizeSession);
}

export async function deleteSession(
  id: string,
): Promise<{ status: string; message: string }> {
  return del<{ status: string; message: string }>(`/api/sessions/${id}`);
}

export async function clearAllSessions(): Promise<{
  status: string;
  message: string;
}> {
  return del<{ status: string; message: string }>("/api/sessions");
}

export async function testApiKey(
  provider: string,
  key: string,
  endpoint?: string,
): Promise<{ status: string; message: string }> {
  return post<{ status: string; message: string }>("/api/settings/test-key", {
    provider,
    key,
    endpoint,
  });
}

export async function fetchProviderModels(
  provider: string,
  key: string,
  endpoint?: string,
): Promise<string[]> {
  return post<string[]>("/api/settings/models", {
    provider,
    key,
    endpoint,
  });
}

export async function updateBackendKey(
  provider: string,
  key: string,
): Promise<{ status: string; message: string }> {
  return post<{ status: string; message: string }>("/api/settings/keys", {
    provider,
    key,
  });
}

export async function fetchAgentModels(): Promise<Record<string, string>> {
  return get<Record<string, string>>("/api/settings/agent-models");
}

export async function setAgentModel(
  specialist: string,
  modelId: string,
): Promise<{ status: string }> {
  return put<{ status: string }>(`/api/settings/agent-models/${specialist}`, {
    model_id: modelId,
  });
}

export async function deleteAgentModel(
  specialist: string,
): Promise<{ status: string }> {
  return del<{ status: string }>(`/api/settings/agent-models/${specialist}`);
}
