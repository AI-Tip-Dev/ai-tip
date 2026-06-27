/**
 * Environment detection utilities for the SDK.
 *
 * Determines which transport to use based on what's available
 * in the current runtime environment.
 */

import type { BridgeEnv } from '../types'

/** Result of environment detection */
export interface EnvDetectionResult {
  /** Detected environment type */
  env: BridgeEnv
  /** Human-readable description of the detection logic */
  reason: string
}

/**
 * Check if we're running inside an Electron renderer process
 * where preload has exposed `window.__bridge__`.
 */
export function hasElectronBridge(): boolean {
  if (typeof window === 'undefined') return false
  // Electron preload script exposes __bridge__ via contextBridge
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return !!(window as any).__bridge__
}

/**
 * Global flag used by Extension transport to signal successful handshake.
 * The ExtensionTransport sets this to true after a successful PING/PONG.
 */
let _extensionHandshakeComplete = false

/** Mark the extension handshake as complete */
export function markExtensionHandshakeComplete(): void {
  _extensionHandshakeComplete = true
}

/** Check if extension handshake has completed */
export function isExtensionHandshakeComplete(): boolean {
  return _extensionHandshakeComplete
}

/**
 * Perform environment detection.
 *
 * Order of checks:
 * 1. Electron — `window.__bridge__` is available (fastest, no async)
 * 2. Extension — postMessage PING/PONG handshake
 * 3. Unknown — neither available
 */
export function detectEnvSync(): EnvDetectionResult {
  if (hasElectronBridge()) {
    return { env: 'electron', reason: 'window.__bridge__ detected (Electron preload)' }
  }

  return { env: 'unknown', reason: 'No bridge transport detected' }
}

/**
 * Pings the Extension content-script via postMessage.
 * Returns true if a PONG response is received within the timeout.
 */
export function pingExtension(timeoutMs = 500): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false)

  return new Promise((resolve) => {
    const requestId = `sdk-ping-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    const timer = setTimeout(() => {
      window.removeEventListener('message', handler)
      resolve(false)
    }, timeoutMs)

    const handler = (event: MessageEvent) => {
      // In production, validate event.origin against a known whitelist
      if (event.data?.type === '__BRIDGE_PONG' && event.data?.id === requestId) {
        clearTimeout(timer)
        window.removeEventListener('message', handler)
        markExtensionHandshakeComplete()
        resolve(true)
      }
    }

    window.addEventListener('message', handler)

    window.postMessage(
      { type: '__BRIDGE_PING', id: requestId },
      '*' // In production, restrict to a specific origin
    )
  })
}

/**
 * Full async environment detection with Extension handshake.
 */
export async function detectEnv(timeoutMs?: number): Promise<EnvDetectionResult> {
  const syncResult = detectEnvSync()
  if (syncResult.env !== 'unknown') return syncResult

  const extAvailable = await pingExtension(timeoutMs)
  if (extAvailable) {
    return { env: 'extension', reason: 'Extension content-script responded to PING/PONG' }
  }

  return { env: 'unknown', reason: 'No bridge transport detected (tried Electron + Extension)' }
}
