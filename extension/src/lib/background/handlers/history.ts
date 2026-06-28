/**
 * History Handlers — browsing history in chrome.storage.local (max 15).
 */

import { storageGet, storageSet, STORAGE_KEYS } from '../storage'

interface HistoryEntry { url: string; title: string; visitedAt: number }

const MAX_HISTORY = 15

export async function handleHistoryList(): Promise<HistoryEntry[]> {
  return (await storageGet<HistoryEntry[]>(STORAGE_KEYS.HISTORY)) ?? []
}

export async function handleHistoryAdd(entry: HistoryEntry): Promise<void> {
  const history = (await storageGet<HistoryEntry[]>(STORAGE_KEYS.HISTORY)) ?? []
  const existingIdx = history.findIndex(h => h.url === entry.url)
  if (existingIdx >= 0) history.splice(existingIdx, 1)
  history.unshift(entry)
  if (history.length > MAX_HISTORY) history.splice(MAX_HISTORY)
  await storageSet(STORAGE_KEYS.HISTORY, history)
}

export async function handleHistoryClear(): Promise<void> {
  await storageSet(STORAGE_KEYS.HISTORY, [])
}
