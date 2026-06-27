import { ElectronAPI } from '@electron-toolkit/preload'
import type {
  SimpleField,
  RawAXNode,
  DetectFieldsResult,
  FieldContext,
  BatchSuggestResult,
  BatchFieldSuggestion,
  FieldSummary,
} from '@ai-tip/sdk'

export type { SimpleField, RawAXNode, DetectFieldsResult, FieldContext, BatchSuggestResult, BatchFieldSuggestion, FieldSummary }

interface SidebarAPI {
  openLocalFile: () => Promise<string | null>
  detectFields: (webContentsId: number) => Promise<DetectFieldsResult>
  summarizePage: (config: unknown, messages: unknown[]) => Promise<string | null>
  batchSuggest: (config: unknown, fields: FieldSummary[], structuredCtx: string) => Promise<BatchSuggestResult | null>
  onBatchSuggestProgress: (callback: (data: { phase: string; tokensReceived: number; contentSoFar?: string }) => void) => void
  removeBatchSuggestProgressListeners: () => void
}

interface LLMAPI {
  testConnection: (config: unknown) => Promise<{ ok: boolean; message: string; traceSpanId?: string }>
  startStream: (config: unknown, messages: unknown[], requestId: string, options?: unknown) => void
  stopStream: () => void
  onStreamChunk: (callback: (data: { requestId: string; chunk: { token?: string; done: boolean; error?: string }; traceSpanId?: string; traceId?: string }) => void) => void
  onStreamError: (callback: (data: { requestId: string; error: string; traceSpanId?: string; traceId?: string }) => void) => void
  removeStreamListeners: () => void
}

interface AITipAPI {
  onFieldSelected: (callback: (context: FieldContext) => void) => void
  removeFieldSelectedListener: () => void
}

interface TraceAPI {
  getDetail: (spanId: string) => Promise<unknown>
  list: (filter?: unknown) => Promise<unknown[]>
  exportTraces: (profile: unknown, filter?: unknown) => Promise<{ ok: boolean; message: string }>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: SidebarAPI
    llmApi: LLMAPI
    aiTipApi: AITipAPI
    traceApi: TraceAPI
  }
}
