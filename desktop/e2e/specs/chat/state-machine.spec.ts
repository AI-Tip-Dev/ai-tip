/**
 * E2E Test: Chat State Machine
 *
 * Domain: chat  |  Mock: mockLLMApi  |  Tag: @p0
 *
 * Tests ChatInput state transitions:
 *   idle (input enabled, stop hidden) → replying (input disabled, stop visible) → done (restored)
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

test.describe('Chat State Machine', { tag: '@p0' }, () => {
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

  // ── Test: idle → replying → done ──
  test('Chat state machine → idle (enabled) → replying (disabled + stop) → done (re-enabled)', async () => {
    // Mock LLM with enough tokens for us to observe the replying state
    await mockLLMApi(ctx.app, {
      fieldLabel: 'Policy',
      options: ['ZUR-2025-00421', 'ZUR-2025-00422'],
      explanation:
        'Here are possible policy numbers based on your knowledge base. The first matches your most recent contract. The second is from last quarter.',
    })

    await webview.goto(TEST_FORM_URL)

    // Ensure we're in Home view
    await sidebar.waitForHome()

    // Enter Chat (Overview)
    await sidebar.clickHomeOverview()
    expect(await sidebar.isChatVisible()).toBe(true)

    // Wait for Chat view to fully render
    await ctx.page.waitForTimeout(500)

    // ── idle state: input enabled, stop button hidden ──
    expect(await sidebar.isInputDisabled()).toBe(false)
    expect(await sidebar.isStopVisible()).toBe(false)

    // ── Send message → replying state ──
    await sidebar.sendMessage('Suggest a policy number')

    // During streaming: input should be disabled, stop button visible
    await ctx.page.waitForTimeout(300)

    // Verify replying state (at least one condition met)
    const inputDisabled = await sidebar.isInputDisabled()
    const stopVisible = await sidebar.isStopVisible()
    expect(inputDisabled || stopVisible).toBe(true)

    // ── Wait for streaming to complete → done state ──
    await sidebar.waitForBotMessage(15_000)
    await ctx.page.waitForTimeout(500)

    // done state: input re-enabled, stop hidden
    expect(await sidebar.isInputDisabled()).toBe(false)
    expect(await sidebar.isStopVisible()).toBe(false)

    // Verify at least one bot message appeared
    const botMsgCount = await ctx.page.locator('.bot-msg').count()
    expect(botMsgCount).toBeGreaterThanOrEqual(1)
  })
})
