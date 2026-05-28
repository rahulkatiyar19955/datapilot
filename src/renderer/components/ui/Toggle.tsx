import type { JSX } from "react";
import { cn } from "@renderer/lib/utils";

interface ToggleProps {
  on: boolean;
  onChange: (next: boolean) => void;
  /** Accessible label (passed to aria-label since the toggle has no visible text). */
  label?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * 32×18 switch matching mock_design/agents.jsx and settings.jsx.
 * Controlled component — caller owns the on/off state.
 *
 * Inline styles instead of a dedicated CSS class because the toggle's
 * geometry is highly specific (knob translation) and only ever appears as
 * a single primitive.
 */
export function Toggle({
  on,
  onChange,
  label,
  disabled,
  className,
}: ToggleProps): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={cn(className)}
      style={{
        width: 32,
        height: 18,
        borderRadius: 10,
        background: on ? "var(--color-accent)" : "var(--color-bg-4)",
        border: `1px solid ${on ? "var(--color-accent)" : "var(--color-border-2)"}`,
        position: "relative",
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "background 0.15s, border-color 0.15s",
        padding: 0,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span
        aria-hidden
        style={{
          position: "absolute",
          top: 1,
          left: on ? 15 : 1,
          width: 14,
          height: 14,
          borderRadius: 50,
          background: "var(--color-bg-0)",
          boxShadow: "0 1px 2px oklch(0 0 0 / 0.4)",
          transition: "left 0.15s",
        }}
      />
    </button>
  );
}
