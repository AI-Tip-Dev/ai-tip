/**
 * E2E Test Helpers — Reusable utilities for Playwright + Electron tests.
 *
 * These helpers wrap common interactions with the Electron app's webview
 * and sidebar components, making test specs cleaner and more maintainable.
 */

import type { Page, ElectronApplication } from '@playwright/test'
import { _electron as electron, test } from '@playwright/test'
import { resolve, join } from 'path'
import { mkdirSync, existsSync } from 'fs'

// ── Types ──

export interface E2EContext {
  app: ElectronApplication
  page: Page
  /** Lines captured from Electron main process stdout/stderr */
  logLines: string[]
}

// ── App Lifecycle ──

/**
 * Launch the Electron app and return the main window page.
 *
 * Captures main-process stdout/stderr directly via Playwright's process API —
 * the recommended approach for Electron E2E logging.  Zero production-code changes.
 *
 * Video recording: uses test.info() to determine the output directory so
 * videos are saved to test-results/<test-name>/ automatically.
 */
export async function launchApp(entryPath: string): Promise<E2EContext> {
  const logLines: string[] = []

  // Determine video output directory from Playwright's test-results
  const testInfo = test.info()
  const videoDir = join(testInfo.outputDir, 'videos')
  if (!existsSync(videoDir)) {
    mkdirSync(videoDir, { recursive: true })
  }

  const app = await electron.launch({
    args: [entryPath],
    env: { ...process.env, NODE_ENV: 'test' },
    recordVideo: {
      dir: videoDir,
      size: { width: 1280, height: 800 },
    },
  })

  // Capture main-process stdout/stderr (electron-log console transport writes here)
  const proc = app.process()
  if (proc.stdout) {
    let stdoutBuf = ''
    proc.stdout.on('data', (chunk: Buffer) => {
      stdoutBuf += chunk.toString()
      const lines = stdoutBuf.split('\n')
      stdoutBuf = lines.pop() || ''
      logLines.push(...lines)
    })
  }
  if (proc.stderr) {
    let stderrBuf = ''
    proc.stderr.on('data', (chunk: Buffer) => {
      stderrBuf += chunk.toString()
      const lines = stderrBuf.split('\n')
      stderrBuf = lines.pop() || ''
      logLines.push(...lines)
    })
  }

  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')

  return { app, page, logLines }
}

/**
 * Close the Electron app gracefully.
 * Keeps the log directory for post-mortem debugging (OS cleans temp files eventually).
 */
export async function closeApp(ctx: E2EContext): Promise<void> {
  await ctx.app.close()
}

// ── WebView Interaction ──

/**
 * Execute JavaScript inside the webview's guest page.
 * Returns the result of the evaluation.
 */
export async function execInWebview(page: Page, code: string): Promise<unknown> {
  return page.evaluate((js) => {
    const wv = document.querySelector('#main-webview') as any
    if (!wv) throw new Error('WebView #main-webview not found in DOM')
    return wv.executeJavaScript(js)
  }, code)
}

/**
 * Navigate the webview to a URL and wait for it to finish loading.
 * Also waits an extra delay for the AI Tip script injection.
 */
export async function navigateWebview(
  page: Page,
  url: string,
  options?: { aiTipDelay?: number }
): Promise<void> {
  const aiTipDelay = options?.aiTipDelay ?? 2000

  await page.evaluate((targetUrl) => {
    const wv = document.querySelector('#main-webview') as any
    if (wv) wv.loadURL(targetUrl)
  }, url)

  // Wait for did-finish-load
  await page.evaluate(
    (t) =>
      new Promise<void>((resolve, reject) => {
        const wv = document.querySelector('#main-webview') as any
        if (!wv) return reject(new Error('WebView not found'))

        const timer = setTimeout(() => reject(new Error('WebView load timeout')), t)
        function onFinish() {
          clearTimeout(timer)
          wv.removeEventListener('did-finish-load', onFinish)
          resolve()
        }
        // Check if already loaded
        const currentUrl = wv.getURL?.() || ''
        if (currentUrl && currentUrl !== 'about:blank') {
          clearTimeout(timer)
          return resolve()
        }
        wv.addEventListener('did-finish-load', onFinish)
      }),
    15_000
  )

  // Wait for AI Tip script injection (1.2s after did-finish-load in useWebview.ts)
  await page.waitForTimeout(aiTipDelay)
}

/**
 * Get the current page title from inside the webview.
 */
export async function getWebviewTitle(page: Page): Promise<string> {
  return (await execInWebview(page, 'document.title')) as string
}

// ── AI Tip Button ──

/**
 * Simulate hovering over a form field in the webview.
 * This triggers the AI Tip button to appear next to the field.
 *
 * @param page - Playwright Page object
 * @param fieldSelector - CSS selector for the field (e.g. '#company_name')
 */
export async function hoverField(page: Page, fieldSelector: string): Promise<void> {
  await execInWebview(page, `
    (function() {
      var el = document.querySelector('${fieldSelector.replace(/'/g, "\\'")}');
      if (!el) throw new Error('Field not found: ${fieldSelector}');
      el.focus();
      el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      el.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
    })()
  `)
}

/**
 * Click the AI Tip button inside the webview.
 * The button is the injected #__ai_tip_btn__ element.
 */
export async function clickAITipButton(page: Page): Promise<void> {
  await execInWebview(page, `
    (function() {
      var btn = document.getElementById('__ai_tip_btn__');
      if (!btn) throw new Error('AI Tip button (#__ai_tip_btn__) not found');
      btn.style.opacity = '1';
      btn.style.pointerEvents = 'auto';
      btn.click();
    })()
  `)
}

/**
 * Check if the AI Tip button is visible in the webview.
 */
export async function isAITipButtonVisible(page: Page): Promise<boolean> {
  return (await execInWebview(
    page,
    `!!(document.getElementById('__ai_tip_btn__') && document.getElementById('__ai_tip_btn__').style.opacity !== '0')`
  )) as boolean
}

/**
 * Dismiss the AI Tip button from the webview.
 */
export async function dismissAITipButton(page: Page): Promise<void> {
  await execInWebview(page, `
    (function() {
      var btn = document.getElementById('__ai_tip_btn__');
      if (btn) btn.remove();
    })()
  `)
}

// ── Field Value ──

/**
 * Get the current value of a form field inside the webview.
 */
export async function getFieldValue(page: Page, selector: string): Promise<string> {
  return (await execInWebview(
    page,
    `(document.querySelector('${selector.replace(/'/g, "\\'")}') || {}).value || ''`
  )) as string
}

/**
 * Set a value into a form field inside the webview (simulates native input).
 */
export async function setFieldValue(
  page: Page,
  selector: string,
  value: string
): Promise<void> {
  const safeSelector = selector.replace(/'/g, "\\'")
  const safeValue = JSON.stringify(value)
  await execInWebview(page, `
    (function() {
      var el = document.querySelector('${safeSelector}');
      if (!el) throw new Error('Field not found: ${safeSelector}');
      var nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value'
      );
      if (nativeSetter && nativeSetter.set) {
        nativeSetter.set.call(el, ${safeValue});
      } else {
        el.value = ${safeValue};
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    })()
  `)
}

// ── Sidebar Interaction ──

/**
 * Wait for suggestion cards (.sug-card) to appear in the sidebar.
 */
export async function waitForSuggestionCards(page: Page, timeout = 5000): Promise<void> {
  const cards = page.locator('.sug-card')
  await cards.first().waitFor({ state: 'visible', timeout })
}

/**
 * Get all visible suggestion card labels from the sidebar.
 */
export async function getSuggestionLabels(page: Page): Promise<string[]> {
  await waitForSuggestionCards(page)
  return page.locator('.sug-card .sug-card-label').allTextContents()
}

/**
 * Click a suggestion card by its label text (partial match).
 */
export async function clickSuggestionByLabel(
  page: Page,
  labelPattern: RegExp
): Promise<void> {
  const cards = page.locator('.sug-card')
  const count = await cards.count()
  for (let i = 0; i < count; i++) {
    const label = await cards.nth(i).locator('.sug-card-label').textContent()
    if (label && labelPattern.test(label)) {
      await cards.nth(i).click()
      return
    }
  }
  throw new Error(`No suggestion card matching ${labelPattern} found`)
}

/**
 * Wait for follow-up chips (.followup-chip) to appear after an AI response.
 */
export async function waitForFollowUpChips(page: Page, timeout = 15_000): Promise<void> {
  const chips = page.locator('.followup-chip')
  await chips.first().waitFor({ state: 'visible', timeout })
}

/**
 * Wait for option chips (.option-chip) to appear in a bot message.
 */
export async function waitForOptionChips(page: Page, timeout = 15_000): Promise<void> {
  const chips = page.locator('.option-chip')
  await chips.first().waitFor({ state: 'visible', timeout })
}

/**
 * Click the first option chip in a bot message.
 * Returns the option value that was clicked.
 */
export async function clickFirstOptionChip(page: Page): Promise<string> {
  const chip = page.locator('.option-chip').first()
  await chip.waitFor({ state: 'visible', timeout: 10_000 })
  const value = (await chip.locator('.opt-value').textContent()) || ''
  await chip.click()
  return value
}

/**
 * Wait for the context pill to appear (shows active field context).
 */
export async function waitForContextPill(page: Page, timeout = 3000): Promise<void> {
  const pill = page.locator('.context-pill')
  const count = await pill.count()
  if (count > 0) {
    await pill.first().waitFor({ state: 'visible', timeout })
  }
}

// ── Page Object Helpers ──

/**
 * Page Object for the Sidebar, providing high-level actions.
 */
export class SidebarPO {
  constructor(private page: Page) {}

  /** Wait for and return suggestion cards */
  async getSuggestions(): Promise<string[]> {
    return getSuggestionLabels(this.page)
  }

  /** Click primary suggestion (first card) */
  async clickPrimarySuggestion(): Promise<void> {
    await waitForSuggestionCards(this.page)
    await this.page.locator('.sug-card').first().click()
  }

  /** Click a suggestion by label regex */
  async clickSuggestion(pattern: RegExp): Promise<void> {
    await clickSuggestionByLabel(this.page, pattern)
  }

  /** Wait for option chips and click the first one */
  async fillFirstOption(): Promise<string> {
    return clickFirstOptionChip(this.page)
  }

  /** Wait for user message to appear */
  async waitForUserMessage(timeout = 5000): Promise<void> {
    await this.page.locator('.user-msg').first().waitFor({ state: 'visible', timeout })
  }

  /** Wait for bot message to appear */
  async waitForBotMessage(timeout = 15_000): Promise<void> {
    await this.page.locator('.bot-msg').first().waitFor({ state: 'visible', timeout })
  }

  /** Get all chat message contents */
  async getMessageContents(): Promise<string[]> {
    const msgs = this.page.locator('.user-msg .bubble, .bot-msg .bubble .md-content')
    return msgs.allTextContents()
  }

  // ── Home View ──

  /** Wait for Home view to be visible (auto-navigates back if in Chat) */
  async waitForHome(timeout = 5000): Promise<void> {
    await this.page.locator('.home-view').waitFor({ state: 'visible', timeout })
  }

  /** Ensure sidebar is in Home view, clicking back if in Chat */
  async ensureHome(): Promise<void> {
    const isHome = await this.page.locator('.home-view').isVisible().catch(() => false)
    if (!isHome) {
      // Might be in Chat view — click back button if present
      const backBtn = this.page.locator('.home-btn')
      if (await backBtn.isVisible().catch(() => false)) {
        await backBtn.click()
        await this.page.locator('.home-view').waitFor({ state: 'visible', timeout: 3000 })
      }
    }
  }

  /** Check if Home view is visible */
  async isHomeVisible(): Promise<boolean> {
    return this.page.locator('.home-view').isVisible()
  }

  /** Click the Overview row in the Home page card */
  async clickHomeOverview(): Promise<void> {
    await this.page.locator('.card-overview').click()
  }

  /** Click a field row in the Home page card */
  async clickHomeField(fieldLabel: string): Promise<void> {
    const rows = this.page.locator('.card-field')
    const count = await rows.count()
    for (let i = 0; i < count; i++) {
      const label = await rows.nth(i).locator('.row-label').textContent()
      if (label?.includes(fieldLabel)) {
        await rows.nth(i).click()
        return
      }
    }
    throw new Error(`Field "${fieldLabel}" not found in Home page card`)
  }

  /** Get the count of field rows in Home */
  async getHomeFieldCount(): Promise<number> {
    return this.page.locator('.card-field').count()
  }

  /** Click a recent page row by hostname */
  async clickRecentPage(host: string): Promise<void> {
    const rows = this.page.locator('.recent-row')
    const count = await rows.count()
    for (let i = 0; i < count; i++) {
      const url = await rows.nth(i).locator('.recent-url').textContent()
      if (url?.includes(host)) {
        await rows.nth(i).click()
        return
      }
    }
    throw new Error(`Recent page "${host}" not found`)
  }

  // ── Chat View ──

  /** Check if Chat view is visible (has chat-header) */
  async isChatVisible(): Promise<boolean> {
    return this.page.locator('.chat-header').isVisible()
  }

  /** Click the Home/back button in Chat header */
  async clickBackButton(): Promise<void> {
    await this.page.locator('.home-btn').click()
  }

  /** Get breadcrumb text from Chat header */
  async getBreadcrumb(): Promise<string> {
    const crumbs = this.page.locator('.chat-header .breadcrumb-current, .chat-header .breadcrumb-link')
    const texts = await crumbs.allTextContents()
    return texts.join(' › ')
  }

  /** Click the page-level breadcrumb link (navigates to Overview) */
  async clickBreadcrumbPage(): Promise<void> {
    await this.page.locator('.breadcrumb-link').click()
  }

  // ── FieldPills ──

  /** Check if FieldPills bar is visible */
  async isFieldPillsVisible(): Promise<boolean> {
    return this.page.locator('.field-pills-bar').isVisible()
  }

  /** Get all pill button texts from FieldPills bar */
  async getFieldPillLabels(): Promise<string[]> {
    const pills = this.page.locator('.field-pills-bar .pill')
    return pills.allTextContents()
  }

  /** Click a pill by label (partial match) */
  async clickFieldPill(label: string): Promise<void> {
    const pills = this.page.locator('.field-pills-bar .pill')
    const count = await pills.count()
    for (let i = 0; i < count; i++) {
      const text = await pills.nth(i).textContent()
      if (text?.includes(label)) {
        await pills.nth(i).click()
        return
      }
    }
    throw new Error(`Pill "${label}" not found in FieldPills`)
  }

  /** Check if the +N overflow button is visible */
  async isOverflowVisible(): Promise<boolean> {
    const btn = this.page.locator('.overflow-btn')
    return btn.isVisible()
  }

  // ── ContextBadge ──

  /** Check if ContextBadge is visible */
  async isContextBadgeVisible(): Promise<boolean> {
    return this.page.locator('.context-badge').isVisible()
  }

  /** Click ContextBadge toggle to expand/collapse */
  async toggleContextBadge(): Promise<void> {
    await this.page.locator('.cb-toggle').click()
  }

  /** Check if ContextBadge is expanded */
  async isContextBadgeExpanded(): Promise<boolean> {
    return this.page.locator('.cb-summary').isVisible()
  }

  // ── Batch Fill Card ──

  /** Check if Batch Fill Card is in trigger state */
  async isBatchCardTrigger(): Promise<boolean> {
    // Button text: "Start Batch Fill (N fields)" in trigger state
    // In done state: "View All Fields" — so we check for "Batch" presence
    const btn = this.page.locator('.batch-card .card-btn')
    if (await btn.count() === 0) return false
    const text = (await btn.first().textContent()) || ''
    return /batch/i.test(text)
  }

  /** Click the Batch Fill start button */
  async clickBatchFillStart(): Promise<void> {
    await this.page.locator('.batch-card .card-btn').first().click()
  }

  /** Check if Batch Fill Card is in loading state */
  async isBatchCardLoading(): Promise<boolean> {
    const card = this.page.locator('.batch-card')
    return card.locator('text=⏳').isVisible()
  }

  /** Check if Batch Fill Card is in done state */
  async isBatchCardDone(): Promise<boolean> {
    const card = this.page.locator('.batch-card')
    return card.locator('text=✅').isVisible()
  }

  /** Get Batch Fill done stats */
  async getBatchStats(): Promise<{ high: number; medium: number; low: number }> {
    const stats = this.page.locator('.batch-card .card-stats')
    const highCount = await stats.locator('.stat.high').count()
    const mediumCount = await stats.locator('.stat.medium').count()
    const lowCount = await stats.locator('.stat.low').count()
    // Get numbers from text
    const extractNum = async (cls: string) => {
      const el = stats.locator(`.stat.${cls}`)
      if (await el.count() === 0) return 0
      const text = (await el.textContent()) || ''
      const match = text.match(/\d+/)
      return match ? parseInt(match[0]) : 0
    }
    return {
      high: highCount ? await extractNum('high') : 0,
      medium: mediumCount ? await extractNum('medium') : 0,
      low: lowCount ? await extractNum('low') : 0,
    }
  }

  // ── Chat Input / State ──

  /** Type and send a message */
  async sendMessage(text: string): Promise<void> {
    const input = this.page.locator('.input-area')
    await input.fill(text)
    await this.page.locator('.send-btn').click()
  }

  /** Check if the input is disabled (during streaming) */
  async isInputDisabled(): Promise<boolean> {
    return this.page.locator('.input-area').isDisabled()
  }

  /** Check if the stop button is visible (during streaming) */
  async isStopVisible(): Promise<boolean> {
    return this.page.locator('.send-btn.stop').isVisible()
  }

  /** Click the stop button to cancel streaming */
  async clickStop(): Promise<void> {
    await this.page.locator('.send-btn.stop').click()
  }

  // ── QuickActions ──

  /** Check if QuickActions chips are visible */
  async isQuickActionsVisible(): Promise<boolean> {
    return this.page.locator('.quick-actions').isVisible()
  }

  // ── Settings ──

  /** Open settings dialog */
  async openSettings(): Promise<void> {
    // Click the settings gear button in Home brand area
    const btn = this.page.locator('.brand-btn[title*="Settings"], .brand-btn[title*="设置"]')
    if (await btn.count() > 0) {
      await btn.click()
    }
  }

  /** Check if settings dialog is visible */
  async isSettingsVisible(): Promise<boolean> {
    return this.page.locator('.settings-dialog, .dialog-overlay').first().isVisible()
  }
}

/**
 * Page Object for the WebView, providing high-level actions.
 */
export class WebviewPO {
  constructor(private page: Page) {}

  /** Navigate to URL */
  async goto(url: string): Promise<void> {
    await navigateWebview(this.page, url)
  }

  /** Hover over a field to trigger AI tip button */
  async hoverField(selector: string): Promise<void> {
    await hoverField(this.page, selector)
  }

  /** Click the AI tip button */
  async clickAITip(): Promise<void> {
    await clickAITipButton(this.page)
  }

  /** Hover field + wait + click AI tip (convenience combo) */
  async triggerAITip(selector: string, hoverDelay = 300): Promise<void> {
    await this.hoverField(selector)
    await this.page.waitForTimeout(hoverDelay)
    await this.clickAITip()
    await this.page.waitForTimeout(500)
  }

  /** Get field value */
  async getValue(selector: string): Promise<string> {
    return getFieldValue(this.page, selector)
  }

  /** Check if AI tip button is visible */
  async isTipVisible(): Promise<boolean> {
    return isAITipButtonVisible(this.page)
  }

  /** Get page title */
  async getTitle(): Promise<string> {
    return getWebviewTitle(this.page)
  }

  /** Send keyboard input to a field (simulates typing) */
  async typeInField(selector: string, text: string): Promise<void> {
    await setFieldValue(this.page, selector, text)
  }
}

// ── LLM Mock (pure test-side, zero production code) ──

/**
 * Intercept `llm:stream:start` IPC in the Electron MAIN PROCESS
 * and replay canned `llm:stream:chunk` events.  No preload or
 * renderer code is modified — the mock runs entirely in the test
 * via Playwright's `electronApp.evaluate()`.
 *
 * @example
 *   await mockLLMApi(ctx.app, {
 *     fieldLabel: 'Company Name',
 *     options: ['Acme Corp', 'Zurich Insurance', 'Global Risk'],
 *     explanation: 'Here are 3 candidates:',
 *   })
 */
export async function mockLLMApi(
  electronApp: ElectronApplication,
  canned: {
    fieldLabel: string
    options: string[]
    explanation?: string
  }
): Promise<void> {
  await electronApp.evaluate(
    ({ ipcMain, BrowserWindow }, c) => {
      const explanation =
        c.explanation || `Here are suggestions for "${c.fieldLabel}":`
      const optionsBlock = `\n\n[[OPTIONS:${c.fieldLabel}]]${c.options.join('||')}[[/OPTIONS]]`
      const fullResponse = explanation + optionsBlock
      const tokens = fullResponse.match(/\S+\s*/g) || [fullResponse]

      // Remove all previous llm:stream:start listeners to avoid accumulation
      ipcMain.removeAllListeners('llm:stream:start')

      // Intercept llm:stream:start — fire canned chunks back to sender
      ipcMain.on('llm:stream:start', (event, data: { requestId: string }) => {
        const requestId = data?.requestId
        if (!requestId) return

        const win = BrowserWindow.fromWebContents(event.sender)
        if (!win) return

        let ti = 0
        const fireNext = (): void => {
          if (ti >= tokens.length) return
          const isLast = ti === tokens.length - 1
          win.webContents.send('llm:stream:chunk', {
            requestId,
            chunk: { token: tokens[ti], done: isLast },
          })
          ti++
          if (!isLast) setTimeout(fireNext, 15)
        }
        fireNext()
      })
    },
    canned
  )
}

/**
 * Intercept `batch:suggest` IPC in the Electron MAIN PROCESS
 * and return canned batch fill suggestions.
 *
 * Uses ipcMain.removeHandler + ipcMain.handle to override the
 * existing handler. Returns deterministic suggestions with
 * configurable confidence levels.
 *
 * @example
 *   await mockBatchSuggest(ctx.app, [
 *     { fieldKey: 'Company Name', suggestedValue: 'Acme Corp', confidence: 'high', reasoning: 'From contract' },
 *     { fieldKey: 'Email', suggestedValue: 'test@acme.com', confidence: 'medium', reasoning: 'Inferred' },
 *   ])
 */
export async function mockBatchSuggest(
  electronApp: ElectronApplication,
  suggestions: Array<{
    fieldKey: string
    suggestedValue: string
    confidence: 'high' | 'medium' | 'low'
    reasoning: string
  }>
): Promise<void> {
  await electronApp.evaluate(
    ({ ipcMain }, canned) => {
      try {
        ipcMain.removeHandler('batch:suggest')
      } catch {
        /* no handler registered yet */
      }
      ipcMain.handle('batch:suggest', async () => {
        return { result: { suggestions: canned }, traceSpanId: 'mock-batch-trace' }
      })
    },
    suggestions
  )
}

/**
 * Mock `page:summarize` IPC to return a canned page summary.
 * This unblocks the Batch Fill Card from appearing (it needs
 * page summary to complete first).
 */
export async function mockPageSummary(
  electronApp: ElectronApplication,
  summary: string
): Promise<void> {
  await electronApp.evaluate(
    ({ ipcMain }, canned) => {
      try {
        ipcMain.removeHandler('page:summarize')
      } catch {
        /* no handler registered yet */
      }
      ipcMain.handle('page:summarize', async () => {
        return canned
      })
    },
    summary
  )
}

// ── Electron Log Capture ──

/**
 * Return the full log captured from the Electron main process stdout/stderr.
 *
 * Usage in tests:
 *   const logs = captureElectronLogs(ctx)
 *   if (logs) await test.info().attach('electron-log', { body: logs, contentType: 'text/plain' })
 */
export function captureElectronLogs(ctx: E2EContext): string | null {
  if (ctx.logLines.length === 0) return null
  return ctx.logLines.join('\n')
}

/**
 * Return only the last N lines of the captured log (useful for large logs).
 */
export function captureElectronLogsTail(ctx: E2EContext, lines = 200): string | null {
  if (ctx.logLines.length === 0) return null
  if (ctx.logLines.length <= lines) return ctx.logLines.join('\n')
  return `... (${ctx.logLines.length - lines} lines truncated) ...\n` + ctx.logLines.slice(-lines).join('\n')
}
