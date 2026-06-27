/**
 * E2E Test: Home ↔ Chat Overview Navigation
 *
 * Domain: navigation  |  Mock: none  |  Tag: @p0
 *
 * Tests view switching between Home and Chat Overview (no LLM interaction).
 * Each test is self-contained — enters Chat from Home, verifies, returns.
 *
 * Run:  pnpm build && pnpm test:e2e
 */

import { test, expect } from '@playwright/test'
import { resolve } from 'path'
import { existsSync } from 'fs'
import {
  launchApp,
  closeApp,
  captureElectronLogsTail,
  type E2EContext,
  WebviewPO,
  SidebarPO,
} from '../../helpers'

// ── Paths ──
const ELECTRON_ENTRY = resolve(__dirname, '..', '..', '..', 'out', 'main', 'index.js')
const TEST_FORM_PATH = resolve(__dirname, '..', '..', 'fixtures', 'test-form.html')
const TEST_FORM_URL = `file:///${TEST_FORM_PATH.replace(/\\/g, '/')}`

// ── Suite ──

test.describe('Home ↔ Chat Overview Navigation', { tag: '@p0' }, () => {
  let ctx: E2EContext
  let webview: WebviewPO
  let sidebar: SidebarPO

  test.beforeAll(async () => {
    if (!existsSync(ELECTRON_ENTRY)) {
      throw new Error(`${ELECTRON_ENTRY} missing — run 'pnpm build' first`)
    }
    if (!existsSync(TEST_FORM_PATH)) {
      throw new Error(`${TEST_FORM_PATH} missing`)
    }

    ctx = await launchApp(ELECTRON_ENTRY)
    webview = new WebviewPO(ctx.page)
    sidebar = new SidebarPO(ctx.page)
  })

  test.afterEach(async () => {
    const logs = captureElectronLogsTail(ctx)
    if (logs) {
      await test.info().attach('electron-log', { body: logs, contentType: 'text/plain' })
    }
  })

  test.afterAll(async () => {
    await closeApp(ctx)
  })

  // ── Test 1: Home → Chat Overview → back ──
  test('Home → Chat Overview → page breadcrumb + FieldPills + back to Home', async () => {
    await webview.goto(TEST_FORM_URL)

    // Verify Home view is showing
    expect(await sidebar.isHomeVisible()).toBe(true)

    // Click Overview in Home page card
    await sidebar.clickHomeOverview()

    // Verify we're in Chat view
    expect(await sidebar.isChatVisible()).toBe(true)

    // Verify breadcrumb shows page title (not field-level)
    const breadcrumb = await sidebar.getBreadcrumb()
    expect(breadcrumb).toContain('Customer Registration')

    // Verify FieldPills bar shows Overview pill
    const pillLabels = await sidebar.getFieldPillLabels()
    expect(pillLabels.some((l) => l.includes('Overview'))).toBe(true)

    // Go back to Home
    await sidebar.clickBackButton()
    expect(await sidebar.isHomeVisible()).toBe(true)
  })

  // ── Test 2: Chat → Home back → re-entry preserves state ──
  test('Chat → Home back → page card visible → re-enter Chat restores messages', async () => {
    // First, enter Chat view (Overview)
    await webview.goto(TEST_FORM_URL)
    await sidebar.clickHomeOverview()
    expect(await sidebar.isChatVisible()).toBe(true)

    // Click back button
    await sidebar.clickBackButton()

    // Verify we're back in Home
    expect(await sidebar.isHomeVisible()).toBe(true)

    // Verify the page card still shows current page
    const pageCard = ctx.page.locator('.page-card')
    expect(await pageCard.isVisible()).toBe(true)

    // Re-enter Chat → should restore Overview messages
    await sidebar.clickHomeOverview()
    expect(await sidebar.isChatVisible()).toBe(true)
  })
})
