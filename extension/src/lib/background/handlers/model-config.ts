/**
 * Model Config Handlers — CRUD + test connection for AI model configurations.
 */

import type { LocalModelConfig } from '@ai-tip/llm-providers'
import { localChatStream } from '@ai-tip/llm-providers'
import { storageGet, storageSet, STORAGE_KEYS } from '../storage'

const PROVIDER_LIST = [
  { name: 'ollama', displayName: 'Ollama', defaultBaseUrl: 'http://localhost:11434/v1', requiresAuth: false },
  { name: 'openai', displayName: 'OpenAI', defaultBaseUrl: 'https://api.openai.com/v1', requiresAuth: true },
  { name: 'anthropic', displayName: 'Anthropic', defaultBaseUrl: 'https://api.anthropic.com/v1', requiresAuth: true },
  { name: 'deepseek', displayName: 'DeepSeek', defaultBaseUrl: 'https://api.deepseek.com/v1', requiresAuth: true },
  { name: 'aliyun', displayName: 'Alibaba Bailian', defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', requiresAuth: true },
  { name: 'zhipu', displayName: 'Zhipu AI', defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4', requiresAuth: true },
  { name: 'siliconflow', displayName: 'SiliconFlow', defaultBaseUrl: 'https://api.siliconflow.cn/v1', requiresAuth: true },
  { name: 'moonshot', displayName: 'Moonshot', defaultBaseUrl: 'https://api.moonshot.cn/v1', requiresAuth: true },
  { name: 'openrouter', displayName: 'OpenRouter', defaultBaseUrl: 'https://openrouter.ai/api/v1', requiresAuth: true },
  { name: 'generic', displayName: 'Generic OpenAI', defaultBaseUrl: 'http://localhost:8080/v1', requiresAuth: false },
]

export async function handleListModels(): Promise<LocalModelConfig[]> {
  return (await storageGet<LocalModelConfig[]>(STORAGE_KEYS.MODELS)) ?? []
}

export async function handleSaveModel(config: LocalModelConfig): Promise<LocalModelConfig> {
  const models = (await storageGet<LocalModelConfig[]>(STORAGE_KEYS.MODELS)) ?? []
  const idx = models.findIndex(m => m.id === config.id)
  if (idx >= 0) {
    models[idx] = config
  } else {
    models.push(config)
    // Auto-activate first model so the sidepanel immediately shows it
    if (models.length === 1 && config.id) {
      await storageSet(STORAGE_KEYS.ACTIVE_MODEL, config.id)
    }
  }
  await storageSet(STORAGE_KEYS.MODELS, models)
  return config
}

export async function handleDeleteModel(id: string): Promise<void> {
  let models = (await storageGet<LocalModelConfig[]>(STORAGE_KEYS.MODELS)) ?? []
  models = models.filter(m => m.id !== id)
  await storageSet(STORAGE_KEYS.MODELS, models)
  const activeId = await storageGet<string>(STORAGE_KEYS.ACTIVE_MODEL)
  if (activeId === id) await storageSet(STORAGE_KEYS.ACTIVE_MODEL, models[0]?.id ?? null)
}

export async function handleSetActiveModel(id: string): Promise<void> {
  await storageSet(STORAGE_KEYS.ACTIVE_MODEL, id)
}

export async function handleGetActiveModel(): Promise<string | null> {
  const activeId = await storageGet<string>(STORAGE_KEYS.ACTIVE_MODEL)
  if (!activeId) return null
  // Verify the stored active ID still points to a valid model
  const models = (await storageGet<LocalModelConfig[]>(STORAGE_KEYS.MODELS)) ?? []
  return models.some(m => m.id === activeId) ? activeId : null
}

export async function handleListProviders() {
  return PROVIDER_LIST.map(p => ({
    name: p.name,
    displayName: p.displayName,
    defaultBaseUrl: p.defaultBaseUrl,
    requiresAuth: p.requiresAuth,
  }))
}

export async function handleTestConnection(config: LocalModelConfig): Promise<{ success: boolean; message: string }> {
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Connection timeout (10s)')), 10000)
      localChatStream(config, [{ role: 'user', content: 'Hi' }], (chunk) => {
        if (chunk.done) { clearTimeout(timeout); resolve() }
      }).catch((err: Error) => { clearTimeout(timeout); reject(err) })
    })
    return { success: true, message: 'Connection successful' }
  } catch (error: any) {
    return { success: false, message: error.message || 'Connection failed' }
  }
}
