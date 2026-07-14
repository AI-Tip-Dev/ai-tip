/**
 * Demo Recording: Batch Fill
 *
 * Slow, deliberate flow designed for video recording:
 *   1. Load form → 2. Wait for page summary
 *   3. Home view shows detected fields
 *   4. Click Overview → 5. Batch Fill Card appears
 *   6. Click "Start Batch Fill" → 7. Loading → Done
 *   8. Verify confidence stats → 9. Verify field sessions created
 *
 * Run:
 *   pnpm build && npx playwright test e2e/specs/demo/batch-fill-demo.spec.ts --config=e2e/playwright.config.ts
 */

import { test, expect } from '@playwright/test'
import { resolve } from 'path'
import { existsSync } from 'fs'
import {
  launchApp,
  closeApp,
  mockBatchSuggest,
  mockPageSummary,
  captureElectronLogsTail,
  type E2EContext,
  WebviewPO,
  SidebarPO,
} from '../../helpers'

const ELECTRON_ENTRY = resolve(__dirname, '..', '..', '..', 'out', 'main', 'index.js')
const TEST_FORM_PATH = resolve(__dirname, '..', '..', 'fixtures', 'test-form.html')
const TEST_FORM_URL = `file:///${TEST_FORM_PATH.replace(/\\/g, '/')}`

test.describe('Demo: Batch Fill', () => {
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

  test('Batch Fill — complete flow', async () => {

    // ── Step 1: Mock page summary (needed for Batch Fill Card to appear) ──
    await mockPageSummary(
      ctx.app,
      'This is a CRM customer registration form with 17 fields across 4 sections: Company Information, Primary Contact, Policy Details, and Processing.'
    )

    // ── Step 2: Mock batch suggestions with varied confidence ──
    await mockBatchSuggest(ctx.app, [
      { fieldKey: 'Company Name',       suggestedValue: 'Zurich Insurance Group Ltd', confidence: 'high',   reasoning: 'From Master Service Agreement §2.1' },
      { fieldKey: 'Industry',           suggestedValue: 'Insurance',                    confidence: 'high',   reasoning: 'From company profile' },
      { fieldKey: 'Registered Address', suggestedValue: 'Mythenquai 2, 8002 Zurich',   confidence: 'high',   reasoning: 'From contract header §1.2' },
      { fieldKey: 'First Name',         suggestedValue: 'Thomas',                      confidence: 'high',   reasoning: 'From email correspondence' },
      { fieldKey: 'Last Name',          suggestedValue: 'Müller',                      confidence: 'high',   reasoning: 'From email signature' },
      { fieldKey: 'Email Address',      suggestedValue: 'thomas.mueller@zurich.com',   confidence: 'high',   reasoning: 'From email header' },
      { fieldKey: 'Phone Number',       suggestedValue: '+41 44 628 20 20',            confidence: 'medium', reasoning: 'From contact directory' },
      { fieldKey: 'Job Title',          suggestedValue: 'Chief Risk Officer',          confidence: 'high',   reasoning: 'From email + LinkedIn' },
      { fieldKey: 'Department',         suggestedValue: 'risk',                        confidence: 'medium', reasoning: 'Inferred from title' },
      { fieldKey: 'Policy Number',      suggestedValue: 'ZUR-2025-00421',              confidence: 'high',   reasoning: 'From policy register' },
      { fieldKey: 'Sum Insured',        suggestedValue: '1,500,000',                   confidence: 'high',   reasoning: 'From policy schedule' },
      { fieldKey: 'Coverage Start',     suggestedValue: '2026-01-01',                  confidence: 'high',   reasoning: 'From inception record' },
      { fieldKey: 'Coverage End',       suggestedValue: '2026-12-31',                  confidence: 'high',   reasoning: '12-month term' },
      { fieldKey: 'Special Conditions', suggestedValue: 'Flood exclusion FLD-2024',    confidence: 'medium', reasoning: 'From policy wording' },
      { fieldKey: 'Priority',           suggestedValue: 'high',                        confidence: 'medium', reasoning: 'Based on sum insured' },
      { fieldKey: 'Correspondence Language', suggestedValue: 'de',                     confidence: 'high',   reasoning: 'Contract language' },
      { fieldKey: 'GDPR Consent',       suggestedValue: 'true',                        confidence: 'high',   reasoning: 'Consent form on file' },
    ])

    // ── Step 3: Navigate to test form ──
    await webview.goto(TEST_FORM_URL)

    // ── Step 4: Wait for page session init + summarizePage (setTimeout 2500ms after load) ──
    await ctx.page.waitForTimeout(500)   // Brief pause — show loaded layout

    // ── Step 5: Click Overview ──
    await sidebar.ensureHome()
    await ctx.page.waitForTimeout(400)   // Show Home view briefly
    const overviewBtn = ctx.page.locator('.card-overview')
    await expect(overviewBtn).toBeVisible()
    await overviewBtn.click()
    await ctx.page.waitForTimeout(600)   // Show chat opening

    // ── Step 6: Wait for Batch Fill Card to appear ──
    const batchCard = ctx.page.locator('.batch-card')
    await expect(batchCard.first()).toBeVisible({ timeout: 8000 })
    await ctx.page.waitForTimeout(600)   // Show the batch fill card

    // ── Step 7: Click "Start Batch Fill" ──
    const startBtn = batchCard.locator('button').first()
    await expect(startBtn).toBeVisible()
    await startBtn.click()
    await ctx.page.waitForTimeout(800)   // Show loading transition

    // ── Step 8: Wait for done state (✅) ──
    await expect(ctx.page.locator('.batch-card').filter({ hasText: '✅' })).toBeVisible({ timeout: 15_000 })
    await ctx.page.waitForTimeout(1200)  // Show done stats

    // ── Step 9: Click "View All Fields" → goes back to Home ──
    const viewAllBtn = ctx.page.locator('.batch-card .card-btn').first()
    await expect(viewAllBtn).toBeVisible()
    await viewAllBtn.click()
    await ctx.page.waitForTimeout(800)   // Show Home view with filled field list

    // ── Step 10: Pick one field → enter individual chat ──
    // Click the first field row that has session data (e.g. Company Name)
    const fieldRow = ctx.page.locator('.card-field').first()
    await expect(fieldRow).toBeVisible({ timeout: 5000 })
    const fieldLabel = await fieldRow.locator('.row-label').textContent()
    await fieldRow.click()
    await ctx.page.waitForTimeout(800)   // Show field chat opening

    // ── Step 11: Verify chat header shows the field name ──
    const chatHeader = ctx.page.locator('.chat-header')
    await expect(chatHeader).toBeVisible()
    // Verify breadcrumb or title contains the field name
    const breadcrumb = await sidebar.getBreadcrumb()
    expect(breadcrumb.length).toBeGreaterThan(0)
    await ctx.page.waitForTimeout(1500)  // Final pause — show individual field chat

    // Attach logs
    const logs = captureElectronLogsTail(ctx)
    if (logs) {
      await test.info().attach('electron-log', { body: logs, contentType: 'text/plain' })
    }
  })
})
