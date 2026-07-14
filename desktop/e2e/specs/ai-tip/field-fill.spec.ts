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

  // ── Test 1: direct fill via executeJavaScript → verify exact value ──
  test('fill pipeline → executeJavaScript sets field value end-to-end', async () => {
    await webview.goto(TEST_FORM_URL)
    await webview.triggerAITip('#first_name')

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
    // Verify the EXACT value was written into the field
    expect(await webview.getValue('#first_name')).toBe(testValue)
  })

  // ── Test 2: mock LLM → [[OPTIONS]] chips → click → verify exact value ──
  test('mock LLM → [[OPTIONS]] chips render → click fills webview field', async () => {
    const cannedOptions = ['Acme Corporation', 'Zurich Insurance Group', 'Global Risk Solutions']
    await mockLLMApi(ctx.app, {
      fieldLabel: 'Company Name',
      options: cannedOptions,
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

    // Verify the field value matches the clicked option chip value exactly
    const fieldValue = await webview.getValue('#company_name')
    expect(fieldValue).toBe(optionValue!.trim())
  })

  // ── Test 3: checkbox fill via window.__aiTipSDK__.fillField() (real SDK path) ──
  test('checkbox fill via SDK → sets .checked and returns ok', async () => {
    await webview.goto(TEST_FORM_URL)

    // Build a FieldContext matching the GDPR consent checkbox
    const fieldCtx = {
      tagName: 'input',
      type: 'checkbox',
      name: '',
      id: 'gdpr_consent',
      placeholder: '',
      value: '',
      ariaLabel: '',
      label: 'Data processing consent obtained (GDPR / FADP)',
      formPurpose: '',
      siblingLabels: [] as string[],
      pageTitle: 'Customer Registration — AI Sidebar',
      pageUrl: TEST_FORM_URL,
      rect: { top: 0, left: 0, width: 100, height: 30 },
    }

    // Call the SDK fillField via executeJavaScript — the EXACT path that
    // triggered GUEST_VIEW_MANAGER_CALL in the original bug report.
    const fillResult = await ctx.page.evaluate(async (ctx) => {
      const wv = document.querySelector('#main-webview') as any
      if (!wv) return { ok: false, reason: 'no webview' }

      // Wrap in try-catch like the fix should, but test the raw SDK call
      const resultJson = await wv.executeJavaScript(`
        (function(){
          try {
            if (!window.__aiTipSDK__) return JSON.stringify({ok:false,reason:'SDK not loaded'});
            return JSON.stringify(window.__aiTipSDK__.fillField("true",${JSON.stringify(ctx)}));
          } catch(e) {
            return JSON.stringify({ok:false,reason:'script error',error:String(e)});
          }
        })()
      `)
      return JSON.parse(resultJson)
    }, fieldCtx)

    // Verify fillField returned ok (not GUEST_VIEW_MANAGER_CALL error)
    expect(fillResult.ok).toBe(true)

    // Verify the checkbox is actually checked
    const isChecked = await ctx.page.evaluate(() => {
      const wv = document.querySelector('#main-webview') as any
      if (!wv) return false
      return wv.executeJavaScript(
        `(function(){ var el=document.getElementById('gdpr_consent'); return !!el && el.checked })()`
      )
    })
    expect(isChecked).toBe(true)
  })

  // ── Test 4: checkbox fill via direct executeJavaScript → verify .checked ──
  test('checkbox direct fill → sets .checked property correctly', async () => {
    await webview.goto(TEST_FORM_URL)

    // Directly set .checked via executeJavaScript (bypasses SDK)
    const fillResult = await ctx.page.evaluate(async () => {
      const wv = document.querySelector('#main-webview') as any
      if (!wv) return '{"ok":false}'

      return wv.executeJavaScript(`
        (function(){
          var el = document.getElementById('gdpr_consent');
          if (!el) return '{"ok":false,"reason":"element not found"}';
          el.checked = true;
          el.dispatchEvent(new Event('input',{bubbles:true}));
          el.dispatchEvent(new Event('change',{bubbles:true}));
          return '{"ok":true}';
        })()
      `)
    })
    const parsed = JSON.parse(fillResult as string)
    expect(parsed.ok).toBe(true)

    // Verify the checkbox is checked
    const isChecked = await ctx.page.evaluate(() => {
      const wv = document.querySelector('#main-webview') as any
      if (!wv) return false
      return wv.executeJavaScript(
        `(function(){ var el=document.getElementById('gdpr_consent'); return !!el && el.checked })()`
      )
    })
    expect(isChecked).toBe(true)
  })
})
