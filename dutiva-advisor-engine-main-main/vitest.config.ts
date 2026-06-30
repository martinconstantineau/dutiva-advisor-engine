import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    /**
     * globals: true — inject describe/it/test/expect/beforeEach/afterEach/vi
     * as implicit globals so existing test files work without import changes.
     *
     * New tests should prefer explicit imports:
     *   import { describe, it, expect, vi } from 'vitest';
     * but globals are kept on for the existing suite to minimise migration diff.
     */
    globals: true,

    /**
     * Node environment — all advisor-engine tests are server-side; no DOM APIs
     * are needed. If browser/UI tests are added later, use a per-file
     * `// @vitest-environment jsdom` pragma or a separate config.
     */
    environment: 'node',

    /**
     * Test discovery — mirrors the former Jest roots/testMatch config:
     *   src/**‌/__tests__/**‌/*.test.ts  (runtime unit/integration tests)
     *   advisor-training/**‌/*.test.ts    (pipeline / schema / registry tests)
     * Exclude build outputs, coverage, raw XML source data, and node_modules.
     */
    include: [
      'src/**/__tests__/**/*.test.ts',
      'src/**/*.test.ts',
      'advisor-training/**/*.test.ts',
    ],
    exclude: [
      'node_modules/**',
      'dist/**',
      'coverage/**',
      'advisor-training/raw-laws/**',
      'advisor-training/parsed/**',
      'advisor-training/normalized/**',
      'advisor-training/guidance/**',
    ],

    /**
     * Coverage — V8 provider.
     * Collect from src/**‌/*.ts only (not build artifacts, not generated data,
     * not advisor-training pipeline scripts which are build-time TypeScript utilities).
     */
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/**/__tests__/**',
        'node_modules/**',
        'dist/**',
      ],
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage',
    },

    /**
     * Reset mocks before each test to prevent inter-test pollution.
     * This is the Vitest equivalent of Jest's `clearMocks: true`.
     */
    clearMocks: true,

    /**
     * Restore spied-on implementations after each test.
     * Equivalent to Jest's `restoreMocks: true`.
     */
    restoreMocks: true,
  },
});
