/**
 * Extension Transport
 *
 * Communicates with a Chrome/Edge browser extension via `window.postMessage`.
 *
 * Protocol:
 * 1. SDK sends `__BRIDGE_PING` → content-script replies `__BRIDGE_PONG` (handshake)
 * 2. SDK sends `__BRIDGE_CALL` with { id, method, args } → content-script forwards
 *    to background service worker → returns via `__BRIDGE_RESP` or `__BRIDGE_ERR`
 *
 * Security note:
 * In production, postMessage should be restricted to a specific origin
 * rather than using '*'. The origin should be configurable.
 */

import { BaseTransport } from './base'
import { BridgeInvokeError } from '../types'

/** Pending call entry — waiting for a response from the extension */
interface PendingCall {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
  timer: ReturnType<typeof setTimeout>
}

/**
 * ExtensionTransport uses window.postMessage to communicate with
 * the browser extension's content script.
 */
export class ExtensionTransport extends BaseTransport {
  private pending = new Map<string, PendingCall>()
  private nextId = 1
  private messageHandler: ((event: MessageEvent) => void) | null = null
  private timeoutMs: number

  constructor(timeoutMs = 30000) {
    super()
    this.timeoutMs = timeoutMs
    this.setupListener()
  }

  /** Generate a unique message ID */
  private genId(): string {
    return `sdk-call-${Date.now()}-${this.nextId++}-${Math.random().toString(36).slice(2, 9)}`
  }

  /** Set up the postMessage listener for responses */
  private setupListener(): void {
    if (typeof window === 'undefined') return

    this.messageHandler = (event: MessageEvent) => {
      const data = event.data
      if (!data || typeof data !== 'object') return

      // In production, validate event.origin

      if (data.type === '__BRIDGE_RESP' && typeof data.id === 'string') {
        const pending = this.pending.get(data.id)
        if (pending) {
          clearTimeout(pending.timer)
          this.pending.delete(data.id)
          pending.resolve(data.result)
        }
      }

      if (data.type === '__BRIDGE_ERR' && typeof data.id === 'string') {
        const pending = this.pending.get(data.id)
        if (pending) {
          clearTimeout(pending.timer)
          this.pending.delete(data.id)
          const errorMsg = data.error?.message || data.error || 'Unknown extension error'
          pending.reject(new BridgeInvokeError(data.method || 'unknown', errorMsg))
        }
      }
    }

    window.addEventListener('message', this.messageHandler)
  }

  /**
   * Invoke a method via postMessage to the extension content-script.
   */
  async invoke(method: string, args: unknown[]): Promise<unknown> {
    if (typeof window === 'undefined') {
      throw new Error('ExtensionTransport requires a browser window environment.')
    }

    const id = this.genId()

    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new BridgeInvokeError(method, `Request timed out after ${this.timeoutMs}ms`))
      }, this.timeoutMs)

      this.pending.set(id, { resolve, reject, timer })

      window.postMessage(
        {
          type: '__BRIDGE_CALL',
          id,
          method,
          args,
        },
        '*' // In production, restrict to a specific origin
      )
    })
  }

  /**
   * Clean up the message listener.
   * Call this when the transport is no longer needed.
   */
  destroy(): void {
    if (this.messageHandler && typeof window !== 'undefined') {
      window.removeEventListener('message', this.messageHandler)
      this.messageHandler = null
    }

    // Reject all pending calls
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer)
      pending.reject(new Error('Transport destroyed'))
      this.pending.delete(id)
    }
  }
}
