/**
 * @ai-tip/llm-providers — Shared LLM provider types
 */

/** Provider metadata */
export interface ProviderMeta {
  name: string
  displayName: string
  defaultBaseUrl: string
  requiresAuth: boolean
}

/** Local model configuration (without storage-layer `id`) */
export interface LocalModelConfig {
  name: string
  provider: string
  baseUrl: string
  apiKey: string
  temperature?: number
  maxTokens?: number
}

/** Chat message */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** Chat options (forwarded to LLM API) */
export interface ChatOptions {
  max_tokens?: number
  temperature?: number
  top_p?: number
  [key: string]: unknown
}

/** Normalized streaming chunk */
export interface StreamChunk {
  token?: string
  done: boolean
  finishReason?: string
  error?: string
}

/**
 * Logger interface — callers inject their own logger.
 * Desktop uses electron-log, Extension uses console or custom.
 */
export interface ChatLogger {
  info: (msg: string, ...args: unknown[]) => void
  debug: (msg: string, ...args: unknown[]) => void
  warn: (msg: string, ...args: unknown[]) => void
  error: (msg: string, ...args: unknown[]) => void
}

/**
 * Provider adapter interface.
 * 22/23 providers use the OpenAI-compatible baseAdapter.
 * Only Anthropic needs a separate adapter.
 */
export interface ProviderAdapter {
  /** Adapter name */
  name: string

  /** Build request endpoint (default: baseUrl + '/chat/completions') */
  endpoint(baseUrl: string, isStream: boolean): string

  /** Auth headers */
  authHeaders(apiKey: string): Record<string, string>

  /** Build request body */
  buildRequestBody(
    model: string,
    messages: ChatMessage[],
    options?: ChatOptions,
  ): unknown

  /** Parse a complete SSE event (delimited by \\n\\n) */
  parseSSEEvent(event: string): StreamChunk | null

  /** Parse a non-streaming JSON response body. Returns extracted text or null. */
  parseNonStreamResponse(data: unknown): string | null
}
