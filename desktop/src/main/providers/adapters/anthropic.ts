/**
 * Anthropic 独立适配器
 * Anthropic Messages API 与 OpenAI 完全不兼容：
 * - 端点: /messages（不是 /chat/completions）
 * - 鉴权: x-api-key header + anthropic-version
 * - system prompt 是顶层字段（不在 messages 数组里）
 * - 流式 SSE 事件格式完全不同
 *
 * 对标 WeKnora Go 后端 models/chat/anthropic.go
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
    options?: ChatOptions
  ): unknown {
    // Anthropic 不支持 system role，提取到顶层 system 字段
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
    // Anthropic SSE 事件跨多行: event: xxx\ndata: {...}
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
    // Anthropic 非流式响应: { content: [{ type: "text", text: "..." }], ... }
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
