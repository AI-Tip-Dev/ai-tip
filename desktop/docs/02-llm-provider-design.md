# 04 — LLM Provider 子系统设计

> **创建**: 2026-06-23 · **更新**: 2026-06-26
> **关联**: [02 系统架构](./02-system-architecture.md) · [03 UI/UX 设计](./03-ui-ux-design.md) · [01 PRD](./01-product-spec.md)
> **参考实现**: `src/main/providers/`（已实施）
> **状态**: ✅ 已实施 — 10 个 Provider，baseAdapter + anthropicAdapter，stream/retry/timeout 全部到位

---

## 目录

1. [架构对比：WeKnora 方案 vs 原设计方案](#1-架构对比weknora-方案-vs-原设计方案)
2. [推荐架构：四层分离](#2-推荐架构四层分离)
3. [核心设计：Provider 层（Adapter + Registry）](#3-核心设计provider-层adapter--registry)
4. [流式聊天入口（chat.ts）](#4-流式聊天入口chatts)
5. [Agent 层设计](#5-agent-层设计)
6. [IPC 通道设计](#6-ipc-通道设计)
7. [Sidebar UI 改造：Chat-First 设计](#7-sidebar-ui-改造chat-first-设计)
8. [Prompt 工程策略](#8-prompt-工程策略)
9. [错误处理 & 降级策略](#9-错误处理--降级策略)
10. [安全设计](#10-安全设计)
11. [文件结构清单](#11-文件结构清单)
12. [实现路线图](#12-实现路线图)

---

## 1. 架构对比：WeKnora 方案 vs 原设计方案

### 1.1 WeKnora 的核心洞察

> **23 个 Provider 中，22 个走同一套 OpenAI 兼容 Adapter，仅 Anthropic 需要独立适配。新增 Provider 只需加一行 metadata。**

```
WeKnora 方案（推荐采用）                    原设计方案（已废弃）
─────────────────────────────              ────────────────────────
Adapter = 纯接口（5 个方法）                Adapter = 抽象类 + 继承
├── endpoint()                              ├── AbstractBaseProvider
├── authHeaders()                           ├── OllamaProvider extends Base
├── buildRequestBody()                      └── OpenAIProvider extends Base
├── parseSSEEvent()
└── name

Provider 路由 = Registry 查表              Provider 路由 = Service 类 switch
├── getAdapter('openai') → baseAdapter     ├── llmService.configure({ provider: 'ollama' })
├── getAdapter('deepseek') → baseAdapter   └── 内部 new OllamaProvider()
├── getAdapter('ollama') → baseAdapter
└── getAdapter('anthropic') → anthropic

流式入口 = 独立函数 localChatStream()      流式入口 = llmService.chatStream()
├── 超时 120s                               ├── 超时参数化
├── 重试 3 次 (429/500/502/503/504)         └── 无内置重试
└── 16ms 批处理减 IPC 频率

新增 Provider = 加一行元数据 + 零代码       新增 Provider = 新建 class 文件 + 注册
```

### 1.2 为什么 WeKnora 方案更好

| 维度 | WeKnora 方案 | 原设计方案 |
|------|:-----------:|:---------:|
| 代码量 | types(70行) + registry(200行) + base(70行) = ~340 行 | types(80行) + service(80行) + ollama(80行) + openai(100行) = ~340行 |
| **扩展成本** | 加一行 metadata | 新建 class 文件 |
| **灵活性** | adapter 是纯对象，可 compose（如 Azure 覆盖 authHeaders） | 继承链固定，难 compose |
| **测试** | 纯函数，可单独测试 | 需要 mock 类实例 |
| **Ollama 处理** | 走 OpenAI 兼容端点（Ollama 已支持 `/v1/chat/completions`） | 需要独立的 Ollama 适配器 |
| **流式处理** | 内置重试 + 超时 + 批处理 | 需要外部包装 |

### 1.3 关键理念转变

```
旧思路：为每个 LLM 建一个 Adapter class
  → OllamaProvider, OpenAIProvider, AnthropicProvider...

新思路：定义一个 Adapter interface，绝大多数 Provider 共享一个 baseAdapter
  → 因为 2026 年几乎所有人都兼容 OpenAI API 格式
  → 只有 Anthropic 需要独立 adapter
  → Ollama 完全兼容 OpenAI，走 baseAdapter 即可
```

---

## 2. 推荐架构：四层分离

```
┌──────────────────────────────────────────────────────────────┐
│                    Sidebar UI (Vue 3)                         │
│                                                              │
│  ┌──────────┐  ┌──────────────────┐  ┌───────────────────┐  │
│  │FieldsView│  │ AIRecommendPanel │  │KnowledgeBasePanel │  │
│  │ (已有)   │  │    (🆕 新增)     │  │ (已有)             │  │
│  └─────┬────┘  └────────┬─────────┘  └────────┬──────────┘  │
│        └──────────┬─────┴──────────┬──────────┘              │
│                   │   useLLM composable                      │
│                   │   • recommendValues()                    │
│                   │   • askQuestion()                        │
│                   │   • streaming state                      │
└───────────────────┼──────────────────────────────────────────┘
                    │ IPC (ipcRenderer.invoke / .on)
                    │
┌───────────────────┼──────────────────────────────────────────┐
│        Main Process                                          │
│                   │                                          │
│  ┌────────────────┴──────────────────────────────────┐      │
│  │              IPC Handlers (index.ts)                │      │
│  │  llm:recommend  llm:stream:start  llm:stream:stop   │      │
│  │  agent:execute  llm:status                          │      │
│  └───────┬──────────────────────────┬─────────────────┘      │
│          │                          │                        │
│  ┌───────┴──────────┐  ┌────────────┴─────────────┐        │
│  │  Agent 层 (🆕)    │  │  Provider 层 (🆕)         │        │
│  │                  │  │                          │        │
│  │ agent/           │  │ providers/               │        │
│  │ ├── engine.ts    │──┤ ├── chat.ts (流式入口)    │        │
│  │ ├── types.ts     │  │ ├── registry.ts (路由表)  │        │
│  │ ├── prompts.ts   │  │ ├── types.ts (共享类型)   │        │
│  │ └── tools/       │  │ └── adapters/             │        │
│  │    (search_kb,   │  │     ├── base.ts (22/23)   │        │
│  │     fill_field)  │  │     └── anthropic.ts (1)   │        │
│  └──────────────────┘  └──────────────────────────┘        │
│                                                              │
│  ┌──────────────────────────────────────────────────┐      │
│  │          现有模块（不变）                          │      │
│  │  detect-fields (CDP)  ·  knowledge-base (待建)    │      │
│  └──────────────────────────────────────────────────┘      │
└──────────────────────────────────────────────────────────────┘
```

### 四层职责

| 层 | 目录 | 职责 |
|----|------|------|
| **UI 层** | `src/renderer/` | Vue 组件 + composable，管理 loading/streaming 状态 |
| **IPC 层** | `src/main/index.ts` | IPC handlers，连接 UI 和 Service |
| **Agent 层** | `src/main/agent/` | ReAct 循环、工具调度、Prompt 构建 |
| **Provider 层** | `src/main/providers/` | LLM 适配器、流式调用、重试、超时 |

---

## 3. 核心设计：Provider 层（Adapter + Registry）

### 3.1 目录结构

```
src/main/providers/
├── types.ts                # 共享类型 + ProviderAdapter 接口
├── registry.ts             # Provider 元数据注册表 + getAdapter()
├── chat.ts                 # 流式聊天入口（超时 + 重试 + 批处理）
└── adapters/
    ├── base.ts             # OpenAI 兼容适配器（覆盖 22/23 provider）
    └── anthropic.ts        # Anthropic 独立适配器（API 不兼容）
```

### 3.2 类型定义（types.ts）

```typescript
// src/main/providers/types.ts

/** 支持的模型类型 */
export type ModelType = 'chat' | 'embedding' | 'rerank' | 'vllm'

/** Provider 元数据 */
export interface ProviderMeta {
  name: string
  displayName: string
  defaultBaseUrl: string
  requiresAuth: boolean
  modelTypes: ModelType[]
}

/** 本地模型配置 */
export interface LocalModelConfig {
  id: string              // 唯一标识
  name: string            // 模型名，如 'qwen2.5:7b'
  provider: string        // provider 名，如 'ollama'
  baseUrl: string
  apiKey: string
  temperature?: number    // 默认 0.1
  maxTokens?: number      // 默认 2048
}

/** 聊天消息 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** 聊天选项（透传给 API） */
export interface ChatOptions {
  max_tokens?: number
  temperature?: number
  top_p?: number
  [key: string]: unknown
}

/** 标准化流式块 */
export interface StreamChunk {
  token?: string
  done: boolean
  finishReason?: string
  error?: string
}

/** ⭐ Provider 适配器接口（对标 WeKnora Go providerAdapter） */
export interface ProviderAdapter {
  name: string

  /** 构建请求端点 */
  endpoint(baseUrl: string, isStream: boolean): string

  /** 鉴权 headers */
  authHeaders(apiKey: string): Record<string, string>

  /** 构建请求体 */
  buildRequestBody(
    model: string,
    messages: ChatMessage[],
    options?: ChatOptions
  ): unknown

  /** 解析 SSE 事件（以 \n\n 分隔的完整事件字符串） */
  parseSSEEvent(event: string): StreamChunk | null
}
```

### 3.3 OpenAI 兼容适配器（base.ts）

```typescript
// src/main/providers/adapters/base.ts

import type { ProviderAdapter, ChatMessage, ChatOptions, StreamChunk } from '../types'

/**
 * 默认 OpenAI 兼容适配器
 * 覆盖所有 OpenAI-compatible provider：
 *   OpenAI, DeepSeek, 阿里云百炼, 智谱, 硅基流动,
 *   火山引擎, Moonshot, OpenRouter, 百度千帆, 腾讯混元,
 *   MiniMax, Novita, ModelScope, 七牛云, LKEAP,
 *   Ollama（原生支持 /v1/chat/completions）,
 *   本地 OpenAI-compatible 服务（LM Studio, vLLM, text-generation-webui 等）
 */
export const baseAdapter: ProviderAdapter = {
  name: 'openai-compatible',

  endpoint(baseUrl: string, _isStream: boolean): string {
    const u = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
    return `${u}/chat/completions`
  },

  authHeaders(apiKey: string): Record<string, string> {
    return { Authorization: `Bearer ${apiKey}` }
  },

  buildRequestBody(
    model: string,
    messages: ChatMessage[],
    options?: ChatOptions
  ): unknown {
    return {
      model,
      messages,
      stream: true,
      max_tokens: options?.max_tokens ?? 4096,
      ...(options ?? {}),
    }
  },

  parseSSEEvent(event: string): StreamChunk | null {
    // 标准 OpenAI SSE: "data: {...}"
    const dataLine = event.startsWith('data: ')
      ? event
      : event.split('\n').find((l) => l.startsWith('data: '))
    if (!dataLine) return null
    if (dataLine === 'data: [DONE]') return { done: true }

    try {
      const json = JSON.parse(dataLine.slice(6))
      const delta = json.choices?.[0]?.delta
      return {
        token: delta?.content ?? undefined,
        done: json.choices?.[0]?.finish_reason != null,
        finishReason: json.choices?.[0]?.finish_reason ?? undefined,
      }
    } catch {
      return null
    }
  },
}
```

### 3.4 Anthropic 适配器（anthropic.ts）

```typescript
// src/main/providers/adapters/anthropic.ts

import type { ProviderAdapter, ChatMessage, ChatOptions, StreamChunk } from '../types'

/**
 * Anthropic 独立适配器
 * 与 OpenAI 完全不同的 API 格式：
 * - 端点: /messages（不是 /chat/completions）
 * - 鉴权: x-api-key header + anthropic-version
 * - system prompt 是顶层字段（不在 messages 数组里）
 * - 流式 SSE 事件格式完全不同
 */
export const anthropicAdapter: ProviderAdapter = {
  name: 'anthropic',

  endpoint(baseUrl: string, _isStream: boolean): string {
    const u = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
    return `${u}/messages`
  },

  authHeaders(apiKey: string): Record<string, string> {
    return {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    }
  },

  buildRequestBody(
    model: string,
    messages: ChatMessage[],
    options?: ChatOptions
  ): unknown {
    let system: string | undefined
    const chatMessages = messages.filter((m) => {
      if (m.role === 'system') {
        system = (system || '') + m.content + '\n'
        return false
      }
      return true
    })
    return {
      model,
      messages: chatMessages,
      system: system?.trim() || undefined,
      max_tokens: options?.max_tokens ?? 4096,
      stream: true,
    }
  },

  parseSSEEvent(event: string): StreamChunk | null {
    const lines = event.split('\n')
    const dataLine = lines.find((l) => l.startsWith('data: '))
    if (!dataLine) return null

    try {
      const json = JSON.parse(dataLine.slice(6))
      const type = json.type

      if (type === 'message_stop') {
        return { done: true, finishReason: 'stop' }
      }
      if (type === 'content_block_delta') {
        const d = json.delta
        if (d.type === 'text_delta') {
          return { token: d.text, done: false }
        }
      }
      return null
    } catch {
      return null
    }
  },
}
```

### 3.5 Provider 注册表（registry.ts）

```typescript
// src/main/providers/registry.ts

import type { ProviderMeta, ProviderAdapter } from './types'
import { baseAdapter } from './adapters/base'
import { anthropicAdapter } from './adapters/anthropic'

// ===================================================================
// Provider 元数据注册表
// ===================================================================

const PROVIDER_METAS: Record<string, ProviderMeta> = {
  // --- 本地 ---
  ollama: {
    name: 'ollama',
    displayName: 'Ollama',
    defaultBaseUrl: 'http://localhost:11434/v1',  // Ollama 兼容 OpenAI API
    requiresAuth: false,
    modelTypes: ['chat', 'embedding'],
  },

  // --- 云端 ---
  openai: {
    name: 'openai',
    displayName: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com/v1',
    requiresAuth: true,
    modelTypes: ['chat', 'embedding'],
  },
  anthropic: {
    name: 'anthropic',
    displayName: 'Anthropic',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    requiresAuth: true,
    modelTypes: ['chat'],
  },
  deepseek: {
    name: 'deepseek',
    displayName: 'DeepSeek',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    requiresAuth: true,
    modelTypes: ['chat'],
  },
  aliyun: {
    name: 'aliyun',
    displayName: '阿里云百炼',
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    requiresAuth: true,
    modelTypes: ['chat', 'embedding'],
  },
  zhipu: {
    name: 'zhipu',
    displayName: '智谱 AI',
    defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    requiresAuth: true,
    modelTypes: ['chat', 'embedding'],
  },
  siliconflow: {
    name: 'siliconflow',
    displayName: '硅基流动',
    defaultBaseUrl: 'https://api.siliconflow.cn/v1',
    requiresAuth: true,
    modelTypes: ['chat', 'embedding'],
  },

  // --- 通用自定义 ---
  generic: {
    name: 'generic',
    displayName: '自定义（OpenAI 兼容）',
    defaultBaseUrl: '',
    requiresAuth: true,
    modelTypes: ['chat', 'embedding'],
  },
}

// ===================================================================
// Provider 查询 API
// ===================================================================

/** 按名称获取 Provider 元数据 */
export function getProviderMeta(name: string): ProviderMeta | undefined {
  return PROVIDER_METAS[name]
}

/** 根据 provider 名称返回对应的 Adapter 实例 */
export function getAdapter(provider: string): ProviderAdapter {
  switch (provider) {
    case 'anthropic':
      return anthropicAdapter
    default:
      // 所有 OpenAI 兼容 provider（含 Ollama, DeepSeek, 阿里云, 智谱, 硅基流动, generic）
      return baseAdapter
  }
}

/** 返回所有注册 provider 的列表 */
export function listProviders(): ProviderMeta[] {
  return Object.values(PROVIDER_METAS)
}
```

### 3.6 设计要点

| 决策 | 理由 |
|------|------|
| **ProviderAdapter 是 interface，不是 class** | 纯对象可实现 compose（如 Azure 覆盖 `authHeaders`），无需继承 |
| **baseAdapter 覆盖 22/23 个 provider** | Ollama 已原生支持 OpenAI API，无需独立适配器 |
| **Registry 查表路由** | `getAdapter(name)` O(1) 查找，新增 provider 只需加一行 metadata |
| **adapter 无状态** | 不持有 apiKey/baseUrl，每次调用时传入。线程安全，可复用 |
| **parseSSEEvent 返回 StreamChunk \| null** | 返回 null 表示非数据事件（如 comment），外层自动跳过 |

---

## 4. 流式聊天入口（chat.ts）

### 4.1 设计

对标 WeKnora 的 `localChatStream()`，这是 LLM 调用的**唯一入口**。内置：

- **超时控制** — 120s fetch timeout
- **自动重试** — 429/500/502/503/504 状态码重试 3 次，指数退避
- **SSE 缓冲区保护** — 1MB 上限防止内存泄漏
- **AbortController** — 支持外部取消
- **进度日志** — 首个 chunk + 每 3 秒输出进度

```typescript
// src/main/providers/chat.ts

import log from 'electron-log'
import { getProviderMeta, getAdapter } from './registry'
import type { LocalModelConfig, ChatMessage, ChatOptions, StreamChunk } from './types'

const logger = log.scope('llm-chat')

const RETRIABLE = new Set([429, 500, 502, 503, 504])
const MAX_RETRIES = 3
const FETCH_TIMEOUT_MS = 120_000
const MAX_BUFFER = 1024 * 1024 // 1MB

/**
 * 流式聊天 — LLM 调用的唯一入口
 * @param config   模型配置（provider, model, baseUrl, apiKey）
 * @param messages 消息列表
 * @param onChunk  每收到一个 SSE chunk 回调一次
 * @param options  聊天参数（temperature, max_tokens 等）
 * @param signal   外部 AbortSignal（用于 IPC 取消）
 */
export async function localChatStream(
  config: LocalModelConfig,
  messages: ChatMessage[],
  onChunk: (chunk: StreamChunk) => void,
  options?: ChatOptions,
  signal?: AbortSignal,
): Promise<void> {
  const meta = getProviderMeta(config.provider)
  const adapter = getAdapter(config.provider)
  const baseUrl = (config.baseUrl || meta?.defaultBaseUrl || '').replace(/\/$/, '')
  const endpoint = adapter.endpoint(baseUrl, true)
  const headers = {
    'Content-Type': 'application/json',
    ...adapter.authHeaders(config.apiKey),
  }
  const body = JSON.stringify(adapter.buildRequestBody(config.name, messages, options))

  logger.info(`Starting stream: model=${config.name} provider=${config.provider} endpoint=${endpoint}`)

  let lastError: Error | undefined

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    const mergedSignal = signal
      ? (signal.addEventListener('abort', () => controller.abort()), controller.signal)
      : controller.signal

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body,
        signal: mergedSignal,
      })
      clearTimeout(timeoutId)

      logger.info(`Response status: ${response.status}`)
      if (!response.ok) {
        const errBody = await response.text().catch(() => '')
        const err = new Error(`LLM ${response.status}: ${errBody.slice(0, 200)}`)
        logger.error(`LLM error: status=${response.status} body=${errBody.slice(0, 500)}`)
        if (!RETRIABLE.has(response.status) || attempt >= MAX_RETRIES) throw err
        const ra = response.headers.get('Retry-After')
        lastError = err
        await sleep(ra ? parseInt(ra) * 1000 : backoffDelay(attempt))
        continue
      }

      // 流式读取 SSE
      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      let chunkCount = 0
      let byteCount = 0
      let lastLogAt = Date.now()
      const LOG_INTERVAL_MS = 3000

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done || mergedSignal.aborted) break
          buf += decoder.decode(value, { stream: true })
          byteCount += value?.length || 0
          if (buf.length > MAX_BUFFER) throw new Error('SSE buffer overflow')

          const events = buf.split('\n\n')
          buf = events.pop() || ''
          for (const ev of events) {
            if (!ev.trim() || mergedSignal.aborted) continue
            const chunk = adapter.parseSSEEvent(ev.trim())
            if (chunk) {
              chunkCount++
              if (chunkCount === 1) {
                logger.info(`First chunk received (${byteCount} bytes)`)
              } else if (Date.now() - lastLogAt >= LOG_INTERVAL_MS) {
                logger.info(`Stream progress: chunks=${chunkCount} bytes=${byteCount}`)
                lastLogAt = Date.now()
              }
              onChunk(chunk)
            }
          }
        }
      } finally {
        reader.releaseLock()
      }

      logger.info(`Stream complete: chunks=${chunkCount} bytes=${byteCount}`)
      onChunk({ done: true })
      return

    } catch (err: any) {
      clearTimeout(timeoutId)
      if (err.name === 'AbortError') {
        logger.info('Stream aborted')
        onChunk({ done: true })
        return
      }
      logger.error(`Stream error (attempt ${attempt + 1}/${MAX_RETRIES + 1}): ${err.message}`)
      if (attempt < MAX_RETRIES) {
        lastError = err
        const delay = backoffDelay(attempt)
        logger.info(`Retrying in ${delay}ms...`)
        await sleep(delay)
      } else {
        throw err
      }
    }
  }

  throw lastError
}

// --- 工具函数 ---
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function backoffDelay(attempt: number): number {
  return Math.min(1000 * Math.pow(2, attempt), 10000)
}
```

---

## 5. Agent 层设计

### 5.1 关系图

```
Agent 层（消费者）                              Provider 层（基础设施）
─────────────────                              ──────────────────────

agent/engine.ts                                providers/chat.ts
    │                                              │
    ├── recommendFieldValues()                     ├── localChatStream()
    │     └── localChatStream(                     │     └── 超时 + 重试 + SSE 解析
    │           config, messages, onChunk,         │
    │           { stream: false, ... },  ← 非流式   │
    │           signal                             │
    │         )                                    │
    │                                              │
    └── 工具调度                                   │
          ├── search_kb  → LanceDB                │
          └── fill_field → WebView JS injection    │
```

### 5.2 Agent 类型

```typescript
// src/main/agent/types.ts

import type { ChatMessage, LocalModelConfig } from '../providers/types'

// ========== 字段推荐 ==========
export interface FieldRecommendInput {
  pageTitle: string
  pageUrl: string
  fields: Array<{
    label: string
    type: string
    required: boolean
    currentValue?: string
  }>
  knowledgeBaseSnippets: Array<{
    fieldLabel: string
    snippets: Array<{ text: string; source: string; score: number }>
  }>
}

export interface FieldRecommend {
  fieldLabel: string
  recommendedValue: string
  confidence: number       // 0-1
  reasoning: string
  source: string
  alternatives?: Array<{ value: string; reason: string }>
}
```

### 5.3 字段推荐引擎

```typescript
// src/main/agent/engine.ts

import { localChatStream } from '../providers/chat'
import type { LocalModelConfig } from '../providers/types'
import type { FieldRecommendInput, FieldRecommend } from './types'
import { buildFieldRecommendPrompt } from './prompts/field-recommend'
import log from 'electron-log'

const logger = log.scope('agent-engine')

/**
 * 字段推荐 — 非流式调用（需要完整 JSON 解析）
 */
export async function recommendFieldValues(
  modelConfig: LocalModelConfig,
  input: FieldRecommendInput,
  signal?: AbortSignal,
): Promise<FieldRecommend[]> {
  const messages = buildFieldRecommendPrompt(input)

  let fullText = ''
  await localChatStream(
    modelConfig,
    messages,
    (chunk) => {
      if (chunk.token) fullText += chunk.token
    },
    { temperature: modelConfig.temperature ?? 0.1, stream: false },
    signal,
  )

  logger.info(`LLM response length: ${fullText.length} chars`)

  // 容错：提取 JSON（LLM 可能会包裹 markdown 代码块）
  let content = fullText.trim()
  if (content.startsWith('```')) {
    content = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  }

  try {
    const parsed = JSON.parse(content)
    if (!Array.isArray(parsed)) {
      throw new Error('Expected JSON array')
    }
    return parsed as FieldRecommend[]
  } catch (err) {
    logger.error(`Failed to parse LLM JSON: ${content.slice(0, 300)}`)
    throw new Error(`Failed to parse LLM response as JSON: ${content.slice(0, 200)}`)
  }
}
```

---

## 6. IPC 通道设计

### 6.1 通道清单

| 通道 | 方向 | 模式 | 说明 |
|------|------|------|------|
| `llm:recommend` | Sidebar → Main | `invoke` | 字段推荐（返回 `FieldRecommend[]`） |
| `llm:stream:start` | Sidebar → Main | `on` + push | 开始流式问答 |
| `llm:stream:chunk` | Main → Sidebar | push | 流式 token 块 |
| `llm:stream:error` | Main → Sidebar | push | 流式错误 |
| `llm:stream:stop` | Sidebar → Main | `on` | 取消流式 |
| `llm:status` | Sidebar → Main | `invoke` | 查询可用的 provider 列表 |
| `llm:configure` | Sidebar → Main | `invoke` | 配置模型 |

### 6.2 IPC Handler 实现（16ms 批处理）

```typescript
// src/main/index.ts — 新增 IPC handlers

import { localChatStream } from './providers/chat'
import { listProviders, getProviderMeta } from './providers/registry'
import type { LocalModelConfig, ChatMessage, ChatOptions, StreamChunk } from './providers/types'
import { recommendFieldValues } from './agent/engine'
import type { FieldRecommendInput } from './agent/types'

// ===================================================================
// LLM 状态 & 配置
// ===================================================================

ipcMain.handle('llm:status', async () => {
  return {
    providers: listProviders().map(p => ({
      name: p.name,
      displayName: p.displayName,
      defaultBaseUrl: p.defaultBaseUrl,
      modelTypes: p.modelTypes,
    })),
  }
})

ipcMain.handle('llm:configure', (_event, config: LocalModelConfig) => {
  logger.info(`llm:configure: provider=${config.provider} model=${config.name}`)
  return { ok: true, provider: config.provider, model: config.name }
})

// ===================================================================
// 字段推荐（非流式 invoke）
// ===================================================================

ipcMain.handle('llm:recommend', async (_event, params: {
  modelConfig: LocalModelConfig
  input: FieldRecommendInput
}) => {
  logger.info(`llm:recommend: ${params.input.fields.length} fields, model=${params.modelConfig.name}`)
  try {
    return await recommendFieldValues(params.modelConfig, params.input)
  } catch (err: any) {
    logger.error(`llm:recommend failed: ${err.message}`)
    throw err
  }
})

// ===================================================================
// 流式聊天（知识库问答场景）
// ===================================================================

const MAX_STREAMS_PER_RENDERER = 3
const activeStreams = new Map<number, AbortController>()
const BATCH_MS = 16  // 16ms 批处理 → ~60fps 渲染已足够

ipcMain.on('llm:stream:start', (event, params: {
  config: LocalModelConfig
  messages: ChatMessage[]
  requestId: string
  options?: ChatOptions
}) => {
  const sender = event.sender
  logger.info(`llm:stream:start: requestId=${params.requestId}`)

  // 并发控制
  const current = [...activeStreams.keys()].filter(k => k === sender.id).length
  if (current >= MAX_STREAMS_PER_RENDERER) {
    sender.send('llm:stream:error', { requestId: params.requestId, error: 'Too many concurrent streams' })
    return
  }

  const controller = new AbortController()
  activeStreams.set(sender.id, controller)

  // 16ms 批处理：减少 IPC 调用频率
  let batchBuf = ''
  let batchTimer: ReturnType<typeof setTimeout> | null = null
  const flush = () => {
    if (batchBuf) {
      sender.send('llm:stream:chunk', { requestId: params.requestId, chunk: { token: batchBuf, done: false } })
      batchBuf = ''
    }
    batchTimer = null
  }

  const onDestroyed = () => {
    controller.abort()
    activeStreams.delete(sender.id)
  }
  sender.once('destroyed', onDestroyed)

  localChatStream(params.config, params.messages, (chunk) => {
    if (sender.isDestroyed()) return
    if (chunk.token) {
      batchBuf += chunk.token
      if (!batchTimer) batchTimer = setTimeout(flush, BATCH_MS)
    } else {
      flush()
      sender.send('llm:stream:chunk', { requestId: params.requestId, chunk })
    }
  }, params.options, controller.signal)
    .catch((err) => {
      if (!controller.signal.aborted && !sender.isDestroyed()) {
        logger.error(`Stream error for ${params.requestId}: ${err.message}`)
        sender.send('llm:stream:error', { requestId: params.requestId, error: String(err) })
      }
    })
    .finally(() => {
      flush()
      if (batchTimer) clearTimeout(batchTimer)
      sender.removeListener('destroyed', onDestroyed)
      activeStreams.delete(sender.id)
      logger.info(`Stream ended: requestId=${params.requestId}`)
    })
})

ipcMain.on('llm:stream:stop', (event) => {
  logger.info('llm:stream:stop')
  const c = activeStreams.get(event.sender.id)
  if (c) {
    c.abort()
    activeStreams.delete(event.sender.id)
  }
})
```

### 6.3 Preload API 暴露

```typescript
// src/preload/index.ts — 新增

import type { LocalModelConfig, ChatMessage, ChatOptions } from '../main/providers/types'
import type { FieldRecommendInput, FieldRecommend } from '../main/agent/types'

const llmApi = {
  configure: (config: LocalModelConfig) =>
    ipcRenderer.invoke('llm:configure', config),
  getStatus: () =>
    ipcRenderer.invoke('llm:status'),
  recommend: (modelConfig: LocalModelConfig, input: FieldRecommendInput): Promise<FieldRecommend[]> =>
    ipcRenderer.invoke('llm:recommend', { modelConfig, input }),

  // 流式
  startStream: (config: LocalModelConfig, messages: ChatMessage[], requestId: string, options?: ChatOptions) =>
    ipcRenderer.send('llm:stream:start', { config, messages, requestId, options }),
  stopStream: () =>
    ipcRenderer.send('llm:stream:stop'),
  onStreamChunk: (callback: (data: { requestId: string; chunk: any }) => void) =>
    ipcRenderer.on('llm:stream:chunk', (_e, data) => callback(data)),
  onStreamError: (callback: (data: { requestId: string; error: string }) => void) =>
    ipcRenderer.on('llm:stream:error', (_e, data) => callback(data)),
  removeStreamListeners: () => {
    ipcRenderer.removeAllListeners('llm:stream:chunk')
    ipcRenderer.removeAllListeners('llm:stream:error')
  },
}

contextBridge.exposeInMainWorld('llmApi', llmApi)
```

---

## 7. Sidebar UI 设计

> **已拆分到独立文档**: 完整的 UI 布局、交互细节、组件树、状态机、颜色编码、UX 决策记录等，请参阅 [`03-ui-ux-design.md`](./03-ui-ux-design.md)。

### 7.1 核心设计理念：Chat-First

> **Chat 不是 Sidebar 的一个面板，Chat 就是 Sidebar。**

统一的 Chat 界面承载所有 AI 交互（表单填充、知识库问答、页面摘要），通过 **Rich Card** 嵌入消息流来展示推荐结果，而非独立面板。

### 7.2 关键交互原则

| 原则 | 说明 |
|------|------|
| **状态驱动** | WelcomeView 负责空状态（上下文感知），QuickActions 仅在有对话消息时出现 |
| **操作层级** | Primary 操作用 Solid 填充，Secondary 操作用 Outline |
| **不重复** | WelcomeView 和 QuickActions 不同时出现，避免认知负荷 |
| **场景匹配** | 表单页突出 Fill Form，文档页突出 Summarize/Search KB |

### 7.3 组件架构

```
Sidebar.vue
├── BrandHeader + AIStatusIndicator
├── UrlBar
├── ContextBar（页面字段 + KB 文档摘要）
├── ChatView
│   ├── WelcomeView（空状态，上下文感知 prompts）
│   └── MessageList（消息气泡 + Rich Cards）
├── QuickActions（对话中快捷 chips，v-if="messages.length > 0"）
└── ChatInput（动态 placeholder + Send/Stop）
```

详见 [`03-ui-ux-design.md`](./03-ui-ux-design.md)。

---

## 8. Prompt 工程策略

### 8.1 字段推荐 Prompt

```typescript
// src/main/agent/prompts/field-recommend.ts

import type { ChatMessage } from '../../providers/types'
import type { FieldRecommendInput } from '../types'

export function buildFieldRecommendPrompt(input: FieldRecommendInput): ChatMessage[] {
  const fieldsText = input.fields
    .map((f, i) => `${i + 1}. "${f.label}" (type: ${f.type}, required: ${f.required ? 'yes' : 'no'})`)
    .join('\n')

  const kbText = input.knowledgeBaseSnippets
    .map(kb => {
      const snippets = kb.snippets
        .map(s => `  [${s.source}] ${s.text}`)
        .join('\n')
      return `### "${kb.fieldLabel}"\n${snippets}`
    })
    .join('\n\n')

  return [
    {
      role: 'system',
      content: `You are an intelligent form-filling assistant. Recommend the most accurate value for each form field based on the user's private documents.

Rules:
1. Only recommend if you find clear evidence in the provided document snippets.
2. If no relevant info exists, set recommendedValue to "" and confidence to 0.
3. Confidence: 0.9+ = exact match, 0.7-0.9 = strong inference, 0.5-0.7 = weak inference, <0.5 = guess.
4. Always cite source document and section.
5. Do NOT fabricate. Do NOT recommend passwords.
6. Output ONLY valid JSON array.`,
    },
    {
      role: 'user',
      content: `Page: ${input.pageTitle}
URL: ${input.pageUrl}

Form fields detected:
${fieldsText}

Knowledge base search results:
${kbText || '(No knowledge base available)'}

Output JSON:
[{"fieldLabel":"...","recommendedValue":"...","confidence":0.0,"reasoning":"...","source":"...","alternatives":[{"value":"...","reason":"..."}]}]`,
    },
  ]
}
```

### 8.2 关键参数

| 参数 | 推荐值 | 理由 |
|------|:-----:|------|
| `temperature` | 0.1 | 填表需要确定性，不能"创意" |
| `max_tokens` | 2048 | 15 字段 JSON 推荐在 1000-2000 token |
| `stream` | false | 需要完整 JSON 才能解析 |
| `response_format` | `{ type: 'json_object' }` | 强制 JSON（Ollama: `format: 'json'`） |

---

## 9. 错误处理 & 降级策略

### 9.1 错误分层

| 层 | 错误类型 | 策略 |
|----|---------|------|
| **chat.ts** | HTTP 429/500/502/503/504 | 自动重试 3 次，指数退避 |
| **chat.ts** | 超时 (>120s) | Abort → throw error |
| **chat.ts** | AbortError（用户取消） | 静默结束，发送 `{ done: true }` |
| **engine.ts** | JSON 解析失败 | throw error，附带原始内容前 200 字符 |
| **index.ts** | IPC handler 异常 | catch → log → 返回错误给 renderer |
| **UI** | 推荐全为空 | 正常展示，不阻塞用户流程 |

### 9.2 降级链

```typescript
// 字段推荐降级链：Ollama → OpenAI → 空推荐
async function recommendWithFallback(
  input: FieldRecommendInput,
  primaryConfig: LocalModelConfig,
  fallbackConfig?: LocalModelConfig,
): Promise<FieldRecommend[]> {
  try {
    return await recommendFieldValues(primaryConfig, input)
  } catch (err) {
    logger.warn('Primary LLM failed, trying fallback:', err)
  }

  if (fallbackConfig) {
    try {
      return await recommendFieldValues(fallbackConfig, input)
    } catch (err) {
      logger.error('Fallback LLM also failed:', err)
    }
  }

  // 最终兜底：返回空推荐，不阻塞用户
  return input.fields.map(f => ({
    fieldLabel: f.label,
    recommendedValue: '',
    confidence: 0,
    reasoning: 'LLM unavailable',
    source: '',
  }))
}
```

---

## 10. 安全设计

| 原则 | 做法 |
|------|------|
| **数据最小化** | 只发送字段名 + KB 片段，不发送完整页面 HTML/cookies |
| **IPC 白名单** | preload 只暴露 `llmApi`，不暴露 `localChatStream` |
| **本地优先** | 默认 Ollama，数据不离开电脑 |
| **API key 安全** | 存在 `electron-store` 加密，不写在代码里 |
| **Prompt 护栏** | System prompt 内建 rules：禁止推荐密码、禁止编造 |

---

## 11. 文件结构清单

```
# ========== 新建文件 ==========

src/main/providers/
├── types.ts                    # ProviderAdapter 接口 + 共享类型（~70 行）✅ 已创建
├── registry.ts                 # Provider 注册表 + getAdapter()（~150 行）✅ 已创建
├── chat.ts                     # localChatStream() 流式入口（~130 行）✅ 已创建
└── adapters/
    ├── base.ts                 # OpenAI 兼容适配器（~70 行）✅ 已创建
    └── anthropic.ts            # Anthropic 适配器（~60 行）✅ 已创建

src/main/agent/
├── types.ts                    # Agent 类型 + FieldRecommend 类型（~50 行）
├── engine.ts                   # recommendFieldValues()（~50 行）
└── prompts/
    └── field-recommend.ts     # Prompt 模板（~50 行）

src/renderer/src/
├── composables/
│   └── useChat.ts             # Chat 状态管理 composable（~120 行）
└── components/sidebar/
    ├── ContextBar.vue          # 🆕 上下文感知栏（~60 行）
    ├── chat/                   # 🆕 Chat 组件
    │   ├── ChatView.vue        # Chat 主容器（~100 行）
    │   ├── WelcomeView.vue     # 欢迎页 + 建议 prompts（~50 行）
    │   ├── UserMessage.vue     # 用户消息气泡（~30 行）
    │   ├── BotMessage.vue      # AI 消息气泡 + Markdown 渲染（~120 行）
    │   ├── ChatInput.vue       # 输入框 + 发送/停止（~80 行）
    │   ├── QuickActions.vue    # 快捷操作 chips（~40 行）
    │   └── cards/
    │       ├── RecommendCard.vue  # 表单推荐 Rich Card（~180 行）
    │       ├── FillResultCard.vue # 回填结果（~50 行）
    │       └── SearchResultCard.vue # KB 检索结果（~60 行）
    └── AIStatusIndicator.vue   # LLM 状态指示灯（~30 行）

# ========== 修改文件 ==========

src/main/index.ts               # 新增 ~6 个 IPC handlers（~120 行新增）
src/preload/index.ts            # 暴露 llmApi（~30 行新增）
src/preload/index.d.ts          # 声明 llmApi 类型
src/renderer/src/components/Sidebar.vue  # 重构为 Chat-First 布局
src/renderer/src/components/sidebar/BrandHeader.vue  # 嵌入 AIStatusIndicator
```

### 代码量估算

| 模块 | 行数 | 复杂度 |
|------|:---:|:-----:|
| providers/* | ~480 行 | 中 — 核心基础设施 ✅ |
| agent/* | ~150 行 | 低 — 薄封装 |
| renderer Chat UI | ~750 行 | 中 — 核心交互 |
| renderer composables | ~120 行 | 低 — 状态管理 |
| IPC handlers | ~150 行 | 低 — 样板代码 |
| **合计** | **~1650 行** | — |

---

## 12. 实现路线图

### Phase 4-A: Provider 层基础设施（1-2 天）

| Task | 文件 | 产出 |
|------|------|------|
| 4A.1 | `src/main/providers/types.ts` | ProviderAdapter 接口 + 所有共享类型 |
| 4A.2 | `src/main/providers/adapters/base.ts` | OpenAI 兼容适配器（纯对象） |
| 4A.3 | `src/main/providers/adapters/anthropic.ts` | Anthropic 独立适配器 |
| 4A.4 | `src/main/providers/registry.ts` | 8 个 Provider 元数据 + getAdapter() |
| 4A.5 | `src/main/providers/chat.ts` | localChatStream() 入口函数 |

### Phase 4-B: Agent 层 + 字段推荐（1 天）

| Task | 文件 | 产出 |
|------|------|------|
| 4B.1 | `src/main/agent/types.ts` | FieldRecommend 相关类型 |
| 4B.2 | `src/main/agent/prompts/field-recommend.ts` | Prompt 模板 |
| 4B.3 | `src/main/agent/engine.ts` | recommendFieldValues() |

### Phase 4-C: IPC + Chat-First Sidebar UI（2-3 天）

| Task | 文件 | 产出 |
|------|------|------|
| 4C.1 | `src/main/index.ts` | IPC handlers（llm:recommend + llm:stream:start/stop/chunk） |
| 4C.2 | `src/preload/index.ts` + `.d.ts` | 白名单 llmApi |
| 4C.3 | `useChat.ts` composable | Chat 状态管理（消息列表、流式、发送/停止） |
| 4C.4 | `ContextBar.vue` | 上下文感知栏 |
| 4C.5 | `ChatView.vue` + `WelcomeView.vue` | Chat 主容器 + 欢迎页 |
| 4C.6 | `UserMessage.vue` + `BotMessage.vue` | 消息气泡（Markdown 渲染） |
| 4C.7 | `ChatInput.vue` + `QuickActions.vue` | 输入框 + 快捷操作 chips |
| 4C.8 | `RecommendCard.vue` | 表单推荐 Rich Card（核心交互） |
| 4C.9 | `Sidebar.vue` 重构 | Chat-First 布局连线 |

### Phase 4-D: 回填引擎（1 天）

| Task | 文件 | 产出 |
|------|------|------|
| 4D.1 | `FillResultCard.vue` | 回填结果展示 |
| 4D.2 | IPC `form:fill` handler | WebView JS 注入回填 |
| 4D.3 | RecommendCard 连线 | Accept → fill IPC → FillResultCard |

---

## 附录 A：关键决策速查

| 决策 | 选择 | 理由 |
|------|------|------|
| Adapter 形式 | **Interface + 纯对象** | 可 compose，无需继承（参考 WeKnora） |
| Ollama | **走 baseAdapter** | Ollama 已支持 OpenAI 兼容 API |
| Provider 路由 | **Registry 查表** | `getAdapter(name)` O(1)，加一行 = 新增一个 Provider |
| 流式入口 | **localChatStream() 独立函数** | 内置重试(3次) + 超时(120s) + 批处理(16ms) |
| 字段推荐 | **非流式 batch JSON** | 15 字段一次调用，延迟最小 |
| Temperature | **0.1** | 填表需要确定性 |
| 降级链 | **Ollama → OpenAI → 空推荐** | 不阻塞用户流程 |
| Agent 框架 | **自建** | 3 个工具，不需要 LangChain |
| **UI 范式** | **Chat-First** | 参考 Edge Copilot/Kimi，一个 Chat 承载所有 AI 交互 |
| **表单推荐展示** | **Rich Card 嵌入消息流** | 非独立面板，保留对话历史 + 自然追溯 |
| **Markdown 渲染** | **marked + DOMPurify** | 轻量，参考 WeKnora 方案 |

## 附录 B：与原设计的关键差异

| 维度 | 原设计 | 新设计（WeKnora 风格） |
|------|--------|----------------------|
| Adapter 模式 | `abstract class BaseLLMProvider` | `interface ProviderAdapter` + 纯对象 |
| Provider 数量 | 2（Ollama, OpenAI） | 8+（Ollama, OpenAI, Anthropic, DeepSeek, 阿里云, 智谱, 硅基流动, 自定义） |
| 扩展成本 | 新建 class 文件 + 注册 | 加一行 metadata |
| Ollama | 独立 `OllamaProvider` | 走 `baseAdapter`（Ollama `/v1/chat/completions`） |
| 流式处理 | `llmService.chatStream()` | `localChatStream()` 独立函数，内置重试+超时 |
| IPC 批处理 | 无 | 16ms 批处理减 IPC 频率 |
| 并发控制 | 无 | `MAX_STREAMS_PER_RENDERER = 3` |
| Provider 状态 | EventEmitter | 无状态，每次传入 config |

---

> **下一步**: 按 Phase 4-A → 4-B → 4-C 顺序开始实现。建议从 `src/main/providers/types.ts` 和 `src/main/providers/adapters/base.ts` 开始编码。
