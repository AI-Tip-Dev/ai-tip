import { app, shell, BrowserWindow, ipcMain, dialog, webContents, Menu } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import log from 'electron-log/main'
import icon from '../../resources/icon.png?asset'
import { FORM_AX_ROLES, axRoleToTagType } from '../shared/ax-roles'
import {
  IPC_OPEN_LOCAL_FILE,
  IPC_DETECT_FIELDS,
  IPC_MODEL_TEST_CONNECTION,
  IPC_PAGE_SUMMARIZE,
  IPC_BATCH_SUGGEST,
  IPC_BATCH_SUGGEST_PROGRESS,
  IPC_LLM_STREAM_START,
  IPC_LLM_STREAM_STOP,
  IPC_LLM_STREAM_CHUNK,
  IPC_LLM_STREAM_ERROR,
  IPC_TRACE_GET,
  IPC_TRACE_LIST,
  IPC_TRACE_EXPORT,
} from '../shared/ipc-channels'
import { localChatStream } from './providers/chat'
import { getAdapter } from './providers/registry'
import type { LocalModelConfig, ChatMessage, ChatOptions } from './providers/types'
import type { BatchSuggestResult, FieldSummary, TraceSpanDetail, TraceQueryFilter, ExportProfile } from '@ai-tip/sdk'
import { initTraceStore, getTraceStore } from './tracing/TraceStore'
import { startSpan, finishSpan } from './tracing/TracerProvider'
import { exportSpans } from './tracing/OtlpExporter'

log.info('Main process starting...')

// ============================================================
// Module-level state
// ============================================================
let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  log.info('Creating main window...')
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    show: false,
    autoHideMenuBar: false,
    title: 'AI Sidebar',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webviewTag: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    log.info('Main window ready-to-show')
    mainWindow!.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    log.info('Loading dev URL:', process.env['ELECTRON_RENDERER_URL'])
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    const indexPath = join(__dirname, '../renderer/index.html')
    log.info('Loading production file:', indexPath)
    mainWindow.loadFile(indexPath)
  }

  mainWindow.webContents.on('did-finish-load', () => {
    log.info('Main window did-finish-load')
  })

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    log.error(`Main window did-fail-load: code=${errorCode} desc=${errorDescription} url=${validatedURL}`)
  })

  log.info('Main window created')
}

// Initialize electron-log to accept logs from renderer process via IPC.
// The preload script sets up window.__electronLog which the renderer's IPC transport needs.
// We then disable the main→renderer direction (ipc.level = false) to prevent every
// main-process log from echoing into the DevTools console.
log.initialize()
log.transports.ipc.level = false
log.info('electron-log initialized for renderer IPC')

// Initialize trace store (JSONL persistence + LRU cache)
initTraceStore()
log.info('Trace store initialized')

// ============================================================
// IPC Handlers
// ============================================================

ipcMain.handle(IPC_OPEN_LOCAL_FILE, async (): Promise<string | null> => {
  log.info('open-local-file: dialog requested')
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'HTML Files', extensions: ['html', 'htm'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  })
  if (result.canceled || result.filePaths.length === 0) {
    log.info('open-local-file: user cancelled')
    return null
  }
  const p = result.filePaths[0]
  const fileUrl = `file:///${p.replace(/\\/g, '/')}`
  log.info('open-local-file: selected', fileUrl)
  return fileUrl
})

// ============================================================
// CDP-based form field detection (zero JS injection)
// ============================================================

interface CDPAXNode {
  nodeId: string
  backendDOMNodeId?: number
  role?: { value: string }
  name?: { value: string }
  value?: { value: string }
  properties?: Array<{ name: string; value?: { value: string } }>
  childIds?: string[]
}

interface CDPAXResult {
  nodes: CDPAXNode[]
}



ipcMain.handle(IPC_DETECT_FIELDS, async (_event, webContentsId: number) => {
  log.debug(`detect-fields: webContentsId=${webContentsId}`)

  const wc = webContents.fromId(webContentsId)
  if (!wc || wc.isDestroyed()) {
    log.warn('detect-fields: WebContents not found or destroyed')
    return { fields: [], rawNodes: [] }
  }

  // Attach debugger (handle case where it's already attached)
  try {
    wc.debugger.attach('1.3')
    log.debug('detect-fields: debugger attached')
  } catch (e) {
    log.warn('detect-fields: attach failed, detaching and retrying:', e)
    try {
      wc.debugger.detach()
    } catch {
      /* ignore */
    }
    try {
      wc.debugger.attach('1.3')
    } catch (e2) {
      log.error('detect-fields: re-attach also failed:', e2)
      return { fields: [], rawNodes: [] }
    }
  }

  try {
    const result = (await wc.debugger.sendCommand(
      'Accessibility.getFullAXTree'
    )) as unknown as CDPAXResult

    if (!result || !Array.isArray(result.nodes)) {
      log.warn('detect-fields: unexpected CDP response format')
      return { fields: [], rawNodes: [] }
    }

    log.debug(`detect-fields: got ${result.nodes.length} AX nodes`)

    // --- Pass 1: build nodeMap, rawNodes, and collect date/time root IDs ---
    const nodeMap = new Map<string, CDPAXNode>()
    const dateTimeRoots: string[] = []
    const rawNodes: Array<{
      nodeId: string
      role: string
      name: string
      value: string
      backendDOMNodeId: number | null
      childIds: string[]
      isFormField: boolean
    }> = []

    for (const n of result.nodes) {
      nodeMap.set(n.nodeId, n)
      const role = n.role?.value || 'unknown'
      const roleLower = role.toLowerCase()
      rawNodes.push({
        nodeId: n.nodeId,
        role,
        name: n.name?.value || '',
        value: n.value?.value || '',
        backendDOMNodeId: n.backendDOMNodeId ?? null,
        childIds: n.childIds ?? [],
        isFormField: FORM_AX_ROLES.has(roleLower)
      })
      if (roleLower === 'date' || roleLower === 'time') {
        dateTimeRoots.push(n.nodeId)
      }
    }

    // --- Collect descendant IDs of Date/Time containers (exclude internal spinbuttons etc.) ---
    const excludedIds = new Set<string>()
    for (const rootId of dateTimeRoots) {
      const stack = [rootId]
      while (stack.length > 0) {
        const n = nodeMap.get(stack.pop()!)
        if (n?.childIds) {
          for (const cid of n.childIds) {
            excludedIds.add(cid)
            stack.push(cid)
          }
        }
      }
    }

    // --- Pass 2: build form fields from nodeMap (already built) ---
    const fields: Array<{
      tagName: string
      type: string
      name: string
      id: string
      placeholder: string
      label: string
      required: boolean
      value: string
      visible: boolean
      backendNodeId: number | null
    }> = []

    for (const n of result.nodes) {
      if (excludedIds.has(n.nodeId)) continue
      const role = (n.role?.value || '').toLowerCase()
      if (!FORM_AX_ROLES.has(role)) continue

      const name = n.name?.value?.trim() || ''
      const value = n.value?.value || ''

      // Extract required from properties
      let required = false
      if (n.properties) {
        for (const prop of n.properties) {
          if (prop.name === 'required' && prop.value?.value === 'true') {
            required = true
            break
          }
        }
      }

      const { tagName, type } = axRoleToTagType(role)

      fields.push({
        tagName,
        type,
        name: '',
        id: n.nodeId,
        placeholder: '',
        label: name,
        required,
        value,
        visible: true,
        backendNodeId: n.backendDOMNodeId ?? null
      })
    }

    log.debug(
      `detect-fields: found ${fields.length} form fields out of ${rawNodes.length} AX nodes`
    )
    return { fields, rawNodes }
  } catch (e) {
    log.error('detect-fields: CDP command failed:', e)
    return { fields: [], rawNodes: [] }
  } finally {
    try {
      wc.debugger.detach()
      log.debug('detect-fields: debugger detached')
    } catch {
      /* ignore */
    }
  }
})

// ============================================================
// LLM Chat IPC handlers
// ============================================================

// --- Test Model Connection ---

ipcMain.handle(
  IPC_MODEL_TEST_CONNECTION,
  async (_event, config: LocalModelConfig & { source?: string }) => {
    log.info(`model:test-connection: provider=${config.provider} model=${config.name}`)

    // ── Trace span ──
    const span = startSpan('model-test')
    span.provider = config.provider
    span.model = config.name
    let result: { ok: boolean; message: string }

    try {
      const adapter = getAdapter(config.provider)
      const baseUrl = (config.baseUrl || '').replace(/\/$/, '')
      const endpoint = adapter.endpoint(baseUrl, false)
      span.endpoint = endpoint

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...adapter.authHeaders(config.apiKey || ''),
      }
      span.setRequestHeaders(headers)

      const reqBody = adapter.buildRequestBody(
        config.name,
        [{ role: 'user', content: 'Hi' }],
        { max_tokens: 5, temperature: 0, stream: false }
      )
      const body = JSON.stringify(reqBody)
      span.requestBody = body

      log.info(`test-connection: POST ${endpoint}`)
      log.info(`test-connection: model=${config.name} provider=${config.provider}`)
      log.info(`test-connection: apiKey first/last 4=${config.apiKey ? config.apiKey.slice(0,4)+'...'+config.apiKey.slice(-4) : '(empty)'}`)
      log.info(`test-connection: headers keys=${Object.keys(headers).join(', ')}`)
      log.info(`test-connection: body=${body.slice(0, 300)}`)

      // DNS pre-check
      try {
        const urlObj = new URL(endpoint)
        const dnsStart = Date.now()
        const { lookup } = await import('dns/promises')
        span.addEvent('pipeline.dns')
        const dnsResult = await lookup(urlObj.hostname)
        const dnsElapsed = Date.now() - dnsStart
        span.addEvent('pipeline.dns_done', { hostname: urlObj.hostname, address: dnsResult.address, ms: dnsElapsed })
        log.info(`test-connection: DNS resolved ${urlObj.hostname} → ${dnsResult.address} in ${dnsElapsed}ms`)
      } catch (dnsErr: any) {
        log.error(`test-connection: DNS resolution FAILED: ${dnsErr.message} (code=${dnsErr.code})`)
        span.addEvent('pipeline.dns_error', { error: dnsErr.message, code: dnsErr.code || '' })
        result = { ok: false, message: `DNS error: cannot resolve hostname — ${dnsErr.message}` }
        span.setError(result.message)
        return { ...result, traceSpanId: span.spanId }
      }

      const controller = new AbortController()
      const timeoutId = setTimeout(() => {
        log.warn('test-connection: timeout reached (10s), aborting')
        controller.abort()
      }, 10000)

      const startMs = Date.now()
      span.addEvent('pipeline.api_call')
      let response: Response
      try {
        response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body,
          signal: controller.signal,
        })
      } catch (fetchErr: any) {
        const elapsed = Date.now() - startMs
        span.httpStatus = 0
        log.error(`test-connection: fetch failed after ${elapsed}ms: ${fetchErr.message}`)
        log.error(`test-connection: fetch error name=${fetchErr.name} cause=${fetchErr.cause} code=${fetchErr.code}`)
        if (fetchErr.cause) {
          log.error(`test-connection: cause details: ${JSON.stringify(fetchErr.cause)}`)
        }
        clearTimeout(timeoutId)
        if (fetchErr.name === 'AbortError') {
          result = { ok: false, message: `Connection timed out after ${elapsed}ms` }
          span.setError(result.message)
          return { ...result, traceSpanId: span.spanId }
        }
        if (fetchErr.code === 'ENOTFOUND' || fetchErr.message?.includes('ENOTFOUND')) {
          result = { ok: false, message: `DNS error: hostname not found` }
          span.setError(result.message)
          return { ...result, traceSpanId: span.spanId }
        }
        if (fetchErr.code === 'ECONNREFUSED' || fetchErr.message?.includes('ECONNREFUSED')) {
          result = { ok: false, message: `Connection refused — is the server running?` }
          span.setError(result.message)
          return { ...result, traceSpanId: span.spanId }
        }
        if (fetchErr.code === 'ETIMEDOUT' || fetchErr.message?.includes('ETIMEDOUT')) {
          result = { ok: false, message: `TCP connection timed out after ${elapsed}ms` }
          span.setError(result.message)
          return { ...result, traceSpanId: span.spanId }
        }
        result = { ok: false, message: fetchErr.message || 'Connection failed' }
        span.setError(result.message)
        return { ...result, traceSpanId: span.spanId }
      }
      clearTimeout(timeoutId)

      const elapsed = Date.now() - startMs
      span.httpStatus = response.status
      span.addEvent('pipeline.api_call_done', { status: response.status, ms: elapsed })
      log.info(`test-connection: response status=${response.status} after ${elapsed}ms`)

      if (response.ok) {
        const respText = await response.text().catch(() => '')
        span.responseBody = respText
        span.addEvent('pipeline.parse')
        log.info(`test-connection: OK, body=${respText.slice(0, 300)}`)
        result = { ok: true, message: 'Connection successful' }
        span.setOk()
        return { ...result, traceSpanId: span.spanId }
      }
      const errText = await response.text().catch(() => '')
      span.responseBody = errText
      log.error(`test-connection: FAIL status=${response.status} body=${errText.slice(0, 500)}`)
      result = { ok: false, message: `HTTP ${response.status}: ${errText.slice(0, 150)}` }
      span.setError(result.message)
      return { ...result, traceSpanId: span.spanId }
    } catch (e: any) {
      log.error(`test-connection: unexpected error: ${e.message}`, e)
      result = { ok: false, message: e.message || 'Connection failed' }
      span.setError(result.message)
      return { ...result, traceSpanId: span.spanId }
    } finally {
      finishSpan(span.spanId)
    }
  }
)

// --- Page Summarization (non-streaming) ---

ipcMain.handle(
  IPC_PAGE_SUMMARIZE,
  async (
    _event,
    params: {
      config: LocalModelConfig
      messages: ChatMessage[]
    }
  ): Promise<string | null> => {
    log.info(`page:summarize: provider=${params.config.provider} model=${params.config.name}`)

    const span = startSpan('page-summarize')
    span.provider = params.config.provider
    span.model = params.config.name

    let fetchStart = 0
    try {
      const adapter = getAdapter(params.config.provider)
      const baseUrl = (params.config.baseUrl || '').replace(/\/$/, '')
      const endpoint = adapter.endpoint(baseUrl, false)
      span.endpoint = endpoint

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...adapter.authHeaders(params.config.apiKey || ''),
      }
      span.setRequestHeaders(headers)

      const reqBody = adapter.buildRequestBody(
        params.config.name,
        params.messages,
        { max_tokens: 512, temperature: 0.3, stream: false }
      )
      const body = JSON.stringify(reqBody)
      span.requestBody = body

      log.info(`page:summarize: POST ${endpoint} | model=${params.config.name} | body=${body.length} chars`)
      log.info(`page:summarize: stream=${(reqBody as any).stream}`)
      log.debug(`page:summarize: body=${body.slice(0, 300)}`)

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 60_000)

      span.addEvent('pipeline.api_call')
      fetchStart = Date.now()
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      span.httpStatus = response.status
      const apiMs = Date.now() - fetchStart
      span.addEvent('pipeline.api_call_done', { status: response.status, ms: apiMs })
      log.info(`page:summarize: response status=${response.status} after ${apiMs}ms`)

      if (!response.ok) {
        const errText = await response.text().catch(() => '')
        log.error(`page:summarize: HTTP ${response.status}: ${errText.slice(0, 200)}`)
        span.setError(`HTTP ${response.status}`)
        throw new Error(`LLM API returned HTTP ${response.status}${errText ? ': ' + errText.slice(0, 100) : ''}`)
      }

      span.addEvent('pipeline.parse')
      const data = await response.json()
      const content = data.choices?.[0]?.message?.content
      span.responseBody = JSON.stringify(data)

      if (content && typeof content === 'string') {
        log.info(`page:summarize: got ${content.length} chars`)
        span.setOk()
        return content.trim()
      }
      log.warn(`page:summarize: unexpected response shape: ${JSON.stringify(data).slice(0, 300)}`)
      span.setError('Unexpected response shape')
      return null
    } catch (e: any) {
      const elapsed = Date.now() - fetchStart
      if (e.name === 'AbortError') {
        log.warn(`page:summarize: timed out after ${elapsed}ms`)
        span.setError(`Timeout after ${elapsed}ms`)
        throw new Error(`Page summarization timed out after ${Math.round(elapsed / 1000)}s — the LLM may be overloaded, try again or switch to a faster model`)
      } else if (e.message?.startsWith('LLM API returned')) {
        // re-throw HTTP errors that we already wrapped above
        throw e
      } else {
        log.error(`page:summarize: fetch error after ${elapsed}ms: name=${e.name} code=${e.code} message=${e.message}`)
        span.setError(e.message)
        throw new Error(`Network error: ${e.message || 'Unknown error'}`)
      }
    } finally {
      finishSpan(span.spanId)
    }
  }
)

// --- Batch Pre-fill (streaming SSE) ---

ipcMain.handle(
  IPC_BATCH_SUGGEST,
  async (
    _event,
    params: {
      config: LocalModelConfig
      fields: FieldSummary[]
      structuredCtx: string
    }
  ): Promise<BatchSuggestResult | null> => {
    const { config, fields, structuredCtx } = params
    log.info(`batch:suggest: ${fields.length} fields, provider=${config.provider}`)

    const span = startSpan('batch-suggest')
    span.provider = config.provider
    span.model = config.name

    let ctx: any
    try { ctx = JSON.parse(structuredCtx) } catch { ctx = null }
    const pageSummary: string = ctx?.page || ''
    const ctxFields: any[] = ctx?.fields || []

    const fieldList = ctxFields.map((f: any) =>
      `${f.index}. key="${f.key}" | format: ${f.format}${f.required ? ' | REQUIRED' : ''}`
      + `${f.placeholder ? ` | hint: "${f.placeholder}"` : ''}`
    ).join('\n')

    const siblingInfo = ctxFields.length > 1
      ? `\nAll field keys (use EXACTLY these): ${ctxFields.map((f: any) => `"${f.key}"`).join(', ')}`
      : ''

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are a form-filling AI. Return ONLY JSON with suggestions for ALL fields.

Output format:
{"suggestions":[{"fieldKey":"...","suggestedValue":"...","confidence":"high|medium|low","reasoning":"..."}],"overallHint":"..."}

RULES:
- fieldKey: EXACTLY match a key from the list — no changes
- suggestedValue: obey the "format" constraint
- Values MUST be internally consistent
- REQUIRED → at least medium confidence`
      },
      {
        role: 'user',
        content: `Page: ${pageSummary || 'unknown'}\n\nFields:\n${fieldList}${siblingInfo}\n\nFill ALL fields.`
      }
    ]

    let fetchStart = 0
    try {
      const adapter = getAdapter(config.provider)
      const baseUrl = (config.baseUrl || '').replace(/\/$/, '')
      const endpoint = adapter.endpoint(baseUrl, true)
      span.endpoint = endpoint

      const reqBody = adapter.buildRequestBody(config.name, messages, {
        max_tokens: 2048, temperature: 0.2, stream: true
      })

      // streaming + strict json_schema 不兼容 → 用 json_object
      ;(reqBody as any).response_format = { type: 'json_object' }
      log.info('batch:suggest: using json_object (streaming)')

      const bodyStr = JSON.stringify(reqBody)
      span.requestBody = bodyStr
      log.info(`batch:suggest: POST ${endpoint} | body=${bodyStr.length} chars`)

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 90_000)

      span.addEvent('pipeline.api_call')
      fetchStart = Date.now()
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...adapter.authHeaders(config.apiKey || ''),
        },
        body: bodyStr,
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      span.httpStatus = response.status
      const apiMs = Date.now() - fetchStart
      span.addEvent('pipeline.api_call_done', { status: response.status, ms: apiMs })
      log.info(`batch:suggest: response status=${response.status} after ${apiMs}ms`)

      if (!response.ok) {
        const errText = await response.text().catch(() => '')
        log.error(`batch:suggest: HTTP ${response.status}: ${errText.slice(0, 200)}`)
        span.setError(`HTTP ${response.status}`)
        return { result: null, traceSpanId: span.spanId } as any
      }

      // ── SSE streaming read ──
      span.addEvent('pipeline.stream_start')
      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      let chunkCount = 0
      let contentAccum = ''

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          const events = buf.split('\n\n')
          buf = events.pop() || ''
          for (const ev of events) {
            if (!ev.trim()) continue
            const chunk = adapter.parseSSEEvent(ev.trim())
            if (!chunk) continue
            if (chunk.token) {
              if (chunkCount === 0) {
                span.addEvent('pipeline.first_token')
                log.info('batch:suggest: first token received')
              }
              chunkCount++
              contentAccum += chunk.token
              // Push streaming progress to renderer
              _event.sender.send(IPC_BATCH_SUGGEST_PROGRESS, { contentSoFar: contentAccum })
            }
          }
        }
      } finally {
        reader.releaseLock()
      }

      log.info(`batch:suggest: stream complete | chunks=${chunkCount} content=${contentAccum.length} chars`)
      span.responseBody = contentAccum
      span.addEvent('pipeline.parse')

      const jsonMatch = contentAccum.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        log.warn('batch:suggest: no JSON found in response:', contentAccum.slice(0, 300))
        span.setError('No JSON found in response')
        return { result: null, traceSpanId: span.spanId } as any
      }
      const result: BatchSuggestResult = JSON.parse(jsonMatch[0])

      // Log per-field summary for debugging
      log.info(`batch:suggest: parsed ${result.suggestions.length} suggestions:`)
      for (const s of result.suggestions) {
        log.info(`  [${s.confidence}] "${s.fieldKey}" → "${s.suggestedValue}" | ${s.reasoning}`)
      }
      span.setOk()
      span.log('info', `Parsed ${result.suggestions.length} suggestions`)
      return { result, traceSpanId: span.spanId } as any
    } catch (e: any) {
      const elapsed = Date.now() - fetchStart
      if (e.name === 'AbortError') {
        log.warn(`batch:suggest: timed out after ${elapsed}ms`)
        span.setError(`Timeout after ${elapsed}ms`)
      } else {
        log.error(`batch:suggest: fetch error after ${elapsed}ms: name=${e.name} code=${e.code} message=${e.message} cause=${JSON.stringify(e.cause)}`)
        span.setError(e.message)
      }
      return { result: null, traceSpanId: span.spanId } as any
    } finally {
      finishSpan(span.spanId)
    }
  }
)

// --- Streaming Chat ---

const activeStreams = new Map<number, AbortController>()
const activeStreamSpans = new Map<number, string>() // sender.id → spanId
const BATCH_MS = 16 // batch 16ms → ~60fps rendering

ipcMain.on(
  IPC_LLM_STREAM_START,
  (
    event,
    params: {
      config: LocalModelConfig
      messages: ChatMessage[]
      requestId: string
      options?: ChatOptions
    }
  ) => {
    const sender = event.sender
    log.debug(`llm:stream:start: requestId=${params.requestId}`)

    // ── Trace: create span for the full stream lifecycle ──
    const span = startSpan('chat-stream')
    span.provider = params.config.provider
    span.model = params.config.name
    // Capture request body (truncated) for trace viewer
    try {
      span.requestBody = JSON.stringify({
        model: params.config.name,
        messages: params.messages.map(m => ({ role: m.role, content: m.content })),
        options: params.options,
      })
    } catch { /* ignore stringify errors */ }
    span.log('info', `Stream started: model=${params.config.name} provider=${params.config.provider}`)
    span.addEvent('pipeline.stream_start')
    activeStreamSpans.set(sender.id, span.spanId)

    const controller = new AbortController()
    activeStreams.set(sender.id, controller)

    let batchBuf = ''
    let batchTimer: ReturnType<typeof setTimeout> | null = null
    let chunkCount = 0
    let responseAccum = '' // accumulated response for trace
    const flush = (): void => {
      if (batchBuf) {
        sender.send(IPC_LLM_STREAM_CHUNK, {
          requestId: params.requestId,
          chunk: { token: batchBuf, done: false },
          traceSpanId: span.spanId,
          traceId: span.traceId,
        })
        batchBuf = ''
      }
      batchTimer = null
    }

    const onDestroyed = (): void => {
      controller.abort()
      activeStreams.delete(sender.id)
      // Finish trace on destroy
      const spanId = activeStreamSpans.get(sender.id)
      if (spanId) {
        span.log('info', `Stream destroyed`)
        finishSpan(spanId)
        activeStreamSpans.delete(sender.id)
      }
    }
    sender.once('destroyed', onDestroyed)

    localChatStream(
      params.config,
      params.messages,
      (chunk) => {
        if (sender.isDestroyed()) return
        if (chunk.token) {
          batchBuf += chunk.token
          responseAccum += chunk.token
          if (!batchTimer) batchTimer = setTimeout(flush, BATCH_MS)
        } else {
          flush()
          chunkCount++
          if (chunkCount === 1) {
            span.addEvent('pipeline.first_token')
          }
          sender.send(IPC_LLM_STREAM_CHUNK, {
            requestId: params.requestId,
            chunk,
            traceSpanId: span.spanId,
            traceId: span.traceId,
          })
        }
      },
      params.options,
      controller.signal
    )
      .then(() => {
        span.responseBody = responseAccum
        span.addEvent('pipeline.stream_done', { chunks: chunkCount })
        span.log('info', `Stream complete: chunks=${chunkCount}`)
        span.setOk()
      })
      .catch((err) => {
        if (!controller.signal.aborted && !sender.isDestroyed()) {
          log.error(
            `Stream error for ${params.requestId}: ${err.message}`
          )
          span.responseBody = responseAccum
          span.setError(err.message)
          span.log('error', `Stream error: ${err.message}`)
          sender.send(IPC_LLM_STREAM_ERROR, {
            requestId: params.requestId,
            error: String(err),
            traceSpanId: span.spanId,
            traceId: span.traceId,
          })
        }
      })
      .finally(() => {
        flush()
        if (batchTimer) clearTimeout(batchTimer)
        sender.removeListener('destroyed', onDestroyed)
        activeStreams.delete(sender.id)
        const spanId = activeStreamSpans.get(sender.id)
        if (spanId) {
          finishSpan(spanId)
          activeStreamSpans.delete(sender.id)
        }
        log.info(`Stream ended: requestId=${params.requestId}`)
      })
  }
)

ipcMain.on(IPC_LLM_STREAM_STOP, (event) => {
  log.info('llm:stream:stop')
  const c = activeStreams.get(event.sender.id)
  if (c) {
    c.abort()
    activeStreams.delete(event.sender.id)
  }
})

// ============================================================
// Trace IPC Handlers
// ============================================================

ipcMain.handle(IPC_TRACE_GET, async (_event, spanId: string): Promise<TraceSpanDetail | null> => {
  const span = getTraceStore().getDetail(spanId)
  return span ?? null
})

ipcMain.handle(IPC_TRACE_LIST, async (_event, filter?: TraceQueryFilter): Promise<TraceSpanDetail[]> => {
  return getTraceStore().query(filter)
})

ipcMain.handle(IPC_TRACE_EXPORT, async (_event, params: { profile: ExportProfile; filter?: TraceQueryFilter }): Promise<{ ok: boolean; message: string }> => {
  const spans = getTraceStore().exportRange({
    since: params.filter?.since,
    until: undefined,
    kind: params.filter?.kind,
  })
  const result = await exportSpans(spans, params.profile)
  return { ok: result.ok, message: result.message }
})

// ============================================================
// App Lifecycle
// ============================================================

app.whenReady().then(() => {
  log.info('App ready')

  // Disable default Electron menu — all functionality is in the sidebar UI
  Menu.setApplicationMenu(null)

  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    log.info('Browser window created')
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', function () {
    log.info('App activated')
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}).catch((err) => {
  log.error('App failed to start:', err)
})

app.on('window-all-closed', () => {
  log.info('All windows closed')
  if (process.platform !== 'darwin') {
    log.info('Quitting app (non-macOS)')
    app.quit()
  }
})
