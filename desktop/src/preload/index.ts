import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import log from 'electron-log/renderer'
import type { DetectFieldsResult } from './index.d'
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
  IPC_AI_TIP_FIELD_SELECTED,
  IPC_TRACE_GET,
  IPC_TRACE_LIST,
  IPC_TRACE_EXPORT,
} from '../shared/ipc-channels'

const api = {
  openLocalFile: (): Promise<string | null> => ipcRenderer.invoke(IPC_OPEN_LOCAL_FILE),
  detectFields: (webContentsId: number): Promise<DetectFieldsResult> =>
    ipcRenderer.invoke(IPC_DETECT_FIELDS, webContentsId),
  summarizePage: (config: unknown, messages: unknown[]): Promise<string | null> =>
    ipcRenderer.invoke(IPC_PAGE_SUMMARIZE, { config, messages }),
  batchSuggest: (config: unknown, fields: unknown[], structuredCtx: string): Promise<unknown> =>
    ipcRenderer.invoke(IPC_BATCH_SUGGEST, { config, fields, structuredCtx }),
  onBatchSuggestProgress: (callback: (data: { phase: string; tokensReceived: number; contentSoFar?: string }) => void): void => {
    ipcRenderer.on(IPC_BATCH_SUGGEST_PROGRESS, (_event, data) => callback(data))
  },
  removeBatchSuggestProgressListeners: (): void => {
    ipcRenderer.removeAllListeners(IPC_BATCH_SUGGEST_PROGRESS)
  },
}

const llmApi = {
  testConnection: (config: unknown): Promise<{ ok: boolean; message: string }> =>
    ipcRenderer.invoke(IPC_MODEL_TEST_CONNECTION, config),

  startStream: (config: unknown, messages: unknown[], requestId: string, options?: unknown): void =>
    ipcRenderer.send(IPC_LLM_STREAM_START, { config, messages, requestId, options }),
  stopStream: (): void =>
    ipcRenderer.send(IPC_LLM_STREAM_STOP),
  onStreamChunk: (callback: (data: { requestId: string; chunk: { token?: string; done: boolean; error?: string }; traceSpanId?: string; traceId?: string }) => void): void => {
    ipcRenderer.on(IPC_LLM_STREAM_CHUNK, (_event, data) => callback(data))
  },
  onStreamError: (callback: (data: { requestId: string; error: string; traceSpanId?: string; traceId?: string }) => void): void => {
    ipcRenderer.on(IPC_LLM_STREAM_ERROR, (_event, data) => callback(data))
  },
  removeStreamListeners: (): void => {
    ipcRenderer.removeAllListeners(IPC_LLM_STREAM_CHUNK)
    ipcRenderer.removeAllListeners(IPC_LLM_STREAM_ERROR)
  }
}

// ── AI Tip API ──
const aiTipApi = {
  onFieldSelected: (callback: (context: unknown) => void): void => {
    ipcRenderer.removeAllListeners(IPC_AI_TIP_FIELD_SELECTED)
    ipcRenderer.on(IPC_AI_TIP_FIELD_SELECTED, (_event, context) => callback(context))
  },
  removeFieldSelectedListener: (): void => {
    ipcRenderer.removeAllListeners(IPC_AI_TIP_FIELD_SELECTED)
  }
}

// ── Trace API ──
const traceApi = {
  getDetail: (spanId: string): Promise<unknown> =>
    ipcRenderer.invoke(IPC_TRACE_GET, spanId),
  list: (filter?: unknown): Promise<unknown[]> =>
    ipcRenderer.invoke(IPC_TRACE_LIST, filter),
  exportTraces: (profile: unknown, filter?: unknown): Promise<{ ok: boolean; message: string }> =>
    ipcRenderer.invoke(IPC_TRACE_EXPORT, { profile, filter }),
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('llmApi', llmApi)
    contextBridge.exposeInMainWorld('aiTipApi', aiTipApi)
    contextBridge.exposeInMainWorld('traceApi', traceApi)
  } catch (error) {
    log.error('Failed to expose APIs via contextBridge:', error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
  // @ts-ignore (define in dts)
  window.llmApi = llmApi
  // @ts-ignore (define in dts)
  window.aiTipApi = aiTipApi
  // @ts-ignore (define in dts)
  window.traceApi = traceApi
}
