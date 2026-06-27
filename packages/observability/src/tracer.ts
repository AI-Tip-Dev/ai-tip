/**
 * @ai-tip/observability — TracerProvider
 *
 * Manages active spans and span lifecycle.
 * Storage is injected by the platform.
 */

import { TracingSpan } from './span'
import type { SpanData } from './types'
import type { TraceStorage } from './storage'

export class TracerProvider {
  private activeSpans = new Map<string, TracingSpan>()
  private storage: TraceStorage

  constructor(storage: TraceStorage) {
    this.storage = storage
  }

  /**
   * Start a new span.
   */
  startSpan(
    kind: string,
    parentSpanId?: string,
    traceId?: string,
  ): TracingSpan {
    const span = new TracingSpan(kind, parentSpanId, traceId)
    this.activeSpans.set(span.spanId, span)
    return span
  }

  /**
   * Finish a span: mark end time, persist to storage, remove from active.
   */
  finishSpan(spanId: string): SpanData | null {
    const span = this.activeSpans.get(spanId)
    if (!span) return null

    span.finish()
    const data = span.toData()
    this.storage.save(data)
    this.activeSpans.delete(spanId)
    return data
  }

  /** Get an active span by ID */
  getActiveSpan(spanId: string): TracingSpan | undefined {
    return this.activeSpans.get(spanId)
  }

  /** Get all active span IDs */
  getActiveSpanIds(): string[] {
    return Array.from(this.activeSpans.keys())
  }
}
