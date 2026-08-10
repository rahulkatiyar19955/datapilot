import { useRef, useEffect } from "react";
import { useChatStore } from "@renderer/stores/chat";
import { useSessionStore } from "@renderer/stores/session";
import { useSettingsStore } from "@renderer/stores/settings";
import * as api from "@renderer/services/api";
import type { PlanStep, Finding, CausalItem, ChatAction } from "@shared/types";

interface UseChatReturn {
  send: (message: string) => void;
  stop: () => void;
}

interface PlanEventData {
  plan: Array<{ specialist?: string; label?: string }>;
}

interface StepEventData {
  idx: number;
  confidence?: number;
  output_summary?: string;
}

interface FinalEventData {
  response?: string;
  findings?: Array<{ sev?: string; text?: string; detail?: string }>;
  audit_trail?: Array<{ result_summary?: string }>;
  causal?: unknown[];
  citations?: unknown[];
  usage?: {
    tokens_in: number;
    tokens_out: number;
    est_cost_usd?: number;
  };
}

interface ErrorEventData {
  message?: string;
}

export function useChat(): UseChatReturn {
  const { addMessage, updateLastMessage, updateMessageById, updatePlanStep, setStreaming } =
    useChatStore();
  const sessionId = useSessionStore((s) => s.sessionId);
  const setTabData = useSessionStore((s) => s.setTabData);
  const defaultProvider = useSettingsStore((s) => s.defaultProvider);
  const defaultModel = useSettingsStore((s) => s.defaultModel);
  const abortRef = useRef<AbortController | null>(null);
  // The assistant message the in-flight stream is writing to. stop() targets it
  // by id so the marker never lands on a trailing system/error message (#36).
  const activeAssistantIdRef = useRef<string | null>(null);

  // Mirror the live sessionId into a ref so async SSE callbacks read the current
  // session, not the value captured in send()'s closure (#35).
  const sessionIdRef = useRef(sessionId);
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  // Abort in-flight stream on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const send = (message: string) => {
    const targetSessionId = sessionIdRef.current || "general";

    // Abort any in-flight request
    abortRef.current?.abort();

    const msgId = crypto.randomUUID();
    const assistantId = crypto.randomUUID();
    activeAssistantIdRef.current = assistantId;
    const now = new Date().toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });

    addMessage({ id: msgId, role: "user", text: message });
    addMessage({ id: assistantId, role: "assistant", time: now });
    setStreaming(true);

    abortRef.current = api.streamChat(
      targetSessionId,
      message,
      (event, data) => {
        if (event === "plan") {
          const planData = data as PlanEventData;
          const plan: PlanStep[] = (planData.plan ?? []).map((s) => ({
            label: s.label ?? s.specialist ?? "step",
            done: false,
            active: false,
          }));
          // Only show the plan card when there are actual steps.
          // General chat sends plan:[] to make the backend feel responsive — ignore it.
          if (plan.length > 0) {
            updateLastMessage((m) => ({ ...m, plan }));
          }
        } else if (event === "step-start") {
          const { idx } = data as StepEventData;
          updatePlanStep(idx, { active: true });
        } else if (event === "step-done") {
          const { idx, confidence, output_summary } = data as StepEventData;
          updatePlanStep(idx, {
            done: true,
            active: false,
            confidence,
            outputSummary: output_summary,
          });
        } else if (event === "final") {
          const final = data as FinalEventData;

          const findings: Finding[] | undefined = final.findings?.map((f) => ({
            sev: (f.sev ?? "info") as Finding["sev"],
            text: f.text ?? "",
            detail: f.detail,
          }));

          // Extract causal chain from final event if present
          const rawCausal = final.causal ?? [];
          const causal: CausalItem[] | undefined =
            rawCausal.length > 0
              ? rawCausal
                  .map((c: any) => ({ text: typeof c === 'string' ? c : c.text ?? String(c) }))
                  .filter((c) => c.text)
              : undefined;

          const actions: ChatAction[] = sessionIdRef.current
            ? [
                {
                  iconName: "Clock",
                  label: "Jump to timeline",
                  target: "timeline",
                },
                {
                  iconName: "Graph",
                  label: "See causal graph",
                  target: "kgraph",
                },
                {
                  iconName: "Activity",
                  label: "Metric: lidar latency",
                  target: "metrics",
                },
              ]
            : [];

          updateLastMessage((m) => ({
            ...m,
            summary: final.response,
            findings: findings?.length ? findings : undefined,
            causal: causal?.length ? causal : undefined,
            actions,
            usage: final.usage,
          }));

          setStreaming(false);
        } else if (event === "kgraph") {
          // The turn distilled new facts into the knowledge graph — refetch it
          // so they appear without reloading the session. Read the live session
          // id so a mid-stream session switch resolves against the right one (#35).
          const liveSessionId = sessionIdRef.current;
          if (liveSessionId) {
            api
              .getKGraph(liveSessionId)
              .then((g) => setTabData("kgraph", g))
              .catch((err) =>
                console.error("knowledge graph refresh failed:", err),
              );
          }
        } else if (event === "error") {
          const errData = data as ErrorEventData;
          addMessage({
            id: crypto.randomUUID(),
            role: "system",
            text: errData.message ?? "An error occurred.",
          });
          setStreaming(false);
        }
      },
      defaultProvider,
      defaultModel,
    );
  };

  const stop = () => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setStreaming(false);
    // Target the assistant message this stream was writing to by id, so the
    // marker never lands on a trailing system/error message (#36).
    const activeId = activeAssistantIdRef.current;
    if (!activeId) return;
    updateMessageById(activeId, (m) => {
      if (!m.summary) {
        return {
          ...m,
          summary: "*Generation stopped by user.*",
        };
      } else {
        return {
          ...m,
          summary: m.summary + "\n\n*Generation stopped by user.*",
        };
      }
    });
  };

  return { send, stop };
}
