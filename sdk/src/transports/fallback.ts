/**
 * Fallback Transport
 *
 * Used when no bridge is available (neither Electron nor Extension).
 * Every method call throws BridgeNotAvailableError with a helpful message
 * guiding the user to install the necessary runtime.
 */

import { BaseTransport } from './base'
import { BridgeNotAvailableError } from '../types'

/**
 * FallbackTransport always throws BridgeNotAvailableError on invoke.
 * This ensures SaaS code gets a clear, actionable error rather than
 * a cryptic "undefined is not a function".
 */
export class FallbackTransport extends BaseTransport {
  async invoke(method: string, _args: unknown[]): Promise<never> {
    throw new BridgeNotAvailableError(
      `Cannot invoke "${method}": Bridge is not available. ` +
        'Please run this application inside the AI Tip Electron desktop app, ' +
        'or install the AI Tip browser extension.'
    )
  }
}
