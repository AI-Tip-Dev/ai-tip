/**
 * Webview Preload — injected into every page loaded in the <webview> tag.
 *
 * 1. Exposes `window.__bridge__` with a request/response protocol over
 *    ipcRenderer.sendToHost, enabling the injected SDK IIFE to communicate
 *    with the Sidebar renderer.
 *
 * 2. Injects the SDK IIFE bundle via a <script> tag, so the SDK auto-initializes
 *    on every page — including pages that haven't integrated @ai-tip/sdk.
 *
 * ⚠️  This runs in the page's context (not Node.js). Only contextBridge,
 *     ipcRenderer, and DOM APIs are available.
 */

import { contextBridge, ipcRenderer } from 'electron'

// ============================================================
// Request/Response protocol
// ============================================================

const TIMEOUT_MS = 30_000
const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()

function bridgeRequest(method: string, args: unknown[]): Promise<unknown> {
  const id = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    ipcRenderer.sendToHost('bridge:request', { id, method, args })
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id)
        reject(new Error(`Bridge request timeout (${TIMEOUT_MS}ms): ${method}`))
      }
    }, TIMEOUT_MS)
  })
}

ipcRenderer.on('bridge:response', (_event: unknown, data: { id: string; result?: unknown; error?: string }) => {
  const p = pending.get(data.id)
  if (!p) return
  pending.delete(data.id)
  data.error ? p.reject(new Error(data.error)) : p.resolve(data.result)
})

// ============================================================
// Events (sidebar → webview push)
// ============================================================

type Callback = (data: unknown) => void
const eventListeners = new Map<string, Set<Callback>>()

ipcRenderer.on('bridge:event', (_event: unknown, data: { event: string; payload: unknown }) => {
  const cbs = eventListeners.get(data.event)
  if (cbs) for (const cb of cbs) { try { cb(data.payload) } catch { /* skip */ } }
})

function onEvent(event: string, cb: Callback): void {
  if (!eventListeners.has(event)) eventListeners.set(event, new Set())
  eventListeners.get(event)!.add(cb)
}

function offEvent(event: string, cb: Callback): void {
  eventListeners.get(event)?.delete(cb)
}

// ============================================================
// window.__bridge__ (minimal transport + API stubs)
// ============================================================

/**
 * Helper: create a domain API where each method routes through bridgeRequest.
 * Method names follow the `domain:action` convention.
 */
function createDomain(domain: string, methods: string[]): Record<string, (...args: any[]) => Promise<any>> {
  const api: Record<string, (...args: any[]) => Promise<any>> = {}
  for (const name of methods) {
    api[name] = (...args: any[]) => bridgeRequest(`${domain}:${name}`, args)
  }
  return api
}

// Define methods per domain (no type imports needed — SDK IIFE handles types)
const bridge = {
  /**
   * Raw sendToHost — used by the AI Tip injected script to send
   * ipc-message events directly to the renderer process.
   * The injected script calls bridge.sendToHost(channel, data)
   * which maps to ipcRenderer.sendToHost(channel, data).
   */
  sendToHost(channel: string, ...args: any[]): void {
    ipcRenderer.sendToHost(channel, ...args)
  },

  meta: Object.freeze({
    version: '1.0.0',
    env: 'electron' as const,
    hostName: 'AI Tip Desktop',
    capabilities: ['ai-tip', 'form-detect', 'llm', 'batch-fill', 'page-summary'],
  }),

  aiTip: {
    onFieldSelected(cb: Callback): void { onEvent('ai-tip:field-selected', cb) },
    offFieldSelected(cb: Callback): void { offEvent('ai-tip:field-selected', cb) },
    fillField(value: any, context: any): Promise<any> { return bridgeRequest('ai-tip:fillField', [value, context]) },
    highlightField(context: any): Promise<any> { return bridgeRequest('ai-tip:highlightField', [context]) },
    setButtonState(state: any): Promise<any> { return bridgeRequest('ai-tip:setButtonState', [state]) },
    setEnabled(enabled: any): Promise<any> { return bridgeRequest('ai-tip:setEnabled', [enabled]) },
    isEnabled(): Promise<any> { return bridgeRequest('ai-tip:isEnabled', []) },
  },

  formDetect: createDomain('form-detect', ['detectFields', 'buildAXTreeText']),

  pageSummary: createDomain('page-summary', ['summarize']),

  batchFill: {
    suggest(config: any, fields: any, ctx: any): Promise<any> { return bridgeRequest('batch-fill:suggest', [config, fields, ctx]) },
    onProgress(cb: Callback): void { onEvent('batch-fill:progress', cb) },
    offProgress(cb: Callback): void { offEvent('batch-fill:progress', cb) },
    autoFill(result: any, fields: any): Promise<any> { return bridgeRequest('batch-fill:autoFill', [result, fields]) },
  },

  llm: {
    testConnection(config: any): Promise<any> { return bridgeRequest('llm:testConnection', [config]) },
    startStream(config: any, messages: any, requestId: any, options?: any): void { bridgeRequest('llm:startStream', [config, messages, requestId, options]) },
    stopStream(): void { bridgeRequest('llm:stopStream', []) },
    onStreamChunk(cb: Callback): void { onEvent('llm:stream-chunk', cb) },
    onStreamError(cb: Callback): void { onEvent('llm:stream-error', cb) },
    removeStreamListeners(): void { eventListeners.delete('llm:stream-chunk'); eventListeners.delete('llm:stream-error') },
  },

  modelConfig: createDomain('model-config', [
    'list', 'save', 'delete', 'setActive', 'getActive', 'listProviders', 'getAdapter',
  ]),

  session: createDomain('session', [
    'listPages', 'initPage', 'activateField', 'updatePageContext',
    'updatePageTitle', 'sendMessage', 'getMessages', 'archivePage',
    'setSidebarView', 'getSidebarView',
  ]),

  webview: createDomain('webview', [
    'navigateTo', 'goBack', 'goForward', 'reload', 'stop',
    'openLocalFile', 'getURL', 'getTitle',
  ]),

  trace: createDomain('trace', ['getDetail', 'list', 'exportTraces']),

  i18n: createDomain('i18n', ['t', 'getLocale', 'setLocale', 'registerLocale']),

  history: createDomain('history', ['list', 'add', 'clear', 'remove']),

  settings: createDomain('settings', ['get', 'set', 'getAll', 'delete']),

  // Extension points (no-op in webview context)
  use: async (_plugin: any) => {},
  useMiddleware: (_mw: any) => {},
  onHook: (_name: any, _handler: any) => {},
  offHook: (_name: any, _handler: any) => {},
  destroy: () => { pending.clear(); eventListeners.clear() },
}

contextBridge.exposeInMainWorld('__bridge__', bridge)

// ============================================================
// SDK IIFE injection moved to Vue renderer (useWebview.ts)
// ============================================================
// The @ai-tip/sdk IIFE bundle is now injected conditionally by the
// Vue renderer when AI Tip is enabled, via wv.executeJavaScript().
// This gives the user control over when the SDK is loaded, rather
// than injecting it unconditionally on every page.
// The core bridge (window.__bridge__) is always available via
// contextBridge above — the SDK IIFE is an optional convenience layer.




