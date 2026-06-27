/**
 * E2E Test: Home ↔ Chat Field Session Navigation
 *
 * Domain: navigation  |  Mock: mockLLMApi  |  Tag: @p0
 *
 * Tests creating a field session via AI Tip → suggestion → Chat view,
 * verifying field breadcrumb, FieldPills, and Home card entries.
 *
 * Run:  pnpm build && pnpm test:e2e
 */

import { test, expect } from '@playwright/test'
import { resolve } from 'path'
import { existsSync } from 'fs'
import {
  launchApp,
  closeApp,
  mockLLMApi,
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

test.describe('Home ↔ Chat Field Session', { tag: '@p0' }, () => {
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

  // ── Test: Home → AI Tip → field session → breadcrumb + FieldPills + Home card ──
  test('Home → AI Tip → field session → field breadcrumb + FieldPills → appears in Home card', async () => {
    // Set up LLM mock before triggering AI Tip
    await mockLLMApi(ctx.app, {
      fieldLabel: 'Company Name',
      options: ['Acme Corporation', 'Zurich Insurance Group'],
      explanation: 'Here are suggestions for Company Name:',
    })

    await webview.goto(TEST_FORM_URL)

    // Trigger AI Tip on company_name → shows WelcomeView with suggestion cards
    await webview.triggerAITip('#company_name')

    // Click the primary suggestion card to actually send a message
    // This creates the field session with messages
    await sidebar.clickPrimarySuggestion()
    await sidebar.waitForUserMessage()
    await sidebar.waitForBotMessage(10_000)

    // Verify Chat view breadcrumb includes field name
    const breadcrumb = await sidebar.getBreadcrumb()
    expect(breadcrumb).toContain('Company Name')

    // Verify FieldPills show Overview + Company Name pills
    const pills = await sidebar.getFieldPillLabels()
    expect(pills.some((p) => p.includes('Overview'))).toBe(true)
    expect(pills.some((p) => p.includes('Company Name'))).toBe(true)

    // Go back to Home
    await sidebar.clickBackButton()
    expect(await sidebar.isHomeVisible()).toBe(true)

    // Verify field session appears in Home page card
    const fieldCount = await sidebar.getHomeFieldCount()
    expect(fieldCount).toBeGreaterThanOrEqual(1)
  })
})
