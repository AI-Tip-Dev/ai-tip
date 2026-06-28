/**
 * Trace Handlers — observability trace management.
 */

import { MemoryStorage, type SpanData } from '@ai-tip/observability'

const traceStorage = new MemoryStorage(500)

export async function handleTraceGet(spanId: string): Promise<SpanData | null> {
  return traceStorage.get(spanId) ?? null
}

export async function handleTraceList(filter?: { provider?: string; model?: string; limit?: number }): Promise<SpanData[]> {
  let filtered = traceStorage.list()
  if (filter?.provider) filtered = filtered.filter(s => s.attributes?.provider === filter.provider)
  if (filter?.model) filtered = filtered.filter(s => s.attributes?.model === filter.model)
  filtered.sort((a, b) => b.startTime - a.startTime)
  if (filter?.limit && filter.limit > 0) filtered = filtered.slice(0, filter.limit)
  return filtered
}

export async function handleTraceExport(_filter: { endpoint: string; apiKey?: string }): Promise<{ exported: number }> {
  return { exported: 0 }
}
