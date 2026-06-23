import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Vitest config for the renderer/shared/preload TypeScript code.
// Mirrors the path aliases declared in electron.vite.config.ts so test
// imports resolve identically to the app build.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer'),
      '@shared': resolve(__dirname, 'src/shared'),
      '@main': resolve(__dirname, 'src/main'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // Unit tests don't need real CSS; skip processing so Tailwind/global
    // stylesheet imports become no-ops instead of failing the run.
    css: false,
  },
})
