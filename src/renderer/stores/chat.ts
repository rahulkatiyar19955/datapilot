import { create } from "zustand";
import type { ChatMessage, PlanStep } from "@shared/types";

interface ChatState {
  messages: ChatMessage[];
  streaming: boolean;

  addMessage: (msg: ChatMessage) => void;
  updateLastMessage: (updater: (m: ChatMessage) => ChatMessage) => void;
  updatePlanStep: (idx: number, patch: Partial<PlanStep>) => void;
  setStreaming: (streaming: boolean) => void;
  clearMessages: () => void;
  setMessages: (msgs: ChatMessage[]) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  streaming: false,

  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),

  updateLastMessage: (updater) =>
    set((s) => {
      if (s.messages.length === 0) return s;
      const msgs = [...s.messages];
      msgs[msgs.length - 1] = updater(msgs[msgs.length - 1]);
      return { messages: msgs };
    }),

  updatePlanStep: (idx, patch) => {
    const { messages } = get();
    if (messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (!last.plan) return;
    const plan = last.plan.map((step, i) =>
      i === idx ? { ...step, ...patch } : step,
    );
    set((s) => {
      const msgs = [...s.messages];
      msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], plan };
      return { messages: msgs };
    });
  },

  setStreaming: (streaming) => set({ streaming }),

  clearMessages: () => set({ messages: [] }),

  setMessages: (msgs) => set({ messages: msgs }),
}));
