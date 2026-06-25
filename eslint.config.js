import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

// Flat ESLint config for the TypeScript/React app code (src/**).
// Philosophy: the AGENT.md "Anti-Patterns" (no Next.js, no URL routing) and the
// renderer security boundary (no raw electron/fs/child_process) are HARD ERRORS;
// code-quality rules (no-explicit-any, unused vars) are WARNINGS so the gate is
// green on the current codebase and can be tightened incrementally.
export default tseslint.config(
  {
    ignores: [
      'out/**',
      'dist/**',
      'build/**',
      'node_modules/**',
      'coverage/**',
      '.pytest_cache/**',
      // Python services have their own tooling (ruff/mypy), not ESLint.
      'backend/**',
      'mcap_parser/**',
      'mcp_workers/**',
      '**/*.d.ts',
      // Root config files (node context).
      '*.config.{js,ts,mjs,cjs}',
      'electron.vite.config.ts',
      // Test files run under Vitest globals; linting them is a follow-up.
      '**/*.{test,spec}.{ts,tsx}',
      'src/test/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // TypeScript already resolves identifiers; core no-undef double-reports
      // (and false-positives on type-only names). typescript-eslint recommends
      // disabling it for TS sources.
      'no-undef': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // AGENT.md Anti-Patterns — hard errors.
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['next', 'next/*'], message: 'No Next.js (AGENT.md anti-pattern). The renderer is Vite + React.' },
          { group: ['react-router', 'react-router-dom', 'react-router/*'], message: 'No URL routing (AGENT.md). Screen state lives in the useUIStore zustand store.' },
        ],
      }],
      // Quality signals — warnings (existing violations are tracked, not blocking).
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      '@typescript-eslint/ban-ts-comment': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',
    },
  },
  {
    // Renderer must go through the preload bridge (window.datapilot), never the
    // Node/Electron internals directly (AGENT.md process-boundary rule).
    files: ['src/renderer/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [
          { name: 'electron', message: 'Renderer must use window.datapilot (preload bridge), not electron directly (AGENT.md).' },
          { name: 'fs', message: 'No fs in the renderer (AGENT.md) — go through the preload bridge.' },
          { name: 'node:fs', message: 'No fs in the renderer (AGENT.md) — go through the preload bridge.' },
          { name: 'child_process', message: 'No child_process in the renderer (AGENT.md).' },
          { name: 'node:child_process', message: 'No child_process in the renderer (AGENT.md).' },
        ],
        patterns: [
          { group: ['next', 'next/*'], message: 'No Next.js (AGENT.md anti-pattern).' },
          { group: ['react-router', 'react-router-dom', 'react-router/*'], message: 'No URL routing (AGENT.md).' },
        ],
      }],
    },
  },
)
