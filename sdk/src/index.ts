/**
 * @ai-tip/sdk — Public API
 *
 * This is the main entry point for the SDK. SaaS applications import
 * everything they need from here:
 *
 *   import { createBridge } from '@ai-tip/sdk'
 *   const bridge = await createBridge()
 *   await bridge.fs.readFile('/path/to/file')
 *   bridge.aiTip.onFieldSelected((ctx) => showBanner(ctx))
 */

// ============================================================
// Bridge creation
// ============================================================
export { createBridge, createBridgeSync, isBridgeAvailable } from './bridge'
export type { CreateBridgeOptions } from './bridge'

// ============================================================
// Transport classes
// ============================================================
export { ElectronTransport, getElectronBridge } from './transports/electron'
export { ExtensionTransport } from './transports/extension'
export { FallbackTransport } from './transports/fallback'
export { BaseTransport } from './transports/base'

// ============================================================
// API factory functions
// ============================================================
export { createAITipAPI } from './apis/ai-tip'
export { createFormDetectAPI } from './apis/form-detect'
export { createPageSummaryAPI } from './apis/page-summary'
export { createBatchFillAPI } from './apis/batch-fill'
export { createLLMAPI } from './apis/llm-stream'
export { createModelConfigAPI } from './apis/model-config'
export { createSessionAPI } from './apis/session'
export { createWebviewAPI } from './apis/webview'
export { createTraceAPI } from './apis/trace'
export { createI18nAPI } from './apis/i18n'
export { createHistoryAPI } from './apis/history'
export { createSettingsAPI } from './apis/settings'

// ============================================================
// Built-in Middleware
// ============================================================
export { RetryMiddleware } from './middleware/builtin/retry'
export { LoggerMiddleware } from './middleware/builtin/logger'
export { createPipeline } from './middleware/pipeline'

// ============================================================
// Plugin & Hook registries
// ============================================================
export { PluginRegistry } from './plugins/registry'
export { HookRegistry } from './hooks/registry'

// ============================================================
// Type exports (public API contract)
// ============================================================
export type {
  // Environment
  BridgeEnv,
  BridgeMeta,

  // Top-level API
  BridgeAPI,

  // Domain APIs (12)
  AITipAPI,
  FormDetectAPI,
  PageSummaryAPI,
  BatchFillAPI,
  LLMAPI,
  ModelConfigAPI,
  SessionAPI,
  WebviewAPI,
  TraceAPI,
  I18nAPI,
  HistoryAPI,
  SettingsAPI,

  // Transport
  Transport,

  // AI Tip
  FieldContext,
  FillResult,

  // Form Detection
  SimpleField,
  RawAXNode,
  DetectFieldsResult,

  // Page Summary
  PageContext,

  // Batch Fill
  FieldSummary,
  BatchFieldSuggestion,
  BatchSuggestResult,

  // LLM
  ChatMessage,
  ChatOptions,
  StreamChunk,
  StreamChunkEvent,
  StreamErrorEvent,

  // Model Config
  ModelConfig,
  ProviderMeta,
  ConnectionTestResult,
  ProviderAdapter,

  // Session
  SessionKeyType,
  SessionKey,
  SessionFieldMeta,
  SubSession,
  PageSessionData,
  SidebarView,

  // Chat Message
  ChatMessageItem,
  MessageCard,

  // Trace
  TraceSpanEvent,
  TraceLogEntry,
  TraceSpanDetail,
  TraceSpanSummary,
  TraceQueryFilter,
  ExportProfile,

  // I18n
  SupportedLocale,

  // History
  HistoryEntry,

  // Extension System
  SDKPlugin,
  PluginContext,
  SDKLogger,
  Middleware,
  MiddlewareContext,
  HookName,
  HookPayloadMap,
  HookHandler,
} from './types'

// ============================================================
// Error classes
// ============================================================
export {
  BridgeNotAvailableError,
  BridgeInvokeError,
  BridgeVersionError,
  BridgeTimeoutError,
  BridgePermissionError,
  BridgeUnsupportedError,
} from './types'

// ============================================================
// Utility exports
// ============================================================
export { SDK_VERSION } from './utils/version'
export { detectEnv, pingExtension, hasElectronBridge } from './utils/env-detect'
