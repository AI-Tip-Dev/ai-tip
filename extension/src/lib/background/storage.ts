/**
 * chrome.storage.local wrapper
 *
 * Provides typed CRUD operations for the extension's persistent storage.
 * Mirrors the Desktop's localStorage + JSON file pattern.
 */

const DB_PREFIX = 'ai-tip:'

export const STORAGE_KEYS = {
  MODELS: `${DB_PREFIX}models`,
  ACTIVE_MODEL: `${DB_PREFIX}active-model`,
  SETTINGS: `${DB_PREFIX}settings`,
  SESSIONS: `${DB_PREFIX}sessions`,
  HISTORY: `${DB_PREFIX}history`,
  TRACES: `${DB_PREFIX}traces`,
  LANGUAGE: `${DB_PREFIX}language`,
} as const

export async function storageGet<T>(key: string): Promise<T | null> {
  const result = await chrome.storage.local.get(key)
  return result[key] ?? null
}

export async function storageSet<T>(key: string, value: T): Promise<void> {
  await chrome.storage.local.set({ [key]: value })
}

export async function storageRemove(key: string): Promise<void> {
  await chrome.storage.local.remove(key)
}

export async function storageGetAll(): Promise<Record<string, unknown>> {
  return chrome.storage.local.get(null)
}

export async function initStorage(): Promise<void> {
  const existing = await chrome.storage.local.get(null)
  const defaults: Record<string, unknown> = {}

  if (!existing[STORAGE_KEYS.MODELS]) defaults[STORAGE_KEYS.MODELS] = []
  if (!existing[STORAGE_KEYS.SETTINGS]) defaults[STORAGE_KEYS.SETTINGS] = { aiTipEnabled: true }
  if (!existing[STORAGE_KEYS.SESSIONS]) defaults[STORAGE_KEYS.SESSIONS] = []
  if (!existing[STORAGE_KEYS.HISTORY]) defaults[STORAGE_KEYS.HISTORY] = []
  if (!existing[STORAGE_KEYS.LANGUAGE]) defaults[STORAGE_KEYS.LANGUAGE] = { locale: 'en' }

  if (Object.keys(defaults).length > 0) {
    await chrome.storage.local.set(defaults)
  }
}
