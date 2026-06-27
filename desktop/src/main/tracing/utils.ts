/**
 * Tracing utility helpers — re-exports from @ai-tip/observability
 *
 * Overrides generateId() to use Node.js crypto for cryptographically
 * secure random IDs (stronger than browser crypto.randomUUID).
 */

import { randomBytes } from 'crypto'

// Re-export most utils from the shared package
export { nowMs, elapsed, sanitizeHeaders, truncate } from '@ai-tip/observability'

/** Generate an OTel-compatible 32-char hex trace/span ID using Node crypto */
export function generateId(): string {
  return randomBytes(16).toString('hex')
}
