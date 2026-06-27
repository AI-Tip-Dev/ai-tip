/**
 * @ai-tip/observability — Shared tracing types
 */

export interface SpanEvent {
  name: string
  timestampMs: number
  attributes?: Record<string, string | number | boolean>
}

export type SpanStatus = 'ok' | 'error' | 'unset'

export interface SpanLogInput {
  level: 'info' | 'debug' | 'warn' | 'error'
  message: string
  timestampMs: number
}

export interface SpanData {
  // OTel identifiers
  traceId: string
  spanId: string
  parentSpanId?: string

  // LLM / GenAI attributes
  kind: string
  provider?: string
  model?: string
  temperature?: number
  maxTokens?: number
  endpoint?: string
  httpStatus?: number
  httpMethod?: string

  // Timing
  startMs: number
  endMs?: number
  durationMs?: number

  // Token usage
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number

  // Status
  status: SpanStatus
  statusMessage?: string

  // Phase events (pipeline stages)
  events: SpanEvent[]

  // Bridged log events
  logs: SpanLogInput[]

  // Full request/response (local only, never exported)
  requestBody?: string
  responseBody?: string

  // Retry info
  attempt?: number
  maxRetries?: number

  // Additional free-form attributes
  attributes?: Record<string, string | number | boolean>

  // Request headers (sanitized)
  requestHeaders?: Record<string, string>
}

/** Logger interface for span logging */
export interface SpanLogger {
  debug: (msg: string) => void
  info: (msg: string) => void
  warn: (msg: string) => void
  error: (msg: string) => void
}
