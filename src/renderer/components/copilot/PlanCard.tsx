import type { JSX } from 'react'
import { Icon } from '@renderer/components/Icon'
import type { PlanStep } from '@shared/types'

interface PlanCardProps {
  steps: PlanStep[]
}

export function PlanCard({ steps }: PlanCardProps): JSX.Element {
  return (
    <div className="card" style={{ marginBottom: 8, overflow: 'hidden' }}>
      <div style={{
        padding: '8px 10px',
        borderBottom: '1px solid var(--color-border-1)',
        fontSize: 11,
        fontWeight: 600,
        color: 'var(--color-text-2)',
        letterSpacing: '0.03em',
        textTransform: 'uppercase',
      }}>
        Analysis Plan
      </div>
      <div className="col" style={{ padding: '6px 0' }}>
        {steps.map((step, i) => (
          <div key={i} className="row gap-2" style={{ padding: '5px 12px', fontSize: 12 }}>
            <span style={{
              width: 16,
              height: 16,
              borderRadius: 4,
              display: 'grid',
              placeItems: 'center',
              background: step.done
                ? 'oklch(0.30 0.08 150 / 0.4)'
                : 'var(--color-bg-3)',
              color: step.done ? 'var(--color-ok)' : 'var(--color-text-3)',
              flexShrink: 0,
            }}>
              {step.done ? (
                <Icon.Check size={11} strokeWidth={2.5} />
              ) : (
                <span className="mono" style={{ fontSize: 10 }}>{i + 1}</span>
              )}
            </span>
            <span style={{ color: step.done ? 'var(--color-text-1)' : 'var(--color-text-2)' }}>
              {step.label}
            </span>
            {step.active && (
              <span className="dim mono pulse" style={{ marginLeft: 'auto', fontSize: 10 }}>
                running…
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
