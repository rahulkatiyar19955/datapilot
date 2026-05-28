import type { JSX } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Icon } from "@renderer/components/Icon";
import { PlanCard } from "./PlanCard";
import { FindingsCard } from "./FindingsCard";
import { CausalChain } from "./CausalChain";
import { useChatStore } from "@renderer/stores/chat";
import { useUIStore } from "@renderer/stores/ui";
import type { ChatMessage as ChatMessageType } from "@shared/types";
import type { WorkspaceTab } from "@shared/types";

interface ChatMessageProps {
  msg: ChatMessageType;
}

function ActionIcon({ name }: { name: string }): JSX.Element | null {
  const Comp = Icon[name as keyof typeof Icon] as
    | ((props: { size?: number }) => JSX.Element)
    | undefined;
  if (!Comp) return null;
  return <Comp size={12} />;
}

export function ChatMessage({ msg }: ChatMessageProps): JSX.Element {
  const setTab = useUIStore((s) => s.setTab);

  // True only for the last assistant message while the model is streaming —
  // used to show the thinking-dots placeholder until content arrives.
  const isThinking = useChatStore(
    (s) => s.streaming && s.messages[s.messages.length - 1]?.id === msg.id,
  );

  if (msg.role === "user") {
    return (
      <div
        className="row"
        style={{ justifyContent: "flex-end", padding: "6px 14px" }}
      >
        <div
          style={{
            maxWidth: "85%",
            background: "var(--color-chat-user-bg)",
            border: "1px solid var(--color-chat-user-border)",
            color: "var(--color-chat-user-text)",
            borderRadius: "12px 12px 2px 12px",
            padding: "8px 12px",
            fontSize: 12.5,
            lineHeight: 1.45,
            whiteSpace: "pre-wrap",
          }}
        >
          {msg.text}
        </div>
      </div>
    );
  }

  if (msg.role === "system") {
    return (
      <div style={{ padding: "4px 14px" }}>
        <div
          className="row gap-2 dim"
          style={{ fontSize: 11.5, padding: "4px 0" }}
        >
          <Icon.Sparkles size={12} />
          <span>{msg.text}</span>
        </div>
      </div>
    );
  }

  // assistant
  return (
    <div style={{ padding: "6px 14px" }}>
      <div className="row gap-2" style={{ marginBottom: 6 }}>
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            background:
              "linear-gradient(135deg, var(--color-accent), oklch(0.55 0.18 280))",
            display: "grid",
            placeItems: "center",
            color: "var(--color-bg-0)",
            flexShrink: 0,
          }}
        >
          <Icon.Sparkles size={12} strokeWidth={2} />
        </div>
        <span
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            color: "var(--color-text-1)",
          }}
        >
          DataPilot
        </span>
        {msg.time && (
          <span className="dim" style={{ fontSize: 11 }}>
            · {msg.time}
          </span>
        )}
      </div>

      {/* Animated dots — pre-plan: shown until the first plan step arrives */}
      {isThinking && !msg.plan?.length && !msg.summary && (
        <div className="chat-thinking">
          <span />
          <span />
          <span />
        </div>
      )}

      {msg.plan && msg.plan.length > 0 && (
        <PlanCard
          steps={msg.plan}
          isComposing={isThinking && msg.plan.every((s) => s.done)}
        />
      )}

      {/* Animated dots — mid/post-plan: shown while steps execute and until summary arrives */}
      {isThinking && !!msg.plan?.length && !msg.summary && (
        <div className="chat-thinking" style={{ marginTop: 2 }}>
          <span />
          <span />
          <span />
        </div>
      )}

      {msg.summary && (
        <div className="chat-md" style={{ marginBottom: 8 }}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {msg.summary}
          </ReactMarkdown>
        </div>
      )}

      {msg.findings && <FindingsCard findings={msg.findings} />}
      {msg.causal && <CausalChain items={msg.causal} />}

      {msg.role === "assistant" && msg.usage && (
        <div
          className="row gap-2 dim"
          style={{
            fontSize: 10,
            marginTop: 6,
            fontFamily: "var(--font-mono, monospace)",
            opacity: 0.85,
          }}
        >
          <Icon.Activity size={10} />
          <span>In: {msg.usage.tokens_in.toLocaleString()}</span>
          <span>·</span>
          <span>Out: {msg.usage.tokens_out.toLocaleString()}</span>
          {msg.usage.est_cost_usd !== undefined &&
            msg.usage.est_cost_usd > 0 && (
              <>
                <span>·</span>
                <span>Cost: ${msg.usage.est_cost_usd.toFixed(4)}</span>
              </>
            )}
        </div>
      )}

      {msg.actions && msg.actions.length > 0 && (
        <div className="row gap-2" style={{ flexWrap: "wrap", marginTop: 6 }}>
          {msg.actions.map((a, i) => (
            <button
              key={i}
              className="btn sm"
              onClick={() => setTab(a.target as WorkspaceTab)}
            >
              <ActionIcon name={a.iconName} />
              {a.label}
              <Icon.ArrowRight size={11} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
