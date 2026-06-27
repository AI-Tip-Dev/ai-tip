import { ref, type Ref } from 'vue'
import log from 'electron-log/renderer'
import type { SimpleField, RawAXNode, DetectFieldsResult, FieldContext, BatchFieldSuggestion, BatchSuggestResult, FieldSummary } from '@ai-tip/sdk'
import { useAITip, type FillResult } from './useAITip'
import { useBridgeHost } from './useBridgeHost'
import { useModelConfig } from './useModelConfig'
import { useLanguageSettings } from './useLanguageSettings'

// SDK IIFE URL — injected at build time via electron.vite.config.ts renderer.define
// Points to the @ai-tip/sdk IIFE bundle (file:/// absolute path)
declare const __SDK_IIFE_URL__: string

export interface WebviewControl {
  navigateTo: (url: string) => void
  goBack: () => void
  goForward: () => void
  reload: () => void
  currentUrl: Ref<string>
  currentTitle: Ref<string>
  openLocalFile: () => Promise<void>
  recentUrls: Ref<string[]>
  detectedFields: Ref<SimpleField[]>
  rawAXNodes: Ref<RawAXNode[]>
  rescanFields: () => void
  /** AI Tip — field context when user clicks a tip button */
  aiTipFieldSelected: Ref<FieldContext | null>
  aiTipEnabled: Ref<boolean>
  toggleAITip: () => void
  clearAITipSelection: () => void
  /** Fill a value back into the webview field (sync return via executeJavaScript) */
  fillField: (value: string, fieldContext?: FieldContext | null) => Promise<FillResult>
  /** Set the AI Tip button state (idle/loading) */
  setAITipState: (state: 'idle' | 'loading') => Promise<void>
  /** Highlight a field in the webview */
  highlightField: (fieldContext?: FieldContext | null) => Promise<void>
  /** LLM-generated page summary (null until ready) */
  pageSummary: Ref<string | null>
  /** Whether page summary is currently being generated */
  pageSummaryLoading: Ref<boolean>
  /** Last error message if summary generation failed */
  pageSummaryError: Ref<string | null>
  /** Manually retry page summarization */
  retryPageSummary: () => void
  /** Batch pre-fill suggestions from last runBatchSuggest */
  batchSuggestions: Ref<BatchFieldSuggestion[]>
  /** Whether batch pre-fill is currently running */
  batchInProgress: Ref<boolean>
  /** Last error from batch pre-fill */
  batchError: Ref<string | null>
  /** Run batch pre-fill for all detected fields */
  runBatchSuggest: () => Promise<void>
  /** Trace span ID from the last batch:suggest call */
  batchTraceSpanId: Ref<string | null>
  /** Real-time streaming content for batch suggest (partial JSON output) */
  batchStreamContent: Ref<string>
}

export function useWebview(
  webviewRef: Ref<HTMLElement | null>,
  currentUrl: Ref<string>,
  recentUrls: Ref<string[]>,
  addRecent: (url: string) => void,
  lastUrl: string | null
): { control: WebviewControl; attachListeners: () => void } {
  const detectedFields = ref<SimpleField[]>([])
  const rawAXNodes = ref<RawAXNode[]>([])

  // ── Page Title (from webview, not renderer) ──
  const currentTitle = ref('')

  // ── Page Summary ──
  const pageSummary = ref<string | null>(null)
  const pageSummaryLoading = ref(false)
  const pageSummaryError = ref<string | null>(null)
  let lastSummarizedUrl = ''
  let summarizeInFlight = false // prevent concurrent calls from duplicate did-finish-load

  // ── AI Tip ──
  const aiTip = useAITip(webviewRef)

  // ── Bridge Host (handles bridge:request from SDK IIFE bundle) ──
  const bridgeHost = useBridgeHost(webviewRef)

  function getWebview(): Electron.WebviewTag | null {
    return webviewRef.value as unknown as Electron.WebviewTag | null
  }

  // ── SDK IIFE injection ──
  // The SDK IIFE is injected by webview-preload.ts via a <script> tag
  // (see src/preload/webview-preload.ts). No renderer-side logic needed.

  function navigateTo(url: string): void {
    const wv = getWebview()
    if (!wv) { log.error('navigateTo: webview is null'); return }
    if (!url) { log.debug('navigateTo: empty URL, skipped'); return }
    let finalUrl = url.trim()
    if (!/^(https?|file):\/\//i.test(finalUrl)) {
      finalUrl = 'https://' + finalUrl
    }
    log.info(`[nav] navigateTo | ${finalUrl.slice(0, 80)}`)
    currentUrl.value = finalUrl
    addRecent(finalUrl)
    wv.loadURL(finalUrl)
  }

  function goBack(): void {
    const wv = getWebview()
    if (wv?.canGoBack()) { log.debug('goBack'); wv.goBack() }
  }

  function goForward(): void {
    const wv = getWebview()
    if (wv?.canGoForward()) { log.debug('goForward'); wv.goForward() }
  }

  function reload(): void {
    log.debug('reload')
    getWebview()?.reload()
  }

  async function openLocalFile(): Promise<void> {
    const filePath = await window.api.openLocalFile()
    if (!filePath) return
    const wv = getWebview()
    if (!wv) { log.error('openLocalFile: webview is null'); return }
    log.info(`[nav] openLocalFile | ${filePath.slice(0, 80)}`)
    currentUrl.value = filePath
    addRecent(filePath)
    wv.loadURL(filePath)
  }

  async function detectFields(): Promise<void> {
    const wv = getWebview()
    if (!wv) return
    try {
      const wcId = wv.getWebContentsId()
      log.debug('detectFields: requesting CDP via main process, wcId=' + wcId)
      const result: DetectFieldsResult = await window.api.detectFields(wcId)
      detectedFields.value = result.fields
      rawAXNodes.value = result.rawNodes
      // Expose for chat context
      ;(window as any).__detected_fields = result.fields
      ;(window as any).__ax_nodes = result.rawNodes
      log.debug(
        'detectFields: got ' + result.fields.length + ' fields / ' +
        result.rawNodes.length + ' AX nodes'
      )
    } catch (e) {
      log.error('detectFields: failed:', e)
      detectedFields.value = []
      rawAXNodes.value = []
      ;(window as any).__detected_fields = []
      ;(window as any).__ax_nodes = []
    }
  }

  /** Resolve LLM config with fallback — mirrors useChat.getModelConfig() */
  function getSummaryModelConfig() {
    const { toLLMConfig } = useModelConfig()
    const cfg = toLLMConfig()
    if (cfg) return cfg
    // Fallback: Ollama localhost (same as useChat FALLBACK_CONFIG)
    log.info('summarizePage: no model configured, using fallback (Ollama localhost)')
    return {
      provider: 'ollama',
      id: 'ollama-default',
      name: 'qwen2.5:7b',
      baseUrl: 'http://localhost:11434/v1',
      apiKey: '',
      temperature: 0.3,
      maxTokens: 512,
    }
  }

  /** Request LLM to generate a concise summary of the current page */
  async function summarizePage(url: string): Promise<void> {
    // Prevent duplicate concurrent calls from duplicate did-finish-load events
    if (summarizeInFlight) {
      log.debug('summarizePage: already in flight, skipping duplicate call')
      return
    }

    const config = getSummaryModelConfig()

    const normalizedUrl = normalizeUrl(url)
    if (normalizedUrl === lastSummarizedUrl && pageSummary.value) {
      log.debug('summarizePage: URL unchanged, using cached summary')
      return
    }

    const fields = detectedFields.value
    if (fields.length < 3) {
      log.debug(`summarizePage: only ${fields.length} fields, skipped`)
      pageSummaryLoading.value = false
      return
    }

    const meaningful = fields.filter(f => f.label || f.name)
    if (meaningful.length === 0) {
      log.debug('summarizePage: no meaningful field labels, skipped')
      pageSummaryLoading.value = false
      return
    }

    pageSummaryLoading.value = true
    pageSummaryError.value = null
    summarizeInFlight = true

    const { uiLanguage } = useLanguageSettings()
    const langName = uiLanguage.value === 'zh-CN' ? 'Simplified Chinese' : 'English'

    const fieldList = meaningful.slice(0, 20).map(f =>
      `${f.label || f.name} [${f.type}]${f.required ? ' *required' : ''}`
    ).join(', ')

    const messages = [
      {
        role: 'system' as const,
        content: `You are a page summarizer. Write ONE concise sentence (max 80 words) describing what this page is and what the user is expected to do on it. Focus on the page's purpose, not individual fields. Reply in ${langName}. Output ONLY the summary sentence, no prefixes or labels.`
      },
      {
        role: 'user' as const,
        content: `URL: ${url}\nTitle: ${currentTitle.value}\nDetected fields (${meaningful.length}): ${fieldList}${meaningful.length > 20 ? ` … (+${meaningful.length - 20} more)` : ''}`
      }
    ]

    try {
      lastSummarizedUrl = normalizedUrl
      const result = await window.api.summarizePage(config, messages)
      if (result && result.trim()) {
        pageSummary.value = result.trim()
        pageSummaryError.value = null
        ;(window as any).__page_summary = result.trim()
        log.info(`summarizePage: summary (${result.length} chars): ${result.slice(0, 100)}...`)
      } else {
        pageSummary.value = null
        pageSummaryError.value = 'LLM returned empty response'
        ;(window as any).__page_summary = null
        log.warn('summarizePage: LLM returned empty summary')
      }
    } catch (e: any) {
      lastSummarizedUrl = normalizedUrl
      pageSummary.value = null
      pageSummaryError.value = e?.message || 'Unknown error'
      ;(window as any).__page_summary = null
      log.error('summarizePage: failed:', e)
    } finally {
      pageSummaryLoading.value = false
      summarizeInFlight = false
    }
  }

  /** Normalize URL for cache key: strip hash & trailing slash */
  function normalizeUrl(raw: string): string {
    try {
      const u = new URL(raw)
      return `${u.origin}${u.pathname.replace(/\/$/, '')}${u.search}`
    } catch {
      return raw
    }
  }

  // ── Batch Pre-fill ──
  const batchSuggestions = ref<BatchFieldSuggestion[]>([])
  const batchInProgress = ref(false)
  const batchError = ref<string | null>(null)
  const batchTraceSpanId = ref<string | null>(null)
  const batchStreamContent = ref('')
  let lastBatchUrl = ''

  function buildFieldSummaries(): FieldSummary[] {
    return detectedFields.value
      .filter(f => f.visible !== false)
      .map(f => ({
        label: f.label || f.name,
        type: f.type,
        name: f.name,
        placeholder: f.placeholder,
        required: f.required,
        currentValue: f.value || '',
        typeHint: getTypeHint(f.type),
      }))
  }

  /** Build a clean structured JSON as LLM input instead of raw AX tree */
  function buildStructuredFieldContext(): object {
    const fields = buildFieldSummaries()
    const allLabels = fields.map(f => f.label).filter(Boolean)
    return {
      page: pageSummary.value || '',
      fieldCount: fields.length,
      fields: fields.map((f, i) => ({
        index: i + 1,
        key: f.label,                    // ← LLM copies this exactly
        format: f.typeHint,
        required: f.required,
        placeholder: f.placeholder || undefined,
        siblingFields: allLabels.filter(l => l !== f.label),  // all other fields
      })),
    }
  }

  /** Map HTML input type to a concise LLM-friendly format hint */
  function getTypeHint(type: string): string {
    const t = type.toLowerCase()
    if (t === 'number') return 'numeric only'
    if (t === 'email') return 'email address'
    if (t === 'tel' || t === 'phone') return 'phone number'
    if (t === 'url') return 'URL'
    if (t === 'date' || t === 'datetime-local' || t === 'month' || t === 'week' || t === 'time') return 'date/time'
    if (t === 'checkbox') return 'true or false'
    if (t === 'select-one' || t === 'select') return 'pick from options'
    if (t === 'password') return 'do NOT fill'
    if (t === 'textarea' || t === 'richtext') return 'multi-line text'
    return 'short text'
  }

  async function runBatchSuggest(): Promise<void> {
    // Guard: prevent concurrent batch requests
    if (batchInProgress.value) {
      log.debug('batchSuggest: already in progress, skipping duplicate call')
      return
    }

    const { toLLMConfig } = useModelConfig()
    const config = toLLMConfig()
    if (!config) {
      log.debug('batchSuggest: no model configured')
      batchError.value = 'No LLM model configured'
      return
    }

    const fields = buildFieldSummaries()
    if (fields.length < 2) {
      log.debug(`batchSuggest: only ${fields.length} fields, skipped`)
      return
    }

    const normalizedUrl = normalizeUrl(currentUrl.value)
    if (normalizedUrl === lastBatchUrl && batchSuggestions.value.length > 0) {
      log.debug('batchSuggest: URL unchanged, using cached suggestions')
      return
    }

    log.info(`batchSuggest: start | fields=${fields.length} url=${normalizedUrl} provider=${config.provider} model=${config.name}`)
    batchInProgress.value = true
    batchError.value = null
    batchStreamContent.value = ''

    // Subscribe to streaming progress from main process — accumulate the partial JSON
    window.api.onBatchSuggestProgress((data) => {
      if (data.contentSoFar) {
        batchStreamContent.value = data.contentSoFar
      }
    })

    try {
      // B: Structured context instead of raw AX tree
      const structuredCtx = JSON.stringify(buildStructuredFieldContext())
      log.debug(`batchSuggest: structuredCtx=${structuredCtx.length} chars`)

      const t0 = Date.now()
      const rawResult = await window.api.batchSuggest(
        config,
        fields,
        structuredCtx
      ) as { result: BatchSuggestResult | null; traceSpanId: string } | null
      log.info(`batchSuggest: IPC returned after ${Date.now() - t0}ms | result=${rawResult?.result ? rawResult.result.suggestions?.length + ' suggestions' : 'null'}`)

      // Capture trace span ID for the batch fill card
      batchTraceSpanId.value = rawResult?.traceSpanId ?? null

      const result = rawResult?.result ?? null

      if (!result || !result.suggestions?.length) {
        log.warn('batchSuggest: empty result — batchError set')
        batchError.value = 'Batch fill failed — LLM did not return valid suggestions. Check logs for details.'
        window.api.removeBatchSuggestProgressListeners()
        return
      }

      lastBatchUrl = normalizedUrl
      batchSuggestions.value = result.suggestions
      log.info(`batchSuggest: storing ${result.suggestions.length} suggestions | overallHint=${result.overallHint?.slice(0, 80)}`)

      // Auto-fill high + medium confidence into DOM (low = user fills manually)
      const toFill = result.suggestions.filter(s => s.suggestedValue && s.confidence !== 'low')
      log.info(`batchSuggest: auto-filling ${toFill.length}/${result.suggestions.length} fields (high+medium)`)

      // Log fieldKey match diagnostics
      let matchOk = 0; let matchFail = 0
      for (const s of result.suggestions) {
        const ctx = findFieldContext(s.fieldKey)
        if (ctx) matchOk++
        else {
          matchFail++
          log.warn(`batchSuggest: fieldKey mismatch | LLM returned "${s.fieldKey}" | available: ${detectedFields.value.map(f => `"${f.label || f.name}"`).join(', ')}`)
        }
      }
      log.info(`batchSuggest: fieldKey match rate=${matchOk}/${matchOk + matchFail}`)

      for (const suggestion of toFill) {
        const ctx = findFieldContext(suggestion.fieldKey)
        if (ctx) {
          const fillResult = await aiTip.fillField(suggestion.suggestedValue, ctx)
          if (!fillResult.ok) {
            log.warn(`batchSuggest: fill failed for "${suggestion.fieldKey}": ${fillResult.reason}`)
          }
        }
      }
    } catch (e: any) {
      log.error(`batchSuggest: exception — name=${e.name} message=${e.message} stack=${e.stack?.slice(0, 300)}`)
      batchError.value = e?.message || 'Unknown error'
    } finally {
      batchInProgress.value = false
      window.api.removeBatchSuggestProgressListeners()
      log.info('batchSuggest: done | batchInProgress=false')
    }
  }

  /** Find a minimal FieldContext for fillField by matching label/name/id */
  function findFieldContext(fieldKey: string): FieldContext | null {
    const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
    const nk = norm(fieldKey)

    // 1. Exact match on label/name/id
    let field = detectedFields.value.find(
      f => f.label === fieldKey || f.name === fieldKey || f.id === fieldKey
    )
    // 2. Normalized exact match
    if (!field) {
      field = detectedFields.value.find(
        f => norm(f.label) === nk || norm(f.name) === nk
      )
    }
    // 3. Label contains fieldKey or vice versa
    if (!field) {
      field = detectedFields.value.find(
        f => norm(f.label).includes(nk) || nk.includes(norm(f.label))
      )
    }
    // 4. Placeholder match
    if (!field) {
      field = detectedFields.value.find(
        f => f.placeholder && norm(f.placeholder).includes(nk)
      )
    }

    if (!field) return null

    return buildContext(field)
  }

  function buildContext(field: SimpleField): FieldContext {
    return {
      tagName: field.tagName,
      type: field.type,
      name: field.name,
      id: field.id,
      placeholder: field.placeholder,
      value: field.value,
      ariaLabel: '',
      label: field.label,
      formPurpose: '',
      siblingLabels: [],
      pageTitle: currentTitle.value,
      pageUrl: currentUrl.value,
      rect: { top: 0, left: 0, width: 100, height: 30 },
    }
  }

  let listenersAttached = false

  function attachListeners(): void {
    if (listenersAttached) {
      log.debug('attachListeners: already attached, skipping')
      return
    }
    const wv = getWebview()
    if (!wv) { log.error('attachListeners: webview is null!'); return }
    listenersAttached = true

    // Set up AI Tip IPC listener (ipc-message via webview preload bridge)
    aiTip.setup()

    // Set up Bridge Host (handles bridge:request from SDK IIFE bundle)
    bridgeHost.setup()

    wv.addEventListener('did-navigate', (event: any) => {
      log.info(`[nav] did-navigate | ${event.url.slice(0, 80)}`)
      currentUrl.value = event.url
      currentTitle.value = ''
      ;(window as any).__current_url = event.url
      addRecent(event.url)

    })

    wv.addEventListener('page-title-updated', (event: any) => {
      if (event.title && event.title !== 'about:blank') {
        currentTitle.value = event.title
        log.debug('page-title-updated: ' + event.title)
      }
    })

    wv.addEventListener('did-navigate-in-page', (event: any) => {
      if (event.isMainFrame) {
        log.info(`[nav] did-navigate-in-page | ${event.url.slice(0, 80)}`)
        currentUrl.value = event.url
        currentTitle.value = ''
        ;(window as any).__current_url = event.url
        addRecent(event.url)
      }
    })

    wv.addEventListener('did-finish-load', () => {
      const url = (wv as any).getURL?.() || ''
      if (!url || url === 'about:blank') {
        log.debug('did-finish-load: skip detection for ' + (url || '(empty)'))
        return
      }
      log.debug('did-finish-load: auto-detecting fields for ' + url)
      setTimeout(() => detectFields(), 800)

      // Inject SDK IIFE if AI Tip is enabled (conditional, user-controlled).
      // The SDK auto-initializes: injects buttons, listens for hover/focus,
      // and sends ai-tip:field-selected events via sendToHost.
      if (aiTip.isEnabled.value && typeof __SDK_IIFE_URL__ === 'string' && __SDK_IIFE_URL__) {
        setTimeout(() => {
          const wv2 = getWebview()
          if (!wv2) return
          wv2.executeJavaScript(`
            (function(){
              if (window.__sdkInjected) return;
              window.__sdkInjected = true;
              var s = document.createElement('script');
              s.src = ${JSON.stringify(__SDK_IIFE_URL__)};
              s.onerror = function(){ console.warn('[SDK IIFE] failed to load:', s.src); };
              document.head.appendChild(s);
            })()
          `).catch((e: Error) => log.error('SDK IIFE injection failed:', e))
        }, 600)
      }

      // Summarize page after fields are detected (async, non-blocking)
      setTimeout(async () => {
        await detectFields() // ensure latest fields before summarizing
        summarizePage(url)
      }, 2500)
    })

    wv.addEventListener('did-fail-load', (event: any) => {
      // Suppress false positives: about:srcdoc iframes always abort (-3)
      if (event.errorCode === -3 && /^about:srcdoc/.test(event.validatedURL || '')) return
      log.error(`did-fail-load: code=${event.errorCode} desc=${event.errorDescription} url=${event.validatedURL}`)
    })

    wv.addEventListener('dom-ready', () => {
      log.debug('dom-ready, currentUrl=' + ((wv as any).getURL?.() || ''))
    })

    if (lastUrl) {
      const url = lastUrl
      wv.addEventListener('dom-ready', function onReady() {
        wv.removeEventListener('dom-ready', onReady)
        log.info(`[nav] restore lastUrl | ${url.slice(0, 80)}`)
        currentUrl.value = url
        addRecent(url)
        wv.loadURL(url)
      })
    }
  }

  const control: WebviewControl = {
    navigateTo,
    goBack,
    goForward,
    reload,
    currentUrl,
    currentTitle,
    openLocalFile,
    recentUrls,
    detectedFields,
    rawAXNodes,
    rescanFields: detectFields,
    // AI Tip
    aiTipFieldSelected: aiTip.fieldSelected,
    aiTipEnabled: aiTip.isEnabled,
    toggleAITip: aiTip.toggle,
    clearAITipSelection: aiTip.clearSelection,
    fillField: aiTip.fillField,
    setAITipState: aiTip.setState,
    highlightField: aiTip.highlightField,
    pageSummary,
    pageSummaryLoading,
    pageSummaryError,
    retryPageSummary: () => summarizePage(currentUrl.value),
    // Batch pre-fill
    batchSuggestions,
    batchInProgress,
    batchError,
    batchTraceSpanId,
    runBatchSuggest,
    batchStreamContent,
  }

  return { control, attachListeners }
}
