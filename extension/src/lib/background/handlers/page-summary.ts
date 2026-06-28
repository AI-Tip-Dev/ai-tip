/**
 * Page Summary Handler — generates page summary via LLM.
 */

import type { LocalModelConfig, ChatMessage } from '@ai-tip/llm-providers'
import { localChatStream } from '@ai-tip/llm-providers'

export async function handlePageSummarize(request: { config: LocalModelConfig; messages: ChatMessage[] }): Promise<string> {
  const { config, messages } = request

  return new Promise((resolve, reject) => {
    let fullText = ''
    const timeout = setTimeout(() => { if (fullText) resolve(fullText); else reject(new Error('Summary timeout (60s)')) }, 60000)
    localChatStream(config, messages, (chunk) => {
      if (chunk.token) fullText += chunk.token
      if (chunk.done) { clearTimeout(timeout); resolve(fullText) }
      if (chunk.error) { clearTimeout(timeout); reject(new Error(chunk.error)) }
    }).catch((error: Error) => { clearTimeout(timeout); reject(error) })
  })
}
