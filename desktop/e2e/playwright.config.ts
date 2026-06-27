import { resolve } from 'path'
import { defineConfig } from '@playwright/test'

/**
 * Playwright E2E configuration for Electron AI Sidebar.
 *
 * Uses Playwright's built-in Electron support to launch the app
 * and interact with both the renderer (sidebar) and the webview.
 *
 * Prerequisites:
 *   pnpm build    (or pnpm dev running separately)
 *
 * Run:
 *   pnpm test:e2e
 */
export default defineConfig({
  testDir: './specs',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  // Retry once on CI
  retries: process.env.CI ? 1 : 0,
  // Reporter
  reporter: [
    ['list'],
    ['html', { outputFolder: './report' }],
  ],
  use: {
    // Screenshot on failure
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry',
  },
})
