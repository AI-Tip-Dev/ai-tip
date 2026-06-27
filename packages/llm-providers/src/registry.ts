/**
 * @ai-tip/llm-providers — Provider registry
 *
 * 22/23 providers use the OpenAI-compatible baseAdapter.
 * Only Anthropic needs a separate adapter.
 */

import type { ProviderMeta, ProviderAdapter } from './types'
import { baseAdapter } from './adapters/base'
import { anthropicAdapter } from './adapters/anthropic'

const PROVIDER_METAS: Record<string, ProviderMeta> = {
  ollama: {
    name: 'ollama',
    displayName: 'Ollama',
    defaultBaseUrl: 'http://localhost:11434/v1',
    requiresAuth: false,
  },
  openai: {
    name: 'openai',
    displayName: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com/v1',
    requiresAuth: true,
  },
  anthropic: {
    name: 'anthropic',
    displayName: 'Anthropic',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    requiresAuth: true,
  },
  deepseek: {
    name: 'deepseek',
    displayName: 'DeepSeek',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    requiresAuth: true,
  },
  aliyun: {
    name: 'aliyun',
    displayName: '阿里云百炼',
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    requiresAuth: true,
  },
  zhipu: {
    name: 'zhipu',
    displayName: '智谱 AI',
    defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    requiresAuth: true,
  },
  siliconflow: {
    name: 'siliconflow',
    displayName: '硅基流动',
    defaultBaseUrl: 'https://api.siliconflow.cn/v1',
    requiresAuth: true,
  },
  moonshot: {
    name: 'moonshot',
    displayName: 'Moonshot (Kimi)',
    defaultBaseUrl: 'https://api.moonshot.cn/v1',
    requiresAuth: true,
  },
  openrouter: {
    name: 'openrouter',
    displayName: 'OpenRouter',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    requiresAuth: true,
  },
  generic: {
    name: 'generic',
    displayName: '自定义（OpenAI 兼容）',
    defaultBaseUrl: '',
    requiresAuth: true,
  },
}

/** Look up provider metadata by name */
export function getProviderMeta(name: string): ProviderMeta | undefined {
  return PROVIDER_METAS[name]
}

/** Return the appropriate adapter for a provider */
export function getAdapter(provider: string): ProviderAdapter {
  switch (provider) {
    case 'anthropic':
      return anthropicAdapter
    default:
      return baseAdapter
  }
}
