/**
 * LLM Stream Handlers — streaming chat via chrome.runtime.connect ports.
 */

import type { LocalModelConfig, ChatMessage, StreamChunk } from '@ai-tip/llm-providers'
import { localChatStream } from '@ai-tip/llm-providers'
import { storageGet, STORAGE_KEYS } from '../storage'

interface StreamStartMessage {
  requestId: string
  modelId?: string
  messages: ChatMessage[]
  options?: Record<string, unknown>
}

export async function handleStartStream(
  message: StreamStartMessage,
  port: chrome.runtime.Port,
  activeStreams: Map<string, AbortController>,
): Promise<void> {
  const { requestId, modelId, messages } = message
  const streamKey = `llm-stream:${requestId}`

  let config: LocalModelConfig
  if (modelId) {
    const models = (await storageGet<LocalModelConfig[]>(STORAGE_KEYS.MODELS)) ?? []
    const found = models.find(m => m.id === modelId)
    if (!found) {
      port.postMessage({ type: 'llm:stream:error', requestId, error: `Model not found: ${modelId}` })
      return
    }
    config = found
  } else {
    const activeId = await storageGet<string>(STORAGE_KEYS.ACTIVE_MODEL)
    const models = (await storageGet<LocalModelConfig[]>(STORAGE_KEYS.MODELS)) ?? []
    const active = models.find(m => m.id === activeId)
    if (!active) {
      config = { id: 'ollama-default', name: 'qwen2.5:7b', provider: 'ollama', baseUrl: 'http://localhost:11434/v1', apiKey: '', temperature: 0.1, maxTokens: 2048 }
    } else {
      config = active
    }
  }

  const controller = new AbortController()
  activeStreams.set(streamKey, controller)

  try {
    await localChatStream(config, messages, (chunk: StreamChunk) => {
      port.postMessage({ type: 'llm:stream:chunk', requestId, chunk: { token: chunk.token, done: chunk.done, finishReason: chunk.finishReason, error: chunk.error } })
    }, undefined, controller.signal)
    activeStreams.delete(streamKey)
  } catch (error: any) {
    if (error.name !== 'AbortError') {
      port.postMessage({ type: 'llm:stream:error', requestId, error: error.message })
    }
    activeStreams.delete(streamKey)
  }
}

export async function handleStopStream(
  message: { requestId: string },
  _port: chrome.runtime.Port,
  activeStreams: Map<string, AbortController>,
): Promise<void> {
  const streamKey = `llm-stream:${message.requestId}`
  activeStreams.get(streamKey)?.abort()
  activeStreams.delete(streamKey)
}
