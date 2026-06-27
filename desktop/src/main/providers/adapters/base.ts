/**
 * 默认 OpenAI 兼容适配器
 * 覆盖所有 OpenAI-compatible provider（22/23）：
 *   OpenAI, DeepSeek, 阿里云百炼, 智谱, 硅基流动,
 *   火山引擎, Moonshot, OpenRouter, 百度千帆, 腾讯混元,
 *   MiniMax, Novita, ModelScope, 七牛云, LKEAP,
 *   Ollama（原生支持 /v1/chat/completions）,
 *   本地 OpenAI-compatible 服务（LM Studio, vLLM, text-generation-webui 等）
 *
 * 对标 WeKnora Go 后端 baseProvider
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
    options?: ChatOptions
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
    // 标准 OpenAI SSE: "data: {...}"
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
