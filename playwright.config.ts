import { defineConfig } from '@playwright/test'

/**
 * Desktop end-to-end tests. They launch the built application (`npm run build` first) with
 * Playwright's Electron driver and an isolated user-data directory per test.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  fullyParallel: false,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  outputDir: 'test-results'
})
