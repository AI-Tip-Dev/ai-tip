/**
 * @ai-tip/observability — OTLP JSON format conversion
 *
 * Converts internal SpanData to OTel JSON per:
 * https://opentelemetry.io/docs/specs/otel/protocol/
 */

import type { SpanData } from './types'

// ============================================================
// OTLP JSON Types
// ============================================================

export interface OtlpResourceSpan {
  resource: {
    attributes: Array<{ key: string; value: { stringValue: string } }>
  }
  scopeSpans: Array<{
    scope: { name: string; version?: string }
    spans: OtlpSpan[]
  }>
}

export interface OtlpSpan {
  traceId: string
  spanId: string
  parentSpanId?: string
  name: string
  kind: number
  startTimeUnixNano: string
  endTimeUnixNano: string
  attributes: Array<{
    key: string
    value: { stringValue?: string; intValue?: string; boolValue?: boolean }
  }>
  status: {
    code: number
    message?: string
  }
  events: Array<{
    name: string
    timeUnixNano: string
    attributes?: Array<{
      key: string
      value: { stringValue: string }
    }>
  }>
}

function msToNano(ms: number): string {
  return String(Math.floor(ms * 1_000_000))
}

/** Convert a single SpanData to OTel JSON format */
export function spanToOtlp(s: SpanData): OtlpSpan {
  const attrs: OtlpSpan['attributes'] = []

  const addAttr = (key: string, value: string | number | boolean) => {
    if (typeof value === 'string') {
      attrs.push({ key, value: { stringValue: value } })
    } else if (typeof value === 'number') {
      attrs.push({ key, value: { intValue: String(Math.floor(value)) } })
    } else {
      attrs.push({ key, value: { boolValue: value } })
    }
  }

  if (s.kind) addAttr('gen_ai.operation.name', s.kind)
  if (s.provider) addAttr('gen_ai.system', s.provider)
  if (s.model) addAttr('gen_ai.request.model', s.model)
  if (s.temperature !== undefined)
    addAttr('gen_ai.request.temperature', s.temperature)
  if (s.maxTokens !== undefined)
    addAttr('gen_ai.request.max_tokens', s.maxTokens)
  if (s.endpoint) addAttr('url.full', s.endpoint)
  if (s.httpStatus !== undefined)
    addAttr('http.response.status_code', s.httpStatus)
  if (s.promptTokens !== undefined)
    addAttr('gen_ai.usage.input_tokens', s.promptTokens)
  if (s.completionTokens !== undefined)
    addAttr('gen_ai.usage.output_tokens', s.completionTokens)
  if (s.totalTokens !== undefined)
    addAttr('gen_ai.usage.total_tokens', s.totalTokens)
  if (s.durationMs !== undefined) addAttr('duration_ms', s.durationMs)

  const events: OtlpSpan['events'] = s.events.map((e) => ({
    name: e.name,
    timeUnixNano: msToNano(e.timestampMs),
    attributes: e.attributes
      ? Object.entries(e.attributes).map(([k, v]) => ({
          key: k,
          value: { stringValue: String(v) },
        }))
      : undefined,
  }))

  return {
    traceId: s.traceId,
    spanId: s.spanId,
    parentSpanId: s.parentSpanId,
    name: `llm.${s.kind}`,
    kind: 1, // INTERNAL
    startTimeUnixNano: msToNano(s.startMs),
    endTimeUnixNano: msToNano(s.endMs || s.startMs),
    attributes: attrs,
    status: {
      code: s.status === 'error' ? 2 : 1,
      message: s.statusMessage,
    },
    events,
  }
}

/** Build the full OTLP resource spans payload */
export function buildOtlpPayload(
  spans: SpanData[],
  serviceName = 'ai-tip',
  serviceVersion = '1.0.0',
): { resourceSpans: OtlpResourceSpan[] } {
  return {
    resourceSpans: [
      {
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: serviceName } },
          ],
        },
        scopeSpans: [
          {
            scope: { name: serviceName, version: serviceVersion },
            spans: spans.map(spanToOtlp),
          },
        ],
      },
    ],
  }
}
