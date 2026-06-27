import { ref, type Ref } from 'vue'
import log from 'electron-log/renderer'

const HISTORY_KEY = 'ai-sidebar-history'
const MAX_RECENT = 15

export interface HistoryData {
  lastUrl: string | null
  recentUrls: string[]
}

export function useRecentHistory(): {
  currentUrl: Ref<string>
  recentUrls: Ref<string[]>
  loadHistory: () => HistoryData
  saveHistory: () => void
  addRecent: (url: string) => void
  setCurrentUrl: (url: string) => void
} {
  const currentUrl = ref('')
  const recentUrls = ref<string[]>([])

  function loadHistory(): HistoryData {
    try {
      const raw = localStorage.getItem(HISTORY_KEY)
      const parsed = JSON.parse(raw || 'null') || { lastUrl: null, recentUrls: [] }
      log.info(`[history] load | count=${parsed.recentUrls.length} | lastUrl=${parsed.lastUrl?.slice(0, 60) || '(none)'}`)
      return parsed
    } catch (e: any) {
      log.error('[history] load parse error: ' + String(e))
      return { lastUrl: null, recentUrls: [] }
    }
  }

  function saveHistory(): void {
    const data = JSON.stringify({
      lastUrl: currentUrl.value || null,
      recentUrls: recentUrls.value
    })
    localStorage.setItem(HISTORY_KEY, data)
  }

  function addRecent(url: string): void {
    if (!url || url === 'about:blank') return
    const before = recentUrls.value.length
    const list = recentUrls.value.filter((u) => u !== url)
    list.unshift(url)
    recentUrls.value = list.slice(0, MAX_RECENT)
    const after = recentUrls.value.length
    if (before !== after || recentUrls.value[0] !== url) {
      log.info(`[history] addRecent | url=${url.slice(0, 60)} | count=${before}→${after}`)
    }
    saveHistory()
  }

  function setCurrentUrl(url: string): void {
    currentUrl.value = url
  }

  return {
    currentUrl,
    recentUrls,
    loadHistory,
    saveHistory,
    addRecent,
    setCurrentUrl
  }
}
