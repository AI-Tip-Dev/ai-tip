/**
 * Chat 状态管理 composable
 * 管理消息列表、流式响应、Rich Card 操作
 */

import { ref, type Ref } from 'vue'
import log from 'electron-log/renderer'
import { useModelConfig } from './useModelConfig'
import { useLanguageSettings } from './useLanguageSettings'
import type { ChatMessageItem } from '@ai-tip/sdk'

// Re-export for other modules
export type { ChatMessageItem } from '@ai-tip/sdk'

// ========== Helpers ==========

let _msgId = 0
function nextMsgId(): string {
  return 'msg-' + Date.now() + '-' + ++_msgId
}

// Fallback config — only used when no model configured
const FALLBACK_CONFIG = {
  provider: 'ollama',
  id: 'ollama-default',
  name: 'qwen2.5:7b',
  baseUrl: 'http://localhost:11434/v1',
  apiKey: '',
  temperature: 0.1,
  maxTokens: 2048,
}

// ========== Types ==========

/** Context mode for chat — controls what context is included in the system prompt */
export type ChatContextMode = 'overview' | 'field'

/** Context options passed when sending a message */
export interface ChatContextOptions {
  /** Chat mode: overview (page-level discussion) or field (field-specific) */
  mode: ChatContextMode
  /**
   * Context derived from the Overview conversation.
   * Only used in 'field' mode — provides page understanding to field-specific chats.
   */
  overviewContext?: string
  /** Metadata about the current field (only for field mode) */
  fieldMeta?: {
    label: string
    type: string
    value: string
    required: boolean
  }
  /** AX tree text for page structure context (overview mode) */
  axTreeText?: string
  /** Batch pre-fill context: other fields' values for coordination (field mode) */
  batchContext?: {
    overallHint: string
    otherFields: Array<{ label: string; value: string; confidence: string }>
  }
}

// ========== Composable ==========

export function useChat() {
  const messages = ref<ChatMessageItem[]>([])
  const isStreaming = ref(false)
  const error = ref<string | null>(null)
  const currentStreamMsgId = ref<string | null>(null)

  // KB context (updated externally)
  const hasKB = ref(false)

  // Model config — reads from localStorage via useModelConfig singleton
  const { toLLMConfig, findModelById, models: allModels } = useModelConfig()

  /** Get the active model config, or fallback if none configured */
  function getModelConfig() {
    const cfg = toLLMConfig()
    if (cfg) {
      log.info(`[useChat] Using model: ${cfg.provider}/${cfg.name} @ ${cfg.baseUrl}`)
      return cfg
    }
    log.warn(`[useChat] No model configured (activeId=${localStorage.getItem('ai-sidebar-active-model')}, models=${localStorage.getItem('ai-sidebar-models')?.slice(0, 80)}), using fallback (Ollama localhost)`)
    return { ...FALLBACK_CONFIG }
  }

  /** Get LLM config for a specific model by ID */
  function toLLMConfigForModel(id: string) {
    const m = allModels.value.find(m => m.id === id)
    if (!m) return getModelConfig()
    return {
      id: m.id,
      name: m.name,
      provider: m.provider,
      baseUrl: m.baseUrl,
      apiKey: m.apiKey,
      temperature: m.temperature,
      maxTokens: m.maxTokens,
    }
  }

  /** Sync hasKB from external ref (called by Sidebar) */
  function syncFields(_detectedFieldsRef: Ref<any[]>): void {
    // KB context sync placeholder — no-op until KB is implemented
  }

  // ========== Actions ==========

  /** Send a user message and get AI response */
  async function sendMessage(
    text: string,
    modelId?: string,
    contextOptions?: ChatContextOptions,
  ): Promise<void> {
    if (isStreaming.value) return
    error.value = null

    // Add user message
    const userMsg: ChatMessageItem = {
      id: nextMsgId(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    }
    messages.value.push(userMsg)

    await handleGeneralChat(text, modelId, contextOptions)
  }

  /** General chat: streaming response */
  async function handleGeneralChat(
    _text: string,
    modelId?: string,
    contextOptions?: ChatContextOptions,
  ): Promise<void> {
    isStreaming.value = true

    // Resolve model config: use specified model, active model, or fallback
    const modelConfig = (modelId ? findModelById(modelId) : null)
      ? toLLMConfigForModel(modelId!)
      : getModelConfig()

    const botMsg: ChatMessageItem = {
      id: nextMsgId(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
    }
    messages.value.push(botMsg)
    currentStreamMsgId.value = botMsg.id

    /** Mutate bot message through reactive proxy (Vue reactivity requires proxy path) */
    function updateBotMsg(fn: (msg: ChatMessageItem) => void): void {
      const idx = messages.value.findIndex(m => m.id === botMsg.id)
      if (idx >= 0) fn(messages.value[idx])
    }

    try {
      const llmApi = window.llmApi
      const requestId = botMsg.id

      llmApi.onStreamChunk(
        (data: { requestId: string; chunk: { token?: string; done: boolean; error?: string }; traceSpanId?: string; traceId?: string }) => {
          if (data.requestId !== requestId) return
          // Capture trace info on first chunk (use updateBotMsg for Vue reactivity)
          if (data.traceSpanId) {
            updateBotMsg(m => { if (!m.traceSpanId) m.traceSpanId = data.traceSpanId })
          }
          if (data.chunk.error) {
            updateBotMsg(m => { m.content = `❌ ${data.chunk.error}`; m.isStreaming = false })
            isStreaming.value = false
            return
          }
          if (data.chunk.token) {
            updateBotMsg(m => { m.content += data.chunk.token })
          }
          if (data.chunk.done) {
            updateBotMsg(m => {
              m.isStreaming = false
              m.traceDurationMs = Date.now() - m.timestamp
            })
            isStreaming.value = false
            currentStreamMsgId.value = null
            llmApi.removeStreamListeners()
          }
        }
      )

      llmApi.onStreamError(
        (data: { requestId: string; error: string; traceSpanId?: string; traceId?: string }) => {
          if (data.requestId !== requestId) return
          // Capture trace info for error display
          if (data.traceSpanId) {
            updateBotMsg(m => { m.traceSpanId = data.traceSpanId; m.traceError = data.error })
          }
          updateBotMsg(m => { m.content = `❌ ${data.error}`; m.isStreaming = false })
          isStreaming.value = false
          currentStreamMsgId.value = null
          llmApi.removeStreamListeners()
        }
      )

      // Build system message based on context mode
      const pageUrl = (window as any).__current_url || ''
      const pageTitle = document.title
      const { uiLanguage } = useLanguageSettings()
      const langName = uiLanguage.value === 'zh-CN' ? 'Simplified Chinese' : 'English'
      const mode = contextOptions?.mode ?? 'overview'

      let systemMsg: string

      if (mode === 'overview') {
        // ── Overview mode: page-level discussion ──
        // Priority: refined conversation context → auto-generated summary → none
        const refinedCtx = contextOptions?.overviewContext
        const pageSummary = (window as any).__page_summary || ''
        const contextBlock = refinedCtx
          ? `\n\nPage context (from Overview discussion — you can refine this further):\n${refinedCtx}`
          : pageSummary
            ? `\n\nInitial page understanding (auto-generated, you can refine this):\n${pageSummary}`
            : ''

        const axBlock = contextOptions?.axTreeText
          ? `\n\nPage accessibility structure (AX tree — shows DOM elements, form fields marked with [FORM]):\n${contextOptions.axTreeText}`
          : ''

        systemMsg = `You are an AI assistant embedded in a browser sidebar. Reply in ${langName}.
The user is currently viewing:
- URL: ${pageUrl}
- Page title: ${pageTitle}${contextBlock}${axBlock}

Discuss the page at a high level. Help the user understand the page's purpose, structure, and content.
If the user asks to refine or correct the page understanding, update your knowledge accordingly.
Be concise and helpful.`

      } else {
        // ── Field mode: includes overview-derived context + specific field info ──
        const fm = contextOptions?.fieldMeta
        const fieldInfo = fm
          ? `\n\nCurrent field the user is asking about:
- Label: ${fm.label}
- Type: ${fm.type}
- Current value: "${fm.value || '(empty)'}"
- Required: ${fm.required ? 'yes' : 'no'}`
          : ''

        const overviewBlock = contextOptions?.overviewContext
          ? `\n\nPage context (from Overview discussion):\n${contextOptions.overviewContext}`
          : ''

        const batchBlock = contextOptions?.batchContext
          ? `\n\nOther fields in this form (already filled or suggested):\n${contextOptions.batchContext.otherFields.map(f =>
              `- "${f.label}": "${f.value}" (${f.confidence})`
            ).join('\n')}
\nForm context: ${contextOptions.batchContext.overallHint}
\nIMPORTANT: Your suggestion for this field MUST be consistent with the values already in other fields.`
          : ''

        systemMsg = `You are an AI assistant embedded in a browser sidebar. Reply in ${langName}.
The user is currently viewing:
- URL: ${pageUrl}
- Page title: ${pageTitle}${overviewBlock}${fieldInfo}${batchBlock}

Use the page context above to suggest meaningful values for this field. Be concise. If the page context doesn't provide enough information, say so honestly.`
      }

      // Build conversation history (exclude the just-added empty bot message)
      const MAX_HISTORY = 20 // last N message pairs to include
      const history = messages.value
        .slice(0, -1) // exclude the placeholder bot message
        .slice(-MAX_HISTORY)
        .map(m => ({ role: m.role, content: m.content }))

      llmApi.startStream(
        modelConfig,
        [
          { role: 'system', content: systemMsg },
          ...history,
        ],
        requestId,
        { temperature: 0.7 }
      )
    } catch (err: any) {
      updateBotMsg(m => { m.content = `❌ ${err.message || err}`; m.isStreaming = false })
      isStreaming.value = false
      currentStreamMsgId.value = null
    }
  }

  /** Stop streaming */
  function stopStreaming(): void {
    window.llmApi.stopStream()
    isStreaming.value = false
    if (currentStreamMsgId.value) {
      const msg = messages.value.find(
        (m) => m.id === currentStreamMsgId.value
      )
      if (msg) msg.isStreaming = false
      currentStreamMsgId.value = null
    }
    window.llmApi.removeStreamListeners()
  }

  function clearMessages(): void {
    messages.value = []
    error.value = null
  }

  return {
    messages,
    isStreaming,
    error,
    hasKB,
    allModels,
    syncFields,

    sendMessage,
    stopStreaming,
    clearMessages,
  }
}
