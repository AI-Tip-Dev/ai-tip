/**
 * Electron Transport
 *
 * Reads `window.__bridge__` exposed by Electron's preload script via `contextBridge`.
 * This transport is the fastest — no async handshake, no message serialization overhead.
 *
 * The `window.__bridge__` object is expected to match the BridgeAPI structure,
 * with each API method being a function that accepts the same arguments and
 * returns a Promise.
 */

import { BaseTransport } from './base'
import type { BridgeAPI } from '../types'

/** Shape of the __bridge__ object exposed by Electron preload */
type ElectronBridge = BridgeAPI

/**
 * ElectronTransport wraps the `window.__bridge__` object and maps
 * method calls to the corresponding preload-exposed API.
 */
export class ElectronTransport extends BaseTransport {
  private bridge: ElectronBridge

  constructor(bridge: ElectronBridge) {
    super()
    this.bridge = bridge
  }

  /**
   * Route a method call through to the preload API.
   *
   * Method naming convention: `domain:method`, e.g. `fs:readFile`, `clipboard:write`.
   * This maps to `bridge.fs.readFile(...)`, `bridge.clipboard.write(...)`, etc.
   */
  async invoke(method: string, args: unknown[]): Promise<unknown> {
    const [domain, action] = method.split(':')

    if (!domain || !action) {
      throw new Error(`Invalid method format: "${method}". Expected "domain:action".`)
    }

    const api = (this.bridge as unknown as Record<string, unknown>)[domain]
    if (!api || typeof api !== 'object') {
      throw new Error(`Unknown API domain: "${domain}". Available: fs, clipboard, notification, system.`)
    }

    const fn = (api as Record<string, unknown>)[action]
    if (typeof fn !== 'function') {
      throw new Error(`Unknown action "${action}" on API domain "${domain}".`)
    }

    return (fn as (...a: unknown[]) => unknown)(...args)
  }

  /** Access the underlying bridge meta directly */
  get meta() {
    return this.bridge.meta
  }
}

/**
 * Get the Electron bridge from the window object.
 * Returns null if not in an Electron environment.
 */
export function getElectronBridge(): ElectronBridge | null {
  if (typeof window === 'undefined') return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bridge = (window as any).__bridge__
  if (!bridge) return null
  return bridge as ElectronBridge
}
