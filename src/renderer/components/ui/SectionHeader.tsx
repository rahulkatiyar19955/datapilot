import type { HTMLAttributes, JSX } from "react";
import { cn } from "@renderer/lib/utils";

export type SectionHeaderProps = HTMLAttributes<HTMLSpanElement>;

/**
 * Uppercase tracked label used as a section divider above lists / panels.
 * Matches `.section-h` in globals.css (10.5px, 600, +0.08em tracking, text-3).
 */
export function SectionHeader({
  className,
  ...rest
}: SectionHeaderProps): JSX.Element {
  return <span className={cn("section-h", className)} {...rest} />;
}
