/**
 * Page Summary API — LLM-based page summarization (non-streaming).
 *
 * Usage:
 *   const summary = await bridge.pageSummary.summarize(config, messages)
 */

import type { Transport, PageSummaryAPI, ModelConfig, ChatMessage } from '../types'

export function createPageSummaryAPI(transport: Transport): PageSummaryAPI {
  return {
    async summarize(config: ModelConfig, messages: ChatMessage[]): Promise<string | null> {
      return transport.invoke('page-summary:summarize', [config, messages]) as Promise<string | null>
    },
  }
}
