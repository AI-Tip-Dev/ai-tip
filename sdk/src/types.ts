/**
 * @ai-tip/sdk — Public Type Definitions
 *
 * This file is the **single source of truth** for all types in the three-repo architecture.
 * `desktop` and `extension` repos import these types via `devDependencies` to ensure
 * the `window.__bridge__` structure matches what the SDK expects.
 *
 * IMPORTANT: All types exported here are part of the public API contract.
 * Breaking changes require a major version bump.
 */

// ============================================================
// Environment
// ============================================================

/** Environment where the SDK is currently running */
export type BridgeEnv = 'electron' | 'extension' | 'unknown'

// ============================================================
// Bridge Metadata
// ============================================================

/** Metadata exposed by the host environment to the SDK */
export interface BridgeMeta {
  /** Host environment version (semver) */
  version: string
  /** Host environment type */
  env: BridgeEnv
  /** Optional: minimum SDK version required by this host */
  minSdkVersion?: string
  /** Human-readable host name (e.g. "AI Tip Desktop", "AI Tip Extension") */
  hostName?: string
  /** List of capabilities the host supports */
  capabilities?: string[]
}

// ============================================================
// Transport (host communication layer)
// ============================================================

/**
 * Transport interface — the abstraction layer between SDK and host environment.
 *
 * `desktop` (Electron preload) and `extension` (content-script) implement this
 * interface, either directly or via message-passing protocol.
 */
export interface Transport {
  /**
   * Invoke a named method on the host with positional arguments.
   * Returns a Promise that resolves with the method's return value.
   */
  invoke(method: string, args: unknown[]): Promise<unknown>

  /**
   * Subscribe to a named event pushed from the host.
   * Optional — only supported in environments that have push capability.
   */
  onEvent?(event: string, callback: (data: unknown) => void): void

  /**
   * Unsubscribe from a named event.
   * Optional — only supported in environments that have push capability.
   */
  offEvent?(event: string, callback: (data: unknown) => void): void
}

// ============================================================
// Bridge API (top-level facade)
// ============================================================

/**
 * BridgeAPI — the top-level object returned by `createBridge()`.
 *
 * SaaS code interacts with this object exclusively.
 * All underlying transport details are hidden.
 */
export interface BridgeAPI {
  /** Metadata about the connected host environment */
  readonly meta: BridgeMeta

  // ── AI Tip 核心 (4) ──
  /** AI Tip button interaction & field filling */
  readonly aiTip: AITipAPI
  /** Form field detection (CDP) */
  readonly formDetect: FormDetectAPI
  /** Page summarization via LLM */
  readonly pageSummary: PageSummaryAPI
  /** Batch pre-fill suggestions */
  readonly batchFill: BatchFillAPI

  // ── LLM 相关 (2) ──
  /** LLM streaming chat */
  readonly llm: LLMAPI
  /** Model configuration management */
  readonly modelConfig: ModelConfigAPI

  // ── 会话与 UI (2) ──
  /** Page session hierarchy */
  readonly session: SessionAPI
  /** WebView navigation control */
  readonly webview: WebviewAPI

  // ── 基础设施 (4) ──
  /** Observability tracing */
  readonly trace: TraceAPI
  /** Internationalization */
  readonly i18n: I18nAPI
  /** Browsing history */
  readonly history: HistoryAPI
  /** Key-value settings */
  readonly settings: SettingsAPI

  // ── 扩展点 ──
  /** Register a plugin */
  use(plugin: SDKPlugin): Promise<void>
  /** Register middleware into the invoke pipeline */
  useMiddleware(mw: Middleware): void
  /** Subscribe to a lifecycle hook */
  onHook<T extends HookName>(name: T, handler: HookHandler<T>): void
  /** Unsubscribe from a lifecycle hook */
  offHook<T extends HookName>(name: T, handler: HookHandler<T>): void
  /** Destroy the bridge and release all resources */
  destroy(): void
}

// ============================================================
// Error Types
// ============================================================

/** Thrown when the bridge is not available in the current environment */
export class BridgeNotAvailableError extends Error {
  public readonly code = 'BRIDGE_NOT_AVAILABLE' as const

  constructor(message = 'Bridge is not available in this environment. Please run in Electron or install the browser extension.') {
    super(message)
    this.name = 'BridgeNotAvailableError'
  }
}

/** Thrown when a bridge method call fails */
export class BridgeInvokeError extends Error {
  public readonly code = 'BRIDGE_INVOKE_ERROR' as const
  public readonly method: string

  constructor(method: string, message: string) {
    super(`Bridge invoke '${method}' failed: ${message}`)
    this.name = 'BridgeInvokeError'
    this.method = method
  }
}

/** Thrown when the SDK version is incompatible with the host */
export class BridgeVersionError extends Error {
  public readonly code = 'BRIDGE_VERSION_ERROR' as const
  public readonly hostVersion: string
  public readonly sdkVersion: string

  constructor(hostVersion: string, sdkVersion: string) {
    super(`SDK v${sdkVersion} is incompatible with host v${hostVersion}. Please upgrade.`)
    this.name = 'BridgeVersionError'
    this.hostVersion = hostVersion
    this.sdkVersion = sdkVersion
  }
}

/** Thrown when a request times out */
export class BridgeTimeoutError extends Error {
  public readonly code = 'BRIDGE_TIMEOUT' as const
  public readonly method: string
  public readonly timeoutMs: number

  constructor(method: string, timeoutMs: number) {
    super(`Bridge invoke '${method}' timed out after ${timeoutMs}ms`)
    this.name = 'BridgeTimeoutError'
    this.method = method
    this.timeoutMs = timeoutMs
  }
}

/** Thrown when the host denies permission for an operation */
export class BridgePermissionError extends Error {
  public readonly code = 'BRIDGE_PERMISSION_DENIED' as const
  public readonly method: string

  constructor(method: string, message?: string) {
    super(message || `Permission denied for '${method}'`)
    this.name = 'BridgePermissionError'
    this.method = method
  }
}

/** Thrown when the host does not support the requested capability */
export class BridgeUnsupportedError extends Error {
  public readonly code = 'BRIDGE_UNSUPPORTED' as const
  public readonly method: string

  constructor(method: string) {
    super(`Operation '${method}' is not supported in this environment`)
    this.name = 'BridgeUnsupportedError'
    this.method = method
  }
}

// ============================================================
// AI Tip API
// ============================================================

/** Context about a form field that the AI button was clicked on */
export interface FieldContext {
  tagName: string
  type: string
  name: string
  id: string
  placeholder: string
  value: string
  ariaLabel: string
  label: string
  labelProximity?: string
  formPurpose: string
  siblingLabels: string[]
  pageTitle: string
  pageUrl: string
  rect: { top: number; left: number; width: number; height: number }
}

/** Result of filling a field */
export interface FillResult {
  ok: boolean
  reason?: string
  label?: string
  error?: string
  stack?: string
}

/** AI Tip API surface */
export interface AITipAPI {
  /** Subscribe to field selection events */
  onFieldSelected(callback: (context: FieldContext) => void): void
  /** Unsubscribe from field selection events */
  offFieldSelected(callback: (context: FieldContext) => void): void

  /** Fill a value into the target field (5-strategy lookup) */
  fillField(value: string, context: FieldContext): Promise<FillResult>
  /** Highlight a field with a purple glow */
  highlightField(context: FieldContext): Promise<void>
  /** Set the AI button visual state */
  setButtonState(state: 'idle' | 'loading'): Promise<void>
  /** Enable or disable AI Tip */
  setEnabled(enabled: boolean): Promise<void>
  /** Check if AI Tip is enabled */
  isEnabled(): Promise<boolean>
}

// ============================================================
// Form Detection API (CDP)
// ============================================================

/** A simplified form field extracted from the accessibility tree */
export interface SimpleField {
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
}

/** A raw accessibility tree node from CDP */
export interface RawAXNode {
  nodeId: string
  role: string
  name: string
  value: string
  backendDOMNodeId: number | null
  childIds: string[]
  isFormField: boolean
}

/** Result of form field detection */
export interface DetectFieldsResult {
  fields: SimpleField[]
  rawNodes: RawAXNode[]
}

/** Form detection API surface */
export interface FormDetectAPI {
  /** Detect form fields via CDP Accessibility.getFullAXTree */
  detectFields(webContentsId: number): Promise<DetectFieldsResult>
  /** Build a text representation of the AX tree for LLM context */
  buildAXTreeText(rawNodes: RawAXNode[]): Promise<string>
}

// ============================================================
// Page Summary API (LLM)
// ============================================================

/** AI-generated page context */
export interface PageContext {
  summary: string
  url: string
  title: string
  fields: Array<{ label: string; type: string; required: boolean; value: string }>
  generatedAt: number
}

/** Page summary API surface */
export interface PageSummaryAPI {
  /** Summarize the current page via LLM (non-streaming) */
  summarize(config: ModelConfig, messages: ChatMessage[]): Promise<string | null>
}

// ============================================================
// Batch Pre-fill API
// ============================================================

/** Lightweight field info for batch LLM prompts */
export interface FieldSummary {
  label: string
  type: string
  name: string
  placeholder: string
  required: boolean
  currentValue: string
  typeHint: string
}

/** Single field suggestion from batch pre-fill */
export interface BatchFieldSuggestion {
  fieldKey: string
  suggestedValue: string
  confidence: 'high' | 'medium' | 'low'
  reasoning: string
}

/** Batch pre-fill result */
export interface BatchSuggestResult {
  suggestions: BatchFieldSuggestion[]
  overallHint?: string
}

/** Batch pre-fill API surface */
export interface BatchFillAPI {
  /** Request batch suggestions for all fields (streaming SSE) */
  suggest(config: ModelConfig, fields: FieldSummary[], structuredCtx: string): Promise<BatchSuggestResult | null>
  /** Subscribe to streaming progress */
  onProgress(callback: (data: { contentSoFar: string }) => void): void
  /** Unsubscribe from streaming progress */
  offProgress(callback: (data: { contentSoFar: string }) => void): void
  /** Auto-fill high+medium confidence suggestions into the page */
  autoFill(result: BatchSuggestResult, fields: FieldSummary[]): Promise<FillResult[]>
}

// ============================================================
// LLM Chat & Streaming API
// ============================================================

/** A chat message in OpenAI-compatible format */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** Chat completion options */
export interface ChatOptions {
  max_tokens?: number
  temperature?: number
  top_p?: number
  stream?: boolean
  response_format?: { type: 'json_object' | 'text' }
  /** Provider-specific extras */
  [key: string]: unknown
}

/** A streaming token chunk */
export interface StreamChunk {
  token?: string
  done: boolean
  finishReason?: string
  error?: string
}

/** Streaming chunk event pushed from host */
export interface StreamChunkEvent {
  requestId: string
  chunk: StreamChunk
  traceSpanId?: string
  traceId?: string
}

/** Streaming error event pushed from host */
export interface StreamErrorEvent {
  requestId: string
  error: string
  traceSpanId?: string
  traceId?: string
}

/** LLM API surface */
export interface LLMAPI {
  /** Start a streaming chat session */
  startStream(config: ModelConfig, messages: ChatMessage[], requestId: string, options?: ChatOptions): void
  /** Stop the active stream */
  stopStream(): void
  /** Subscribe to streaming chunks (batched at ~16ms for 60fps) */
  onStreamChunk(callback: (data: StreamChunkEvent) => void): void
  /** Subscribe to streaming errors */
  onStreamError(callback: (data: StreamErrorEvent) => void): void
  /** Remove all stream listeners */
  removeStreamListeners(): void
  /** Test model connection */
  testConnection(config: ModelConfig): Promise<ConnectionTestResult>
}

// ============================================================
// Model Configuration API
// ============================================================

/** Local model configuration */
export interface ModelConfig {
  id: string
  name: string
  provider: string
  baseUrl?: string
  apiKey?: string
  temperature?: number
  maxTokens?: number
  source?: 'local' | 'remote'
}

/** Provider metadata */
export interface ProviderMeta {
  name: string
  displayName: string
  defaultBaseUrl: string
  requiresAuth: boolean
}

/** Model connection test result */
export interface ConnectionTestResult {
  ok: boolean
  message: string
  traceSpanId?: string
  latencyMs?: number
}

/**
 * Provider adapter — abstracts LLM provider-specific API differences.
 * Implementations are provided by the host at runtime.
 */
export interface ProviderAdapter {
  name: string
  endpoint(baseUrl: string, isStream: boolean): string
  authHeaders(apiKey: string): Record<string, string>
  buildRequestBody(model: string, messages: ChatMessage[], options?: ChatOptions): unknown
  parseSSEEvent(event: string): StreamChunk | null
}

/** Model config API surface */
export interface ModelConfigAPI {
  /** List all saved model configs */
  list(): Promise<ModelConfig[]>
  /** Save a model config */
  save(config: ModelConfig): Promise<void>
  /** Delete a model config by ID */
  delete(id: string): Promise<void>
  /** Set the active model */
  setActive(id: string): Promise<void>
  /** Get the currently active model */
  getActive(): Promise<ModelConfig | null>
  /** List available LLM providers */
  listProviders(): Promise<ProviderMeta[]>
  /** Get the provider adapter for direct LLM calls */
  getAdapter(provider: string): Promise<ProviderAdapter | null>
}

// ============================================================
// Session Management API
// ============================================================

export type SessionKeyType = 'page-chat' | 'field'

export interface SessionKey {
  type: SessionKeyType
  fieldName?: string
}

export interface SessionFieldMeta {
  label: string
  type: string
  name: string
  placeholder: string
  required: boolean
  value: string
}

export interface SubSession {
  key: SessionKey
  fieldMeta?: FieldContext | null
  messages: ChatMessageItem[]
  createdAt: number
  lastActiveAt: number
}

export interface PageSessionData {
  pageId: string
  pageUrl: string
  pageTitle: string
  pageContext: PageContext | null
  children: SubSession[]
  activeChildIndex: number
  isArchived: boolean
  createdAt: number
  lastActiveAt: number
}

export type SidebarView = 'home' | 'chat'

/** Session API surface */
export interface SessionAPI {
  /** List all page sessions */
  listPages(): Promise<PageSessionData[]>
  /** Initialize or retrieve a page session */
  initPage(url: string, title: string, fields: SimpleField[]): Promise<PageSessionData>
  /** Activate a field sub-session */
  activateField(fieldMeta: SessionFieldMeta): Promise<SubSession>
  /** Update page context (summary) */
  updatePageContext(pageId: string, ctx: PageContext): Promise<void>
  /** Update page title */
  updatePageTitle(pageId: string, title: string): Promise<void>
  /** Send a message to the active sub-session */
  sendMessage(pageId: string, message: ChatMessageItem): Promise<ChatMessageItem>
  /** Get messages for a session */
  getMessages(pageId: string, sessionKey: SessionKey): Promise<ChatMessageItem[]>
  /** Archive a page session */
  archivePage(pageId: string): Promise<void>
  /** Set sidebar view state */
  setSidebarView(view: SidebarView): Promise<void>
  /** Get current sidebar view */
  getSidebarView(): Promise<SidebarView>
}

// ============================================================
// Chat Message Item
// ============================================================

/** Message card (discriminated union) */
export type MessageCard =
  | { type: 'batch-fill'; state: 'trigger' | 'loading' | 'done'; fieldCount: number; traceSpanId?: string; modelName?: string; tokenCount?: number; startedAt?: number }
  | { type: 'suggestion'; fieldKey: string; suggestedValue: string; confidence: 'high' | 'medium' | 'low'; reasoning: string }

/** A chat message item in the session UI */
export interface ChatMessageItem {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  isStreaming?: boolean
  sessionKey?: SessionKey
  usedPageContext?: boolean
  card?: MessageCard
  traceSpanId?: string
  traceDurationMs?: number
  traceError?: string
}

// ============================================================
// Observability / Tracing API
// ============================================================

export interface TraceSpanEvent {
  name: string
  timestampMs: number
  attributes?: Record<string, string | number | boolean>
}

export interface TraceLogEntry {
  level: 'info' | 'debug' | 'warn' | 'error'
  message: string
  timestampMs: number
}

export interface TraceSpanDetail {
  traceId: string
  spanId: string
  parentSpanId?: string
  kind: string
  provider?: string
  model?: string
  temperature?: number
  maxTokens?: number
  endpoint?: string
  httpStatus?: number
  httpMethod?: string
  startMs: number
  endMs?: number
  durationMs?: number
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  status: 'ok' | 'error' | 'unset'
  statusMessage?: string
  events: TraceSpanEvent[]
  logs: TraceLogEntry[]
  requestBody?: string
  responseBody?: string
  attempt?: number
  maxRetries?: number
  attributes?: Record<string, string | number | boolean>
  requestHeaders?: Record<string, string>
}

export interface TraceSpanSummary {
  spanId: string
  traceId: string
  kind: string
  provider?: string
  model?: string
  startMs: number
  durationMs?: number
  status: 'ok' | 'error' | 'unset'
  statusMessage?: string
  promptTokens?: number
  completionTokens?: number
}

export interface TraceQueryFilter {
  kind?: string
  status?: 'ok' | 'error'
  traceId?: string
  since?: number
  until?: number
  provider?: string
  model?: string
  limit?: number
}

export interface ExportProfile {
  name: string
  endpoint: string
  authHeader?: string
}

/** Trace API surface */
export interface TraceAPI {
  /** Get full span detail by spanId */
  getDetail(spanId: string): Promise<TraceSpanDetail | null>
  /** Query span summaries with optional filter */
  list(filter?: TraceQueryFilter): Promise<TraceSpanSummary[]>
  /** Export spans to an OTLP target */
  exportTraces(profile: ExportProfile, filter?: TraceQueryFilter): Promise<{ ok: boolean; message: string }>
}

/** traceLLMCall return shape */
export interface TraceResult {
  spanId: string
  traceId: string
  durationMs: number
  status: 'ok' | 'error'
  statusMessage?: string
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
}

// ============================================================
// WebView API
// ============================================================

/** WebView control API surface */
export interface WebviewAPI {
  navigateTo(url: string): Promise<void>
  goBack(): Promise<void>
  goForward(): Promise<void>
  reload(): Promise<void>
  stop(): Promise<void>
  openLocalFile(): Promise<string | null>
  getURL(): Promise<string>
  getTitle(): Promise<string>
}

// ============================================================
// I18n API
// ============================================================

export type SupportedLocale = 'zh-CN' | 'en'

export interface LocaleMessages {
  [key: string]: string | LocaleMessages
}

/** I18n API surface */
export interface I18nAPI {
  /** Translate a key with optional parameters */
  t(key: string, params?: Record<string, string | number>): string
  /** Get current locale */
  getLocale(): SupportedLocale
  /** Set locale */
  setLocale(locale: SupportedLocale): void
  /** Register custom locale messages */
  registerLocale(locale: string, messages: LocaleMessages): void
}

// ============================================================
// History API
// ============================================================

export interface HistoryEntry {
  url: string
  title: string
  visitedAt: number
}

/** History API surface */
export interface HistoryAPI {
  /** List recent URLs */
  list(limit?: number): Promise<HistoryEntry[]>
  /** Add a history entry */
  add(url: string, title: string): Promise<void>
  /** Clear all history */
  clear(): Promise<void>
  /** Remove a specific URL */
  remove(url: string): Promise<void>
}

// ============================================================
// Settings API
// ============================================================

/** Key-value settings API surface */
export interface SettingsAPI {
  /** Get a setting value */
  get<T = unknown>(key: string): Promise<T | null>
  /** Set a setting value */
  set<T = unknown>(key: string, value: T): Promise<void>
  /** Get all settings */
  getAll(): Promise<Record<string, unknown>>
  /** Delete a setting */
  delete(key: string): Promise<void>
}

// ============================================================
// Extension System Types
// ============================================================

/** SDK Logger interface (for plugins) */
export interface SDKLogger {
  debug(msg: string, ...args: unknown[]): void
  info(msg: string, ...args: unknown[]): void
  warn(msg: string, ...args: unknown[]): void
  error(msg: string, ...args: unknown[]): void
}

/** Plugin context passed to install() */
export interface PluginContext {
  bridge: BridgeAPI
  useMiddleware(mw: Middleware): void
  onHook<T extends HookName>(name: T, handler: HookHandler<T>): void
  logger: SDKLogger
}

/** SDK Plugin interface */
export interface SDKPlugin {
  name: string
  version: string
  sdkVersion: string
  install(ctx: PluginContext): void | Promise<void>
  uninstall?(): void | Promise<void>
}

/** Middleware context passed through the pipeline */
export interface MiddlewareContext {
  method: string
  args: unknown[]
  transport: Transport
  meta: BridgeMeta
}

/** Middleware interface */
export interface Middleware {
  name: string
  /** Priority: lower numbers execute first (default 100) */
  priority?: number
  /** Transform request before invoke */
  onRequest?(ctx: MiddlewareContext): MiddlewareContext | Promise<MiddlewareContext>
  /** Transform response after invoke */
  onResponse?(ctx: MiddlewareContext, result: unknown): unknown | Promise<unknown>
  /** Handle/transform errors */
  onError?(ctx: MiddlewareContext, error: Error): Error | Promise<Error>
}

/** All available hook names */
export type HookName =
  | 'bridge:beforeCreate'
  | 'bridge:afterCreate'
  | 'bridge:destroy'
  | 'transport:beforeInvoke'
  | 'transport:afterInvoke'
  | 'transport:invokeError'
  | 'aiTip:fieldSelected'
  | 'aiTip:beforeFill'
  | 'aiTip:afterFill'
  | 'batchFill:beforeSuggest'
  | 'batchFill:suggestProgress'
  | 'batchFill:afterSuggest'
  | 'llm:beforeStream'
  | 'llm:streamToken'
  | 'llm:afterStream'
  | 'trace:spanCreated'
  | 'trace:spanFinished'

/** Hook payload map */
export interface HookPayloadMap {
  'bridge:beforeCreate': { env: BridgeEnv }
  'bridge:afterCreate': { bridge: BridgeAPI }
  'bridge:destroy': Record<string, never>
  'transport:beforeInvoke': { method: string; args: unknown[] }
  'transport:afterInvoke': { method: string; args: unknown[]; result: unknown; durationMs: number }
  'transport:invokeError': { method: string; args: unknown[]; error: Error; durationMs: number }
  'aiTip:fieldSelected': { context: FieldContext }
  'aiTip:beforeFill': { value: string; context: FieldContext }
  'aiTip:afterFill': { result: FillResult; value: string; context: FieldContext }
  'batchFill:beforeSuggest': { config: ModelConfig; fields: FieldSummary[] }
  'batchFill:suggestProgress': { contentSoFar: string }
  'batchFill:afterSuggest': { result: BatchSuggestResult | null; durationMs: number }
  'llm:beforeStream': { config: ModelConfig; requestId: string }
  'llm:streamToken': { requestId: string; token: string }
  'llm:afterStream': { requestId: string; totalTokens: number; durationMs: number }
  'trace:spanCreated': { spanId: string; traceId: string; kind: string }
  'trace:spanFinished': { spanId: string; traceId: string; kind: string; durationMs: number; status: string }
}

export type HookHandler<T extends HookName> = (payload: HookPayloadMap[T]) => void | Promise<void>
