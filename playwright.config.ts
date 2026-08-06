import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: ['smoke/**/*.spec.ts', 'e2e/**/*.spec.ts'],
});
