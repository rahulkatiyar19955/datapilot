import { forwardRef, type HTMLAttributes } from 'react'
import { cn } from '@renderer/lib/utils'

export type PanelProps = HTMLAttributes<HTMLDivElement>

/**
 * Outer panel surface (`.panel` — bg-1, larger container than card).
 * Use for major UI regions (sidebars, overlays).
 */
export const Panel = forwardRef<HTMLDivElement, PanelProps>(function Panel(
  { className, ...rest },
  ref,
) {
  return <div ref={ref} className={cn('panel', className)} {...rest} />
})
