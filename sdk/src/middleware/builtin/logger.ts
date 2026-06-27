/**
 * Built-in Logger Middleware — logs all invocations.
 *
 * Usage:
 *   import { LoggerMiddleware } from '@ai-tip/sdk/middleware'
 *   bridge.useMiddleware(new LoggerMiddleware(console))
 */

import type { Middleware, MiddlewareContext } from '../../types'
import type { SDKLogger } from '../../types'

export class LoggerMiddleware implements Middleware {
  name = 'logger'
  priority = 200 // Run late (after all others)
  private logger: SDKLogger

  constructor(logger: SDKLogger = console) {
    this.logger = logger
  }

  onRequest(ctx: MiddlewareContext): MiddlewareContext {
    this.logger.debug(`[bridge] → ${ctx.method}`, ctx.args)
    return ctx
  }

  onResponse(ctx: MiddlewareContext, result: unknown): unknown {
    this.logger.debug(`[bridge] ← ${ctx.method}`, typeof result === 'object' ? 'OK' : String(result).slice(0, 100))
    return result
  }

  onError(ctx: MiddlewareContext, error: Error): Error {
    this.logger.error(`[bridge] ✗ ${ctx.method}:`, error.message)
    return error
  }
}
