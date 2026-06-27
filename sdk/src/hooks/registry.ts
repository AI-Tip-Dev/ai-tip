/**
 * Hook registry — manages lifecycle hook subscriptions.
 */

import type { HookName, HookHandler, HookPayloadMap } from '../types'

export class HookRegistry {
  private handlers = new Map<HookName, Set<HookHandler<HookName>>>()

  on<T extends HookName>(name: T, handler: HookHandler<T>): void {
    if (!this.handlers.has(name)) {
      this.handlers.set(name, new Set())
    }
    this.handlers.get(name)!.add(handler as HookHandler<HookName>)
  }

  off<T extends HookName>(name: T, handler: HookHandler<T>): void {
    this.handlers.get(name)?.delete(handler as HookHandler<HookName>)
  }

  async trigger<T extends HookName>(name: T, payload: HookPayloadMap[T]): Promise<void> {
    const handlers = this.handlers.get(name)
    if (!handlers || handlers.size === 0) return

    const promises: Promise<void>[] = []
    for (const handler of handlers) {
      try {
        const result = (handler as HookHandler<T>)(payload)
        if (result instanceof Promise) promises.push(result)
      } catch (e) {
        console.error(`[ai-tip/sdk] Hook "${name}" handler error:`, e)
      }
    }
    await Promise.allSettled(promises)
  }

  clear(): void {
    this.handlers.clear()
  }
}
