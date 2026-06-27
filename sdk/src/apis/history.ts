/**
 * History API — browsing URL history management.
 *
 * Usage:
 *   await bridge.history.add('https://example.com', 'Example')
 *   const entries = await bridge.history.list(10)
 *   await bridge.history.clear()
 */

import type { Transport, HistoryAPI, HistoryEntry } from '../types'

export function createHistoryAPI(transport: Transport): HistoryAPI {
  return {
    async list(limit?: number): Promise<HistoryEntry[]> {
      return transport.invoke('history:list', [limit]) as Promise<HistoryEntry[]>
    },

    async add(url: string, title: string): Promise<void> {
      return transport.invoke('history:add', [url, title]) as Promise<void>
    },

    async clear(): Promise<void> {
      return transport.invoke('history:clear', []) as Promise<void>
    },

    async remove(url: string): Promise<void> {
      return transport.invoke('history:remove', [url]) as Promise<void>
    },
  }
}
