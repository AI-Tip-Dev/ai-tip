/**
 * Provider registry — thin re-export from @ai-tip/llm-providers
 *
 * Keeps backward compatibility for existing imports.
 */

export { getProviderMeta, getAdapter, baseAdapter, anthropicAdapter } from '@ai-tip/llm-providers'
export type { ProviderMeta, ProviderAdapter } from '@ai-tip/llm-providers'
