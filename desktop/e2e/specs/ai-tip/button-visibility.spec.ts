/**
 * E2E Test: AI Tip Button Visibility + Suggestion Cards
 *
 * Domain: ai-tip  |  Mock: none  |  Tag: @p0
 *
 * Tests that don't modify chat state — WelcomeView stays visible throughout.
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

test.describe('AI Tip Button Visibility', { tag: '@p0' }, () => {
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

  // ── Test 1: hover → AI Tip button → click → suggestion cards ──
  test('hover field → AI Tip button appears → click → suggestion cards render', async () => {
    await webview.goto(TEST_FORM_URL)

    // Verify form loaded
    expect(await webview.getTitle()).toContain('Customer Registration')

    // Hover → button appears
    await webview.hoverField('#company_name')
    await ctx.page.waitForTimeout(300)
    expect(await webview.isTipVisible()).toBe(true)

    // Click AI Tip → sidebar shows suggestion cards
    await webview.clickAITip()
    await ctx.page.waitForTimeout(500)

    // Verify at least one .sug-card is visible in the sidebar
    const cardCount = await ctx.page.locator('.sug-card').count()
    expect(cardCount).toBeGreaterThanOrEqual(1)
  })

  // ── Test 2: different field types → suggestion cards ──
  test('text | select | textarea → suggestion cards render for each field type', async () => {
    // Text input
    await webview.goto(TEST_FORM_URL)
    await webview.triggerAITip('#company_name')
    expect(await ctx.page.locator('.sug-card').count()).toBeGreaterThanOrEqual(1)

    // Select field
    await webview.goto(TEST_FORM_URL)
    await webview.triggerAITip('#industry')
    expect(await ctx.page.locator('.sug-card').count()).toBeGreaterThanOrEqual(1)

    // Textarea
    await webview.goto(TEST_FORM_URL)
    await webview.triggerAITip('#notes')
    expect(await ctx.page.locator('.sug-card').count()).toBeGreaterThanOrEqual(1)
  })
})
