/**
 * @ai-tip/observability — OTel-compatible TracingSpan
 *
 * Platform-agnostic span. Accepts an optional SpanLogger.
 * Desktop wires electron-log; Extension wires console or custom.
 */

import { generateId, nowMs, sanitizeHeaders } from './utils'
import type {
  SpanEvent,
  SpanStatus,
  SpanLogInput,
  SpanData,
  SpanLogger,
} from './types'

export class TracingSpan {
  readonly traceId: string
  readonly spanId: string
  readonly parentSpanId?: string
  readonly kind: string
  readonly startMs: number

  private _status: SpanStatus = 'unset'
  private _statusMessage?: string
  private _endMs?: number
  private _events: SpanEvent[] = []
  private _logs: SpanLogInput[] = []

  // LLM attributes
  provider?: string
  model?: string
  temperature?: number
  maxTokens?: number
  endpoint?: string
  httpStatus?: number
  httpMethod?: string
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  requestBody?: string
  responseBody?: string
  attempt?: number
  maxRetries?: number
  requestHeaders?: Record<string, string>
  attributes?: Record<string, string | number | boolean>

  /** Optional logger — platform-specific */
  private _logger?: SpanLogger

  constructor(
    kind: string,
    parentSpanId?: string,
    traceId?: string,
    logger?: SpanLogger,
  ) {
    this.traceId = traceId || generateId()
    this.spanId = generateId()
    this.parentSpanId = parentSpanId
    this.kind = kind
    this.startMs = nowMs()
    this._logger = logger
  }

  // ── Status ──

  setOk(message?: string): void {
    this._status = 'ok'
    this._statusMessage = message
  }

  setError(message: string): void {
    this._status = 'error'
    this._statusMessage = message
  }

  get status(): SpanStatus {
    return this._status
  }

  get statusMessage(): string | undefined {
    return this._statusMessage
  }

  // ── Events ──

  addEvent(
    name: string,
    attrs?: Record<string, string | number | boolean>,
  ): void {
    this._events.push({
      name,
      timestampMs: nowMs(),
      attributes: attrs,
    })
  }

  // ── Log bridge ──

  /**
   * Log a message — writes to the platform logger AND records as a span event.
   */
  log(level: SpanLogInput['level'], message: string): void {
    const ts = nowMs()
    this._logs.push({ level, message, timestampMs: ts })

    if (this._logger) {
      const scoped = `[${this.spanId.slice(0, 8)}] ${message}`
      switch (level) {
        case 'debug':
          this._logger.debug(scoped)
          break
        case 'info':
          this._logger.info(scoped)
          break
        case 'warn':
          this._logger.warn(scoped)
          break
        case 'error':
          this._logger.error(scoped)
          break
      }
    }
  }

  // ── Set request headers (auto-sanitized) ──

  setRequestHeaders(headers: Record<string, string>): void {
    this.requestHeaders = sanitizeHeaders(headers)
  }

  // ── Finish ──

  finish(): void {
    this._endMs = nowMs()
    if (this._status === 'unset') {
      this._status = 'ok'
    }
  }

  // ── Serialize ──

  toData(): SpanData {
    const endMs = this._endMs || nowMs()
    return {
      traceId: this.traceId,
      spanId: this.spanId,
      parentSpanId: this.parentSpanId,
      kind: this.kind,
      provider: this.provider,
      model: this.model,
      temperature: this.temperature,
      maxTokens: this.maxTokens,
      endpoint: this.endpoint,
      httpStatus: this.httpStatus,
      httpMethod: this.httpMethod,
      startMs: this.startMs,
      endMs,
      durationMs: endMs - this.startMs,
      promptTokens: this.promptTokens,
      completionTokens: this.completionTokens,
      totalTokens: this.totalTokens,
      status: this._status,
      statusMessage: this._statusMessage,
      events: [...this._events],
      logs: [...this._logs],
      requestBody: this.requestBody || undefined,
      responseBody: this.responseBody || undefined,
      attempt: this.attempt,
      maxRetries: this.maxRetries,
      attributes: this.attributes,
      requestHeaders: this.requestHeaders,
    }
  }
}
