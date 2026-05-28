import type { JSX, ReactNode } from "react";
import { cn } from "@renderer/lib/utils";

interface RailProps {
  children: ReactNode;
  /** Optional D-logo at the top of the rail (matches mock_design/app.jsx). */
  logo?: ReactNode;
  className?: string;
}

/**
 * Vertical 56px navigation rail. Compose with `<RailButton>` children.
 *
 * Mock convention:
 *   - Top: brand logo
 *   - Top half: primary destinations (Copilot, Fleet, Search, Replay)
 *   - Spacer (use `<div className="rail-spacer" />`)
 *   - Bottom half: secondary destinations (Agents & MCP, Settings)
 */
export function Rail({ children, logo, className }: RailProps): JSX.Element {
  return (
    <nav className={cn("rail", className)} aria-label="Primary navigation">
      {logo ?? <div className="rail-logo">D</div>}
      {children}
    </nav>
  );
}
