# SDK 完整设计文档 — AI Tip JS SDK v0.2+

> **创建**: 2026-06-27 · **更新**: 2026-06-27 · **状态**: ✅ 已定稿
> **关联**: [14 — 三 Repo 架构](../desktop/docs/14-electron-js-sdk-architecture.md) · [15 — 目录结构](../desktop/docs/15-directory-structure-design.md)
> **场景**: 覆盖 desktop 全部功能，实现可扩展、零注入、多环境统一的 JS SDK

---

## 📋 文档导航

> - [一句话概述](#一句话概述) · [设计原则](#设计原则) · [可扩展性架构](#可扩展性架构)
> - [完整 API 矩阵](#完整-api-矩阵) · [类型系统](#类型系统) · [模块详解](#模块详解)
> - [desktop 功能覆盖检查](#desktop-功能覆盖检查) · [迁移路径](#迁移路径)
> - [安全模型](#安全模型) · [版本策略](#版本策略) · [测试策略](#测试策略)

---

## 一句话概述

> 🎯 **`@ai-tip/sdk` 是 SaaS 页面与 AI Tip 宿主环境之间的唯一契约。一个 `npm install` + 一行 `import { createBridge } from '@ai-tip/sdk'`，覆盖 desktop 全部 11 个 composable、10 个 IPC channel、7 个 ipcMain handler、6 个注入脚本功能。**

---

## 设计原则

| 原则 | 说明 | 反例 |
|------|------|------|
| **零运行时依赖** | `dependencies: {}`，纯 JS + TS 类型 | ❌ 依赖 vue/react/lodash |
| **SDK 是真相源** | 所有公开类型定义在 SDK，desktop/extension 通过 devDependency 引用 | ❌ 类型分散在 shared/ |
| **Transport 抽象** | 所有原生能力通过 `Transport.invoke(method, args)` 路由 | ❌ 直接调用 `window.electron.*` |
| **渐进式 API** | 核心 API 稳定，实验性 API 标记 `@experimental` | ❌ 一次性暴露不稳定 API |
| **可扩展** | Plugin/Middleware/Hook 三层扩展点 | ❌ 硬编码逻辑 |
| **环境无关** | 同一行代码在 Electron / Extension / 纯浏览器均能运行 | ❌ `if (isElectron) {...}` |
| **类型安全** | 全量 TypeScript strict mode | ❌ `any` 泛滥 |

---

## 可扩展性架构

### 三层扩展体系

```
┌──────────────────────────────────────────────────────────┐
│                    Plugin Layer                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐               │
│  │  Auth    │  │  Cache   │  │  Logger  │  ...          │
│  │  Plugin  │  │  Plugin  │  │  Plugin  │               │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘               │
│       │              │              │                     │
│       ▼              ▼              ▼                     │
│  ┌──────────────────────────────────────────────────┐   │
│  │              Middleware Pipeline                  │   │
│  │  request → [auth] → [retry] → [log] → transport  │   │
│  │  response ← [auth] ← [retry] ← [log] ← transport │   │
│  └──────────────────────────────────────────────────┘   │
│                         │                                │
│                         ▼                                │
│  ┌──────────────────────────────────────────────────┐   │
│  │                Hook System                        │   │
│  │  beforeInvoke / afterInvoke / onError / ...       │   │
│  └──────────────────────────────────────────────────┘   │
│                         │                                │
│                         ▼                                │
│  ┌──────────────────────────────────────────────────┐   │
│  │              Core SDK                             │   │
│  │  BridgeAPI → APIS → Transport → Host             │   │
│  └──────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

### 1. Plugin 系统

```typescript
// sdk/src/plugins/types.ts
export interface SDKPlugin {
  /** 插件名称 */
  name: string
  /** 插件版本 */
  version: string
  /** SDK 版本要求（semver range） */
  sdkVersion: string

  /** 插件安装 */
  install(ctx: PluginContext): void | Promise<void>
  /** 插件卸载 */
  uninstall?(): void | Promise<void>
}

export interface PluginContext {
  bridge: BridgeAPI
  useMiddleware(mw: Middleware): void
  onHook<T extends HookName>(name: T, handler: HookHandler<T>): void
  logger: SDKLogger
}
```

| Plugin | 功能 | 默认启用 |
|--------|------|:--------:|
| `RetryPlugin` | 请求失败自动重试（可配置次数、退避策略） | ✅ |
| `TimeoutPlugin` | 请求超时控制 | ✅ |
| `LogPlugin` | 请求/响应日志（可插拔 logger） | ✅ |
| `CachePlugin` | 请求结果缓存（可配置 TTL） | ❌ |
| `AuthPlugin` | 自动附加认证 token | ❌ |
| `MetricsPlugin` | 性能指标收集 | ❌ |

### 2. Middleware 管道

```typescript
// sdk/src/middleware/types.ts
export interface MiddlewareContext { method: string; args: unknown[]; transport: Transport; meta: BridgeMeta }

export interface Middleware {
  name: string
  priority?: number           // 数字越小越先执行（默认 100）
  onRequest?(ctx: MiddlewareContext): MiddlewareContext | Promise<MiddlewareContext>
  onResponse?(ctx: MiddlewareContext, result: unknown): unknown | Promise<unknown>
  onError?(ctx: MiddlewareContext, error: Error): Error | Promise<Error>
}
```

### 3. Hook 系统

```typescript
export type HookName =
  | 'bridge:beforeCreate' | 'bridge:afterCreate' | 'bridge:destroy'
  | 'transport:beforeInvoke' | 'transport:afterInvoke' | 'transport:invokeError'
  | 'aiTip:fieldSelected' | 'aiTip:beforeFill' | 'aiTip:afterFill'
  | 'batchFill:beforeSuggest' | 'batchFill:suggestProgress' | 'batchFill:afterSuggest'
  | 'llm:beforeStream' | 'llm:streamToken' | 'llm:afterStream'
  | 'trace:spanCreated' | 'trace:spanFinished'
```

---

## 完整 API 矩阵

### Desktop 功能 → SDK API 一字不漏映射

```
Desktop 模块                      SDK API 域              关键方法
═══════════════════════════════════════════════════════════════════════════════

▸ useAITip.ts (注入脚本)     →  bridge.aiTip
  - scanAndAttach / createButton →  (preload 内置)    宿主负责，SDK 不管 DOM
  - field-selected push 事件     →  aiTip.onFieldSelected(ctx)
  - fillField(value, ctx)        →  aiTip.fillField(value, ctx)     invoke
  - highlightField(ctx)          →  aiTip.highlightField(ctx)       invoke
  - setState('loading')          →  aiTip.setButtonState(state)     invoke
  - toggle()                     →  aiTip.setEnabled(bool)          invoke
  - inject() / setup()           →  (废弃) SDK 不注入

▸ useWebview.ts              →  bridge.webview
  - navigateTo / goBack / reload  →  webview.navigateTo / goBack / reload
  - openLocalFile()               →  webview.openLocalFile()
  - detectFields()                →  bridge.formDetect.detectFields(wcId)
  - summarizePage()               →  bridge.pageSummary.summarize(cfg, msgs)
  - runBatchSuggest()             →  bridge.batchFill.suggest(cfg, fields, ctx)

▸ useChat.ts                 →  bridge.llm
  - sendMessage(text, ...)        →  llm.startStream(cfg, msgs, reqId)
  - stopStreaming()               →  llm.stopStream()
  - on chunk / on error           →  llm.onStreamChunk / onStreamError

▸ useModelConfig.ts          →  bridge.modelConfig
  - models list / save / delete   →  modelConfig.list / save / delete
  - setActive / getActive         →  modelConfig.setActive / getActive
  - testConnection()              →  llm.testConnection(cfg)   (归在 LLM API)
  - PROVIDERS 列表                →  modelConfig.listProviders()

▸ useSession.ts              →  bridge.session
  - pageSessions                 →  session.listPages()
  - initPageSession(url, ...)    →  session.initPage(url, title, fields)
  - activateFieldSession(meta)   →  session.activateField(meta)
  - updatePageContext / sendMsg  →  session.updatePageContext / sendMessage

▸ useTraceDetail.ts          →  bridge.trace
  - fetchDetail(spanId)          →  trace.getDetail(spanId)
  - list / export                →  trace.list / trace.export

▸ useAXTree.ts               →  bridge.formDetect
  - axTreeText                   →  formDetect.buildAXTreeText(rawNodes)

▸ useI18n.ts                 →  bridge.i18n
  - t(key, params?)             →  i18n.t(key, params)

▸ useRecentHistory.ts        →  bridge.history
  - recentUrls / addRecent       →  history.list / history.add

▸ useLanguageSettings.ts     →  bridge.settings
  - uiLanguage / outputLang      →  settings.get / settings.set

▸ main/index.ts (7+2 IPC)    →  transport.invoke(method, args)
  - 由宿主 (desktop/extension) 实现具体逻辑
```

---

## 类型系统（完整清单 — 覆盖 desktop 全部类型）

```
类型分层:
  Layer 0: 基础原语         BridgeEnv, BridgeMeta, Transport
  Layer 1: 领域类型          FieldContext, ChatMessage, StreamChunk, ...
  Layer 2: API 接口          AITipAPI, LLMAPI, TraceAPI, SessionAPI, ...
  Layer 3: 顶层门面          BridgeAPI (15 个 API 域)
  Layer 4: 扩展点            SDKPlugin, Middleware, Hook
  Layer 5: 错误体系          BridgeNotAvailableError, BridgeInvokeError, ...
```

### Layer 0: 基础原语

```typescript
export type BridgeEnv = 'electron' | 'extension' | 'unknown'

export interface BridgeMeta {
  version: string
  env: BridgeEnv
  minSdkVersion?: string
  hostName?: string
  capabilities?: string[]       // 如 ['aiTip', 'llm', 'trace', 'fs']
}

export interface Transport {
  invoke(method: string, args: unknown[]): Promise<unknown>
  onEvent?(event: string, callback: (data: unknown) => void): void
  offEvent?(event: string, callback: (data: unknown) => void): void
}
```

### Layer 1: 领域类型

```typescript
// ── AI Tip ──
export interface FieldContext {
  tagName: string; type: string; name: string; id: string
  placeholder: string; value: string; ariaLabel: string; label: string
  labelProximity?: string; formPurpose: string; siblingLabels: string[]
  pageTitle: string; pageUrl: string
  rect: { top: number; left: number; width: number; height: number }
}
export interface FillResult { ok: boolean; reason?: string; label?: string; error?: string; stack?: string }

// ── 表单检测 (CDP) ──
export interface SimpleField {
  tagName: string; type: string; name: string; id: string
  placeholder: string; label: string; required: boolean
  value: string; visible: boolean; backendNodeId: number | null
}
export interface RawAXNode {
  nodeId: string; role: string; name: string; value: string
  backendDOMNodeId: number | null; childIds: string[]; isFormField: boolean
}
export interface DetectFieldsResult { fields: SimpleField[]; rawNodes: RawAXNode[] }

// ── 页面摘要 ──
export interface PageContext {
  summary: string; url: string; title: string
  fields: Array<{ label: string; type: string; required: boolean; value: string }>
  generatedAt: number
}

// ── 批量预填 ──
export interface FieldSummary {
  label: string; type: string; name: string; placeholder: string
  required: boolean; currentValue: string; typeHint: string
}
export interface BatchFieldSuggestion {
  fieldKey: string; suggestedValue: string
  confidence: 'high'|'medium'|'low'; reasoning: string
}
export interface BatchSuggestResult { suggestions: BatchFieldSuggestion[]; overallHint?: string }

// ── LLM 流式 ──
export interface ChatMessage { role: 'system'|'user'|'assistant'; content: string }
export interface ChatOptions {
  max_tokens?: number; temperature?: number; top_p?: number
  stream?: boolean; response_format?: { type: 'json_object'|'text' }
  [key: string]: unknown
}
export interface StreamChunk { token?: string; done: boolean; finishReason?: string; error?: string }
export interface StreamChunkEvent { requestId: string; chunk: StreamChunk; traceSpanId?: string; traceId?: string }
export interface StreamErrorEvent { requestId: string; error: string; traceSpanId?: string; traceId?: string }

// ── 模型配置 ──
export interface ModelConfig {
  id: string; name: string; provider: string
  baseUrl?: string; apiKey?: string; temperature?: number; maxTokens?: number
  source?: 'local' | 'remote'
}
export interface ProviderMeta { name: string; displayName: string; defaultBaseUrl: string; requiresAuth: boolean }
export interface ConnectionTestResult { ok: boolean; message: string; traceSpanId?: string; latencyMs?: number }
export interface ProviderAdapter {
  name: string
  endpoint(baseUrl: string, isStream: boolean): string
  authHeaders(apiKey: string): Record<string, string>
  buildRequestBody(model: string, messages: ChatMessage[], options?: ChatOptions): unknown
  parseSSEEvent(event: string): StreamChunk | null
}

// ── 会话管理 ──
export type SessionKeyType = 'page-chat' | 'field'
export interface SessionKey { type: SessionKeyType; fieldName?: string }
export interface SessionFieldMeta { label: string; type: string; name: string; placeholder: string; required: boolean; value: string }
export interface SubSession { key: SessionKey; fieldMeta?: SessionFieldMeta; messages: ChatMessageItem[]; createdAt: number; lastActiveAt: number }
export interface PageSessionData {
  pageId: string; pageUrl: string; pageTitle: string; pageContext: PageContext | null
  children: SubSession[]; activeChildIndex: number; isArchived: boolean
  createdAt: number; updatedAt: number
}
export type SidebarView = 'home' | 'chat'

// ── 聊天消息项 ──
export type MessageCard =
  | { type: 'batch-fill'; state: 'trigger'|'loading'|'done'; fieldCount?: number; result?: BatchSuggestResult }
  | { type: 'suggestion'; fieldKey: string; suggestedValue: string; confidence: string; reasoning: string }
export interface ChatMessageItem {
  id: string; role: 'user'|'assistant'|'system'; content: string; timestamp: number
  isStreaming?: boolean; sessionKey?: SessionKey; usedPageContext?: PageContext
  card?: MessageCard; traceSpanId?: string; traceDurationMs?: number; traceError?: string
}

// ── 可观测性 ──
export interface TraceSpanEvent { name: string; timestampMs: number; attributes?: Record<string, unknown> }
export interface TraceLogEntry { level: string; message: string; timestampMs: number }
export interface TraceSpanDetail {
  traceId: string; spanId: string; parentSpanId?: string; kind: string
  provider?: string; model?: string; temperature?: number; maxTokens?: number
  endpoint?: string; httpStatus?: number; httpMethod?: string
  startMs?: number; durationMs?: number
  inputTokens?: number; outputTokens?: number; totalTokens?: number
  status: 'ok'|'error'|'running'; statusMessage?: string
  events: TraceSpanEvent[]; logs: TraceLogEntry[]
  requestBody?: string; responseBody?: string
  attempt?: number; maxRetries?: number
  attributes?: Record<string, unknown>; requestHeaders?: Record<string, string>
}
export interface TraceSpanSummary {
  spanId: string; traceId: string; kind: string
  provider?: string; model?: string
  startMs: number; durationMs?: number
  status: 'ok'|'error'|'running'; statusMessage?: string
  inputTokens?: number; outputTokens?: number
}
export interface TraceQueryFilter {
  kind?: string; status?: string; traceId?: string
  since?: number; until?: number; provider?: string; model?: string; limit?: number
}
export interface ExportProfile { name: string; endpoint: string; authHeader?: string }

// ── WebView / 文件 / 历史 / 设置 ──
export interface FileReadResult { content: string; encoding: 'utf-8'|'base64'|'binary'; size: number }
export interface FileReadOptions { encoding?: 'utf-8'|'base64'|'binary' }
export interface FileWriteOptions { encoding?: 'utf-8'; createParents?: boolean }
export interface DirEntry { name: string; isDirectory: boolean; size: number; modifiedAt: string }
export interface ListDirOptions { includeHidden?: boolean; maxDepth?: number }
export type ClipboardFormat = 'text'|'html'|'image'|'rtf'
export interface ClipboardReadResult { formats: ClipboardFormat[]; text?: string; html?: string; image?: string }
export interface ClipboardWriteOptions { text?: string; html?: string; image?: string }
export interface NotificationOptions { title: string; body?: string; icon?: string; tag?: string; requireInteraction?: boolean; onClickUrl?: string }
export interface NotificationInstance { id: string; tag?: string; title: string; close(): Promise<void> }
export type NotificationClickHandler = (n: NotificationInstance) => void
export interface SystemInfo { platform: 'win32'|'darwin'|'linux'|'unknown'; arch: string; hostname: string; osVersion: string; totalMemory: number; freeMemory: number }
export type SupportedLocale = 'zh-CN' | 'en'
export interface LocaleMessages { [key: string]: string | LocaleMessages }
export interface HistoryEntry { url: string; title: string; visitedAt: number }
```

### Layer 2: API 接口（15 个域）

```typescript
export interface FsAPI { readFile(...); writeFile(...); listDir(...); exists(...); mkdir(...); remove(...) }
export interface ClipboardAPI { read(); write(...); clear() }
export interface NotificationAPI { show(...); onClick(...); offClick(...) }
export interface SystemAPI { getInfo(); openExternal(...); showItemInFolder(...); getTempPath(); getHomePath() }

export interface AITipAPI {
  onFieldSelected(cb): void; offFieldSelected(cb): void
  fillField(value, ctx): Promise<FillResult>
  highlightField(ctx): Promise<void>
  setButtonState(state: 'idle'|'loading'): Promise<void>
  setEnabled(enabled: boolean): Promise<void>
  isEnabled(): Promise<boolean>
}

export interface FormDetectAPI {
  detectFields(webContentsId: number): Promise<DetectFieldsResult>
  buildAXTreeText(rawNodes: RawAXNode[]): Promise<string>
}

export interface PageSummaryAPI { summarize(config: ModelConfig, messages: ChatMessage[]): Promise<string | null> }

export interface BatchFillAPI {
  suggest(config: ModelConfig, fields: FieldSummary[], structuredCtx: string): Promise<BatchSuggestResult | null>
  onProgress(cb): void; offProgress(cb): void
  autoFill(result: BatchSuggestResult, fields: FieldSummary[]): Promise<FillResult[]>
}

export interface LLMAPI {
  startStream(config, messages, requestId, options?): void
  stopStream(): void
  onStreamChunk(cb): void; onStreamError(cb): void; removeStreamListeners(): void
  testConnection(config: ModelConfig): Promise<ConnectionTestResult>
}

export interface ModelConfigAPI {
  list(): Promise<ModelConfig[]>; save(config): Promise<void>; delete(id): Promise<void>
  setActive(id): Promise<void>; getActive(): Promise<ModelConfig | null>
  listProviders(): Promise<ProviderMeta[]>
  getAdapter(provider: string): Promise<ProviderAdapter | null>
}

export interface SessionAPI {
  listPages(): Promise<PageSessionData[]>
  initPage(url, title, fields): Promise<PageSessionData>
  activateField(meta): Promise<SubSession>
  updatePageContext(pageId, ctx): Promise<void>
  updatePageTitle(pageId, title): Promise<void>
  sendMessage(pageId, msg): Promise<ChatMessageItem>
  getMessages(pageId, key): Promise<ChatMessageItem[]>
  archivePage(pageId): Promise<void>
  setSidebarView(view): Promise<void>
  getSidebarView(): Promise<SidebarView>
}

export interface TraceAPI {
  getDetail(spanId): Promise<TraceSpanDetail | null>
  list(filter?): Promise<TraceSpanSummary[]>
  exportTraces(profile, filter?): Promise<{ok:boolean;message:string}>
}

export interface WebviewAPI {
  navigateTo(url): Promise<void>; goBack(): Promise<void>; goForward(): Promise<void>
  reload(): Promise<void>; stop(): Promise<void>
  openLocalFile(): Promise<string | null>; getURL(): Promise<string>; getTitle(): Promise<string>
}

export interface I18nAPI {
  t(key, params?): string
  getLocale(): SupportedLocale; setLocale(locale): void
  registerLocale(locale, messages): void
}

export interface HistoryAPI { list(limit?): Promise<HistoryEntry[]>; add(url, title): Promise<void>; clear(): Promise<void>; remove(url): Promise<void> }

export interface SettingsAPI { get<T>(key): Promise<T|null>; set(key, value): Promise<void>; getAll(): Promise<Record<string,unknown>>; delete(key): Promise<void> }
```

### Layer 3: 顶层门面

```typescript
export interface BridgeAPI {
  readonly meta: BridgeMeta
  // 基础原生 (4)
  readonly fs: FsAPI; readonly clipboard: ClipboardAPI; readonly notification: NotificationAPI; readonly system: SystemAPI
  // AI Tip 核心 (4)
  readonly aiTip: AITipAPI; readonly formDetect: FormDetectAPI; readonly pageSummary: PageSummaryAPI; readonly batchFill: BatchFillAPI
  // LLM 相关 (2)
  readonly llm: LLMAPI; readonly modelConfig: ModelConfigAPI
  // 会话与 UI (2)
  readonly session: SessionAPI; readonly webview: WebviewAPI
  // 基础设施 (4)
  readonly trace: TraceAPI; readonly i18n: I18nAPI; readonly history: HistoryAPI; readonly settings: SettingsAPI
  // 扩展
  use(plugin: SDKPlugin): Promise<void>
  useMiddleware(mw: Middleware): void
  onHook<T>(name, handler): void; offHook<T>(name, handler): void
  destroy(): void
}
```

### Layer 5: 错误体系

```typescript
export class BridgeNotAvailableError extends Error { readonly code = 'BRIDGE_NOT_AVAILABLE' }
export class BridgeInvokeError extends Error { readonly code = 'BRIDGE_INVOKE_ERROR'; readonly method: string }
export class BridgeVersionError extends Error { readonly code = 'BRIDGE_VERSION_ERROR'; readonly hostVersion: string; readonly sdkVersion: string }
export class BridgeTimeoutError extends Error { readonly code = 'BRIDGE_TIMEOUT'; readonly method: string; readonly timeoutMs: number }
export class BridgePermissionError extends Error { readonly code = 'BRIDGE_PERMISSION_DENIED'; readonly method: string }
export class BridgeUnsupportedError extends Error { readonly code = 'BRIDGE_UNSUPPORTED'; readonly method: string }
```

---

## 模块详解（目录结构）

```
sdk/
├── src/
│   ├── index.ts                 # 公开 API 导出
│   ├── bridge.ts                # createBridge() 门面 + 环境检测
│   ├── types.ts                 # 🔑 全部公开类型（~700 行，15 个 API 域）
│   │
│   ├── apis/                    # 语义化 API 封装（每个域一个文件）
│   │   ├── fs.ts                #   已有 ✅
│   │   ├── clipboard.ts         #   已有 ✅
│   │   ├── notification.ts      #   已有 ✅
│   │   ├── system.ts            #   已有 ✅
│   │   ├── ai-tip.ts            #   🆕 AI Tip 按钮 + 字段填充
│   │   ├── form-detect.ts       #   🆕 表单 CDP 检测 + AX 树文本
│   │   ├── page-summary.ts      #   🆕 页面 LLM 摘要
│   │   ├── batch-fill.ts        #   🆕 批量预填 + autoFill
│   │   ├── llm-stream.ts        #   🆕 LLM 流式聊天 + testConnection
│   │   ├── model-config.ts      #   🆕 模型配置 CRUD + Provider 列表 + Adapter
│   │   ├── session.ts           #   🆕 页面会话管理
│   │   ├── webview.ts           #   🆕 WebView 导航控制
│   │   ├── trace.ts             #   🆕 可观测性追踪
│   │   ├── i18n.ts              #   🆕 SDK 内置国际化
│   │   ├── history.ts           #   🆕 URL 浏览历史
│   │   └── settings.ts          #   🆕 键值设置
│   │
│   ├── transports/              # 传输适配器（已有 ✅）
│   │   ├── base.ts              #   Transport 接口 + BaseTransport
│   │   ├── electron.ts          #   window.__bridge__ 桥接
│   │   ├── extension.ts         #   postMessage 桥接
│   │   └── fallback.ts          #   降级
│   │
│   ├── middleware/              # 🆕 Middleware 管道
│   │   ├── types.ts
│   │   ├── pipeline.ts
│   │   └── builtin/
│   │       ├── retry.ts         #     指数退避重试
│   │       ├── timeout.ts       #     超时控制
│   │       └── logger.ts        #     请求日志
│   │
│   ├── plugins/                 # 🆕 Plugin 系统
│   │   ├── types.ts
│   │   └── registry.ts
│   │
│   ├── hooks/                   # 🆕 Hook 系统
│   │   ├── types.ts
│   │   └── registry.ts
│   │
│   └── utils/
│       ├── env-detect.ts        #   已有 ✅
│       ├── version.ts           #   已有 ✅
│       ├── semver.ts            #   🆕 semver 解析/比较
│       └── retry.ts             #   🆕 重试工具函数
│
├── locales/                     # 🆕 SDK 内置国际化
│   ├── en.ts
│   └── zh-CN.ts
│
├── docs/                        # 🆕 设计文档
│   └── 01-sdk-ai-tip-split-design.md  # ← 本文档
│
├── __tests__/                   # 已有 6 个 ✅ + 🆕 7 个
│   ├── bridge.test.ts           ✅
│   ├── apis.test.ts             ✅
│   ├── transport-electron.test.ts ✅
│   ├── transport-extension.test.ts ✅
│   ├── transport-fallback.test.ts ✅
│   ├── version.test.ts          ✅
│   ├── ai-tip.test.ts           🆕
│   ├── batch-fill.test.ts       🆕
│   ├── llm-stream.test.ts       🆕
│   ├── session.test.ts          🆕
│   ├── middleware-pipeline.test.ts 🆕
│   ├── plugin-system.test.ts    🆕
│   └── hook-system.test.ts      🆕
│
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── eslint.config.mjs
```

---

## Desktop 功能覆盖检查

### 量化统计

| 类别 | Desktop 现有 | SDK 覆盖 | 覆盖率 |
|------|:----------:|:-------:|:------:|
| Composable 数量 | 11 | 11 | 100% |
| IPC Channel 数量 | 10 | 10 | 100% |
| ipcMain handler | 7 (handle) + 2 (on) | 9 | 100% |
| 注入脚本功能 | 6 | 4 (2 个归宿主) | 100% |
| Provider 数量 | 10 | 10 (通过 getAdapter) | 100% |
| Trace 方法 | getDetail / list / export | 3 | 100% |
| Vue 组件 | 20+ | 0 (UI 不归 SDK) | N/A |

### 逐项覆盖

| # | Desktop 源 | 功能 | SDK API | |
|---|-----------|------|---------|:--:|
| 1 | `useAITip.ts` INJECTED_SCRIPT | AI 按钮注入 | preload 内置 | ✅ |
| 2 | `useAITip.ts` scanAndAttach | DOM 扫描 | preload 内置 | ✅ |
| 3 | `useAITip.ts` collectContext | 上下文收集 | preload 内置 | ✅ |
| 4 | `useAITip.ts` field-selected | 字段选择事件 | `aiTip.onFieldSelected()` | ✅ |
| 5 | `useAITip.ts` fillField | 5层填充 | `aiTip.fillField()` | ✅ |
| 6 | `useAITip.ts` highlightField | 高亮 | `aiTip.highlightField()` | ✅ |
| 7 | `useAITip.ts` setState | 按钮状态 | `aiTip.setButtonState()` | ✅ |
| 8 | `useAITip.ts` toggle | 开关 | `aiTip.setEnabled()` | ✅ |
| 9 | `useWebview.ts` navigateTo | 导航 | `webview.navigateTo()` | ✅ |
| 10 | `useWebview.ts` openLocalFile | 本地文件 | `webview.openLocalFile()` | ✅ |
| 11 | `useWebview.ts` detectFields | CDP 检测 | `formDetect.detectFields()` | ✅ |
| 12 | `useWebview.ts` summarizePage | LLM 摘要 | `pageSummary.summarize()` | ✅ |
| 13 | `useWebview.ts` runBatchSuggest | 批量预填 | `batchFill.suggest()` | ✅ |
| 14 | `useChat.ts` sendMessage | 流式聊天 | `llm.startStream()` | ✅ |
| 15 | `useChat.ts` stopStreaming | 停止 | `llm.stopStream()` | ✅ |
| 16 | `useChat.ts` streaming events | 流事件 | `llm.onStreamChunk/Error()` | ✅ |
| 17 | `useModelConfig.ts` CRUD | 模型管理 | `modelConfig.list/save/delete` | ✅ |
| 18 | `useModelConfig.ts` testConnection | 连接测试 | `llm.testConnection()` | ✅ |
| 19 | `useModelConfig.ts` PROVIDERS | Provider 列表 | `modelConfig.listProviders()` | ✅ |
| 20 | `useSession.ts` page sessions | 页面会话 | `session.listPages/initPage` | ✅ |
| 21 | `useSession.ts` field sessions | 字段会话 | `session.activateField()` | ✅ |
| 22 | `useSession.ts` overviewContext | 页面上下文 | `session.updatePageContext()` | ✅ |
| 23 | `useTraceDetail.ts` | Trace 详情 | `trace.getDetail()` | ✅ |
| 24 | `useAXTree.ts` buildText | AX 树文本 | `formDetect.buildAXTreeText()` | ✅ |
| 25 | `useI18n.ts` t() | 国际化 | `i18n.t()` | ✅ |
| 26 | `useRecentHistory.ts` | URL 历史 | `history.list/add` | ✅ |
| 27 | `useLanguageSettings.ts` | 语言设置 | `settings.get/set` | ✅ |
| 28 | `main/index.ts` all IPC | 全部 IPC | transport 路由 | ✅ |
| 29 | `providers/` adapters | Provider 适配 | `modelConfig.getAdapter()` + `ProviderAdapter` | ✅ |
| 30 | `tracing/` TraceStore | 可观测性 | `trace.*` | ✅ |
| 31 | `providers/chat.ts` retry | 重试逻辑 | `RetryPlugin` (middleware) | ✅ |

### 不放入 SDK 的模块（明确排除）

| 模块 | 原因 | 归属 |
|------|------|------|
| `FORM_AX_ROLES` / `axRoleToTagType` | CDP 专用常量，Electron 实现细节 | `desktop/src/shared/` |
| Vue 组件 (20+) | UI 层 | `desktop/src/renderer/` |
| `electron-log` | Electron 日志基础设施 | `desktop/` |
| `electron-builder.yml` | 打包配置 | `desktop/` |
| Playwright e2e | 集成测试 | `desktop/e2e/` |
| Provider 具体实现 | 运行时宿主提供 | `desktop/src/main/providers/` |

---

## 迁移路径（5 个 Phase）

### Phase 1: SDK 类型扩展（1-2 天）

1. 更新 `sdk/src/types.ts` — 添加全部 ~700 行类型定义
2. `BridgeAPI` 包含全部 15 个 API 域
3. 添加 Plugin/Middleware/Hook 类型体系
4. 添加 6 个错误类
5. `npm run typecheck` 通过
6. `desktop/src/shared/types.ts` 改为 `import type { ... } from '@ai-tip/sdk/types'`

### Phase 2: SDK API 实现（2-3 天）

1. 实现 `apis/` 下 15 个 API 工厂函数
2. 实现 Plugin 注册中心 + Middleware 管道 + Hook 注册中心
3. 实现 3 个内置 Middleware（Retry / Timeout / Logger）
4. 实现 SDK 内置 i18n（zh-CN + en）
5. 更新 `bridge.ts` — `buildBridgeAPI()` 集成全部 15 个域
6. 更新 `index.ts` — 导出全部新增
7. `npm run build` + `npm test` 通过

### Phase 3: Desktop preload 对接（2 天）

1. `desktop/package.json` → `devDependencies: { "@ai-tip/sdk": "^0.2.0" }`
2. 创建 `desktop/src/preload/bridge.ts` — `contextBridge.exposeInMainWorld('__bridge__', bridge as BridgeAPI)`
3. 创建 `desktop/src/main/bridge/` — 15 个 IPC handler 文件
4. 创建 `desktop/src/main/ipc.ts` — 集中注册
5. 清理 `desktop/src/main/index.ts` — 移除已迁移的 IPC handler
6. 删除旧 `desktop/src/shared/types.ts` / `ipc-channels.ts`

### Phase 4: Desktop renderer 对接（1-2 天）

1. 更新 composables 引用 SDK 类型
2. 移除 `useAITip.ts` 中的 `INJECTED_SCRIPT` + `executeJavaScript()`
3. 统一所有 preload 暴露为 `window.__bridge__`

### Phase 5: 测试与文档（1-2 天）

1. 新增 7 个 SDK 测试文件
2. 更新 Desktop e2e mock
3. SDK README 编写

---

## 安全模型

### 权限分级

```typescript
export enum PermissionLevel { SAFE = 'safe', SENSITIVE = 'sensitive', CRITICAL = 'critical' }

export const METHOD_PERMISSIONS: Record<string, PermissionLevel> = {
  'fs:readFile': 'safe', 'fs:writeFile': 'sensitive', 'fs:remove': 'critical',
  'clipboard:read': 'safe', 'clipboard:write': 'safe',
  'system:openExternal': 'sensitive',
  'aiTip:fillField': 'safe',
  'llm:startStream': 'safe',
  'modelConfig:save': 'sensitive', 'modelConfig:delete': 'sensitive',
  // ... 其余均为 'safe'
}
```

| 环境 | 措施 |
|------|------|
| Electron | contextIsolation=true, nodeIntegration=false, sandbox=true, preload 白名单 |
| Extension | Content Script ISOLATED world, origin 校验, manifest 最小权限 |

---

## 版本策略

| SDK | Desktop 最低 | Extension 最低 | 变更 |
|-----|:-----------:|:-------------:|------|
| 0.1.x | — | — | 基础 Bridge |
| 0.2.x | 2.0.0 | 2.0.0 | + AI Tip 全套 |
| 0.3.x | 2.1.0 | 2.1.0 | + Plugin/Middleware/Hook |
| 1.0.0 | 3.0.0 | 3.0.0 | 稳定版 |

### 版本协商

```
SDK → Host: 你的版本？
Host → SDK: v2.0.0, capabilities: [aiTip, llm, trace, ...]
SDK: major 匹配 + capabilities 满足 → 继续
     否则 → BridgeVersionError
```

---

## 与现有 SDK (v0.1.0) 的差异

| 维度 | v0.1.0 | v0.2+ |
|------|:-----:|:----:|
| API 域数量 | 4 | 15 |
| 类型行数 | ~250 | ~700 |
| 源码文件 | 14 | 35+ |
| 测试文件 | 6 | 13+ |
| 扩展机制 | 无 | Plugin + Middleware + Hook |
| 错误类型 | 3 | 6 |
| i18n | 无 | 内置 zh-CN / en |
| Provider 适配 | 无 | ProviderAdapter 接口 |

---

## 关键设计决策

| # | 决策 | 理由 |
|---|------|------|
| 1 | AI 按钮逻辑在 preload 实现（非 SDK） | SDK 不能操作 DOM，按钮注入是宿主职责 |
| 2 | 字段填充保留 5 层策略 | React/Angular/Vue 兼容 |
| 3 | Plugin/Middleware/Hook 三层 | 借鉴 Koa/Express 成熟模式 |
| 4 | 15 个独立 API 域 | 单一职责，独立测试和版本管理 |
| 5 | `getAdapter()` 暴露给 SaaS | SaaS 可自行管理 LLM 调用 |
| 6 | `Capabilities` 能力列表 | 宿主声明支持的能力，SDK 按需降级 |

---

> **下一步**: 确认本设计 → Phase 1: 扩展 SDK 类型 → Phase 2: 实现全部 API → Phase 3: Desktop 对接。
