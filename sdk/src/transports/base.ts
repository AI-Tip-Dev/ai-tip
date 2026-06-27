/**
 * Base Transport class and interface re-export.
 *
 * All transport implementations (Electron, Extension, Fallback)
 * must implement the Transport interface defined in types.ts.
 */

export type { Transport } from '../types'

/**
 * Abstract base class for transports.
 * Provides shared logic for method routing and error handling.
 */
export abstract class BaseTransport {
  /**
   * Invoke a named method with positional arguments.
   * Each concrete transport must implement this.
   */
  abstract invoke(method: string, args: unknown[]): Promise<unknown>

  /**
   * Subscribe to a host event.
   * Default no-op; override if the transport supports push events.
   */
  onEvent(_event: string, _callback: (data: unknown) => void): void {
    // No-op by default
  }

  /**
   * Unsubscribe from a host event.
   * Default no-op; override if the transport supports push events.
   */
  offEvent(_event: string, _callback: (data: unknown) => void): void {
    // No-op by default
  }
}
