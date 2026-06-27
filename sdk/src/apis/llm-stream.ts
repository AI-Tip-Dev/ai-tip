/**
 * LLM API — streaming chat + connection test.
 *
 * Usage:
 *   bridge.llm.onStreamChunk(({ chunk }) => appendToken(chunk.token))
 *   bridge.llm.onStreamError(({ error }) => showError(error))
 *   bridge.llm.startStream(config, messages, requestId, options)
 *   bridge.llm.stopStream()
 */

import type { Transport, LLMAPI, ModelConfig, ChatMessage, ChatOptions, StreamChunkEvent, StreamErrorEvent, ConnectionTestResult } from '../types'

export function createLLMAPI(transport: Transport): LLMAPI {
  const chunkCbs = new Set<(data: StreamChunkEvent) => void>()
  const errorCbs = new Set<(data: StreamErrorEvent) => void>()

  if (transport.onEvent) {
    transport.onEvent('llm:stream:chunk', (data: unknown) => {
      for (const cb of chunkCbs) {
        try { cb(data as StreamChunkEvent) } catch (e) { console.error('[ai-tip/sdk] streamChunk callback error:', e) }
      }
    })
    transport.onEvent('llm:stream:error', (data: unknown) => {
      for (const cb of errorCbs) {
        try { cb(data as StreamErrorEvent) } catch (e) { console.error('[ai-tip/sdk] streamError callback error:', e) }
      }
    })
  }

  return {
    startStream(config: ModelConfig, messages: ChatMessage[], requestId: string, options?: ChatOptions): void {
      // fire-and-forget: use invoke but don't await the response
      transport.invoke('llm:stream:start', [config, messages, requestId, options]).catch(() => {
        // errors come via onStreamError push events
      })
    },

    stopStream(): void {
      transport.invoke('llm:stream:stop', []).catch(() => {})
    },

    onStreamChunk(callback: (data: StreamChunkEvent) => void): void {
      chunkCbs.add(callback)
    },

    onStreamError(callback: (data: StreamErrorEvent) => void): void {
      errorCbs.add(callback)
    },

    removeStreamListeners(): void {
      chunkCbs.clear()
      errorCbs.clear()
    },

    async testConnection(config: ModelConfig): Promise<ConnectionTestResult> {
      return transport.invoke('llm:testConnection', [config]) as Promise<ConnectionTestResult>
    },
  }
}
