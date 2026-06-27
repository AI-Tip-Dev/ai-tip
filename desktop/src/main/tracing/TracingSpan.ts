/**
 * TracingSpan — Desktop-specific thin wrapper around @ai-tip/observability
 *
 * Wires electron-log for the span log() bridge.
 */

import log from 'electron-log'
import {
  TracingSpan as BaseTracingSpan,
} from '@ai-tip/observability'
import type {
  SpanEvent,
  SpanStatus,
  SpanLogInput,
  SpanData,
} from '@ai-tip/observability'

// Re-export types used by other tracing modules
export type { SpanEvent, SpanStatus, SpanLogInput, SpanData }

/**
 * Desktop-specific TracingSpan that wires electron-log.
 */
export class TracingSpan {
  private _span: BaseTracingSpan

  constructor(
    kind: string,
    parentSpanId?: string,
    traceId?: string,
  ) {
    const scopedLogger = log.scope(`trace.${kind}`)
    this._span = new BaseTracingSpan(kind, parentSpanId, traceId, {
      debug: (msg: string) => scopedLogger.debug(msg),
      info: (msg: string) => scopedLogger.info(msg),
      warn: (msg: string) => scopedLogger.warn(msg),
      error: (msg: string) => scopedLogger.error(msg),
    })
  }

  // Delegate all accessors to the base span

  get traceId(): string { return this._span.traceId }
  get spanId(): string { return this._span.spanId }
  get parentSpanId(): string | undefined { return this._span.parentSpanId }
  get kind(): string { return this._span.kind }
  get startMs(): number { return this._span.startMs }
  get status(): SpanStatus { return this._span.status }
  get statusMessage(): string | undefined { return this._span.statusMessage }

  get provider(): string | undefined { return this._span.provider }
  set provider(v: string | undefined) { this._span.provider = v }
  get model(): string | undefined { return this._span.model }
  set model(v: string | undefined) { this._span.model = v }
  get temperature(): number | undefined { return this._span.temperature }
  set temperature(v: number | undefined) { this._span.temperature = v }
  get maxTokens(): number | undefined { return this._span.maxTokens }
  set maxTokens(v: number | undefined) { this._span.maxTokens = v }
  get endpoint(): string | undefined { return this._span.endpoint }
  set endpoint(v: string | undefined) { this._span.endpoint = v }
  get httpStatus(): number | undefined { return this._span.httpStatus }
  set httpStatus(v: number | undefined) { this._span.httpStatus = v }
  get httpMethod(): string | undefined { return this._span.httpMethod }
  set httpMethod(v: string | undefined) { this._span.httpMethod = v }
  get promptTokens(): number | undefined { return this._span.promptTokens }
  set promptTokens(v: number | undefined) { this._span.promptTokens = v }
  get completionTokens(): number | undefined { return this._span.completionTokens }
  set completionTokens(v: number | undefined) { this._span.completionTokens = v }
  get totalTokens(): number | undefined { return this._span.totalTokens }
  set totalTokens(v: number | undefined) { this._span.totalTokens = v }
  get requestBody(): string | undefined { return this._span.requestBody }
  set requestBody(v: string | undefined) { this._span.requestBody = v }
  get responseBody(): string | undefined { return this._span.responseBody }
  set responseBody(v: string | undefined) { this._span.responseBody = v }
  get attempt(): number | undefined { return this._span.attempt }
  set attempt(v: number | undefined) { this._span.attempt = v }
  get maxRetries(): number | undefined { return this._span.maxRetries }
  set maxRetries(v: number | undefined) { this._span.maxRetries = v }
  get requestHeaders(): Record<string, string> | undefined { return this._span.requestHeaders }
  set requestHeaders(v: Record<string, string> | undefined) { this._span.requestHeaders = v }
  get attributes(): Record<string, string | number | boolean> | undefined { return this._span.attributes }
  set attributes(v: Record<string, string | number | boolean> | undefined) { this._span.attributes = v }

  setOk(message?: string): void { this._span.setOk(message) }
  setError(message: string): void { this._span.setError(message) }
  addEvent(name: string, attrs?: Record<string, string | number | boolean>): void { this._span.addEvent(name, attrs) }
  log(level: SpanLogInput['level'], message: string): void { this._span.log(level, message) }
  setRequestHeaders(headers: Record<string, string>): void { this._span.setRequestHeaders(headers) }
  finish(): void { this._span.finish() }
  toData(): SpanData { return this._span.toData() }
}
