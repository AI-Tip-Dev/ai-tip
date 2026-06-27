/**
 * Main process Provider layer shared types
 *
 * Re-exports from @ai-tip/llm-providers, with desktop-specific extensions.
 */

// Re-export shared types
export type {
  ProviderMeta,
  ChatMessage,
  ChatOptions,
  StreamChunk,
  ChatLogger,
  ProviderAdapter,
} from '@ai-tip/llm-providers'

// Desktop-specific: adds `id` for storage layer (local-models.json)
import type { LocalModelConfig as BaseLocalModelConfig } from '@ai-tip/llm-providers'

export interface LocalModelConfig extends BaseLocalModelConfig {
  id: string // Unique identifier for storage
}
