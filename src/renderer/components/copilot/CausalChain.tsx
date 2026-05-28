import type { JSX } from "react";
import type { CausalItem } from "@shared/types";

interface CausalChainProps {
  items: CausalItem[];
}

function treeChar(i: number, total: number): string {
  if (i === 0) return "┌─";
  if (i === total - 1) return "└─";
  return "├─";
}

export function CausalChain({ items }: CausalChainProps): JSX.Element {
  return (
    <div className="card" style={{ marginBottom: 8, padding: "10px 12px" }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "var(--color-text-2)",
          letterSpacing: "0.03em",
          textTransform: "uppercase",
          marginBottom: 8,
        }}
      >
        Root cause chain
      </div>
      <div className="col gap-1">
        {items.map((c, i) => (
          <div key={i} className="row gap-2">
            <span
              className="mono"
              style={{
                fontSize: 10.5,
                color: "var(--color-text-3)",
                width: 24,
                flexShrink: 0,
              }}
            >
              {treeChar(i, items.length)}
            </span>
            <span style={{ fontSize: 11.5, color: "var(--color-text-1)" }}>
              {c.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
