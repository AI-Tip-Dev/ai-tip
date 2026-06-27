/**
 * AI Tip API — manages field selection events, field filling, and button state.
 *
 * Usage:
 *   bridge.aiTip.onFieldSelected((ctx) => showBanner(ctx))
 *   await bridge.aiTip.fillField('张三', ctx)
 *   await bridge.aiTip.highlightField(ctx)
 */

import type { Transport, AITipAPI, FieldContext, FillResult } from '../types'

export function createAITipAPI(transport: Transport): AITipAPI {
  const fieldSelectedCbs = new Set<(context: FieldContext) => void>()

  // Register for push-based field-selected events
  if (transport.onEvent) {
    transport.onEvent('ai-tip:field-selected', (data: unknown) => {
      const ctx = data as FieldContext
      for (const cb of fieldSelectedCbs) {
        try { cb(ctx) } catch (e) { console.error('[ai-tip/sdk] fieldSelected callback error:', e) }
      }
    })
  }

  return {
    onFieldSelected(callback: (context: FieldContext) => void): void {
      fieldSelectedCbs.add(callback)
    },

    offFieldSelected(callback: (context: FieldContext) => void): void {
      fieldSelectedCbs.delete(callback)
    },

    async fillField(value: string, context: FieldContext): Promise<FillResult> {
      return transport.invoke('ai-tip:fillField', [value, context]) as Promise<FillResult>
    },

    async highlightField(context: FieldContext): Promise<void> {
      return transport.invoke('ai-tip:highlightField', [context]) as Promise<void>
    },

    async setButtonState(state: 'idle' | 'loading'): Promise<void> {
      return transport.invoke('ai-tip:setButtonState', [state]) as Promise<void>
    },

    async setEnabled(enabled: boolean): Promise<void> {
      return transport.invoke('ai-tip:setEnabled', [enabled]) as Promise<void>
    },

    async isEnabled(): Promise<boolean> {
      return transport.invoke('ai-tip:isEnabled', []) as Promise<boolean>
    },
  }
}
