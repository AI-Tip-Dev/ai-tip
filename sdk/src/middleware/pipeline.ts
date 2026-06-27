/**
 * Middleware type definitions and pipeline executor.
 *
 * The pipeline wraps `transport.invoke()` with a chain of middleware
 * that can transform requests, responses, and errors.
 *
 * Execution order: onRequest (high→low priority) → transport.invoke → onResponse (low→high priority)
 * On error: onError chain fires in order, last error returned is the final error.
 */

import type { Middleware, MiddlewareContext, Transport } from '../types'

/**
 * Sort middleware by priority (lower = earlier).
 */
function sortByPriority(middlewares: Middleware[]): Middleware[] {
  return [...middlewares].sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100))
}

/**
 * Create a pipeline that wraps the transport.
 * Returns a new Transport whose invoke() runs through all middleware.
 */
export function createPipeline(transport: Transport, middlewares: Middleware[]): Transport {
  const sorted = sortByPriority(middlewares)

  return {
    invoke: async (method: string, args: unknown[]): Promise<unknown> => {
      let ctx: MiddlewareContext = { method, args, transport, meta: { version: '0', env: 'unknown' } }

      // 1. Run onRequest forward (higher priority first)
      for (const mw of sorted) {
        if (mw.onRequest) {
          ctx = await mw.onRequest(ctx)
        }
      }

      // 2. Call transport
      let result: unknown
      try {
        result = await transport.invoke(ctx.method, ctx.args)
      } catch (error) {
        // 3. Run onError chain
        let err = error instanceof Error ? error : new Error(String(error))
        for (const mw of sorted) {
          if (mw.onError) {
            err = await mw.onError(ctx, err)
          }
        }
        throw err
      }

      // 4. Run onResponse backward (lower priority = later, so reverse)
      for (let i = sorted.length - 1; i >= 0; i--) {
        const mw = sorted[i]
        if (mw.onResponse) {
          result = await mw.onResponse(ctx, result)
        }
      }

      return result
    },

    onEvent: transport.onEvent
      ? (event: string, callback: (data: unknown) => void) => transport.onEvent!(event, callback)
      : undefined,

    offEvent: transport.offEvent
      ? (event: string, callback: (data: unknown) => void) => transport.offEvent!(event, callback)
      : undefined,
  }
}
