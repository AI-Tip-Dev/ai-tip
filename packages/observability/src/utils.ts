/**
 * @ai-tip/observability — Platform-agnostic utility helpers
 */

/** Generate an OTel-compatible 32-char hex trace/span ID */
export function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, '')
  }
  // Fallback
  return Math.random().toString(16).slice(2) + Date.now().toString(16)
}

/** High-resolution monotonic timestamp (ms since epoch) */
export function nowMs(): number {
  return Date.now()
}

/** Elapsed time in ms from a start timestamp */
export function elapsed(startMs: number): number {
  return nowMs() - startMs
}

/**
 * Sanitize headers object — mask API keys for safe logging/export.
 */
export function sanitizeHeaders(
  headers: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(headers)) {
    const lower = k.toLowerCase()
    if (
      lower === 'authorization' ||
      lower === 'x-api-key' ||
      lower === 'api-key'
    ) {
      if (v.startsWith('Bearer ') && v.length > 20) {
        out[k] = `Bearer ${v.slice(7, 11)}****${v.slice(-4)}`
      } else if (v.length > 8) {
        out[k] = `${v.slice(0, 4)}****${v.slice(-4)}`
      } else {
        out[k] = '***'
      }
    } else {
      out[k] = v
    }
  }
  return out
}

/**
 * Truncate a string for safe logging.
 */
export function truncate(str: string, maxLen = 500): string {
  if (str.length <= maxLen) return str
  const half = Math.floor((maxLen - 3) / 2)
  return str.slice(0, half) + '...' + str.slice(-half)
}
