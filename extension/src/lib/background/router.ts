/**
 * Background Message Router
 *
 * Maps incoming bridge calls (method → handler) and manages streaming connections.
 * This is the extension equivalent of the Desktop's IPC handler registration.
 */

import type { LocalModelConfig, ChatMessage } from '@ai-tip/llm-providers'
import {
  handleListModels, handleSaveModel, handleDeleteModel,
  handleSetActiveModel, handleGetActiveModel, handleListProviders, handleTestConnection,
} from './handlers/model-config'
import { handleStartStream, handleStopStream } from './handlers/llm-stream'
import { handlePageSummarize } from './handlers/page-summary'
import { handleBatchSuggest, handleBatchSuggestStream } from './handlers/batch-fill'
import {
  handleListPages, handleInitPage, handleActivateField,
  handleSendMessage, handleGetMessages, handleArchivePage, handleSetSidebarView,
} from './handlers/session'
import { handleTraceGet, handleTraceList, handleTraceExport } from './handlers/trace'
import { handleHistoryList, handleHistoryAdd, handleHistoryClear } from './handlers/history'
import { handleSettingsGet, handleSettingsSet, handleSettingsGetAll } from './handlers/settings'
import { handleDetectFields, handleBuildAXTreeText } from './handlers/form-detect'

// ── Types ──

interface BridgeMessage { type: 'BRIDGE_CALL'; id: string; method: string; args: unknown[] }

type HandlerFn = (args: unknown[], sender: chrome.runtime.MessageSender) => Promise<unknown>

const handlers: Record<string, HandlerFn> = {
  'model-config:list': () => handleListModels(),
  'model-config:save': (args) => handleSaveModel(args[0] as LocalModelConfig),
  'model-config:delete': (args) => handleDeleteModel(args[0] as string),
  'model-config:setActive': (args) => handleSetActiveModel(args[0] as string),
  'model-config:getActive': () => handleGetActiveModel(),
  'model-config:listProviders': () => handleListProviders(),
  'model:test-connection': (args) => handleTestConnection(args[0] as LocalModelConfig),

  'form-detect:detectFields': (args, sender) => handleDetectFields(args, sender),
  'form-detect:buildAXTreeText': (args, sender) => handleBuildAXTreeText(args, sender),

  'page:summarize': (args) => handlePageSummarize(args[0] as { config: LocalModelConfig; messages: ChatMessage[] }),

  'batch:suggest': (args) => handleBatchSuggest(args[0] as any),

  'session:listPages': () => handleListPages(),
  'session:initPage': (args) => handleInitPage(args[0] as any),
  'session:activateField': (args) => handleActivateField(args[0] as any),
  'session:sendMessage': (args) => handleSendMessage(args[0] as any),
  'session:getMessages': (args) => handleGetMessages(args[0] as any),
  'session:archivePage': (args) => handleArchivePage(args[0] as any),
  'session:setSidebarView': (args) => handleSetSidebarView(args[0] as any),

  'trace:get': (args) => handleTraceGet(args[0] as string),
  'trace:list': (args) => handleTraceList(args[0] as any),
  'trace:export': (args) => handleTraceExport(args[0] as any),

  'history:list': () => handleHistoryList(),
  'history:add': (args) => handleHistoryAdd(args[0] as any),
  'history:clear': () => handleHistoryClear(),

  'settings:get': (args) => handleSettingsGet(args[0] as string),
  'settings:set': (args) => handleSettingsSet(args[0] as string, args[1] as unknown),
  'settings:getAll': () => handleSettingsGetAll(),
}

// ── Message Handler ──

export async function handleMessage(message: BridgeMessage, sender: chrome.runtime.MessageSender): Promise<unknown> {
  const { method, args } = message
  const handler = handlers[method]
  if (!handler) throw new Error(`Unknown method: ${method}`)
  try { return await handler(args, sender) }
  catch (error: any) { console.error('[bg] Handler error:', method, error.message); throw error }
}

// ── Connection Handler (Streaming) ──

const activeStreams = new Map<string, AbortController>()

export function handleConnect(port: chrome.runtime.Port): void {
  port.onMessage.addListener((message) => {
    if (message.type === 'llm:stream:start') handleStartStream(message, port, activeStreams)
    else if (message.type === 'llm:stream:stop') handleStopStream(message, port, activeStreams)
    else if (message.type === 'batch:suggest:start') handleBatchSuggestStream(message, port, activeStreams)
  })
  port.onDisconnect.addListener(() => {
    const streamKey = Array.from(activeStreams.keys()).find(k => k.startsWith(`${port.name}:`))
    if (streamKey) { activeStreams.get(streamKey)?.abort(); activeStreams.delete(streamKey) }
  })
}
