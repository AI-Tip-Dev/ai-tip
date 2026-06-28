/**
 * Settings Handlers — key-value store in chrome.storage.local.
 */

import { storageGet, storageSet, STORAGE_KEYS } from '../storage'

export async function handleSettingsGet(key: string): Promise<unknown> {
  const settings = (await storageGet<Record<string, unknown>>(STORAGE_KEYS.SETTINGS)) ?? {}
  return settings[key] ?? null
}

export async function handleSettingsSet(key: string, value: unknown): Promise<void> {
  const settings = (await storageGet<Record<string, unknown>>(STORAGE_KEYS.SETTINGS)) ?? {}
  settings[key] = value
  await storageSet(STORAGE_KEYS.SETTINGS, settings)
}

export async function handleSettingsGetAll(): Promise<Record<string, unknown>> {
  return (await storageGet<Record<string, unknown>>(STORAGE_KEYS.SETTINGS)) ?? {}
}
