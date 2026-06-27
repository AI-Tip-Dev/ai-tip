/**
 * Trace API — LLM call observability and tracing.
 *
 * Usage:
 *   const detail = await bridge.trace.getDetail(spanId)
 *   const spans = await bridge.trace.list({ provider: 'openai', limit: 10 })
 *   await bridge.trace.exportTraces({ name: 'prod', endpoint: 'https://otlp.example.com' })
 */

import type { Transport, TraceAPI, TraceSpanDetail, TraceSpanSummary, TraceQueryFilter, ExportProfile } from '../types'

export function createTraceAPI(transport: Transport): TraceAPI {
  return {
    async getDetail(spanId: string): Promise<TraceSpanDetail | null> {
      return transport.invoke('trace:get', [spanId]) as Promise<TraceSpanDetail | null>
    },

    async list(filter?: TraceQueryFilter): Promise<TraceSpanSummary[]> {
      return transport.invoke('trace:list', [filter]) as Promise<TraceSpanSummary[]>
    },

    async exportTraces(profile: ExportProfile, filter?: TraceQueryFilter): Promise<{ ok: boolean; message: string }> {
      return transport.invoke('trace:export', [{ profile, filter }]) as Promise<{ ok: boolean; message: string }>
    },
  }
}
