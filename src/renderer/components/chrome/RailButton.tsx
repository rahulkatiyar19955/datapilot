import type { JSX, ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@renderer/lib/utils";

const railButtonVariants = cva("rail-btn", {
  variants: {
    active: {
      true: "active",
      false: "",
    },
  },
  defaultVariants: {
    active: false,
  },
});

interface RailButtonProps
  extends
    Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children">,
    VariantProps<typeof railButtonVariants> {
  icon: ReactNode;
  /** Accessible label; rendered as `title=` (hover tooltip). */
  label: string;
  /** Renders a red badge dot in the top-right corner (e.g. alerts). */
  badge?: boolean;
}

/**
 * Single rail entry. Wraps mock's `.rail-btn` with cva-typed `active`/`badge`.
 *
 * Mock visual indicators:
 *   - Active state draws a 2-px accent bar on the left edge (CSS pseudo).
 *   - Badge dot is a 6×6 red dot with glow in the top-right corner.
 */
export function RailButton({
  icon,
  label,
  active,
  badge,
  className,
  type,
  ...rest
}: RailButtonProps): JSX.Element {
  return (
    <button
      type={type ?? "button"}
      className={cn(railButtonVariants({ active }), className)}
      title={label}
      aria-label={label}
      aria-pressed={active ?? false}
      {...rest}
    >
      {icon}
      {badge && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: 4,
            right: 4,
            width: 6,
            height: 6,
            borderRadius: 50,
            background: "var(--color-danger)",
            boxShadow: "0 0 6px var(--color-danger)",
          }}
        />
      )}
    </button>
  );
}
