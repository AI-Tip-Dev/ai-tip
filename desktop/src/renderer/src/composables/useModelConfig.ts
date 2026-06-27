/**
 * Model config composable — manages AI models in localStorage.
 * Defaults to the most recently saved model.
 */

import { ref, computed } from 'vue'

export interface ModelConfig {
  id: string
  name: string
  displayName: string
  provider: string
  source: 'local' | 'remote'
  baseUrl: string
  apiKey: string
  temperature: number
  maxTokens: number
  customHeaders: Array<{ key: string; value: string }>
}

export interface ProviderDef {
  name: string
  displayName: string
  defaultBaseUrl: string
  requiresAuth: boolean
  source: 'local' | 'remote'
}

/** Single source of truth for supported AI providers */
export const PROVIDERS: ProviderDef[] = [
  { name: 'ollama', displayName: 'Ollama', defaultBaseUrl: 'http://localhost:11434/v1', requiresAuth: false, source: 'local' },
  { name: 'openai', displayName: 'OpenAI', defaultBaseUrl: 'https://api.openai.com/v1', requiresAuth: true, source: 'remote' },
  { name: 'anthropic', displayName: 'Anthropic', defaultBaseUrl: 'https://api.anthropic.com/v1', requiresAuth: true, source: 'remote' },
  { name: 'deepseek', displayName: 'DeepSeek', defaultBaseUrl: 'https://api.deepseek.com/v1', requiresAuth: true, source: 'remote' },
  { name: 'aliyun', displayName: 'Alibaba Bailian', defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', requiresAuth: true, source: 'remote' },
  { name: 'zhipu', displayName: 'Zhipu AI', defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4', requiresAuth: true, source: 'remote' },
  { name: 'siliconflow', displayName: 'SiliconFlow', defaultBaseUrl: 'https://api.siliconflow.cn/v1', requiresAuth: true, source: 'remote' },
  { name: 'openrouter', displayName: 'OpenRouter', defaultBaseUrl: 'https://openrouter.ai/api/v1', requiresAuth: true, source: 'remote' },
  { name: 'moonshot', displayName: 'Moonshot', defaultBaseUrl: 'https://api.moonshot.cn/v1', requiresAuth: true, source: 'remote' },
  { name: 'generic', displayName: 'Generic OpenAI', defaultBaseUrl: 'http://localhost:8080/v1', requiresAuth: false, source: 'local' },
]

const STORAGE_KEY = 'ai-sidebar-models'
const ACTIVE_KEY = 'ai-sidebar-active-model'

// ========== Singleton state ==========
const models = ref<ModelConfig[]>(loadFromStorage())
const activeId = ref<string | null>(localStorage.getItem(ACTIVE_KEY))

export function useModelConfig() {
  // Validate activeId — if the saved ID no longer exists, pick first or null
  if (activeId.value && !models.value.find(m => m.id === activeId.value)) {
    activeId.value = models.value[0]?.id ?? null
    if (activeId.value) localStorage.setItem(ACTIVE_KEY, activeId.value)
    else localStorage.removeItem(ACTIVE_KEY)
  }

  const activeModel = computed<ModelConfig | null>(() =>
    models.value.find(m => m.id === activeId.value) ?? null
  )

  const hasModel = computed(() => models.value.length > 0 && activeModel.value !== null)

  const displayLabel = computed(() => {
    const m = activeModel.value
    if (!m) return 'No model'
    return m.displayName || `${m.provider}/${m.name}`
  })

  // ========== CRUD ==========

  function saveModel(cfg: ModelConfig): void {
    const idx = models.value.findIndex(m => m.id === cfg.id)
    if (idx >= 0) {
      models.value[idx] = cfg
    } else {
      models.value.push(cfg)
    }
    activeId.value = cfg.id
    localStorage.setItem(ACTIVE_KEY, cfg.id)
    persistToStorage()
  }

  function deleteModel(id: string): void {
    models.value = models.value.filter(m => m.id !== id)
    if (activeId.value === id) {
      activeId.value = models.value[0]?.id ?? null
      if (activeId.value) localStorage.setItem(ACTIVE_KEY, activeId.value)
      else localStorage.removeItem(ACTIVE_KEY)
    }
    persistToStorage()
  }

  function setActiveModel(id: string): void {
    if (models.value.find(m => m.id === id)) {
      activeId.value = id
      localStorage.setItem(ACTIVE_KEY, id)
    }
  }

  /** Find a model config by ID (not necessarily the active one) */
  function findModelById(id: string): ModelConfig | null {
    return models.value.find(m => m.id === id) ?? null
  }

  // ========== Build IPC config ==========

  function toLLMConfig() {
    const m = activeModel.value
    if (!m) return null
    return {
      id: m.id,
      name: m.name,
      provider: m.provider,
      baseUrl: m.baseUrl,
      apiKey: m.apiKey,
      temperature: m.temperature,
      maxTokens: m.maxTokens,
    }
  }

  return {
    models,
    activeModel,
    activeId,
    hasModel,
    displayLabel,
    saveModel,
    deleteModel,
    setActiveModel,
    findModelById,
    toLLMConfig,
  }
}

// ========== Internal helpers ==========

function loadFromStorage(): ModelConfig[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch {
    return []
  }
}

function persistToStorage(): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(models.value))
}
