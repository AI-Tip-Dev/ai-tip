/**
 * @ai-tip/observability — TraceStorage interface + MemoryStorage
 */

import type { SpanData } from './types'

/** Storage interface — implemented by each platform */
export interface TraceStorage {
  save(span: SpanData): void | Promise<void>
  getDetail(spanId: string): SpanData | null | Promise<SpanData | null>
  query(filter?: TraceQueryFilter): SpanData[] | Promise<SpanData[]>
  exportRange(filter?: TraceExportFilter): SpanData[] | Promise<SpanData[]>
}

export interface TraceQueryFilter {
  kind?: string
  status?: 'ok' | 'error'
  traceId?: string
  since?: number
  limit?: number
}

export interface TraceExportFilter {
  since?: number
  until?: number
  kind?: string
}

/** In-memory storage (for testing or Extension fallback) */
export class MemoryStorage implements TraceStorage {
  private spans: SpanData[] = []

  save(span: SpanData): void {
    this.spans.push(span)
    // Keep last 500
    if (this.spans.length > 500) {
      this.spans.shift()
    }
  }

  getDetail(spanId: string): SpanData | null {
    return this.spans.find((s) => s.spanId === spanId) ?? null
  }

  query(filter?: TraceQueryFilter): SpanData[] {
    let results = [...this.spans]

    if (filter?.kind) results = results.filter((s) => s.kind === filter.kind)
    if (filter?.status) results = results.filter((s) => s.status === filter.status)
    if (filter?.traceId) results = results.filter((s) => s.traceId === filter.traceId)
    if (filter?.since) results = results.filter((s) => (s.startMs || 0) >= filter.since!)

    results.sort((a, b) => (b.startMs || 0) - (a.startMs || 0))
    return results.slice(0, filter?.limit ?? 50)
  }

  exportRange(filter?: TraceExportFilter): SpanData[] {
    let results = [...this.spans]
    if (filter?.kind) results = results.filter((s) => s.kind === filter.kind)
    if (filter?.since) results = results.filter((s) => (s.startMs || 0) >= filter.since!)
    if (filter?.until) results = results.filter((s) => (s.startMs || 0) <= filter.until!)
    return results
  }
}
