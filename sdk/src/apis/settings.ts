/**
 * Settings API — key-value persistent settings.
 *
 * Usage:
 *   await bridge.settings.set('uiLanguage', 'zh-CN')
 *   const lang = await bridge.settings.get<string>('uiLanguage')
 *   const all = await bridge.settings.getAll()
 */

import type { Transport, SettingsAPI } from '../types'

export function createSettingsAPI(transport: Transport): SettingsAPI {
  return {
    async get<T = unknown>(key: string): Promise<T | null> {
      return transport.invoke('settings:get', [key]) as Promise<T | null>
    },

    async set<T = unknown>(key: string, value: T): Promise<void> {
      return transport.invoke('settings:set', [key, value]) as Promise<void>
    },

    async getAll(): Promise<Record<string, unknown>> {
      return transport.invoke('settings:getAll', []) as Promise<Record<string, unknown>>
    },

    async delete(key: string): Promise<void> {
      return transport.invoke('settings:delete', [key]) as Promise<void>
    },
  }
}
