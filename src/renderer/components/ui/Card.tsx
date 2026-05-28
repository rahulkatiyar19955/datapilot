import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@renderer/lib/utils";

export type CardProps = HTMLAttributes<HTMLDivElement>;

/**
 * Standard card surface (`.card` — bg-2, rounded 8px, 1px border).
 * Use for content blocks inside panels (e.g. message cards, robot tiles).
 */
export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, ...rest },
  ref,
) {
  return <div ref={ref} className={cn("card", className)} {...rest} />;
});
