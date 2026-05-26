import type { JSX, ReactNode } from 'react'
import { cn } from '@renderer/lib/utils'

interface WindowChromeProps {
  children: ReactNode
  className?: string
}

/**
 * Outer frameless-window shell. Maps to `.window` in globals.css.
 * Composes a Titlebar + body region. Used at the top of every full-window screen.
 */
export function WindowChrome({ children, className }: WindowChromeProps): JSX.Element {
  return <div className={cn('window', className)}>{children}</div>
}
