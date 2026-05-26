import type { JSX } from 'react'

export type RobotStatus = 'ok' | 'warning' | 'critical' | 'offline'

interface StatusDotProps {
  status: RobotStatus
  /** Render with a `pulse` animation (for active critical states). */
  pulse?: boolean
}

const STATUS_MAP = {
  ok: { color: 'var(--color-ok)', glow: 'oklch(0.78 0.17 150 / 0.6)' },
  warning: { color: 'var(--color-warn)', glow: 'oklch(0.80 0.15 80 / 0.6)' },
  critical: { color: 'var(--color-danger)', glow: 'oklch(0.70 0.20 25 / 0.6)' },
  offline: { color: 'var(--color-text-3)', glow: 'transparent' },
} as const

/**
 * 8×8 glowing status dot used on Fleet cards and the title-bar local-stack
 * indicator. Matches mock_design/fleet.jsx `StatusDot`.
 */
export function StatusDot({ status, pulse }: StatusDotProps): JSX.Element {
  const { color, glow } = STATUS_MAP[status]
  return (
    <span
      aria-hidden
      className={pulse ? 'pulse' : undefined}
      style={{
        width: 8,
        height: 8,
        borderRadius: 50,
        background: color,
        boxShadow: status === 'offline' ? 'none' : `0 0 10px ${glow}`,
        flexShrink: 0,
        display: 'inline-block',
      }}
    />
  )
}
