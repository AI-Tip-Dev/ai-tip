/**
 * Built-in Retry Middleware — retries failed invocations with exponential backoff.
 *
 * Usage:
 *   import { RetryMiddleware } from '@ai-tip/sdk/middleware'
 *   bridge.useMiddleware(new RetryMiddleware({ maxRetries: 3, baseDelayMs: 1000 }))
 */

import type { Middleware, MiddlewareContext } from '../../types'

export interface RetryOptions {
  /** Maximum retry attempts (default: 3) */
  maxRetries?: number
  /** Base delay in ms (default: 1000) */
  baseDelayMs?: number
  /** Maximum delay cap in ms (default: 10000) */
  maxDelayMs?: number
  /** HTTP status codes that should trigger a retry (default: 429, 500, 502, 503, 504) */
  retryableStatuses?: number[]
  /** Custom shouldRetry function */
  shouldRetry?: (error: Error, attempt: number) => boolean
}

const DEFAULT_RETRYABLE = [429, 500, 502, 503, 504]

export class RetryMiddleware implements Middleware {
  name = 'retry'
  priority = 50 // Run early
  private options: Required<Omit<RetryOptions, 'shouldRetry'>> & { shouldRetry?: RetryOptions['shouldRetry'] }

  constructor(options: RetryOptions = {}) {
    this.options = {
      maxRetries: options.maxRetries ?? 3,
      baseDelayMs: options.baseDelayMs ?? 1000,
      maxDelayMs: options.maxDelayMs ?? 10000,
      retryableStatuses: options.retryableStatuses ?? DEFAULT_RETRYABLE,
      shouldRetry: options.shouldRetry,
    }
  }

  async onError(ctx: MiddlewareContext, error: Error): Promise<Error> {
    const attempt = (ctx as MiddlewareContext & { _retryAttempt?: number })._retryAttempt ?? 0

    if (attempt >= this.options.maxRetries) return error

    const shouldRetry = this.options.shouldRetry
      ? this.options.shouldRetry(error, attempt)
      : this.isRetryableError(error)

    if (!shouldRetry) return error

    // Calculate delay with exponential backoff + jitter
    const delay = Math.min(
      this.options.baseDelayMs * Math.pow(2, attempt) * (0.5 + Math.random() * 0.5),
      this.options.maxDelayMs
    )

    await new Promise(resolve => setTimeout(resolve, delay))

    // Retry the original invoke
    try {
      const result = await ctx.transport.invoke(ctx.method, ctx.args)
      // Success — throw a special marker to signal the pipeline to use this result
      throw new RetrySuccessError(result)
    } catch (e) {
      if (e instanceof RetrySuccessError) throw e
      // Recurse with incremented attempt
      const nextCtx = { ...ctx, _retryAttempt: attempt + 1 }
      return this.onError(nextCtx, e instanceof Error ? e : new Error(String(e)))
    }
  }

  private isRetryableError(error: Error): boolean {
    const msg = error.message || ''
    // Check for retryable HTTP statuses in error message
    for (const status of this.options.retryableStatuses) {
      if (msg.includes(String(status))) return true
    }
    // Common network errors
    if (msg.includes('ECONNRESET') || msg.includes('ETIMEDOUT') || msg.includes('ENOTFOUND')) return true
    if (msg.includes('fetch failed') || msg.includes('network error')) return true
    return false
  }
}

/** Internal marker to signal successful retry */
class RetrySuccessError extends Error {
  public readonly result: unknown
  constructor(result: unknown) {
    super('__RETRY_SUCCESS__')
    this.result = result
  }
}
