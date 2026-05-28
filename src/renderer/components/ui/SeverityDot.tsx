import type { JSX } from "react";
import { Pill } from "./Pill";

export type Severity = "critical" | "warning" | "info" | "success" | "ghost";

interface SeverityDotProps {
  sev: Severity;
  /** Override displayed label. Defaults to the severity name. */
  label?: string;
}

const TONE_MAP = {
  critical: "danger",
  warning: "warn",
  info: "accent",
  success: "ok",
  ghost: "ghost",
} as const;

/**
 * Severity pill with a colored swatch dot. Used inside chat findings,
 * timeline events, anomaly tags. Maps Severity → Pill tone variants.
 *
 * Matches `SeverityDot` in mock_design/copilot.jsx.
 */
export function SeverityDot({ sev, label }: SeverityDotProps): JSX.Element {
  return (
    <Pill size="sm" tone={TONE_MAP[sev]} swatch>
      {label ?? sev}
    </Pill>
  );
}
