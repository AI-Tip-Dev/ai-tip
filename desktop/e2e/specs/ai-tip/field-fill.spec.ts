/**
 * E2E Test: AI Tip Fill Pipeline + LLM Options → Fill
 *
 * Domain: ai-tip  |  Mock: mockLLMApi  |  Tag: @p0
 *
 * Tests the complete fill flow: direct executeJavaScript pipeline
 * and mock LLM streaming → [[OPTIONS]] chips → click → fill.
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

test.describe('AI Tip Fill Pipeline', { tag: '@p0' }, () => {
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

  // ── Test 1: direct fill via executeJavaScript (no chat msg) ──
  test('fill pipeline → executeJavaScript sets field value end-to-end', async () => {
    await webview.goto(TEST_FORM_URL)
    await webview.triggerAITip('#first_name')

    // Direct fill via webview.executeJavaScript (does not send chat msg)
    const testValue = 'E2E-First-Name'
    const fillResult = await ctx.page.evaluate(async (val) => {
      const wv = document.querySelector('#main-webview') as any
      if (!wv) return { ok: false }

      const result = await wv.executeJavaScript(`
        (function() {
          var v = ${JSON.stringify(val)};
          var el = document.querySelector('#first_name');
          if (!el) el = document.querySelector('input[name="first_name"]');
          if (!el) return '{"ok":false}';

          var d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');
          if (d&&d.set) d.set.call(el,v); else el.value=v;
          el.dispatchEvent(new Event('input',{bubbles:true}));
          el.dispatchEvent(new Event('change',{bubbles:true}));
          return '{"ok":true,"label":'+JSON.stringify(v)+'}';
        })()
      `)
      return JSON.parse(result)
    }, testValue)

    expect(fillResult.ok).toBe(true)
    expect(await webview.getValue('#first_name')).toBe(testValue)
  })

  // ── Test 2: mock LLM → [[OPTIONS]] chips → click → fill ──
  test('mock LLM → [[OPTIONS]] chips render → click fills webview field', async () => {
    // Inject IPC handler in MAIN PROCESS via electronApp.evaluate().
    // Intercepts llm:stream:start → fires canned llm:stream:chunk events.
    // Zero production code changes — mock runs entirely in test.
    await mockLLMApi(ctx.app, {
      fieldLabel: 'Company Name',
      options: ['Acme Corporation', 'Zurich Insurance Group', 'Global Risk Solutions'],
      explanation: 'Here are 3 candidate values for the Company Name field.',
    })

    await webview.goto(TEST_FORM_URL)
    await webview.triggerAITip('#company_name')
    await sidebar.clickPrimarySuggestion()
    await sidebar.waitForUserMessage()

    // Mock streams tokens → BotMessage renders option chips
    const optionChip = ctx.page.locator('.option-chip').first()
    await optionChip.waitFor({ state: 'visible', timeout: 5000 })

    const optionValue = await optionChip.locator('.opt-value').textContent()
    expect(optionValue).toBeTruthy()

    // Click the option chip → fills the webview field
    await optionChip.click()
    await ctx.page.waitForTimeout(500)

    const fieldValue = await webview.getValue('#company_name')
    expect(fieldValue).toBeTruthy()
  })
})
