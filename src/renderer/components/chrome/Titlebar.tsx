import type { JSX, ReactNode } from 'react'
import { cn } from '@renderer/lib/utils'

interface TitlebarProps {
  /** Slot for traffic lights or spacer on the leading edge. */
  left?: ReactNode
  /** Slot for the centered title text. */
  center?: ReactNode
  /** Slot for trailing actions (theme toggle, version pill, status pill). */
  right?: ReactNode
  className?: string
}

/**
 * Frameless-window title bar. Drag region is enabled via `.titlebar`
 * (-webkit-app-region: drag); interactive children opt out by sitting inside
 * `.traffic` or `.titlebar-actions`, both of which set `no-drag`.
 */
export function Titlebar({ left, center, right, className }: TitlebarProps): JSX.Element {
  return (
    <div className={cn('titlebar', className)}>
      {left ?? null}
      <div className="title">{center}</div>
      {right ? <div className="titlebar-actions">{right}</div> : null}
    </div>
  )
}
