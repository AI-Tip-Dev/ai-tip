/**
 * useAITip — thin Vue glue layer for AI Tip Button interaction.
 *
 * The AI Tip button itself is injected by the SDK IIFE bundle (auto.ts)
 * via a <script> tag in useWebview.ts. This composable only:
 *
 * 1. Listens for ipc-message events (ai-tip:field-selected) from the
 *    injected SDK → exposes fieldSelected / lastFieldContext refs.
 * 2. Provides fillField / highlightField / setState wrappers that call
 *    window.__aiTipSDK__.* in the webview via executeJavaScript.
 *
 * No inline script strings — all DOM logic lives in @ai-tip/sdk auto.ts.
 */

import { ref, type Ref } from 'vue'
import log from 'electron-log/renderer'
import type { FieldContext } from '@ai-tip/sdk'
import { IPC_AI_TIP_FIELD_SELECTED } from '../../../shared/ipc-channels'

// ================================================================
// Event types
// ================================================================

export interface FieldSelectedEvent {
  type: 'field-selected'
  context: FieldContext
}

export interface FillResult {
  ok: boolean
  reason?: string
  label?: string
  error?: string
  stack?: string
}

// ================================================================
// SDK global API — called via executeJavaScript in the webview
// ================================================================

/** Call window.__aiTipSDK__.fillField(value, ctx) in webview context */
function buildFillScript(value: string, ctx: FieldContext): string {
  return `window.__aiTipSDK__.fillField(${JSON.stringify(value)},${JSON.stringify(ctx)})`
}

/** Call window.__aiTipSDK__.highlightField(ctx) in webview context */
function buildHighlightScript(ctx: FieldContext): string {
  return `window.__aiTipSDK__.highlightField(${JSON.stringify(ctx)})`
}

/** Call window.__aiTipSDK__.setButtonState(state) in webview context */
function buildSetStateScript(state: 'idle' | 'loading'): string {
  return `window.__aiTipSDK__.setButtonState(${JSON.stringify(state)})`
}

// ================================================================
// Composable
// ================================================================

const CH_TIP = IPC_AI_TIP_FIELD_SELECTED

export function useAITip(webviewRef: Ref<HTMLElement | null>): {
  isEnabled: Ref<boolean>
  fieldSelected: Ref<FieldContext | null>
  lastFieldContext: Ref<FieldContext | null>
  toggle: () => void
  /** @deprecated SDK IIFE auto-injects; kept for API compatibility */
  inject: () => Promise<void>
  setup: () => void
  clearSelection: () => void
  fillField: (value: string, fieldContext?: FieldContext | null) => Promise<FillResult>
  setState: (state: 'idle' | 'loading') => Promise<void>
  highlightField: (fieldContext?: FieldContext | null) => Promise<void>
} {
  const isEnabled = ref(true)
  const fieldSelected = ref<FieldContext | null>(null)
  const lastFieldContext = ref<FieldContext | null>(null)
  let listenerAttached = false

  function getWebview(): Electron.WebviewTag | null {
    return webviewRef.value as unknown as Electron.WebviewTag | null
  }

  /** Handle ipc-message events from webview (sent by SDK auto.ts via sendToHost) */
  function handleIpcMessage(e: any): void {
    const channel: string = e.channel || ''

    if (channel === CH_TIP) {
      try {
        const data = e.args[0] as FieldSelectedEvent
        if (data && data.type === 'field-selected') {
          log.debug('AI Tip: field selected —', data.context?.label || data.context?.placeholder)
          lastFieldContext.value = data.context
          fieldSelected.value = data.context
        }
      } catch (err) {
        log.error('AI Tip: failed to parse field-selected message:', err)
      }
    }
  }

  /** Attach ipc-message listener to webview (call once after mount) */
  function setup(): void {
    if (listenerAttached) return
    const wv = getWebview()
    if (!wv) {
      log.warn('AI Tip: webview not available for ipc-message listener')
      return
    }
    wv.addEventListener('ipc-message', handleIpcMessage)
    listenerAttached = true
    log.debug('AI Tip: ipc-message listener ready')
  }

  /**
   * @deprecated The SDK IIFE (auto.ts) is injected via <script> tag by
   * useWebview.ts on did-finish-load. This method exists only for API
   * compatibility and is a no-op.
   */
  async function inject(): Promise<void> {
    // No-op: SDK IIFE is injected by useWebview.ts via <script> tag
  }

  /** Toggle AI Tip on/off */
  function toggle(): void {
    isEnabled.value = !isEnabled.value
    if (!isEnabled.value) {
      // Remove the button from the webview via SDK
      const wv = getWebview()
      if (wv) {
        wv.executeJavaScript(`
          (function(){
            var btn = document.getElementById('__ai_tip_btn__');
            if(btn) btn.remove();
          })()
        `).catch(() => {})
      }
    }
  }

  function clearSelection(): void {
    fieldSelected.value = null
  }

  /**
   * Fill a value into the target field in the webview.
   * Delegates to window.__aiTipSDK__.fillField() in the injected SDK.
   */
  async function fillField(value: string, fieldContext?: FieldContext | null): Promise<FillResult> {
    const wv = getWebview()
    if (!wv) return { ok: false, reason: 'webview not available' }
    const ctx = fieldContext || lastFieldContext.value
    if (!ctx) return { ok: false, reason: 'no field context' }

    try {
      const script = buildFillScript(value, ctx)
      const result: FillResult = await wv.executeJavaScript(script)
      if (result && result.ok) {
        log.info('useAITip: fillField succeeded for', ctx.label || ctx.name)
      } else {
        log.warn('useAITip: fillField failed:', result?.reason, ctx.label || ctx.name)
      }
      return result || { ok: false, reason: 'no result' }
    } catch (e) {
      log.error('useAITip: fillField executeJavaScript error:', e)
      return { ok: false, reason: 'executeJavaScript error', error: String(e) }
    }
  }

  /** Set the AI Tip button visual state (idle/loading) */
  async function setState(state: 'idle' | 'loading'): Promise<void> {
    const wv = getWebview()
    if (!wv) return
    const script = buildSetStateScript(state)
    await wv.executeJavaScript(script).catch(() => {})
  }

  /** Highlight a field in the webview with a purple glow */
  async function highlightField(fieldContext?: FieldContext | null): Promise<void> {
    const wv = getWebview()
    if (!wv) return
    const ctx = fieldContext || lastFieldContext.value
    if (!ctx) return

    const script = buildHighlightScript(ctx)
    await wv.executeJavaScript(script).catch(() => {})
  }

  return {
    isEnabled,
    fieldSelected,
    lastFieldContext,
    toggle,
    inject,
    setup,
    clearSelection,
    fillField,
    setState,
    highlightField,
  }
}
