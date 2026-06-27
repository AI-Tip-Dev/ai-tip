/**
 * OtlpExporter — Export local spans to OTLP/HTTP targets
 *
 * Supports:
 *   - LangFuse:  POST https://cloud.langfuse.com/api/public/otel/v1/traces
 *   - Aspire Dashboard: POST http://localhost:4318/v1/traces
 *
 * Uses shared OTLP formatting from @ai-tip/observability.
 */

import log from 'electron-log'
import type { SpanData } from './TracingSpan'
import type { ExportProfile } from '@ai-tip/sdk'
import {
  buildOtlpPayload,
} from '@ai-tip/observability'

const logger = log.scope('otlp-exporter')

// ============================================================
// Types
// ============================================================

export interface ExportResult {
  ok: boolean
  message: string
  spansExported: number
}

// ============================================================
// Export
// ============================================================

export async function exportSpans(
  spans: SpanData[],
  profile: ExportProfile
): Promise<ExportResult> {
  if (spans.length === 0) {
    return { ok: true, message: 'No spans to export', spansExported: 0 }
  }

  const body = JSON.stringify(buildOtlpPayload(spans, 'electron-ai-sidebar'))

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
      logger.info(
        `Exported ${spans.length} spans to ${profile.name} (${profile.endpoint})`
      )
      return {
        ok: true,
        message: `Exported ${spans.length} spans`,
        spansExported: spans.length,
      }
    }

    const errText = await response.text().catch(() => '')
    logger.error(
      `Export to ${profile.name} failed: HTTP ${response.status} ${errText.slice(0, 300)}`
    )
    return {
      ok: false,
      message: `Export failed: HTTP ${response.status} — ${errText.slice(0, 150)}`,
      spansExported: 0,
    }
  } catch (err: any) {
    logger.error(`Export to ${profile.name} error: ${err.message}`)
    return {
      ok: false,
      message: `Export error: ${err.message}`,
      spansExported: 0,
    }
  }
}
