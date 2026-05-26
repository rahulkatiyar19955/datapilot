/**
 * Shared utilities for the renderer.
 *
 * `cn()` is the standard className composer used across the primitive kit and
 * by future shadcn primitives. It runs `clsx` (conditional class joining) then
 * `tailwind-merge` (deduplicates conflicting Tailwind utilities, e.g.
 * `cn('px-2', 'px-4')` → `'px-4'`).
 */
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
