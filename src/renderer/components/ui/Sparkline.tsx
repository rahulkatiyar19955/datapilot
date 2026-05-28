import type { JSX } from "react";

export type Trend = "stable" | "up" | "down" | "spike";

interface SparklineProps {
  trend?: Trend;
  color?: string;
  width?: number;
  height?: number;
  className?: string;
}

const PATHS: Record<Trend, string> = {
  stable: "M 0 12 L 12 10 L 24 13 L 36 11 L 48 12",
  up: "M 0 18 L 12 14 L 24 16 L 36 8 L 48 4",
  down: "M 0 6 L 12 7 L 24 5 L 36 12 L 48 18",
  spike: "M 0 14 L 8 14 L 14 4 L 20 14 L 32 14 L 38 4 L 48 14",
};

/**
 * Tiny 48×20 SVG trend line used in Fleet robot cards.
 * Same path shapes as mock_design/fleet.jsx `Sparkline`.
 */
export function Sparkline({
  trend = "stable",
  color = "var(--color-accent)",
  width = 48,
  height = 20,
  className,
}: SparklineProps): JSX.Element {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 48 22"
      style={{ display: "block" }}
      className={className}
      aria-hidden
    >
      <path
        d={PATHS[trend]}
        stroke={color}
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}
