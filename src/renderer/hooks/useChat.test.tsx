import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type Mock,
} from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ChatEventHandler } from "@renderer/services/api";

// Mock the REST/SSE client. streamChat is the only path useChat drives.
vi.mock("@renderer/services/api", () => ({
  streamChat: vi.fn(),
  getKGraph: vi.fn(),
}));

import * as api from "@renderer/services/api";
import { useChat } from "./useChat";
import { useChatStore } from "@renderer/stores/chat";
import { useSessionStore } from "@renderer/stores/session";

const streamChat = api.streamChat as unknown as Mock;
const getKGraph = api.getKGraph as unknown as Mock;

/** Pull the onEvent callback that useChat passed into streamChat. */
function lastOnEvent(): ChatEventHandler {
  const call = streamChat.mock.calls.at(-1);
  if (!call) throw new Error("streamChat was not called");
  return call[2] as ChatEventHandler;
}

function resetChatStore() {
  useChatStore.setState({ messages: [], streaming: false });
}

function resetSessionStore() {
  useSessionStore.setState({
    pendingPath: null,
    pendingSessionId: null,
    sessionId: null,
    status: "idle",
    meta: null,
    timeline: [],
    topics: [],
    logs: [],
    kgraph: null,
  });
}

describe("useChat", () => {
  let abort: Mock;

  beforeEach(() => {
    resetChatStore();
    resetSessionStore();
    streamChat.mockReset();
    getKGraph.mockReset();
    getKGraph.mockResolvedValue({ nodes: [], edges: [] });

    abort = vi.fn();
    // Return a stand-in AbortController so abortRef.current.abort() is observable.
    streamChat.mockReturnValue({ abort } as unknown as AbortController);

    // Deterministic ids; crypto.randomUUID exists in jsdom but stub for clarity.
    let n = 0;
    vi.spyOn(crypto, "randomUUID").mockImplementation(
      () => `id-${++n}` as `${string}-${string}-${string}-${string}-${string}`,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("send() pushes a user message + an assistant placeholder and sets streaming", () => {
    const { result } = renderHook(() => useChat());

    act(() => {
      result.current.send("why did the robot stop?");
    });

    const { messages, streaming } = useChatStore.getState();
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      role: "user",
      text: "why did the robot stop?",
    });
    expect(messages[1]).toMatchObject({ role: "assistant" });
    expect(streaming).toBe(true);
  });

  it("send() calls streamChat with the session id, message, and composer overrides", () => {
    useSessionStore.setState({ sessionId: "sess-42" });
    const { result } = renderHook(() => useChat());

    act(() => {
      result.current.send("hello");
    });

    expect(streamChat).toHaveBeenCalledTimes(1);
    const call = streamChat.mock.calls[0];
    expect(call[0]).toBe("sess-42"); // sessionId
    expect(call[1]).toBe("hello"); // message
    expect(typeof call[2]).toBe("function"); // onEvent
    // composerProvider / composerModel come from the settings store defaults.
    expect(call[3]).toBeTypeOf("string");
    expect(call[4]).toBeTypeOf("string");
  });

  it("falls back to the 'general' session id when none is selected", () => {
    const { result } = renderHook(() => useChat());
    act(() => {
      result.current.send("hi");
    });
    expect(streamChat.mock.calls[0][0]).toBe("general");
  });

  it("a 'plan' event with steps attaches the plan to the assistant message", () => {
    const { result } = renderHook(() => useChat());
    act(() => result.current.send("trace failure"));

    act(() => {
      lastOnEvent()("plan", {
        plan: [{ specialist: "RootCauseAnalyst" }, { label: "Summarize" }],
      });
    });

    const last = useChatStore.getState().messages.at(-1)!;
    expect(last.plan).toHaveLength(2);
    expect(last.plan?.[0]).toMatchObject({
      label: "RootCauseAnalyst",
      done: false,
      active: false,
    });
    expect(last.plan?.[1]?.label).toBe("Summarize");
  });

  it("an empty 'plan' event (general chat) does not attach a plan card", () => {
    const { result } = renderHook(() => useChat());
    act(() => result.current.send("just chatting"));

    act(() => {
      lastOnEvent()("plan", { plan: [] });
    });

    expect(useChatStore.getState().messages.at(-1)!.plan).toBeUndefined();
  });

  it("step-start / step-done update the corresponding plan step", () => {
    const { result } = renderHook(() => useChat());
    act(() => result.current.send("trace"));
    act(() => {
      lastOnEvent()("plan", { plan: [{ label: "A" }, { label: "B" }] });
    });

    act(() => lastOnEvent()("step-start", { idx: 0 }));
    expect(useChatStore.getState().messages.at(-1)!.plan?.[0].active).toBe(true);

    act(() =>
      lastOnEvent()("step-done", {
        idx: 0,
        confidence: 0.9,
        output_summary: "found it",
      }),
    );
    const step = useChatStore.getState().messages.at(-1)!.plan?.[0];
    expect(step).toMatchObject({
      done: true,
      active: false,
      confidence: 0.9,
      outputSummary: "found it",
    });
  });

  it("a 'final' event writes summary/findings and clears streaming", () => {
    const { result } = renderHook(() => useChat());
    act(() => result.current.send("why?"));

    act(() => {
      lastOnEvent()("final", {
        response: "The lidar dropped out at t=12.3s.",
        findings: [{ sev: "critical", text: "lidar dropout", detail: "topic /scan" }],
        usage: { tokens_in: 100, tokens_out: 50, est_cost_usd: 0.01 },
      });
    });

    const last = useChatStore.getState().messages.at(-1)!;
    expect(last.summary).toBe("The lidar dropped out at t=12.3s.");
    expect(last.findings).toHaveLength(1);
    expect(last.findings?.[0]).toMatchObject({
      sev: "critical",
      text: "lidar dropout",
    });
    expect(last.usage).toMatchObject({ tokens_in: 100, tokens_out: 50 });
    expect(useChatStore.getState().streaming).toBe(false);
  });

  it("'final' attaches quick actions only when a real session is active", () => {
    // No session -> actions is an empty array (current behavior: the field is
    // always written, the no-session branch just produces []).
    const { result, rerender } = renderHook(() => useChat());
    act(() => result.current.send("q1"));
    act(() => lastOnEvent()("final", { response: "ans" }));
    expect(useChatStore.getState().messages.at(-1)!.actions).toEqual([]);

    // With a session -> three navigation actions.
    act(() => {
      resetChatStore();
      useSessionStore.setState({ sessionId: "sess-1" });
    });
    rerender();
    act(() => result.current.send("q2"));
    act(() => lastOnEvent()("final", { response: "ans2" }));
    const actions = useChatStore.getState().messages.at(-1)!.actions;
    expect(actions).toHaveLength(3);
    expect(actions?.map((a) => a.target)).toEqual([
      "timeline",
      "kgraph",
      "metrics",
    ]);
  });

  it("an 'error' event appends a system message and stops streaming", () => {
    const { result } = renderHook(() => useChat());
    act(() => result.current.send("boom"));

    act(() => lastOnEvent()("error", { message: "backend exploded" }));

    const msgs = useChatStore.getState().messages;
    expect(msgs.at(-1)).toMatchObject({
      role: "system",
      text: "backend exploded",
    });
    expect(useChatStore.getState().streaming).toBe(false);
  });

  it("a 'kgraph' event refetches the graph when a session is active", () => {
    useSessionStore.setState({ sessionId: "sess-9" });
    const { result } = renderHook(() => useChat());
    act(() => result.current.send("update kg"));

    act(() => lastOnEvent()("kgraph", {}));

    expect(getKGraph).toHaveBeenCalledWith("sess-9");
  });

  it("a second send() aborts the previous in-flight stream", () => {
    const { result } = renderHook(() => useChat());
    act(() => result.current.send("first"));
    act(() => result.current.send("second"));
    // The first controller's abort() is invoked before the second stream starts.
    expect(abort).toHaveBeenCalled();
    expect(streamChat).toHaveBeenCalledTimes(2);
  });

  it("stop() aborts, clears streaming, and annotates the last message", () => {
    const { result } = renderHook(() => useChat());
    act(() => result.current.send("long question"));

    act(() => result.current.stop());

    expect(abort).toHaveBeenCalled();
    expect(useChatStore.getState().streaming).toBe(false);
    // Placeholder had no summary -> replaced with the stopped marker.
    expect(useChatStore.getState().messages.at(-1)!.summary).toBe(
      "*Generation stopped by user.*",
    );
  });

  it("stop() appends the marker when a partial summary already exists", () => {
    const { result } = renderHook(() => useChat());
    act(() => result.current.send("q"));
    act(() => lastOnEvent()("final", { response: "partial answer" }));

    act(() => result.current.stop());

    expect(useChatStore.getState().messages.at(-1)!.summary).toBe(
      "partial answer\n\n*Generation stopped by user.*",
    );
  });

  // NOTE: issue #36 — stop() mutates whatever message is currently LAST in the
  // store, not necessarily the assistant message that the aborted stream was
  // writing to. If a later message (e.g. a system error) has been appended, the
  // "stopped by user" marker lands on the wrong message. Characterized here so a
  // future fix changes this assertion deliberately.
  it("issue #36: stop() annotates the current LAST message, even a system error", () => {
    const { result } = renderHook(() => useChat());
    act(() => result.current.send("q"));
    act(() => lastOnEvent()("error", { message: "stream died" }));

    act(() => result.current.stop());

    const last = useChatStore.getState().messages.at(-1)!;
    // The system error message is the one that gets the (mis-targeted) marker.
    expect(last.role).toBe("system");
    expect(last.summary).toBe("*Generation stopped by user.*");
  });

  // NOTE: issue #35 — useChat's send() closes over `sessionId` captured at hook
  // render time. The streamChat target session id is read at send() time, but the
  // `actions` branch in the 'final' handler reads the same captured `sessionId`.
  // If the active session changes after the hook rendered (without a re-render),
  // the stream can be routed against the stale id. We characterize the current
  // closure behavior: a freshly rendered hook uses the session present at render.
  it("issue #35: send() uses the sessionId captured at the latest render", () => {
    act(() => {
      useSessionStore.setState({ sessionId: "sess-old" });
    });
    const { result, rerender } = renderHook(() => useChat());

    // Change the store, then re-render so the hook re-captures the new id.
    act(() => {
      useSessionStore.setState({ sessionId: "sess-new" });
    });
    rerender();

    act(() => result.current.send("which session?"));
    expect(streamChat.mock.calls.at(-1)![0]).toBe("sess-new");
  });
});
