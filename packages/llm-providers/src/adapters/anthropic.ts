/**
 * @ai-tip/llm-providers — Anthropic adapter
 */

import type {
  ProviderAdapter,
  ChatMessage,
  ChatOptions,
  StreamChunk,
} from '../types'

export const anthropicAdapter: ProviderAdapter = {
  name: 'anthropic',

  endpoint(baseUrl: string, _isStream: boolean): string {
    const u = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
    return `${u}/messages`
  },

  authHeaders(apiKey: string): Record<string, string> {
    return {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    }
  },

  buildRequestBody(
    model: string,
    messages: ChatMessage[],
    options?: ChatOptions,
  ): unknown {
    let system: string | undefined
    const chatMessages = messages.filter((m) => {
      if (m.role === 'system') {
        system = (system || '') + m.content + '\n'
        return false
      }
      return true
    })
    return {
      model,
      messages: chatMessages,
      system: system?.trim() || undefined,
      max_tokens: options?.max_tokens ?? 4096,
      stream: true,
    }
  },

  parseSSEEvent(event: string): StreamChunk | null {
    const lines = event.split('\n')
    const dataLine = lines.find((l) => l.startsWith('data: '))
    if (!dataLine) return null

    try {
      const json = JSON.parse(dataLine.slice(6))
      const type = json.type

      if (type === 'message_stop') {
        return { done: true, finishReason: 'stop' }
      }
      if (type === 'content_block_delta') {
        const d = json.delta
        if (d.type === 'text_delta') {
          return { token: d.text, done: false }
        }
      }
      return null
    } catch {
      return null
    }
  },

  parseNonStreamResponse(data: unknown): string | null {
    if (!data || typeof data !== 'object') return null
    const d = data as Record<string, unknown>
    const content = d.content
    if (Array.isArray(content)) {
      const texts = content
        .filter((block: any) => block?.type === 'text' && typeof block.text === 'string')
        .map((block: any) => block.text.trim())
        .filter(Boolean)
      return texts.length > 0 ? texts.join('\n') : null
    }
    return null
  },
}
