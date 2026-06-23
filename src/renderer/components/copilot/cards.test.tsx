import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FindingsCard } from "./FindingsCard";
import { PlanCard } from "./PlanCard";
import { ChatMessage } from "./ChatMessage";
import { useChatStore } from "@renderer/stores/chat";
import { useUIStore } from "@renderer/stores/ui";
import type {
  ChatMessage as ChatMessageType,
  Finding,
  PlanStep,
} from "@shared/types";

// Reset the zustand stores between tests so ChatMessage's `isThinking`
// derivation (streaming + last-message id) is deterministic.
beforeEach(() => {
  useChatStore.setState({ messages: [], streaming: false });
  useUIStore.setState({ tab: "timeline" });
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("FindingsCard", () => {
  const findings: Finding[] = [
    { sev: "critical", text: "Planner aborted at t=12.4s", detail: "node /move_base" },
    { sev: "warning", text: "Battery dipped to 18%" },
    { sev: "info", text: "Localization recovered" },
  ];

  it("renders the section title", () => {
    render(<FindingsCard findings={findings} />);
    expect(screen.getByText("Key findings")).toBeInTheDocument();
  });

  it("renders one row per finding with its text", () => {
    render(<FindingsCard findings={findings} />);
    expect(screen.getByText("Planner aborted at t=12.4s")).toBeInTheDocument();
    expect(screen.getByText("Battery dipped to 18%")).toBeInTheDocument();
    expect(screen.getByText("Localization recovered")).toBeInTheDocument();
  });

  it("renders the optional detail line when present", () => {
    render(<FindingsCard findings={findings} />);
    expect(screen.getByText("node /move_base")).toBeInTheDocument();
  });

  it("renders a severity pill per finding mapped to the right tone", () => {
    render(<FindingsCard findings={findings} />);
    // SeverityDot maps critical->danger, warning->warn, info->accent
    expect(screen.getByText("critical")).toHaveClass("pill", "danger");
    expect(screen.getByText("warning")).toHaveClass("pill", "warn");
    expect(screen.getByText("info")).toHaveClass("pill", "accent");
  });

  it("renders empty (just the header) when given no findings", () => {
    render(<FindingsCard findings={[]} />);
    expect(screen.getByText("Key findings")).toBeInTheDocument();
    expect(screen.queryByText("critical")).toBeNull();
  });
});

describe("PlanCard", () => {
  const steps: PlanStep[] = [
    {
      label: "Index diagnostics",
      done: true,
      active: false,
      confidence: 0.92,
      outputSummary: "1,204 messages indexed",
    },
    { label: "Trace causal edges", done: false, active: true },
    { label: "Compose answer", done: false, active: false },
  ];

  it("renders the plan title and every step label", () => {
    render(<PlanCard steps={steps} />);
    expect(screen.getByText("Analysis Plan")).toBeInTheDocument();
    expect(screen.getByText("Index diagnostics")).toBeInTheDocument();
    expect(screen.getByText("Trace causal edges")).toBeInTheDocument();
    expect(screen.getByText("Compose answer")).toBeInTheDocument();
  });

  it("shows a rounded confidence badge for completed steps", () => {
    render(<PlanCard steps={steps} />);
    expect(screen.getByText("92%")).toBeInTheDocument();
  });

  it("shows a running indicator for the active step", () => {
    render(<PlanCard steps={steps} />);
    expect(screen.getByText("running…")).toBeInTheDocument();
  });

  it("renders a collapsible details summary for completed steps with output", () => {
    render(<PlanCard steps={steps} />);
    expect(screen.getByText("Details")).toBeInTheDocument();
    expect(screen.getByText("1,204 messages indexed")).toBeInTheDocument();
  });

  it("shows the composing indicator only when isComposing is set", () => {
    const { rerender } = render(<PlanCard steps={steps} />);
    expect(screen.queryByText("Composing response…")).toBeNull();
    rerender(<PlanCard steps={steps} isComposing />);
    expect(screen.getByText("Composing response…")).toBeInTheDocument();
  });
});

describe("ChatMessage", () => {
  it("renders a user message bubble with its text", () => {
    const msg: ChatMessageType = {
      id: "u1",
      role: "user",
      text: "Why did the robot stop?",
    };
    render(<ChatMessage msg={msg} />);
    expect(screen.getByText("Why did the robot stop?")).toBeInTheDocument();
  });

  it("renders a system message with its text", () => {
    const msg: ChatMessageType = {
      id: "s1",
      role: "system",
      text: "Session restored",
    };
    render(<ChatMessage msg={msg} />);
    expect(screen.getByText("Session restored")).toBeInTheDocument();
  });

  it("renders an assistant message with the DataPilot label and timestamp", () => {
    const msg: ChatMessageType = {
      id: "a1",
      role: "assistant",
      summary: "The planner aborted.",
      time: "10:42",
    };
    render(<ChatMessage msg={msg} />);
    expect(screen.getByText("DataPilot")).toBeInTheDocument();
    expect(screen.getByText(/10:42/)).toBeInTheDocument();
  });

  it("renders the assistant summary markdown", () => {
    const msg: ChatMessageType = {
      id: "a2",
      role: "assistant",
      summary: "The **planner** aborted",
    };
    render(<ChatMessage msg={msg} />);
    // remark renders **planner** as a <strong>
    const strong = screen.getByText("planner");
    expect(strong.tagName).toBe("STRONG");
  });

  it("renders nested PlanCard, FindingsCard and CausalChain when present", () => {
    const msg: ChatMessageType = {
      id: "a3",
      role: "assistant",
      plan: [{ label: "Index", done: true, active: false }],
      findings: [{ sev: "critical", text: "Hard stop" }],
      causal: [{ text: "Sensor dropout" }, { text: "Recovery failed" }],
    };
    render(<ChatMessage msg={msg} />);
    expect(screen.getByText("Analysis Plan")).toBeInTheDocument();
    expect(screen.getByText("Key findings")).toBeInTheDocument();
    expect(screen.getByText("Root cause chain")).toBeInTheDocument();
    expect(screen.getByText("Sensor dropout")).toBeInTheDocument();
  });

  it("renders token usage when provided", () => {
    const msg: ChatMessageType = {
      id: "a4",
      role: "assistant",
      summary: "done",
      usage: { tokens_in: 1234, tokens_out: 567, est_cost_usd: 0.0123 },
    };
    render(<ChatMessage msg={msg} />);
    expect(screen.getByText("In: 1,234")).toBeInTheDocument();
    expect(screen.getByText("Out: 567")).toBeInTheDocument();
    expect(screen.getByText("Cost: $0.0123")).toBeInTheDocument();
  });

  it("renders action buttons and switches the workspace tab on click", async () => {
    const user = userEvent.setup();
    const msg: ChatMessageType = {
      id: "a5",
      role: "assistant",
      summary: "see the map",
      actions: [{ iconName: "Map", label: "Open Map", target: "map" }],
    };
    render(<ChatMessage msg={msg} />);
    const btn = screen.getByRole("button", { name: /Open Map/ });
    await user.click(btn);
    expect(useUIStore.getState().tab).toBe("map");
  });

  it("shows the thinking dots for the streaming last assistant message before content arrives", () => {
    const msg: ChatMessageType = { id: "stream-1", role: "assistant" };
    // Make this the last message in a streaming session.
    useChatStore.setState({ messages: [msg], streaming: true });
    const { container } = render(<ChatMessage msg={msg} />);
    expect(container.querySelector(".chat-thinking")).not.toBeNull();
  });

  it("does not show thinking dots once a summary is present", () => {
    const msg: ChatMessageType = {
      id: "stream-2",
      role: "assistant",
      summary: "answer ready",
    };
    useChatStore.setState({ messages: [msg], streaming: true });
    const { container } = render(<ChatMessage msg={msg} />);
    expect(container.querySelector(".chat-thinking")).toBeNull();
  });

  it("renders an action label even when the icon name is unknown to the Icon map", () => {
    const msg: ChatMessageType = {
      id: "a6",
      role: "assistant",
      summary: "x",
      actions: [{ iconName: "NotARealIcon", label: "Mystery", target: "logs" }],
    };
    render(<ChatMessage msg={msg} />);
    // ActionIcon returns null for unknown names; the label still renders.
    expect(
      screen.getByRole("button", { name: /Mystery/ }),
    ).toBeInTheDocument();
  });
});

describe("ChatMessage accessibility characterization (issue #49)", () => {
  // NOTE: issue #49 — the assistant action buttons use a raw `.btn sm` class
  // and rely on their visible text for an accessible name (they are NOT
  // icon-only). They carry no explicit aria-label. This test characterizes
  // that the accessible name comes solely from the label text; it does not
  // assert any aria-label is present.
  it("action buttons derive their accessible name from visible label text", () => {
    const msg: ChatMessageType = {
      id: "a7",
      role: "assistant",
      summary: "x",
      actions: [{ iconName: "Map", label: "Open Map", target: "map" }],
    };
    render(<ChatMessage msg={msg} />);
    const btn = screen.getByRole("button", { name: /Open Map/ });
    expect(btn).not.toHaveAttribute("aria-label");
    expect(within(btn).getByText("Open Map")).toBeInTheDocument();
  });
});
