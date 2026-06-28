/**
 * Content Script — WXT Entrypoint
 *
 * Injected into every HTTPS page in ISOLATED world.
 * Equivalent of Desktop's webview-preload.
 *
 * Responsibilities:
 *   1. postMessage bridge (PING/PONG/CALL/RESP/ERR)
 *   2. DOM form detection (via @lib/content-script/scanner)
 *   3. AI Tip button injection on form fields
 *   4. Field fill operations (value setter + event dispatch)
 *   5. Page summary collection
 *   6. Relay messages between page and Background SW
 */

import { initBridge } from '@/lib/content-script/bridge'
import { scanFields, buildAXTree } from '@/lib/content-script/scanner'
import { injectButtons, removeButtons } from '@/lib/content-script/button-inject'
import { fillFieldValue } from '@/lib/content-script/field-fill'
import { collectPageSummary } from '@/lib/content-script/page-summary'

export default defineContentScript({
  matches: ['https://*/*', 'http://localhost/*'],
  runAt: 'document_idle',
  world: 'ISOLATED',

  main() {
    // ── State ──
    let aiTipEnabled = true
    let detectedFields: Array<{
      label: string; type: string; required: boolean; value: string
      name?: string; id?: string; placeholder?: string
      rect?: { x: number; y: number; width: number; height: number }
    }> = []

    // ── Bridge Setup ──
    const bridge = initBridge()

    // ── Handle bridge calls ──
    bridge.onCall(async (method, args) => {
      switch (method) {
        case 'form-detect:scan':
          detectedFields = scanFields()
          return { fields: detectedFields }

        case 'form-detect:buildAXTree':
          return buildAXTree()

        case 'ai-tip:setEnabled':
          aiTipEnabled = args[0] as boolean
          aiTipEnabled ? injectButtons(detectedFields, bridge) : removeButtons()
          return { enabled: aiTipEnabled }

        case 'ai-tip:getEnabled':
          return { enabled: aiTipEnabled }

        case 'ai-tip:rescan':
          detectedFields = scanFields()
          if (aiTipEnabled) { removeButtons(); injectButtons(detectedFields, bridge) }
          return { fields: detectedFields }

        case 'ai-tip:fillField': {
          const ctx = args[0] as { label?: string; name?: string; id?: string; placeholder?: string }
          return fillFieldValue(ctx, args[1] as string)
        }

        case 'ai-tip:highlightField': {
          const ctx = args[0] as { label?: string; name?: string; id?: string; placeholder?: string }
          highlightField(ctx)
          return { success: true }
        }

        case 'ai-tip:clearSelection':
          clearHighlights()
          return { success: true }

        case 'page-summary:collect':
          return collectPageSummary()

        default:
          console.warn('[cs] Unknown method:', method)
          return null
      }
    })

    // ── Initial scan ──
    setTimeout(() => {
      detectedFields = scanFields()
      if (aiTipEnabled) injectButtons(detectedFields, bridge)
    }, 1500)

    // ── Re-scan on DOM changes ──
    const observer = new MutationObserver(() => {
      const newFields = scanFields()
      const newCount = newFields.length
      const oldCount = detectedFields.length
      if (Math.abs(newCount - oldCount) > 2 || newCount !== oldCount) {
        detectedFields = newFields
        if (aiTipEnabled) { removeButtons(); injectButtons(detectedFields, bridge) }
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })

    console.log('[cs] Content script initialized')
  },
})

// ── Highlight helpers ──

function highlightField(ctx: { label?: string; name?: string; id?: string; placeholder?: string }): void {
  clearHighlights()
  let el: Element | null = null
  if (ctx.id) el = document.getElementById(ctx.id)
  else if (ctx.name) el = document.querySelector(`input[name="${CSS.escape(ctx.name)}"], textarea[name="${CSS.escape(ctx.name)}"], select[name="${CSS.escape(ctx.name)}"]`)
  else if (ctx.label) {
    const labelEl = Array.from(document.querySelectorAll('label')).find(l => l.textContent?.trim() === ctx.label)
    if (labelEl) {
      const forAttr = labelEl.getAttribute('for')
      if (forAttr) el = document.getElementById(forAttr)
      else el = labelEl.querySelector('input, textarea, select')
    }
  }
  if (el) el.classList.add('ai-tip-highlight')
}

function clearHighlights(): void {
  document.querySelectorAll('.ai-tip-highlight').forEach(el => el.classList.remove('ai-tip-highlight'))
}
