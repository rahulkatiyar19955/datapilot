import { describe, it, expect, beforeEach } from "vitest";
import { useChatStore } from "./chat";
import type { ChatMessage, PlanStep } from "@shared/types";

const initial = useChatStore.getState();

function msg(id: string, over: Partial<ChatMessage> = {}): ChatMessage {
  return { id, role: "assistant", text: `msg-${id}`, ...over };
}

describe("useChatStore", () => {
  beforeEach(() => {
    useChatStore.setState(initial, true);
  });

  it("starts empty and not streaming", () => {
    const s = useChatStore.getState();
    expect(s.messages).toEqual([]);
    expect(s.streaming).toBe(false);
  });

  describe("addMessage", () => {
    it("appends messages in order", () => {
      useChatStore.getState().addMessage(msg("1"));
      useChatStore.getState().addMessage(msg("2"));
      const { messages } = useChatStore.getState();
      expect(messages.map((m) => m.id)).toEqual(["1", "2"]);
    });

    it("does not mutate the previous array reference", () => {
      useChatStore.getState().addMessage(msg("1"));
      const first = useChatStore.getState().messages;
      useChatStore.getState().addMessage(msg("2"));
      const second = useChatStore.getState().messages;
      expect(first).not.toBe(second);
      expect(first).toHaveLength(1);
    });
  });

  describe("updateLastMessage", () => {
    it("applies the updater to the final message only", () => {
      useChatStore.getState().addMessage(msg("1"));
      useChatStore.getState().addMessage(msg("2"));
      useChatStore
        .getState()
        .updateLastMessage((m) => ({ ...m, text: "edited" }));
      const { messages } = useChatStore.getState();
      expect(messages[0].text).toBe("msg-1");
      expect(messages[1].text).toBe("edited");
    });

    it("is a no-op when there are no messages", () => {
      useChatStore.getState().updateLastMessage((m) => ({ ...m, text: "x" }));
      expect(useChatStore.getState().messages).toEqual([]);
    });

    // NOTE: issue #36 — updateLastMessage edits messages[last] blindly with no
    // role check. If the last message is the USER's (e.g. the assistant
    // placeholder has not been appended yet), the streamed assistant content
    // overwrites the user's message. This test characterizes that CURRENT,
    // buggy behavior: a "user" message gets its text clobbered.
    it("blindly overwrites the last message even if it is the user's (issue #36)", () => {
      useChatStore.getState().addMessage(msg("u1", { role: "user", text: "hi" }));
      useChatStore
        .getState()
        .updateLastMessage((m) => ({ ...m, text: "assistant token" }));
      const last = useChatStore.getState().messages.at(-1)!;
      // Role is left as "user" but the text was replaced — the bug.
      expect(last.role).toBe("user");
      expect(last.text).toBe("assistant token");
    });
  });

  describe("updatePlanStep", () => {
    const planMsg = (): ChatMessage => {
      const plan: PlanStep[] = [
        { label: "a", done: false, active: true },
        { label: "b", done: false, active: false },
      ];
      return msg("p", { plan });
    };

    it("patches a single plan step on the last message", () => {
      useChatStore.getState().addMessage(planMsg());
      useChatStore.getState().updatePlanStep(0, { done: true, active: false });
      const last = useChatStore.getState().messages.at(-1)!;
      expect(last.plan![0]).toMatchObject({ label: "a", done: true, active: false });
      expect(last.plan![1]).toMatchObject({ label: "b", done: false });
    });

    it("is a no-op when there are no messages", () => {
      useChatStore.getState().updatePlanStep(0, { done: true });
      expect(useChatStore.getState().messages).toEqual([]);
    });

    it("is a no-op when the last message has no plan", () => {
      useChatStore.getState().addMessage(msg("1"));
      useChatStore.getState().updatePlanStep(0, { done: true });
      expect(useChatStore.getState().messages.at(-1)!.plan).toBeUndefined();
    });

    it("ignores an out-of-range index (leaves steps unchanged)", () => {
      useChatStore.getState().addMessage(planMsg());
      useChatStore.getState().updatePlanStep(99, { done: true });
      const last = useChatStore.getState().messages.at(-1)!;
      expect(last.plan!.every((s) => s.done === false)).toBe(true);
    });
  });

  describe("setStreaming / clearMessages / setMessages", () => {
    it("setStreaming toggles the streaming flag", () => {
      useChatStore.getState().setStreaming(true);
      expect(useChatStore.getState().streaming).toBe(true);
      useChatStore.getState().setStreaming(false);
      expect(useChatStore.getState().streaming).toBe(false);
    });

    it("clearMessages empties the message list", () => {
      useChatStore.getState().addMessage(msg("1"));
      useChatStore.getState().clearMessages();
      expect(useChatStore.getState().messages).toEqual([]);
    });

    it("setMessages replaces the entire list", () => {
      useChatStore.getState().addMessage(msg("old"));
      const replacement = [msg("a"), msg("b")];
      useChatStore.getState().setMessages(replacement);
      expect(useChatStore.getState().messages.map((m) => m.id)).toEqual([
        "a",
        "b",
      ]);
    });
  });
});
