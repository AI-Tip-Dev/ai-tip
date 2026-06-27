/**
 * @ai-tip/llm-providers — OpenAI-compatible base adapter
 */

import type {
  ProviderAdapter,
  ChatMessage,
  ChatOptions,
  StreamChunk,
} from '../types'

export const baseAdapter: ProviderAdapter = {
  name: 'openai-compatible',

  endpoint(baseUrl: string, _isStream: boolean): string {
    const u = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
    return `${u}/chat/completions`
  },

  authHeaders(apiKey: string): Record<string, string> {
    return { Authorization: `Bearer ${apiKey}` }
  },

  buildRequestBody(
    model: string,
    messages: ChatMessage[],
    options?: ChatOptions,
  ): unknown {
    return {
      model,
      messages,
      stream: true,
      max_tokens: options?.max_tokens ?? 4096,
      ...(options ?? {}),
    }
  },

  parseSSEEvent(event: string): StreamChunk | null {
    const dataLine = event.startsWith('data: ')
      ? event
      : event.split('\n').find((l) => l.startsWith('data: '))
    if (!dataLine) return null
    if (dataLine === 'data: [DONE]') return { done: true }

    try {
      const json = JSON.parse(dataLine.slice(6))
      const delta = json.choices?.[0]?.delta
      return {
        token: delta?.content ?? undefined,
        done: json.choices?.[0]?.finish_reason != null,
        finishReason: json.choices?.[0]?.finish_reason ?? undefined,
      }
    } catch {
      return null
    }
  },

  parseNonStreamResponse(data: unknown): string | null {
    if (!data || typeof data !== 'object') return null
    const d = data as Record<string, unknown>
    const content = (d as any).choices?.[0]?.message?.content
    if (typeof content === 'string' && content.trim()) {
      return content.trim()
    }
    return null
  },
}
