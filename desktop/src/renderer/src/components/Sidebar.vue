<script setup lang="ts">
import { ref, inject, computed, watch } from 'vue'
import log from 'electron-log/renderer'
import type { WebviewControl } from '../composables/useWebview'
import type { FieldContext } from '../../../preload/index.d'
import { useSession } from '../composables/useSession'
import { useAXTree } from '../composables/useAXTree'
import { useI18n } from '../composables/useI18n'
import type { SessionKey, PageContext, SimpleField, SubSession, BatchFieldSuggestion } from '@ai-tip/sdk'

// ── Home view components ──
import HomeView from './sidebar/HomeView.vue'

// ── Chat view components ──
import ChatHeader from './sidebar/chat/ChatHeader.vue'
import FieldPills from './sidebar/chat/FieldPills.vue'
import ChatView from './sidebar/chat/ChatView.vue'
import ChatInput from './sidebar/chat/ChatInput.vue'
import ContextPill from './sidebar/chat/ContextPill.vue'
import ContextBadge from './sidebar/ContextBadge.vue'

// ── Shared ──
import SettingsDialog from './sidebar/SettingsDialog.vue'

const webview = inject<WebviewControl>('webviewControl')!
const triggerSettings = inject<ReturnType<typeof ref<number>>>('triggerSettings', ref(0))

const { t } = useI18n()

// --- Session composable (replaces useChat) ---
const session = useSession()

// --- AX Tree (for overview context + DetectedFieldsPanel) ---
const { axTreeText } = useAXTree(webview.rawAXNodes)

// Expose AX tree to window for useWebview batchSuggest
watch(axTreeText, (val) => {
  ;(window as any).__ax_tree_text = val || ''
}, { immediate: true })

// --- Sync page context to chat composable ---
session.syncFields(webview.detectedFields)

// --- Initialize page session when URL changes ---
watch(() => webview.currentUrl.value, (url) => {
  if (!url || url === 'about:blank') return
  log.info('[Sidebar] URL changed, init page session:', url)
  session.initPageSession(url, webview.currentTitle.value || url, webview.detectedFields.value)
})

// --- Retroactively update page title when webview reports it (page-title-updated fires after did-navigate) ---
watch(() => webview.currentTitle.value, (title) => {
  if (!title) return
  session.updatePageTitle(title)
})

// --- Update page context when auto-summary arrives (first time only) ---
// Subsequent refinements happen via "总结本页" follow-up chip in chat.
watch(() => webview.pageSummary.value, (summary) => {
  if (!summary || !session.activePageSession.value) return
  const ps = session.activePageSession.value
  const ctx: PageContext = {
    summary,
    url: ps.pageUrl,
    title: ps.pageTitle,
    fields: webview.detectedFields.value.map((f: SimpleField) => ({
      label: f.label,
      type: f.type,
      required: f.required,
      value: f.value,
    })),
    generatedAt: Date.now(),
  }
  session.updatePageContext(ctx)

  // Insert Batch Fill Card into Overview if fields ≥ 2
  const overview = ps.children.find(c => c.key.type === 'page-chat')
  if (overview && webview.detectedFields.value.length >= 2) {
    const existingBatchCard = overview.messages.find(m => m.card?.type === 'batch-fill')
    if (!existingBatchCard) {
      overview.messages.push({
        id: 'batch-fill-card-' + Date.now(),
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        card: { type: 'batch-fill', state: 'trigger', fieldCount: webview.detectedFields.value.length },
      })
      log.info('[Sidebar] Inserted Batch Fill Card into Overview')
    }
  }
})

// --- Context bar data ---
const pageLabel = computed(() => {
  const url = webview.currentUrl.value
  try {
    const host = new URL(url).hostname
    return host.replace('www.', '')
  } catch {
    return ''
  }
})

// --- Model Config ---
const showModelSettings = ref(false)

function openSettings(): void {
  showModelSettings.value = true
}

// Watch for settings trigger (keyboard shortcut or Home button)
watch(triggerSettings, () => {
  showModelSettings.value = true
})

// --- AI Tip ---
const tipBannerVisible = ref(false)
const tipBannerContext = ref<FieldContext | null>(null)
const tipLoading = ref(false)
const tipFieldLabel = ref('')

// Watch for AI Tip field selections
watch(() => webview.aiTipFieldSelected.value, (ctx) => {
  if (ctx) {
    tipBannerContext.value = ctx
    tipFieldLabel.value = ctx.label || ctx.placeholder || ctx.name || ''
    tipBannerVisible.value = true
    log.info('[Sidebar] AI Tip field selected | label:', tipFieldLabel.value, '| ctx:', ctx)
    webview.highlightField(ctx)
    // Activate field session
    session.activateFieldSession(ctx)
  }
})

/** Smart send: sets tip loading state when field context is active.
 * Skips when batch pre-fill is in progress to avoid concurrent LLM requests. */
function handleSmartSend(text: string, modelId?: string): void {
  if (webview.batchInProgress.value) {
    log.info('[Sidebar] handleSmartSend: batch in progress, skipping send')
    return
  }
  log.info('[Sidebar] handleSmartSend | tipVisible:', tipBannerVisible.value,
    '| tipCtx:', !!tipBannerContext.value,
    '| text preview:', text.slice(0, 100))
  if (tipBannerVisible.value && tipBannerContext.value) {
    tipLoading.value = true
    webview.setAITipState('loading')
  }
  session.sendMessage(text, modelId, axTreeText.value || undefined)
}

function handleTipDismiss(): void {
  log.info('[Sidebar] handleTipDismiss')
  tipBannerVisible.value = false
  tipLoading.value = false
  webview.clearAITipSelection()
}

async function handleFill(value: string): Promise<void> {
  await webview.fillField(value, tipBannerContext.value)
}

watch(session.isStreaming, (val) => {
  if (!val && tipLoading.value) {
    tipLoading.value = false
    webview.setAITipState('idle')
    log.info('[Sidebar] streaming ended | tipVisible:', tipBannerVisible.value,
      '| tipCtx:', !!tipBannerContext.value,
      '| tipLabel:', tipFieldLabel.value)
  }
})

// --- Input placeholder ---
const inputPlaceholder = computed(() => {
  if (session.hasKB.value) return t('sidebar.inputPlaceholderKb')
  return t('sidebar.inputPlaceholder')
})

// --- Home → Chat navigation ---
function handleSelectOverview(): void {
  const ps = session.activePageSession.value
  if (!ps) return
  // Dismiss any active AI tip — Overview is page-level, not field-specific
  tipBannerVisible.value = false
  tipLoading.value = false
  tipBannerContext.value = null
  webview.clearAITipSelection()
  const overview = ps.children.find(c => c.key.type === 'page-chat')
  if (overview) {
    session.selectView(overview.key)
  }
}

function handleSelectField(key: SessionKey): void {
  // When switching to Overview, dismiss any active AI tip
  if (key.type === 'page-chat') {
    tipBannerVisible.value = false
    tipLoading.value = false
    tipBannerContext.value = null
    webview.clearAITipSelection()
  }
  session.selectView(key)
}

function handleSelectPage(pageId: string): void {
  const idx = session.pageSessions.value.findIndex(p => p.pageId === pageId)
  if (idx < 0) return
  session.pageSessions.value[idx].isArchived = false
  session.pageSessions.value[idx].lastActiveAt = Date.now()
  session.activePageIndex.value = idx
  // Navigate webview to that page
  const url = session.pageSessions.value[idx].pageUrl
  if (url) webview.navigateTo(url)
}

/** Navigate to a recent URL from history */
function handleSelectRecentUrl(url: string): void {
  log.info('[Sidebar] handleSelectRecentUrl:', url)
  webview.navigateTo(url)
}

/** Open local file via native dialog */
function handleOpenFile(): void {
  webview.openLocalFile()
}

/** Open settings dialog */
function handleOpenSettings(): void {
  showModelSettings.value = true
}

/** Active sub-session key for FieldPills */
const activeSubKey = computed<SessionKey | null>(() => {
  return session.activeSubSession.value?.key ?? null
})

// ── Batch Pre-fill Handlers ──

/** User clicked [开始批量预填] in the Overview Batch Fill Card */
async function handleBatchStart(): Promise<void> {
  log.info('[Sidebar] handleBatchStart')
  const ps = session.activePageSession.value
  if (!ps) return

  // Guard: prevent batch while a chat stream is in progress
  if (session.isStreaming.value) {
    log.info('[Sidebar] handleBatchStart: chat streaming in progress, skipping')
    return
  }

  // Update card to loading state
  const overview = ps.children.find(c => c.key.type === 'page-chat')
  const batchCard = overview?.messages.find(m => m.card?.type === 'batch-fill')
  if (batchCard?.card && batchCard.card.type === 'batch-fill') {
    batchCard.card = { type: 'batch-fill', state: 'loading', fieldCount: batchCard.card.fieldCount, startedAt: Date.now() }
  }

  await webview.runBatchSuggest()

  // Collect results
  const suggestions = webview.batchSuggestions.value
  const hasError = !!webview.batchError.value

  log.info(`[Sidebar] batchSuggest done | suggestions=${suggestions.length} hasError=${hasError} error=${webview.batchError.value || 'none'}`)

  if (batchCard?.card && batchCard.card.type === 'batch-fill') {
    if (hasError || !suggestions.length) {
      // Error state — show the error from batchError
      const errMsg = webview.batchError.value || 'Unknown error'
      batchCard.content = `⚠️ ${errMsg}`
      batchCard.card = { type: 'batch-fill', state: 'trigger', fieldCount: batchCard.card.fieldCount }
      log.warn(`[Sidebar] batchSuggest failed: ${errMsg}`)
      return
    }
    // Done state
    const highCount = suggestions.filter(s => s.confidence === 'high').length
    const mediumCount = suggestions.filter(s => s.confidence === 'medium').length
    const lowCount = suggestions.filter(s => s.confidence === 'low').length
    batchCard.card = {
      type: 'batch-fill',
      state: 'done',
      fieldCount: suggestions.length,
      traceSpanId: webview.batchTraceSpanId.value ?? undefined,
    }

    // Update card content with summary
    const parts: string[] = []
    if (highCount) parts.push(`🟢 ${highCount} auto-filled`)
    if (mediumCount) parts.push(`🟡 ${mediumCount} needs review`)
    if (lowCount) parts.push(`⚪ ${lowCount} low confidence`)
    batchCard.content = parts.join(' · ')
  }

  // Create Field Sessions for ALL fields with Suggestion Cards
  createBatchFieldSessions(suggestions)
}

/** Create field sessions for all batch-prefilled fields */
function createBatchFieldSessions(suggestions: BatchFieldSuggestion[]): void {
  const ps = session.activePageSession.value
  if (!ps) return

  for (const s of suggestions) {
    const fieldKey = s.fieldKey
    const existingIdx = ps.children.findIndex(
      c => c.key.type === 'field' && c.key.fieldName === fieldKey
    )
    if (existingIdx >= 0) continue // already exists

    const fieldMeta: FieldContext = {
      tagName: 'input',
      type: 'text',
      name: fieldKey,
      id: '',
      placeholder: '',
      value: s.suggestedValue,
      ariaLabel: '',
      label: fieldKey,
      formPurpose: '',
      siblingLabels: [],
      pageTitle: ps.pageTitle,
      pageUrl: ps.pageUrl,
      rect: { top: 0, left: 0, width: 100, height: 30 },
    }

    const fieldSession: SubSession = {
      key: { type: 'field', fieldName: fieldKey },
      fieldMeta,
      messages: [
        {
          id: `batch-sugg-${fieldKey}-${Date.now()}`,
          role: 'assistant',
          content: s.reasoning || `AI suggested value for "${fieldKey}"`,
          timestamp: Date.now(),
          card: {
            type: 'suggestion',
            fieldKey,
            suggestedValue: s.suggestedValue,
            confidence: s.confidence,
            reasoning: s.reasoning,
          },
        },
      ],
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
    }
    ps.children.push(fieldSession)
  }
  log.info(`[Sidebar] Created ${suggestions.length} batch field sessions`)
}

/** Cancel batch fill (user clicked cancel during loading) */
function handleBatchCancel(): void {
  log.info('[Sidebar] handleBatchCancel')
  // Simplest: update card back to trigger state
  const ps = session.activePageSession.value
  if (!ps) return
  const overview = ps.children.find(c => c.key.type === 'page-chat')
  const batchCard = overview?.messages.find(m => m.card?.type === 'batch-fill')
  if (batchCard?.card && batchCard.card.type === 'batch-fill') {
    batchCard.card = { type: 'batch-fill', state: 'trigger', fieldCount: batchCard.card.fieldCount }
  }
}

/** View all field sessions (switch to Home) */
function handleBatchViewAll(): void {
  session.goHome()
}

/** Re-suggest — send a message to the field session asking AI to refine */
function handleSuggestionReSuggest(fieldKey: string): void {
  log.info('[Sidebar] handleSuggestionReSuggest:', fieldKey)
  const ps = session.activePageSession.value
  if (!ps) return
  const fieldIdx = ps.children.findIndex(
    c => c.key.type === 'field' && c.key.fieldName === fieldKey
  )
  if (fieldIdx < 0) return
  ps.activeChildIndex = fieldIdx
  session.sidebarView.value = 'chat'

  // Build batchContext for coordinated refinement
  const suggestions = webview.batchSuggestions.value
  const batchContext = suggestions.length > 0 ? {
    overallHint: ps.pageContext?.summary || '',
    otherFields: suggestions
      .filter(s => s.fieldKey !== fieldKey)
      .map(s => ({ label: s.fieldKey, value: s.suggestedValue, confidence: s.confidence })),
  } : undefined

  const reSuggestText = `Please re-suggest a value for "${fieldKey}". The previous suggestion doesn't work for me.`
  session.sendMessage(reSuggestText, undefined, axTreeText.value || undefined, batchContext)
}
</script>

<template>
  <aside class="sidebar">
    <!-- ═══ HOME VIEW ═══ -->
    <template v-if="session.sidebarView.value === 'home'">
      <HomeView
        :current-page="session.activePageSession.value"
        :page-sessions="session.pageSessions.value"
        :recent-urls="webview.recentUrls.value"
        @select-overview="handleSelectOverview"
        @select-field="handleSelectField"
        @select-page="handleSelectPage"
        @select-recent-url="handleSelectRecentUrl"
        @open-file="handleOpenFile"
        @open-settings="handleOpenSettings"
      />

      <SettingsDialog v-model:visible="showModelSettings" />
    </template>

    <!-- ═══ CHAT VIEW ═══ -->
    <template v-else>
      <ChatHeader
        :page-session="session.activePageSession.value"
        :active-sub="session.activeSubSession.value"
        @back="session.goHome()"
        @navigate-to-page="handleSelectOverview"
      />

      <FieldPills
        :children="session.activeChildren.value"
        :active-key="activeSubKey"
        @select="handleSelectField"
      />

      <ContextBadge
        :overview-context="session.overviewContext.value"
        :has-overview-context="session.hasOverviewContext.value"
        :summary-loading="webview.pageSummaryLoading.value"
        :summary-error="webview.pageSummaryError.value"
        :has-model="webview.hasModel.value"
        @generate="handleSelectOverview"
        @retry="webview.retryPageSummary()"
        @configure-model="openSettings()"
      />

      <ChatView
        :messages="session.currentMessages.value"
        :is-streaming="session.isStreaming.value"
        :has-k-b="session.hasKB.value"
        :has-fields="webview.detectedFields.value.length > 0"
        :page-label="pageLabel"
        :fill-field-label="tipFieldLabel"
        :tip-context="tipBannerVisible ? tipBannerContext : null"
        :field-meta="(session.activeSubSession.value?.fieldMeta as any) ?? null"
        :is-field-mode="session.activeSubSession.value?.key.type === 'field'"
        :page-context-title="session.activePageSession.value?.pageTitle ?? ''"
        :detected-fields="webview.detectedFields.value"
        :raw-a-x-nodes="webview.rawAXNodes.value"
        :page-summary-loading="webview.pageSummaryLoading.value"
        :has-page-summary="!!webview.pageSummary.value"
        :batch-in-progress="webview.batchInProgress.value"
        :detected-field-count="webview.detectedFields.value.length"
        :batch-stream-content="webview.batchStreamContent.value"
        @send="(text: string, modelId?: string) => handleSmartSend(text, modelId)"
        @fill="handleFill"
        @rescan="webview.rescanFields()"
        @batch-start="handleBatchStart"
        @batch-cancel="handleBatchCancel"
        @batch-view-all="handleBatchViewAll"
        @suggestion-re-suggest="handleSuggestionReSuggest"
      />

      <ContextPill
        v-if="tipBannerVisible && tipBannerContext && session.activeSubSession.value?.key.type === 'field'"
        :context="tipBannerContext"
        :is-loading="tipLoading"
        @dismiss="handleTipDismiss"
      />

      <ChatInput
        :is-streaming="session.isStreaming.value"
        :placeholder="inputPlaceholder"
        :context-label="tipFieldLabel || undefined"
        :batch-in-progress="webview.batchInProgress.value"
        @send="(text: string, modelId?: string) => handleSmartSend(text, modelId)"
        @stop="session.stopStreaming()"
        @open-settings="openSettings()"
      />

      <SettingsDialog v-model:visible="showModelSettings" />
    </template>
  </aside>
</template>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--sidebar-bg);
  border-left: 1px solid var(--sidebar-border);
  font-size: 13px;
  color: var(--color-text);
}
</style>

