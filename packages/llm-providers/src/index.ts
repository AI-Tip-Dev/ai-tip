/**
 * @ai-tip/llm-providers — Public API
 */

export { localChatStream } from './chat'
export { getProviderMeta, getAdapter } from './registry'
export { baseAdapter } from './adapters/base'
export { anthropicAdapter } from './adapters/anthropic'

export type {
  ProviderMeta,
  LocalModelConfig,
  ChatMessage,
  ChatOptions,
  StreamChunk,
  ChatLogger,
  ProviderAdapter,
} from './types'
