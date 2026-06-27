/**
 * Batch Fill API — streaming batch suggestions for all form fields.
 *
 * Usage:
 *   const result = await bridge.batchFill.suggest(config, fields, structuredCtx)
 *   bridge.batchFill.onProgress(({ contentSoFar }) => updateUI(contentSoFar))
 */

import type { Transport, BatchFillAPI, ModelConfig, FieldSummary, BatchSuggestResult, FillResult } from '../types'

export function createBatchFillAPI(transport: Transport): BatchFillAPI {
  const progressCbs = new Set<(data: { contentSoFar: string }) => void>()

  if (transport.onEvent) {
    transport.onEvent('batch-fill:progress', (data: unknown) => {
      const d = data as { contentSoFar: string }
      for (const cb of progressCbs) {
        try { cb(d) } catch (e) { console.error('[ai-tip/sdk] progress callback error:', e) }
      }
    })
  }

  return {
    async suggest(config: ModelConfig, fields: FieldSummary[], structuredCtx: string): Promise<BatchSuggestResult | null> {
      return transport.invoke('batch-fill:suggest', [config, fields, structuredCtx]) as Promise<BatchSuggestResult | null>
    },

    onProgress(callback: (data: { contentSoFar: string }) => void): void {
      progressCbs.add(callback)
    },

    offProgress(callback: (data: { contentSoFar: string }) => void): void {
      progressCbs.delete(callback)
    },

    async autoFill(result: BatchSuggestResult, fields: FieldSummary[]): Promise<FillResult[]> {
      // Auto-fill high+medium confidence suggestions
      const toFill = result.suggestions.filter(
        s => s.suggestedValue && (s.confidence === 'high' || s.confidence === 'medium')
      )
      const fillResults: FillResult[] = []
      for (const s of toFill) {
        // Build minimal context for the fill operation
        const fieldMeta = fields.find(f => f.label === s.fieldKey || f.name === s.fieldKey)
        const ctx = {
          tagName: 'input', type: fieldMeta?.type ?? 'text', name: s.fieldKey, id: '',
          placeholder: fieldMeta?.placeholder ?? '', value: '', ariaLabel: '', label: s.fieldKey,
          formPurpose: 'unknown', siblingLabels: [], pageTitle: '', pageUrl: '',
          rect: { top: 0, left: 0, width: 0, height: 0 },
        }
        const r = await transport.invoke('ai-tip:fillField', [s.suggestedValue, ctx]) as FillResult
        fillResults.push(r)
      }
      return fillResults
    },
  }
}
