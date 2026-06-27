/**
 * IPC Channel Constants
 *
 * All IPC channel names must be defined here as typed constants.
 * This ensures compile-time safety and prevents typos across processes.
 *
 * Naming convention:
 *   - `invoke` channels (Renderer → Main, with return):  use `ipcMain.handle` + `ipcRenderer.invoke`
 *   - `send` channels (Renderer → Main, fire-and-forget): use `ipcMain.on` + `ipcRenderer.send`
 *   - `push` channels (Main → Renderer, push):            use `webContents.send` + `ipcRenderer.on`
 *   - `host` channels (WebView preload → Renderer):       use `ipcRenderer.sendToHost` + `ipc-message` event
 */

// ============================================================
// Main ↔ Renderer (invoke — request/response)
// ============================================================

/** Renderer → Main: Open a local HTML file via native dialog */
export const IPC_OPEN_LOCAL_FILE = 'open-local-file' as const

/** Renderer → Main: Detect form fields via CDP Accessibility.getFullAXTree */
export const IPC_DETECT_FIELDS = 'detect-fields' as const

/** Renderer → Main: Test LLM model connection */
export const IPC_MODEL_TEST_CONNECTION = 'model:test-connection' as const

/** Renderer → Main: Summarize current page via LLM (non-streaming, returns text) */
export const IPC_PAGE_SUMMARIZE = 'page:summarize' as const

/** Renderer → Main: Batch pre-fill suggestions for all form fields (streaming, returns BatchSuggestResult) */
export const IPC_BATCH_SUGGEST = 'batch:suggest' as const

/** Main → Renderer: Push batch suggest streaming progress */
export const IPC_BATCH_SUGGEST_PROGRESS = 'batch:suggest:progress' as const

// ============================================================
// Main ↔ Renderer (send/on — fire-and-forget)
// ============================================================

/** Renderer → Main: Start LLM streaming chat */
export const IPC_LLM_STREAM_START = 'llm:stream:start' as const

/** Renderer → Main: Stop/cancel active LLM stream */
export const IPC_LLM_STREAM_STOP = 'llm:stream:stop' as const

/** Main → Renderer: Push a streaming token chunk */
export const IPC_LLM_STREAM_CHUNK = 'llm:stream:chunk' as const

/** Main → Renderer: Push a streaming error */
export const IPC_LLM_STREAM_ERROR = 'llm:stream:error' as const

// ============================================================
// WebView Preload → Renderer (sendToHost)
// ============================================================

/** WebView preload → Renderer: User clicked AI button on a form field */
export const IPC_AI_TIP_FIELD_SELECTED = 'ai-tip:field-selected' as const

// ============================================================
// LLM Tracing / Observability
// ============================================================

/** Renderer → Main: Get trace span detail by spanId */
export const IPC_TRACE_GET = 'trace:get' as const

/** Renderer → Main: Query trace span list with optional filter */
export const IPC_TRACE_LIST = 'trace:list' as const

/** Renderer → Main: Export spans to an OTLP target */
export const IPC_TRACE_EXPORT = 'trace:export' as const

// ============================================================
// Aggregate type — all IPC channel names
// ============================================================

export type IpcChannelName =
  | typeof IPC_OPEN_LOCAL_FILE
  | typeof IPC_DETECT_FIELDS
  | typeof IPC_MODEL_TEST_CONNECTION
  | typeof IPC_PAGE_SUMMARIZE
  | typeof IPC_BATCH_SUGGEST
  | typeof IPC_BATCH_SUGGEST_PROGRESS
  | typeof IPC_LLM_STREAM_START
  | typeof IPC_LLM_STREAM_STOP
  | typeof IPC_LLM_STREAM_CHUNK
  | typeof IPC_LLM_STREAM_ERROR
  | typeof IPC_AI_TIP_FIELD_SELECTED
  | typeof IPC_TRACE_GET
  | typeof IPC_TRACE_LIST
  | typeof IPC_TRACE_EXPORT
