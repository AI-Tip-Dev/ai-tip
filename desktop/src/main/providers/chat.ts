/**
 * Streaming chat entry point — thin wrapper around @ai-tip/llm-providers
 *
 * Wires electron-log for Desktop logging.
 */

import log from 'electron-log'
import { localChatStream as _localChatStream } from '@ai-tip/llm-providers'
import type {
  LocalModelConfig,
  ChatMessage,
  ChatOptions,
  StreamChunk,
} from './types'

const logger = log.scope('llm-chat')

/**
 * LLM streaming call entry point.
 * Delegates to @ai-tip/llm-providers with electron-log wired in.
 */
export async function localChatStream(
  config: LocalModelConfig,
  messages: ChatMessage[],
  onChunk: (chunk: StreamChunk) => void,
  options?: ChatOptions,
  signal?: AbortSignal,
): Promise<void> {
  return _localChatStream(config, messages, onChunk, options, signal, {
    info: (msg: string, ...args: unknown[]) => logger.info(msg, ...args),
    debug: (msg: string, ...args: unknown[]) => logger.debug(msg, ...args),
    warn: (msg: string, ...args: unknown[]) => logger.warn(msg, ...args),
    error: (msg: string, ...args: unknown[]) => logger.error(msg, ...args),
  })
}
