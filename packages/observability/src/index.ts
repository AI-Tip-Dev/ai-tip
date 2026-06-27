/**
 * @ai-tip/observability — Public API
 */

// Types
export type {
  SpanEvent,
  SpanStatus,
  SpanLogInput,
  SpanData,
  SpanLogger,
} from './types'

// Span
export { TracingSpan } from './span'

// Tracer
export { TracerProvider } from './tracer'

// Utils
export {
  generateId,
  nowMs,
  elapsed,
  sanitizeHeaders,
  truncate,
} from './utils'

// OTLP
export {
  spanToOtlp,
  buildOtlpPayload,
} from './otlp'
export type { OtlpResourceSpan, OtlpSpan } from './otlp'

// Storage
export type { TraceStorage, TraceQueryFilter, TraceExportFilter } from './storage'
export { MemoryStorage } from './storage'

// Exporter
export type { ExportResult, ExportProfile, TraceExporter } from './exporter'
export { OtlpHttpExporter } from './exporter'
