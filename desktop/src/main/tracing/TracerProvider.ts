/**
 * TracerProvider — manages active spans and span lifecycle
 *
 * Provides a lightweight alternative to @opentelemetry/sdk-node.
 * Uses AsyncLocalStorage-like pattern with a global Map of active spans.
 */

import { TracingSpan } from './TracingSpan'
import { getTraceStore } from './TraceStore'
import log from 'electron-log'

const logger = log.scope('tracer-provider')

// ============================================================
// Active span tracking
// ============================================================

/** Map of spanId → active TracingSpan */
const activeSpans = new Map<string, TracingSpan>()

/**
 * Start a new span. Returns the span object.
 * If `parentSpanId` is provided, the span will be linked to parent.
 */
export function startSpan(
  kind: string,
  parentSpanId?: string,
  traceId?: string
): TracingSpan {
  const span = new TracingSpan(kind, parentSpanId, traceId)
  activeSpans.set(span.spanId, span)
  return span
}

/**
 * Finish a span: mark end time, persist to TraceStore, remove from active.
 * Returns the serialized SpanData.
 */
export function finishSpan(spanId: string) {
  const span = activeSpans.get(spanId)
  if (!span) {
    logger.warn(`finishSpan: span ${spanId} not found`)
    return null
  }

  span.finish()
  const data = span.toData()
  getTraceStore().save(data)
  activeSpans.delete(spanId)
  return data
}

/**
 * Get the currently active span by ID.
 */
export function getActiveSpan(spanId: string): TracingSpan | undefined {
  return activeSpans.get(spanId)
}

/**
 * Get all active span IDs.
 */
export function getActiveSpanIds(): string[] {
  return Array.from(activeSpans.keys())
}
