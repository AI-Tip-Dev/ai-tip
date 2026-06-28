<script setup lang="ts">
/**
 * Side Panel — App.vue
 *
 * AI Tip side panel UI. Provides:
 *   - Session-aware chat (Overview + Field sub-sessions)
 *   - FieldPills for switching between detected fields
 *   - AI chat with streaming + [[OPTIONS:...]] structured fill
 *   - WelcomeView for context-aware suggestion cards
 *
 * Uses browser-native APIs: chrome.runtime, chrome.tabs, chrome.storage
 */

import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useSession } from './composables/useSession'
import type { ChatMessageItem } from './composables/useSession'
import ChatHeader from './components/ChatHeader.vue'
import FieldPills from './components/FieldPills.vue'
import ChatView from './components/ChatView.vue'
import ChatInput from './components/ChatInput.vue'
import ContextPill from './components/ContextPill.vue'

// ── Types ──
interface ModelConfig {
  id: string; name: string; displayName?: string; provider: string
  baseUrl: string; apiKey: string; temperature: number; maxTokens: number
  source?: 'local' | 'remote'
  customHeaders?: { key: string; value: string }[]
}
interface DetectedField {
  label: string; type: string; required: boolean; value: string
  name?: string; id?: string; placeholder?: string
}

// ── Bridge to Background SW ──
async function bridgeCall(method: string, args: unknown[] = []): Promise<unknown> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'BRIDGE_CALL', id: 'sp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8), method, args },
      (response) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message))
        else if (response?.success) resolve(response.data)
        else reject(new Error(response?.error || 'Unknown error'))
      },
    )
  })
}

// ── Session ──
const session = useSession()

// ── State ──
const currentUrl = ref('')
const currentTitle = ref('')
const detectedFields = ref<DetectedField[]>([])
const models = ref<ModelConfig[]>([])
const activeModelId = ref<string | null>(null)
const isStreaming = ref(false)

// Field currently selected via content-script button click
const tipField = ref<DetectedField | null>(null)

// ── Computed ──
const activeModel = computed(() => models.value.find(m => m.id === activeModelId.value) ?? null)
const hasModel = computed(() => models.value.length > 0 && activeModelId.value !== null)
const pageHostname = computed(() => {
  try { return new URL(currentUrl.value).hostname.replace('www.', '') } catch { return '' }
})

const activeFieldLabel = computed(() => {
  const sub = session.activeSubSession.value
  if (sub?.key.type === 'field') {
    const fm = sub.fieldMeta as Record<string, string> | undefined
    return fm?.label || fm?.placeholder || fm?.name || sub.key.fieldName || null
  }
  return null
})

const activeFieldType = computed(() => {
  const sub = session.activeSubSession.value
  if (sub?.key.type === 'field') {
    const fm = sub.fieldMeta as Record<string, string> | undefined
    return fm?.type || null
  }
  return null
})

const activeFieldPlaceholder = computed(() => {
  const sub = session.activeSubSession.value
  if (sub?.key.type === 'field') {
    const fm = sub.fieldMeta as Record<string, string> | undefined
    return fm?.placeholder || null
  }
  return null
})

const inputPlaceholder = computed(() => {
  if (!hasModel.value) return ''
  if (activeFieldLabel.value) return `Fill "${activeFieldLabel.value}"...`
  return 'Ask AI Tip...'
})

// ── URL Filtering ──
/** Only process web pages (http/https) and local files — skip internal browser pages */
function isProcessableUrl(url: string): boolean {
  if (!url) return false
  const lower = url.toLowerCase()
  return (
    (lower.startsWith('http://') || lower.startsWith('https://') || lower.startsWith('file://')) &&
    !lower.startsWith('chrome-extension://')
  )
}

/** Reload models + active model ID from storage */
async function reloadModels(): Promise<void> {
  try { models.value = (await bridgeCall('model-config:list')) as ModelConfig[] || [] } catch {}
  try { activeModelId.value = (await bridgeCall('model-config:getActive')) as string | null } catch {}
}

/** Handle chrome.storage changes — reload models when config is updated elsewhere */
function handleStorageChange(changes: Record<string, chrome.storage.StorageChange>, areaName: string): void {
  if (areaName !== 'local') return
  if (changes['ai-tip:models'] || changes['ai-tip:active-model']) {
    reloadModels()
  }
}

// ── Tab switching ──

/** Refresh sidepanel state for the currently active tab */
async function refreshActiveTab(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab) return
  currentUrl.value = tab.url || ''
  currentTitle.value = tab.title || ''
  tipField.value = null

  if (isProcessableUrl(currentUrl.value)) {
    await detectFields()
    await session.initPageSession(currentUrl.value, currentTitle.value, detectedFields.value)
  }
}

/** Fires when user switches to a different tab */
async function onTabActivated(_activeInfo: chrome.tabs.TabActiveInfo): Promise<void> {
  await refreshActiveTab()
}

/** Fires when the active tab finishes loading (URL change within same tab) */
async function onTabUpdated(
  tabId: number,
  changeInfo: chrome.tabs.TabChangeInfo,
  tab: chrome.tabs.Tab,
): Promise<void> {
  // Only react when the active tab's URL or status changes
  if (changeInfo.status === 'complete' && tab.active) {
    await refreshActiveTab()
  }
}

// ── CS Event handler ──
function handleCsEvent(msg: any): void {
  if (msg?.type === 'CS_EVENT' && msg.event === 'ai-tip:field-selected') {
    const field = msg.payload as DetectedField
    tipField.value = field
    session.activateFieldSession(field)
    highlightFieldInPage(field)
  }
}

// ── Lifecycle ──
onMounted(async () => {
  // Load models
  await reloadModels()

  // Get current tab & process only web pages / files
  await refreshActiveTab()

  // Listen for field selections from content script
  chrome.runtime.onMessage.addListener(handleCsEvent)

  // Watch storage changes — reload models when Options/Settings page saves changes
  chrome.storage.onChanged.addListener(handleStorageChange)

  // Watch tab switches — refresh state when user changes tabs
  chrome.tabs.onActivated.addListener(onTabActivated)
  chrome.tabs.onUpdated.addListener(onTabUpdated)
})

onUnmounted(() => {
  chrome.storage.onChanged.removeListener(handleStorageChange)
  chrome.runtime.onMessage.removeListener(handleCsEvent)
  chrome.tabs.onActivated.removeListener(onTabActivated)
  chrome.tabs.onUpdated.removeListener(onTabUpdated)
})

// Auto-insert batch fill trigger when ≥2 fields detected in Overview mode
watch([() => detectedFields.value.length, () => session.activeSessionKey.value], ([count, key]) => {
  if (count >= 2 && key?.type === 'page-chat') {
    insertBatchFillTrigger()
  }
})

async function detectFields(): Promise<void> {
  try {
    const result = await bridgeCall('form-detect:detectFields') as { fields: DetectedField[] }
    if (result?.fields) detectedFields.value = result.fields
  } catch { /* content script may not be ready */ }
}

// ── Highlight field in page ──
async function highlightFieldInPage(field: DetectedField): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, {
      type: 'BRIDGE_CALL', id: 'hl-' + Date.now(),
      method: 'ai-tip:highlightField',
      args: [{ label: field.label, name: field.name, id: field.id, placeholder: field.placeholder }],
    }).catch(() => {})
  }
}

// ── Fill field ──
async function fillField(value: string): Promise<void> {
  const field = tipField.value
  if (!field) return
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (tab?.id) {
    await chrome.tabs.sendMessage(tab.id, {
      type: 'BRIDGE_CALL', id: 'fill-' + Date.now(),
      method: 'ai-tip:fillField',
      args: [{ label: field.label, name: field.name, id: field.id, placeholder: field.placeholder }, value],
    })
  }
}

// ── Open native Options page (full tab) ──
function openOptions(): void {
  chrome.runtime.openOptionsPage()
}

// ── Batch Fill ──
const batchFillPort = ref<chrome.runtime.Port | null>(null)

/** Insert a BatchFillCard trigger into the Overview session */
function insertBatchFillTrigger(): void {
  const ps = session.activePageSession.value
  if (!ps) return
  const overview = ps.children.find(c => c.key.type === 'page-chat')
  if (!overview) return
  // Don't insert if already has a card
  if (overview.messages.some(m => m.card?.type === 'batch-fill')) return
  overview.messages.push({
    id: 'batch-' + Date.now(),
    role: 'assistant',
    content: '',
    timestamp: Date.now(),
    card: { type: 'batch-fill', state: 'trigger' },
  })
}

function handleBatchStart(): void {
  const ps = session.activePageSession.value
  if (!ps) return
  const overview = ps.children.find(c => c.key.type === 'page-chat')
  if (!overview) return

  // Update card to loading state
  const cardMsg = overview.messages.find(m => m.card?.type === 'batch-fill')
  if (cardMsg?.card) {
    cardMsg.card.state = 'loading'
    cardMsg.card.streamContent = ''
  }

  // Build context for batch fill
  const systemMsg: ChatMessageItem = {
    role: 'system',
    content: `You are an AI form-filling assistant. Analyze the following form fields on "${currentTitle.value}" and suggest appropriate values for each. Return a JSON object with a "fields" array. Each field should have: "label" (field name), "value" (suggested value), "confidence" ("high"/"medium"/"low"), "reason" (brief explanation).

Form URL: ${currentUrl.value}
Fields to fill: ${detectedFields.value.map(f => `- ${f.label || f.name}: type=${f.type}, placeholder="${f.placeholder || ''}", required=${f.required}`).join('\n')}

Respond ONLY with valid JSON like:
{"fields":[{"label":"Company Name","value":"Acme Corp","confidence":"medium","reason":"Generic placeholder"},...]}`,
    timestamp: Date.now(),
  }

  const port = chrome.runtime.connect({ name: 'batch-fill' })
  batchFillPort.value = port

  port.onMessage.addListener((msg) => {
    if (msg.type === 'batch:suggest:progress' && cardMsg?.card) {
      cardMsg.card.streamContent = msg.partial as string
    }
    if (msg.type === 'batch:suggest:done') {
      const result = msg.result as { suggestions: { fieldLabel: string; value: string; confidence: 'high' | 'medium' | 'low' }[] }
      if (cardMsg?.card) {
        cardMsg.card.state = 'done'
        cardMsg.card.highCount = result.suggestions.filter(s => s.confidence === 'high').length
        cardMsg.card.mediumCount = result.suggestions.filter(s => s.confidence === 'medium').length
        cardMsg.card.lowCount = result.suggestions.filter(s => s.confidence === 'low').length
      }
      // Auto-fill high+medium confidence fields
      for (const s of result.suggestions) {
        if (s.confidence === 'high' || s.confidence === 'medium') {
          const field = detectedFields.value.find(f => (f.label || f.name) === s.fieldLabel)
          if (field) fillFieldForBatch(field, s.value)
        }
      }
      batchFillPort.value = null
      port.disconnect()
    }
    if (msg.type === 'batch:suggest:error') {
      if (cardMsg?.card) cardMsg.card.state = 'done'
      batchFillPort.value = null
      port.disconnect()
    }
  })

  port.postMessage({
    type: 'batch:suggest:start',
    requestId: 'batch-' + Date.now(),
    modelId: activeModelId.value,
    messages: [systemMsg],
    fieldCount: detectedFields.value.length,
  })
}

async function fillFieldForBatch(field: DetectedField, value: string): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, {
      type: 'BRIDGE_CALL', id: 'bfill-' + Date.now(),
      method: 'ai-tip:fillField',
      args: [{ label: field.label, name: field.name, id: field.id, placeholder: field.placeholder }, value],
    }).catch(() => {})
  }
}

function handleBatchCancel(): void {
  if (batchFillPort.value) {
    batchFillPort.value.disconnect()
    batchFillPort.value = null
  }
  // Remove the card
  const ps = session.activePageSession.value
  if (ps) {
    const overview = ps.children.find(c => c.key.type === 'page-chat')
    if (overview) {
      const idx = overview.messages.findIndex(m => m.card?.type === 'batch-fill')
      if (idx >= 0) overview.messages.splice(idx, 1)
    }
  }
}

function handleBatchViewAll(): void {
  // Show results by switching to first field session
  const ps = session.activePageSession.value
  if (!ps) return
  const firstField = ps.children.find(c => c.key.type === 'field')
  if (firstField) session.selectView(firstField.key)
}

// ── Chat ──
function handleSend(text: string): void {
  if (!hasModel.value) { openOptions(); return }
  sendChat(text)
}

async function sendChat(text: string): Promise<void> {
  if (isStreaming.value) return

  // Add user message to session
  session.addUserMessage(text)
  isStreaming.value = true

  // Add placeholder assistant message
  session.addAssistantMessage('')

  // Build system context
  const systemMsg: ChatMessageItem = {
    role: 'system',
    content: `You are AI Tip, an intelligent form-filling assistant. Current page: ${currentTitle.value} (${currentUrl.value}). ${
      activeFieldLabel.value
        ? `User is working on field: "${activeFieldLabel.value}" (type: ${activeFieldType.value || 'text'}). When suggesting values, use this format:\n[[OPTIONS:${activeFieldLabel.value}]]value1||value2||value3[[/OPTIONS]]`
        : 'Help the user understand and fill forms on this page.'
    } Keep responses concise and actionable.`,
  }

  // Get messages from current sub-session (excluding the empty assistant placeholder)
  const subMsgs = session.currentMessages.value.filter(m => m.content !== '')

  const port = chrome.runtime.connect({ name: 'llm-stream' })
  port.onMessage.addListener((msg) => {
    if (msg.type === 'llm:stream:chunk') {
      if (msg.chunk?.token) session.appendToLastAssistant(msg.chunk.token, false)
      if (msg.chunk?.done) {
        session.appendToLastAssistant('', true)
        isStreaming.value = false
        port.disconnect()
      }
      if (msg.chunk?.error) {
        session.appendToLastAssistant(`\n\nError: ${msg.chunk.error}`, true)
        isStreaming.value = false
        port.disconnect()
      }
    }
    if (msg.type === 'llm:stream:error') {
      session.appendToLastAssistant(`\n\nError: ${msg.error}`, true)
      isStreaming.value = false
      port.disconnect()
    }
  })

  port.postMessage({
    type: 'llm:stream:start',
    requestId: 'chat-' + Date.now(),
    modelId: activeModelId.value,
    messages: [systemMsg, ...subMsgs],
  })
}

function handleStop(): void {
  isStreaming.value = false
}

// ── Field chip click ──
function handleFieldChipClick(field: DetectedField): void {
  tipField.value = field
  session.activateFieldSession(field)
  highlightFieldInPage(field)
}

// ── Dismiss tip field ──
function handleDismissTip(): void {
  tipField.value = null
  // Go back to Overview
  const ps = session.activePageSession.value
  if (ps) {
    const overviewIdx = ps.children.findIndex(c => c.key.type === 'page-chat')
    if (overviewIdx >= 0) ps.activeChildIndex = overviewIdx
  }
}
</script>

<template>
  <div class="app">
    <!-- Header -->
    <header class="header">
      <div class="brand">
        <span class="brand-dot" :class="{ active: hasModel }">{{ hasModel ? '🟢' : '⚪' }}</span>
        <span class="brand-model" :title="activeModel?.baseUrl">{{ activeModel?.name || activeModel?.provider || 'No Model' }}</span>
      </div>
      <div class="header-actions">
        <button class="icon-btn" @click="openOptions" title="Settings">⚙️</button>
      </div>
    </header>

    <!-- Breadcrumb & Field Pills -->
    <ChatHeader
      :page-title="currentTitle || pageHostname"
      :active-key="session.activeSessionKey.value"
      :active-field-label="activeFieldLabel || undefined"
      :has-model="hasModel"
      :model-name="activeModel?.name || activeModel?.provider"
      @back-to-overview="handleDismissTip"
    />

    <FieldPills
      :children="session.activeChildren.value"
      :active-key="session.activeSessionKey.value"
      @select="(key) => {
        session.selectView(key)
        if (key.type === 'field') {
          const f = detectedFields.find(df => (df.label || df.name) === key.fieldName)
          if (f) { tipField = f; highlightFieldInPage(f) }
        } else {
          tipField = null
        }
      }"
    />

    <!-- Detected Fields (static chip list as fallback) -->
    <div v-if="detectedFields.length > 0 && session.sessionFieldNames.value.length === 0" class="fields-section">
      <div class="section-title">Form Fields ({{ detectedFields.length }})</div>
      <div class="fields-list">
        <button
          v-for="field in detectedFields.slice(0, 10)"
          :key="field.label || field.name || field.id"
          class="field-chip"
          :class="{ active: tipField?.label === field.label && tipField?.name === field.name }"
          @click="handleFieldChipClick(field)"
        >
          ✨ {{ field.label || field.name || field.placeholder }}
        </button>
      </div>
    </div>

    <!-- Chat Messages -->
    <ChatView
      :messages="session.currentMessages.value"
      :active-field-label="activeFieldLabel"
      :active-field-type="activeFieldType"
      :active-field-placeholder="activeFieldPlaceholder"
      :page-title="currentTitle"
      :field-count="detectedFields.length"
      :has-model="hasModel"
      @fill="fillField"
      @send-suggestion="handleSend"
      @batch-start="handleBatchStart"
      @batch-cancel="handleBatchCancel"
      @batch-view-all="handleBatchViewAll"
      @open-settings="openOptions"
    />

    <!-- Context pill + Input -->
    <ContextPill
      :field-label="activeFieldLabel || ''"
      :field-type="activeFieldType || undefined"
      :is-loading="isStreaming"
      @dismiss="handleDismissTip"
    />

    <ChatInput
      :is-streaming="isStreaming"
      :placeholder="inputPlaceholder"
      :disabled="!hasModel"
      disabled-hint="Click to configure an LLM model..."
      @send="handleSend"
      @stop="handleStop"
      @open-settings="openOptions"
    />
  </div>
</template>

<style>
/* ── Reset ── */
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; color: #1a1d20; background: #fff; }

/* ── App Layout ── */
.app { display: flex; flex-direction: column; height: 100vh; }

/* ── Header ── */
.header { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border-bottom: 1px solid #e2e5e9; flex-shrink: 0; }
.brand { display: flex; align-items: center; gap: 6px; min-width: 0; }
.brand-dot { font-size: 10px; flex-shrink: 0; }
.brand-dot.active { filter: none; }
.brand-model {
  font-size: 12px;
  font-weight: 500;
  color: #374151;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.header-actions { display: flex; align-items: center; gap: 8px; }
.icon-btn { background: none; border: 1px solid #ddd; border-radius: 6px; padding: 4px 8px; cursor: pointer; font-size: 14px; line-height: 1; }
.icon-btn:hover { background: #f0f0f0; }

/* ── Fields (static chips fallback) ── */
.fields-section { padding: 8px 14px; border-bottom: 1px solid #f0f0f0; flex-shrink: 0; }
.section-title { font-size: 11px; color: #888; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
.fields-list { display: flex; flex-wrap: wrap; gap: 4px; }
.field-chip { font-size: 11px; padding: 3px 8px; border: 1px solid #ddd; border-radius: 12px; background: #fff; cursor: pointer; white-space: nowrap; font-family: inherit; }
.field-chip:hover { background: #e8f0fe; border-color: #003d8f; }
.field-chip.active { background: #003d8f; color: #fff; border-color: #003d8f; }
</style>
