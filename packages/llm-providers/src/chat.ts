/**
 * @ai-tip/llm-providers — Streaming chat entry point
 *
 * Built-in timeout, retry, and SSE parsing.
 * Accepts an optional ChatLogger for logging — Desktop passes electron-log,
 * Extension passes console or a custom logger.
 */

import { getProviderMeta, getAdapter } from './registry'
import type {
  LocalModelConfig,
  ChatMessage,
  ChatOptions,
  StreamChunk,
  ChatLogger,
} from './types'

const RETRIABLE = new Set([429, 500, 502, 503, 504])
const MAX_RETRIES = 3
const FETCH_TIMEOUT_MS = 120_000
const MAX_BUFFER = 1024 * 1024 // 1MB SSE buffer safety limit

/**
 * LLM streaming call entry point.
 *
 * @param config   Model config (provider, model, baseUrl, apiKey)
 * @param messages Chat messages
 * @param onChunk  Called for each SSE chunk
 * @param options  Chat params (temperature, max_tokens, etc.). Pass `stream: false` for non-streaming.
 * @param signal   External AbortSignal (for IPC cancellation)
 * @param logger   Optional logger. Defaults to silent.
 */
export async function localChatStream(
  config: LocalModelConfig,
  messages: ChatMessage[],
  onChunk: (chunk: StreamChunk) => void,
  options?: ChatOptions,
  signal?: AbortSignal,
  logger?: ChatLogger,
): Promise<void> {
  const log: ChatLogger = logger ?? {
    info: () => {},
    debug: () => {},
    warn: () => {},
    error: () => {},
  }

  const meta = getProviderMeta(config.provider)
  const adapter = getAdapter(config.provider)
  const baseUrl = (config.baseUrl || meta?.defaultBaseUrl || '').replace(
    /\/$/,
    '',
  )
  const endpoint = adapter.endpoint(baseUrl, true)
  const headers = {
    'Content-Type': 'application/json',
    ...adapter.authHeaders(config.apiKey),
  }
  const body = JSON.stringify(
    adapter.buildRequestBody(config.name, messages, options),
  )

  log.info(
    `Starting stream: model=${config.name} provider=${config.provider} endpoint=${endpoint}`,
  )
  log.debug(`Request body: ${body}`)

  let lastError: Error | undefined

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    const mergedSignal = signal
      ? (signal.addEventListener('abort', () => controller.abort()),
        controller.signal)
      : controller.signal

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body,
        signal: mergedSignal,
      })
      clearTimeout(timeoutId)

      log.info(`Response status: ${response.status} ${response.statusText}`)
      if (!response.ok) {
        const errBody = await response.text().catch(() => '')
        const err = new Error(
          `LLM ${response.status}: ${errBody.slice(0, 200)}`,
        )
        log.error(
          `LLM API error: status=${response.status} body=${errBody.slice(0, 500)}`,
        )
        if (!RETRIABLE.has(response.status) || attempt >= MAX_RETRIES)
          throw err
        const ra = response.headers.get('Retry-After')
        lastError = err
        await sleep(ra ? parseInt(ra) * 1000 : backoffDelay(attempt))
        continue
      }

      // Stream SSE events delimited by \n\n
      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      let chunkCount = 0
      let byteCount = 0
      let lastLogAt = Date.now()
      const LOG_INTERVAL_MS = 3000

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done || mergedSignal.aborted) break
          buf += decoder.decode(value, { stream: true })
          byteCount += value?.length || 0
          if (buf.length > MAX_BUFFER)
            throw new Error('SSE buffer overflow')
          const events = buf.split('\n\n')
          buf = events.pop() || ''
          for (const ev of events) {
            if (!ev.trim() || mergedSignal.aborted) continue
            const chunk = adapter.parseSSEEvent(ev.trim())
            if (chunk) {
              chunkCount++
              if (chunkCount === 1) {
                log.info(
                  `First chunk received (${byteCount} bytes read so far)`,
                )
              } else if (Date.now() - lastLogAt >= LOG_INTERVAL_MS) {
                log.info(
                  `Stream progress: chunks=${chunkCount} bytes=${byteCount} latest=${JSON.stringify(chunk).slice(0, 120)}`,
                )
                lastLogAt = Date.now()
              }
              onChunk(chunk)
            }
          }
        }
      } finally {
        reader.releaseLock()
      }

      log.info(
        `Stream complete: chunks=${chunkCount} bytes=${byteCount}`,
      )
      onChunk({ done: true })
      return
    } catch (err: any) {
      clearTimeout(timeoutId)
      if (err.name === 'AbortError') {
        log.info('Stream aborted')
        onChunk({ done: true })
        return
      }
      log.error(
        `Stream error (attempt ${attempt + 1}/${MAX_RETRIES + 1}): ${err.message}`,
      )
      if (attempt < MAX_RETRIES) {
        lastError = err
        const delay = backoffDelay(attempt)
        log.info(`Retrying in ${delay}ms...`)
        await sleep(delay)
      } else {
        throw err
      }
    }
  }

  throw lastError
}

// ============================================================
// Helpers
// ============================================================

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function backoffDelay(attempt: number): number {
  return Math.min(1000 * Math.pow(2, attempt), 10000)
}
