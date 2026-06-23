import { describe, it, expect } from 'vitest'
import { cn } from './utils'

describe('cn', () => {
  it('joins multiple class names', () => {
    expect(cn('a', 'b')).toBe('a b')
  })

  it('drops falsey conditional classes', () => {
    expect(cn('base', false && 'hidden', undefined, null, 'shown')).toBe('base shown')
  })

  it('dedupes conflicting Tailwind utilities, last one wins', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4')
  })

  it('returns an empty string with no inputs', () => {
    expect(cn()).toBe('')
  })
})
