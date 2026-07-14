/**
 * Demo Recording: Single Field Fill
 *
 * Slow, deliberate flow designed for video recording:
 *   1. Load form → 2. Hover field → 3. AI Tip button appears
 *   4. Click AI Tip → 5. Chat opens → 6. [[OPTIONS]] chips render
 *   7. Click chip → 8. Form field fills → 9. Verify
 *
 * Run:
 *   pnpm build && npx playwright test e2e/specs/demo/fill-field-demo.spec.ts --config=e2e/playwright.config.ts
 */

import { test, expect } from '@playwright/test'
import { resolve } from 'path'
import { existsSync, readFileSync } from 'fs'
import {
  launchApp,
  closeApp,
  mockLLMApi,
  mockPageSummary,
  captureElectronLogsTail,
  type E2EContext,
  WebviewPO,
  SidebarPO,
} from '../../helpers'

const ELECTRON_ENTRY = resolve(__dirname, '..', '..', '..', 'out', 'main', 'index.js')
const TEST_FORM_URL = 'https://ai-tip-dev.github.io/ai-tip/test-form.html'

// Read SDK IIFE for inline injection — HTTPS pages block file:// <script src>
const SDK_IIFE_PATH = resolve(__dirname, '..', '..', '..', '..', 'sdk', 'dist', 'ai-tip-sdk.iife.js')
const SDK_IIFE_SOURCE = existsSync(SDK_IIFE_PATH) ? readFileSync(SDK_IIFE_PATH, 'utf-8') : ''

test.describe('Demo: Single Field Fill', () => {
  let ctx: E2EContext
  let webview: WebviewPO
  let sidebar: SidebarPO

  test.beforeAll(async () => {
    if (!existsSync(ELECTRON_ENTRY)) {
      throw new Error(`${ELECTRON_ENTRY} missing — run 'pnpm build' first`)
    }
    ctx = await launchApp(ELECTRON_ENTRY)
    webview = new WebviewPO(ctx.page)
    sidebar = new SidebarPO(ctx.page)
  })

  test.afterAll(async () => {
    await closeApp(ctx)
  })

  test('Fill Form — Company Name', async () => {

    // ── Step 1: Mock page summary (BEFORE navigation — summarizePage fires 2500ms after load) ──
    await mockPageSummary(
      ctx.app,
      'This is a CRM customer registration form with 17 fields across 4 sections.',
    )

    // ── Step 2: Mock LLM response with option chips ──
    const cannedOptions = ['Zurich Insurance Group Ltd', 'Acme Corporation', 'Global Risk Solutions']
    await mockLLMApi(ctx.app, {
      fieldLabel: 'Company Name',
      options: cannedOptions,
      explanation: 'Here are 3 candidate values for Company Name from your knowledge base:',
    })

    // ── Step 3: Navigate to form via the app's URL bar ──
    await ctx.page.evaluate((url: string) => {
      localStorage.setItem('ai-sidebar-history', JSON.stringify({ lastUrl: url, recentUrls: [url] }))
    }, TEST_FORM_URL)
    const urlInput = ctx.page.locator('.url-input')
    await urlInput.click()
    await urlInput.fill(TEST_FORM_URL)
    await urlInput.press('Enter')
    // Assert the webview loaded the target URL.
    await expect.poll(() =>
      ctx.page.evaluate(() => {
        const wv = document.querySelector('#main-webview') as any
        return wv?.getURL?.() || ''
      })
    ).toBe(TEST_FORM_URL)

    // ── Step 3.5: Inject SDK IIFE inline (HTTPS blocks file:// <script src> in production) ──
    if (SDK_IIFE_SOURCE) {
      await ctx.page.evaluate((source: string) => {
        const wv = document.querySelector('#main-webview') as any
        if (!wv) return
        wv.executeJavaScript(`
          (function(){
            if (window.__sdkInjected) return;
            window.__sdkInjected = true;
            // The SDK auto-inits only when loaded via <script> tag.
            // executeJavaScript has no <script>, so fake it.
            if (!document.currentScript) {
              Object.defineProperty(document, 'currentScript', { value: {}, configurable: true });
            }
            ${source}
            delete document.currentScript;
          })()
        `).catch(() => {})
      }, SDK_IIFE_SOURCE)
    }

    // ── Step 4: Hover over Company Name → AI Tip button appears ──
    await webview.hoverField('#company_name')
    await ctx.page.waitForTimeout(800)   // Pause — show AI Tip button appearing

    // Ensure AI Tip button is visible
    const tipVisible = await webview.isTipVisible()
    expect(tipVisible).toBe(true)

    // ── Step 5: Click AI Tip button ──
    await webview.clickAITip()
    await ctx.page.waitForTimeout(800)   // Pause — chat opening transition

    // ── Step 6: Click the first suggestion chip to trigger LLM stream ──
    const sugCard = ctx.page.locator('.sug-card').first()
    await sugCard.waitFor({ state: 'visible', timeout: 10_000 })
    await ctx.page.waitForTimeout(600)   // Pause — show the suggestion chips
    await sugCard.click()
    await ctx.page.waitForTimeout(500)   // Pause — message sent

    // ── Step 7: Wait for option chips in bot response ──
    const chip = ctx.page.locator('.option-chip').first()
    await chip.waitFor({ state: 'visible', timeout: 10_000 })
    await ctx.page.waitForTimeout(800)   // Pause — show the chips

    // Verify option chip text matches expectations
    const chipText = await chip.locator('.opt-value').textContent()
    expect(chipText).toBeTruthy()
    expect(cannedOptions).toContain(chipText)

    // ── Step 7: Click the first option chip → fills the form ──
    await chip.click()
    await ctx.page.waitForTimeout(1000)  // Pause — show the fill result

    // ── Step 8: Verify the form field was filled ──
    const filledValue = await webview.getValue('#company_name')
    expect(filledValue).toBe(chipText)

    await ctx.page.waitForTimeout(500)  // Final pause — show completed form

    // Attach logs
    const logs = captureElectronLogsTail(ctx)
    if (logs) {
      await test.info().attach('electron-log', { body: logs, contentType: 'text/plain' })
    }
  })
})
