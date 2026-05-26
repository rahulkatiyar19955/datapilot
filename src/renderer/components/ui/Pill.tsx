import type { ButtonHTMLAttributes, HTMLAttributes, JSX, ReactNode } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@renderer/lib/utils'

const pillVariants = cva('pill', {
  variants: {
    size: {
      md: '',
      sm: 'sm',
    },
    tone: {
      default: '',
      ghost: 'ghost',
      ok: 'ok',
      warn: 'warn',
      danger: 'danger',
      accent: 'accent',
    },
  },
  defaultVariants: {
    size: 'md',
    tone: 'default',
  },
})

type PillVariantProps = VariantProps<typeof pillVariants>

interface BasePillProps extends PillVariantProps {
  /** Render a leading colored swatch dot. */
  swatch?: boolean
  /** Render the pill in monospace (e.g. for paths, versions). */
  mono?: boolean
  children?: ReactNode
  className?: string
}

type StaticPillProps = BasePillProps & Omit<HTMLAttributes<HTMLSpanElement>, 'children' | 'className'>
type ClickablePillProps = BasePillProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'className'> & { onClick: ButtonHTMLAttributes<HTMLButtonElement>['onClick'] }

export type PillProps = StaticPillProps | ClickablePillProps

/**
 * Compact pill / badge. Static `<span>` by default; renders as a `<button>`
 * when an `onClick` is supplied so keyboard / a11y are correct.
 */
export function Pill(props: PillProps): JSX.Element {
  const { size, tone, swatch, mono, children, className, ...rest } = props as BasePillProps & {
    onClick?: ButtonHTMLAttributes<HTMLButtonElement>['onClick']
  }
  const cls = cn(pillVariants({ size, tone }), mono && 'mono', className)

  const inner = (
    <>
      {swatch && <span className="swatch" />}
      {children}
    </>
  )

  if ('onClick' in rest && rest.onClick) {
    const buttonRest = rest as ButtonHTMLAttributes<HTMLButtonElement>
    return (
      <button type="button" className={cls} {...buttonRest}>
        {inner}
      </button>
    )
  }
  const spanRest = rest as HTMLAttributes<HTMLSpanElement>
  return (
    <span className={cls} {...spanRest}>
      {inner}
    </span>
  )
}
