import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// jsdom does not implement matchMedia; renderer theme code (useTheme) and a few
// components rely on it. Provide a permissive stub so tests don't crash on import.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}
