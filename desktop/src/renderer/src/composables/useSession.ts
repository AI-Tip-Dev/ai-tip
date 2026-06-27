/**
 * Session 管理 composable
 *
 * 管理 Page Session 层级结构：
 *   PageSession → SubSession (PageChat | Field)
 *
 * 包装 useChat，添加 Session 感知能力。
 * Home + Chat 双视图切换。
 */
import { ref, computed, watch } from 'vue'
import log from 'electron-log/renderer'
import { useChat, type ChatContextOptions } from './useChat'
import type { ChatMessageItem } from './useChat'
import type {
  PageSessionData,
  SubSession,
  SessionKey,
  PageContext,
  SidebarView,
  SimpleField,
} from '@ai-tip/sdk'

// ========== Helpers ==========

let _pageSeq = 0
function nextPageId(): string {
  return 'page-' + Date.now() + '-' + ++_pageSeq
}

function sessionKeyEq(a: SessionKey, b: SessionKey): boolean {
  return a.type === b.type && a.fieldName === b.fieldName
}

const MAX_PAGES = 20

// ========== Composable ==========

export function useSession() {
  const chat = useChat()

  // ── State ──
  const pageSessions = ref<PageSessionData[]>([])
  const activePageIndex = ref<number>(-1)
  const sidebarView = ref<SidebarView>('home')

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

  /** Messages filtered to the active sub-session */
  const currentMessages = computed<ChatMessageItem[]>(() => {
    const sub = activeSubSession.value
    if (!sub) return chat.messages.value // fallback to flat
    return sub.messages
  })

  const currentPageContext = computed<PageContext | null>(() => {
    return activePageSession.value?.pageContext ?? null
  })

  /** Field names that have sessions (user clicked ✨) on the active page */
  const sessionFieldNames = computed<string[]>(() => {
    const ps = activePageSession.value
    if (!ps) return []
    return ps.children
      .filter(c => c.key.type === 'field' && c.messages.length > 0)
      .map(c => c.key.fieldName!)
  })

  /** All children of active page for FieldPills */
  const activeChildren = computed<SubSession[]>(() => {
    return activePageSession.value?.children ?? []
  })

  /**
   * Page context for field sessions.
   *
   * Priority:
   *   1. Overview conversation AI reply  (user has refined via chat)
   *   2. Auto-generated page summary     (baseline, from IPC_PAGE_SUMMARIZE)
   *   3. Empty                          (neither available yet)
   */
  const overviewContext = computed<string>(() => {
    const ps = activePageSession.value
    if (!ps) return ''

    // 1. Check Overview conversation for AI replies (optimized context)
    //    Skip card-only messages (e.g. Batch Fill Card) which have empty content
    const overview = ps.children.find(c => c.key.type === 'page-chat')
    if (overview) {
      const aiMsgs = overview.messages.filter(
        m => m.role === 'assistant' && !m.isStreaming && m.content
      )
      if (aiMsgs.length > 0) {
        return aiMsgs[aiMsgs.length - 1].content
      }
    }

    // 2. Fall back to auto-generated page summary (baseline)
    if (ps.pageContext?.summary) {
      return ps.pageContext.summary
    }

    return ''
  })

  /**
   * Whether the overview has generated context yet.
   * Field sessions should show a hint if no overview context exists.
   */
  const hasOverviewContext = computed<boolean>(() => {
    return overviewContext.value.length > 0
  })

  // ── Page Session Management ──

  /** Create or activate a Page Session for a URL */
  function initPageSession(url: string, title: string, _fields: SimpleField[]): PageSessionData {
    // Check if page already exists
    const existingIdx = pageSessions.value.findIndex(
      p => p.pageUrl === url && !p.isArchived
    )
    if (existingIdx >= 0) {
      activePageIndex.value = existingIdx
      const ps = pageSessions.value[existingIdx]
      ps.lastActiveAt = Date.now()
      return ps
    }

    // Create new page session
    const pageId = nextPageId()
    const overviewSession: SubSession = {
      key: { type: 'page-chat' },
      messages: [],
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
    }

    const ps: PageSessionData = {
      pageId,
      pageUrl: url,
      pageTitle: title || url,
      pageContext: null,
      children: [overviewSession],
      activeChildIndex: 0, // Overview is default
      isArchived: false,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
    }

    // Archive previous active page
    if (activePageIndex.value >= 0) {
      const prev = pageSessions.value[activePageIndex.value]
      if (prev && !prev.isArchived) {
        prev.isArchived = true
      }
    }

    pageSessions.value.unshift(ps)
    activePageIndex.value = 0

    // Navigate to Home when a new page is loaded
    sidebarView.value = 'home'

    // Enforce max pages
    if (pageSessions.value.length > MAX_PAGES) {
      pageSessions.value = pageSessions.value.slice(0, MAX_PAGES)
    }

    log.info(`[useSession] Created page session: ${title} (${url})`)
    return ps
  }

  /** Activate a Field sub-session (create if not exists) */
  function activateFieldSession(fieldMeta: any): void {
    const ps = activePageSession.value
    if (!ps) {
      log.warn('[useSession] activateFieldSession: no active page')
      return
    }

    const fieldName = fieldMeta.label || fieldMeta.name || fieldMeta.placeholder || 'field'
    const fieldKey: SessionKey = { type: 'field', fieldName }

    // Check if field session already exists
    const existingIdx = ps.children.findIndex(c => sessionKeyEq(c.key, fieldKey))
    if (existingIdx >= 0) {
      ps.activeChildIndex = existingIdx
      ps.children[existingIdx].lastActiveAt = Date.now()
      log.info(`[useSession] Activated existing field: ${fieldName}`)
    } else {
      const fieldSession: SubSession = {
        key: fieldKey,
        fieldMeta: fieldMeta,
        messages: [],
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
      }
      ps.children.push(fieldSession)
      ps.activeChildIndex = ps.children.length - 1
      log.info(`[useSession] Created field session: ${fieldName}`)
    }

    // Switch to chat view
    sidebarView.value = 'chat'
  }

  /** Select a sub-session by key (from HomeView click or FieldPills) */
  function selectView(sessionKey: SessionKey): void {
    const ps = activePageSession.value
    if (!ps) return

    const idx = ps.children.findIndex(c => sessionKeyEq(c.key, sessionKey))
    if (idx >= 0) {
      ps.activeChildIndex = idx
      ps.children[idx].lastActiveAt = Date.now()
    }
    sidebarView.value = 'chat'
  }

  /** Go back to Home view */
  function goHome(): void {
    sidebarView.value = 'home'
  }

  /** Update page context (called after summary generation) */
  function updatePageContext(ctx: PageContext): void {
    const ps = activePageSession.value
    if (!ps) return
    ps.pageContext = ctx
    log.info('[useSession] Page context updated')

    // If Overview has no messages yet, insert the full generation conversation
    // (user prompt + assistant summary) so the user sees the complete context
    // when they open the Overview session.
    const overview = ps.children.find(c => c.key.type === 'page-chat')
    if (overview && overview.messages.length === 0 && ctx.summary) {
      const now = Date.now()
      // User prompt that triggered the summary generation
      overview.messages.push({
        id: 'auto-summary-user-' + now,
        role: 'user',
        content: 'Summarize this page',
        timestamp: now,
      })
      // Assistant response with the generated summary
      overview.messages.push({
        id: 'auto-summary-bot-' + now,
        role: 'assistant',
        content: ctx.summary,
        timestamp: now + 1,
      })
      log.info('[useSession] Auto-inserted summary conversation into Overview')
    }
  }

  /** Update page title retroactively (called when page-title-updated fires after session was already created) */
  function updatePageTitle(title: string): void {
    const ps = activePageSession.value
    if (!ps || !title) return
    ps.pageTitle = title
    log.info('[useSession] Page title updated: ' + title)
  }

  // ── Message Sync ──
  // Keep chat.messages in sync with activeSubSession.messages
  let syncingFromSub = false

  // When activeSubSession changes, load its messages into chat.messages
  watch(activeSubSession, (sub) => {
    if (sub) {
      syncingFromSub = true
      chat.messages.value = sub.messages
      syncingFromSub = false
    }
  }, { immediate: true })

  // When chat.messages change (new messages added), sync back to activeSubSession
  watch(chat.messages, (msgs) => {
    if (syncingFromSub) return
    const sub = activeSubSession.value
    if (sub) {
      sub.messages = msgs
      sub.lastActiveAt = Date.now()
    }
  }, { deep: true })

  // ── Send message (session-aware) ──
  async function sendMessage(
    text: string,
    modelId?: string,
    axTreeText?: string,
    batchContext?: ChatContextOptions['batchContext'],
  ): Promise<void> {
    const sub = activeSubSession.value
    if (!sub) {
      log.warn('[useSession] sendMessage: no active sub-session')
      return
    }

    // Build context options based on session type
    const ctxOpts: ChatContextOptions = {
      mode: sub.key.type === 'page-chat' ? 'overview' : 'field',
    }

    // Pass overview-derived context (refined from conversation or auto-summary)
    ctxOpts.overviewContext = overviewContext.value || undefined

    if (sub.key.type === 'page-chat') {
      if (axTreeText) {
        ctxOpts.axTreeText = axTreeText
      }
    }

    if (sub.key.type === 'field') {
      const fm = sub.fieldMeta as any
      if (fm) {
        ctxOpts.fieldMeta = {
          label: fm.label || fm.placeholder || fm.name || sub.key.fieldName || '',
          type: fm.type || 'text',
          value: fm.value || '',
          required: fm.required || false,
        }
      }
      // Pass batch context for coordinated field refinement
      if (batchContext) {
        ctxOpts.batchContext = batchContext
      }
    }

    await chat.sendMessage(text, modelId, ctxOpts)

    // Tag the latest user message with sessionKey
    const userMsg = chat.messages.value[chat.messages.value.length - 2] // user msg before bot
    if (userMsg && userMsg.role === 'user') {
      userMsg.sessionKey = sub.key
    }
    // Tag the bot message too
    const botMsg = chat.messages.value[chat.messages.value.length - 1]
    if (botMsg && botMsg.role === 'assistant') {
      botMsg.sessionKey = sub.key
      botMsg.usedPageContext = sub.key.type === 'field' && !!currentPageContext.value
    }
  }

  return {
    // State
    pageSessions,
    activePageIndex,
    sidebarView,

    // Computed
    activePageSession,
    activeSubSession,
    currentMessages,
    currentPageContext,
    sessionFieldNames,
    activeChildren,
    overviewContext,
    hasOverviewContext,

    // From useChat (pass through)
    messages: chat.messages,
    isStreaming: chat.isStreaming,
    error: chat.error,
    hasKB: chat.hasKB,
    allModels: chat.allModels,

    // Session methods
    initPageSession,
    activateFieldSession,
    selectView,
    goHome,
    updatePageContext,
    updatePageTitle,

    // Chat methods
    sendMessage,
    stopStreaming: chat.stopStreaming,
    clearMessages: chat.clearMessages,
    syncFields: chat.syncFields,
  }
}
