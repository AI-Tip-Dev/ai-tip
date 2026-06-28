/**
 * Batch Fill Handler — streaming batch suggestions for all form fields.
 */

import type { LocalModelConfig, ChatMessage } from '@ai-tip/llm-providers'
import { localChatStream } from '@ai-tip/llm-providers'
import { storageGet, STORAGE_KEYS } from '../storage'

interface FieldSuggestion { fieldLabel: string; value: string; confidence: 'high' | 'medium' | 'low'; reason: string }

export async function handleBatchSuggest(request: {
  config?: LocalModelConfig; messages: ChatMessage[]; fieldCount: number; port?: chrome.runtime.Port
}): Promise<{ suggestions: FieldSuggestion[] }> {
  const { config: explicitConfig, messages, fieldCount, port } = request
  let config = explicitConfig
  if (!config) {
    const activeId = await storageGet<string>(STORAGE_KEYS.ACTIVE_MODEL)
    const models = (await storageGet<LocalModelConfig[]>(STORAGE_KEYS.MODELS)) ?? []
    config = models.find(m => m.id === activeId) ?? undefined
  }
  if (!config) throw new Error('No model configured')

  return new Promise((resolve, reject) => {
    let fullText = ''
    const timeout = setTimeout(() => {
      if (fullText) resolve({ suggestions: parseBatchSuggestions(fullText, fieldCount) })
      else reject(new Error('Batch suggest timeout (120s)'))
    }, 120000)

    localChatStream(config!, messages, (chunk) => {
      if (chunk.token) { fullText += chunk.token; port?.postMessage({ type: 'batch:suggest:progress', partial: fullText }) }
      if (chunk.done) {
        clearTimeout(timeout)
        const suggestions = parseBatchSuggestions(fullText, fieldCount)
        port?.postMessage({ type: 'batch:suggest:done', result: { suggestions } })
        resolve({ suggestions })
      }
      if (chunk.error) { clearTimeout(timeout); reject(new Error(chunk.error)) }
    }).catch((err: Error) => { clearTimeout(timeout); reject(err) })
  })
}

export async function handleBatchSuggestStream(
  message: any, port: chrome.runtime.Port, _activeStreams: Map<string, AbortController>
): Promise<void> {
  try { await handleBatchSuggest({ ...message, port }) }
  catch (error: any) { port.postMessage({ type: 'batch:suggest:error', error: error.message }) }
}

function parseBatchSuggestions(text: string, fieldCount: number): FieldSuggestion[] {
  const suggestions: FieldSuggestion[] = []
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      if (parsed.fields && Array.isArray(parsed.fields)) {
        for (const f of parsed.fields) {
          suggestions.push({ fieldLabel: f.label || f.fieldLabel || f.field || '', value: f.value || f.suggestedValue || '', confidence: f.confidence || 'medium', reason: f.reason || f.reasoning || '' })
        }
        return suggestions.slice(0, fieldCount)
      }
    }
  } catch { /* fall through */ }
  for (const line of text.split('\n')) {
    const match = line.match(/^(.+?):\s*(.+)$/)
    if (match) suggestions.push({ fieldLabel: match[1].trim(), value: match[2].trim(), confidence: 'medium', reason: '' })
  }
  return suggestions.slice(0, fieldCount)
}
