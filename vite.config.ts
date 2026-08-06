/// <reference types="vitest/config" />

import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.{ts,tsx}', 'tests/build/**/*.test.ts'],
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    passWithNoTests: true,
  },
});
