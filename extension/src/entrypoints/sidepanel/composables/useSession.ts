/**
 * useSession — Session management composable for Extension sidepanel.
 *
 * Manages PageSession → SubSession hierarchy via chrome.storage.local
 * through background SW bridge calls. Wraps the flat chat state with
 * session-aware routing (Overview vs Field chat).
 */
import { ref, computed } from 'vue'

// ── Types ──
export interface ChatMessageItem {
  role: 'user' | 'assistant' | 'system'
  content: string
  id?: string
  timestamp?: number
  isStreaming?: boolean
  /** Special card type for non-message UI cards (e.g. batch fill) */
  card?: { type: 'batch-fill'; state: 'trigger' | 'loading' | 'done'; streamContent?: string; highCount?: number; mediumCount?: number; lowCount?: number }
}

export interface SessionKey {
  type: 'page-chat' | 'field'
  fieldName?: string
}

export interface SubSession {
  key: SessionKey
  messages: ChatMessageItem[]
  fieldMeta?: Record<string, unknown>
  createdAt?: number
  lastActiveAt?: number
}

export interface PageSessionData {
  pageId: string
  pageUrl: string
  pageTitle: string
  createdAt: number
  archived: boolean
  pageContext?: Record<string, unknown> | null
  children: SubSession[]
  activeChildIndex: number
}

// ── Bridge helper ──
async function bridgeCall(method: string, args: unknown[] = []): Promise<unknown> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'BRIDGE_CALL', id: 'ss-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8), method, args },
      (response) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message))
        else if (response?.success) resolve(response.data)
        else reject(new Error(response?.error || 'Unknown error'))
      },
    )
  })
}

// ── Composable ──
export function useSession() {
  // ── State ──
  const pageSessions = ref<PageSessionData[]>([])
  const activePageIndex = ref<number>(-1)
  const sidebarView = ref<'home' | 'chat'>('chat') // extension has no Home view by default

  // ── Computed: Active ──
  const activePageSession = computed<PageSessionData | null>(() => {
    if (activePageIndex.value < 0 || activePageIndex.value >= pageSessions.value.length) return null
    return pageSessions.value[activePageIndex.value]
  })

  const activeSubSession = computed<SubSession | null>(() => {
    const ps = activePageSession.value
    if (!ps || ps.activeChildIndex < 0 || ps.activeChildIndex >= ps.children.length) return null
    return ps.children[ps.activeChildIndex]
  })

  const activeSessionKey = computed<SessionKey | null>(() => {
    const sub = activeSubSession.value
    return sub?.key ?? null
  })

  const currentMessages = computed<ChatMessageItem[]>(() => {
    const sub = activeSubSession.value
    return sub?.messages ?? []
  })

  const activeChildren = computed<SubSession[]>(() => {
    return activePageSession.value?.children ?? []
  })

  /** Field names that have sessions on the active page */
  const sessionFieldNames = computed<string[]>(() => {
    const ps = activePageSession.value
    if (!ps) return []
    return ps.children
      .filter(c => c.key.type === 'field')
      .map(c => c.key.fieldName!)
  })

  // ── Page Session Management ──

  async function initPageSession(url: string, title: string, fields: { label?: string; name?: string; id?: string }[]): Promise<PageSessionData | null> {
    try {
      const result = await bridgeCall('session:initPage', [{ pageUrl: url, pageTitle: title, fields }])
      const ps = result as PageSessionData
      // Merge into local state
      const existingIdx = pageSessions.value.findIndex(p => p.pageId === ps.pageId)
      if (existingIdx >= 0) {
        pageSessions.value[existingIdx] = ps
        activePageIndex.value = existingIdx
      } else {
        pageSessions.value.unshift(ps)
        if (pageSessions.value.length > 20) pageSessions.value.splice(20)
        activePageIndex.value = 0
      }
      return ps
    } catch {
      // Fallback: create local-only session
      const pageId = 'page-' + Date.now()
      const ps: PageSessionData = {
        pageId,
        pageUrl: url,
        pageTitle: title,
        createdAt: Date.now(),
        archived: false,
        children: [{ key: { type: 'page-chat' }, messages: [] }],
        activeChildIndex: 0,
      }
      pageSessions.value.unshift(ps)
      activePageIndex.value = 0
      return ps
    }
  }

  async function activateFieldSession(fieldMeta: { label?: string; name?: string; id?: string; placeholder?: string; type?: string }): Promise<void> {
    const ps = activePageSession.value
    if (!ps) return

    const fieldName = fieldMeta.label || fieldMeta.name || fieldMeta.placeholder || 'field'
    const fieldKey: SessionKey = { type: 'field', fieldName }

    const existingIdx = ps.children.findIndex(
      c => c.key.type === fieldKey.type && c.key.fieldName === fieldKey.fieldName
    )
    if (existingIdx >= 0) {
      ps.activeChildIndex = existingIdx
    } else {
      ps.children.push({ key: fieldKey, messages: [], fieldMeta })
      ps.activeChildIndex = ps.children.length - 1
    }

    // Persist to background
    try {
      await bridgeCall('session:activateField', [{ pageUrl: ps.pageUrl, fieldName }])
    } catch { /* non-critical */ }

    sidebarView.value = 'chat'
  }

  function selectView(sessionKey: SessionKey): void {
    const ps = activePageSession.value
    if (!ps) return
    const idx = ps.children.findIndex(
      c => c.key.type === sessionKey.type && c.key.fieldName === sessionKey.fieldName
    )
    if (idx >= 0) {
      ps.activeChildIndex = idx
    }
    sidebarView.value = 'chat'
  }

  function goHome(): void {
    sidebarView.value = 'home'
  }

  // ── Message Management ──

  function addUserMessage(text: string): void {
    const sub = activeSubSession.value
    const ps = activePageSession.value
    if (!sub || !ps) return

    const msg: ChatMessageItem = {
      id: 'u-' + Date.now(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    }
    sub.messages.push(msg)

    // Persist
    bridgeCall('session:sendMessage', [{ pageUrl: ps.pageUrl, message: msg }]).catch(() => {})
  }

  function addAssistantMessage(content = ''): ChatMessageItem {
    const sub = activeSubSession.value
    const ps = activePageSession.value
    if (!sub || !ps) return { role: 'assistant', content: '' }

    const msg: ChatMessageItem = {
      id: 'a-' + Date.now(),
      role: 'assistant',
      content,
      isStreaming: content === '',
      timestamp: Date.now(),
    }
    sub.messages.push(msg)

    // Persist initial empty message
    bridgeCall('session:sendMessage', [{ pageUrl: ps.pageUrl, message: msg }]).catch(() => {})
    return msg
  }

  function appendToLastAssistant(token: string, done: boolean): void {
    const sub = activeSubSession.value
    if (!sub) return
    const last = sub.messages[sub.messages.length - 1]
    if (last && last.role === 'assistant') {
      last.content += token
      if (done) last.isStreaming = false
    }
  }

  // ── Load from storage ──
  async function loadSessions(): Promise<void> {
    try {
      const sessions = await bridgeCall('session:listPages') as PageSessionData[]
      if (Array.isArray(sessions)) {
        pageSessions.value = sessions
        // Activate first non-archived page
        const firstActive = sessions.findIndex(s => !s.archived)
        activePageIndex.value = firstActive >= 0 ? firstActive : (sessions.length > 0 ? 0 : -1)
      }
    } catch { /* storage may be empty */ }
  }

  return {
    // State
    pageSessions,
    activePageIndex,
    sidebarView,
    // Computed
    activePageSession,
    activeSubSession,
    activeSessionKey,
    currentMessages,
    activeChildren,
    sessionFieldNames,
    // Actions
    initPageSession,
    activateFieldSession,
    selectView,
    goHome,
    addUserMessage,
    addAssistantMessage,
    appendToLastAssistant,
    loadSessions,
  }
}
