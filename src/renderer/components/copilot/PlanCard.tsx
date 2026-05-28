import type { JSX } from "react";
import { Icon } from "@renderer/components/Icon";
import type { PlanStep } from "@shared/types";

interface PlanCardProps {
  steps: PlanStep[];
  isComposing?: boolean;
}

export function PlanCard({ steps, isComposing }: PlanCardProps): JSX.Element {
  return (
    <div className="card" style={{ marginBottom: 8, overflow: "hidden" }}>
      <div
        style={{
          padding: "8px 10px",
          borderBottom: "1px solid var(--color-border-1)",
          fontSize: 11,
          fontWeight: 600,
          color: "var(--color-text-2)",
          letterSpacing: "0.03em",
          textTransform: "uppercase",
        }}
      >
        Analysis Plan
      </div>
      <div className="col" style={{ padding: "6px 0" }}>
        {steps.map((step, i) => (
          <div key={i} style={{ padding: "3px 12px" }}>
            {/* Step row */}
            <div className="row gap-2" style={{ fontSize: 12, padding: "2px 0" }}>
              <span
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 4,
                  display: "grid",
                  placeItems: "center",
                  background: step.done
                    ? "var(--color-ok-bg)"
                    : "var(--color-bg-3)",
                  color: step.done ? "var(--color-ok)" : "var(--color-text-3)",
                  flexShrink: 0,
                }}
              >
                {step.done ? (
                  <Icon.Check size={11} strokeWidth={2.5} />
                ) : (
                  <span className="mono" style={{ fontSize: 10 }}>
                    {i + 1}
                  </span>
                )}
              </span>
              <span
                style={{
                  color: step.done
                    ? "var(--color-text-1)"
                    : "var(--color-text-2)",
                  flex: 1,
                }}
              >
                {step.label}
              </span>
              {step.done && step.confidence !== undefined && (
                <span
                  className="pill sm ghost mono"
                  style={{ fontSize: 10, flexShrink: 0 }}
                >
                  {Math.round(step.confidence * 100)}%
                </span>
              )}
              {step.active && (
                <span
                  className="dim mono pulse"
                  style={{ marginLeft: "auto", fontSize: 10, flexShrink: 0 }}
                >
                  running…
                </span>
              )}
            </div>

            {/* Collapsible output summary */}
            {step.done && step.outputSummary && (
              <details style={{ marginLeft: 22, marginTop: 2 }}>
                <summary
                  style={{
                    fontSize: 10.5,
                    color: "var(--color-text-3)",
                    cursor: "pointer",
                    userSelect: "none",
                    listStyle: "none",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <Icon.ChevronRight size={10} style={{ flexShrink: 0 }} />
                  Details
                </summary>
                <div
                  className="mono"
                  style={{
                    fontSize: 10.5,
                    color: "var(--color-text-2)",
                    marginTop: 4,
                    padding: "4px 8px",
                    background: "var(--color-bg-1)",
                    borderRadius: 4,
                    lineHeight: 1.5,
                    wordBreak: "break-word",
                  }}
                >
                  {step.outputSummary}
                </div>
              </details>
            )}
          </div>
        ))}

        {/* Composing indicator shown when all steps are done but response not yet ready */}
        {isComposing && (
          <div
            className="row gap-2 dim"
            style={{ padding: "6px 12px", fontSize: 11 }}
          >
            <span className="mono pulse" style={{ fontSize: 10 }}>
              ···
            </span>
            <span>Composing response…</span>
          </div>
        )}
      </div>
    </div>
  );
}
