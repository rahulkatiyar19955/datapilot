import type { ButtonHTMLAttributes, HTMLAttributes, JSX, ReactNode } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@renderer/lib/utils'

interface TabsProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
}

/**
 * Horizontal tabs strip. Compose with `<Tab>` children + optional flex spacer
 * + trailing controls (e.g. a "+ new tab" button) per mock_design/workspace.jsx.
 */
export function Tabs({ children, className, ...rest }: TabsProps): JSX.Element {
  return (
    <div role="tablist" className={cn('tabs', className)} {...rest}>
      {children}
    </div>
  )
}

const tabVariants = cva('tab', {
  variants: {
    active: {
      true: 'active',
      false: '',
    },
  },
  defaultVariants: {
    active: false,
  },
})

interface TabProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof tabVariants> {
  icon?: ReactNode
  /** Optional numeric count badge rendered after the label. */
  count?: number | null
}

export function Tab({
  icon,
  count,
  active,
  className,
  type,
  children,
  ...rest
}: TabProps): JSX.Element {
  return (
    <button
      type={type ?? 'button'}
      role="tab"
      aria-selected={active ?? false}
      className={cn(tabVariants({ active }), className)}
      {...rest}
    >
      {icon}
      {children}
      {count != null && <span className="count">{count}</span>}
    </button>
  )
}
