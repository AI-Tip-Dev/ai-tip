/**
 * @ai-tip/observability — TraceExporter interface + OTLP HTTP exporter
 */

import type { SpanData } from './types'
import { buildOtlpPayload } from './otlp'

// ============================================================
// Types
// ============================================================

export interface ExportResult {
  ok: boolean
  message: string
  spansExported: number
}

export interface ExportProfile {
  name: string
  endpoint: string
  authHeader?: string
}

/** Exporter interface — implemented by each platform */
export interface TraceExporter {
  export(spans: SpanData[], profile: ExportProfile): Promise<ExportResult>
}

// ============================================================
// OTLP HTTP Exporter (built-in, pure fetch)
// ============================================================

export class OtlpHttpExporter implements TraceExporter {
  async export(
    spans: SpanData[],
    profile: ExportProfile,
  ): Promise<ExportResult> {
    if (spans.length === 0) {
      return { ok: true, message: 'No spans to export', spansExported: 0 }
    }

    const payload = buildOtlpPayload(spans)
    const body = JSON.stringify(payload)

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (profile.authHeader) {
      headers['Authorization'] = profile.authHeader
    }

    try {
      const response = await fetch(profile.endpoint, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(15_000),
      })

      if (response.ok) {
        return {
          ok: true,
          message: `Exported ${spans.length} spans`,
          spansExported: spans.length,
        }
      }

      const errText = await response.text().catch(() => '')
      return {
        ok: false,
        message: `Export failed: HTTP ${response.status} — ${errText.slice(0, 150)}`,
        spansExported: 0,
      }
    } catch (err: any) {
      return {
        ok: false,
        message: `Export error: ${err.message}`,
        spansExported: 0,
      }
    }
  }
}
