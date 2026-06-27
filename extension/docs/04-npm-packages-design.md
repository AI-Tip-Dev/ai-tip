# 04 — 共享 npm 包设计

> **创建**: 2026-06-27 · **状态**: 📝 草案
> **关联**: [01 — 架构总览](./01-browser-extension-architecture.md) · [14 — 三 Repo 架构](../desktop/docs/14-electron-js-sdk-architecture.md)
> **场景**: 3 个 npm 包 (`@ai-tip/llm-providers`, `@ai-tip/form-detection`, `@ai-tip/observability`) 供 Desktop 和 Extension 共享。UI 组件不上收——Desktop 和 Extension 各自维护 Vue 组件，通过一致的 CSS 变量体系和设计规范文档保持视觉统一。

---

## 📋 文档导航

> - [一句话概述](#一句话概述) · [包总览](#包总览) · [1. llm-providers](#1-ai-tipllm-providers)
> - [2. form-detection](#2-ai-tipform-detection) · [3. observability](#3-ai-tipobservability)
> - [UI 组件策略](#ui-组件策略) · [包管理方案](#包管理方案) · [迁移计划](#迁移计划)

---

## 一句话概述

> 🎯 **3 个独立 npm 包，零运行时依赖，覆盖 LLM 调度、表单检测、可观测性三大共享域。UI 组件不上收为 npm 包——复用度仅 60%，且 Desktop Sidebar 和 Extension Side Panel 的布局、路由、状态管理差异大，强行上收反而增加耦合。**

---

## 包总览

| 包名 | 优先级 | 零运行时依赖 | 当前源码位置 | 复用度 |
|------|:------:|:-----------:|-------------|:------:|
| `@ai-tip/llm-providers` | **P0** | ✅ | `desktop/src/main/providers/*` | 90% |
| `@ai-tip/form-detection` | **P1** | ✅ | `sdk/src/auto.ts` (部分) + 新写 | 80% |
| `@ai-tip/observability` | **P2** | ✅ | `desktop/src/main/tracing/*` (核心模型) | 70% |

> ⚠️ **UI 组件不上收**。复用度仅 60%，且 Desktop (Sidebar 嵌入主窗口) 和 Extension (独立 Side Panel) 的布局、路由、状态管理差异大。改为共享 CSS 变量体系 + 设计规范文档。详见 [UI 组件策略](#ui-组件策略)。

---

## 1. `@ai-tip/llm-providers`

### 边界

**做什么**：
- 定义 `ProviderAdapter` 接口 + 10+ Provider 元数据
- 实现 OpenAI-compatible 基类 + Anthropic 适配器
- 流式 SSE 解析（`parseSSEEvent`）
- 非流式响应解析（`parseNonStreamResponse`）
- 本地 `localChatStream()` 入口（fetch + 重试 + 超时）

**不做什么**：
- 不关心存储（API Key 由调用方传入）
- 不关心 tracing（可观测性由 `@ai-tip/observability` 通过回调注入）
- 不依赖 Electron / Chrome API（纯 fetch）

### 目录

```
packages/llm-providers/
├── package.json              # name: "@ai-tip/llm-providers"
├── tsconfig.json
├── vitest.config.ts
├── src/
│   ├── index.ts              # 公开导出
│   ├── types.ts              # ProviderMeta, LocalModelConfig, ChatMessage, StreamChunk, ProviderAdapter
│   ├── registry.ts           # PROVIDER_METAS + getProviderMeta + getAdapter
│   ├── chat.ts               # localChatStream() + fetch + retry
│   └── adapters/
│       ├── base.ts           # OpenAI-compatible: endpoint(), authHeaders(), buildRequestBody(), parseSSEEvent()
│       └── anthropic.ts      # Anthropic 独立适配器
└── __tests__/
    ├── chat.test.ts
    ├── registry.test.ts
    ├── adapters/
    │   ├── base.test.ts
    │   └── anthropic.test.ts
    └── fixtures/
        └── sse-samples.ts    # SSE 事件样本
```

### 抽取要点

从 `desktop/src/main/providers/` 抽离时：

| 文件 | 动作 | 说明 |
|------|------|------|
| `types.ts` | ✅ 直接搬 | 去掉 `LocalModelConfig.id`（id 是存储层概念） |
| `registry.ts` | ✅ 直接搬 | 提供 10 个 provider 元数据 |
| `chat.ts` | ⚠️ 改编 | 去掉 `electron-log` → 接受 `logger` 回调或使用 `console` |
| `adapters/base.ts` | ✅ 直接搬 | 纯函数，无平台依赖 |
| `adapters/anthropic.ts` | ✅ 直接搬 | 纯函数，无平台依赖 |

### `chat.ts` 改编

```typescript
// 前 (Desktop): 依赖 electron-log
import log from 'electron-log'
const logger = log.scope('llm-chat')

// 后 (通用): 接受可选 logger
export interface ChatLogger {
  info: (msg: string, ...args: unknown[]) => void
  debug: (msg: string, ...args: unknown[]) => void
  warn: (msg: string, ...args: unknown[]) => void
  error: (msg: string, ...args: unknown[]) => void
}

export async function localChatStream(
  config: LocalModelConfig,
  messages: ChatMessage[],
  onChunk: (chunk: StreamChunk) => void,
  options?: ChatOptions,
  signal?: AbortSignal,
  logger?: ChatLogger,  // ← 新增可选参数
): Promise<void> {
  const log = logger ?? {
    info: () => {}, debug: () => {}, warn: console.warn, error: console.error
  }
  // ... 其余逻辑不变
}
```

Desktop 传入 `electronLog.scope('llm-chat')`，Extension 传入自定义 logger 或使用默认 `console`。

### 依赖

```json
{
  "name": "@ai-tip/llm-providers",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist"],
  "dependencies": {},
  "devDependencies": {
    "typescript": "^5.5",
    "vitest": "^2"
  }
}
```

---

## 2. `@ai-tip/form-detection`

### 边界

**做什么**：
- DOM 表单字段扫描（`querySelectorAllDeep` 含 Shadow DOM）
- 标签推断（`inferLabel` — aria, `<label>`, placeholder 优先级链）
- 字段回填（`fillField` — value setter + 框架兼容）
- 可见性检测（`isVisible`, `getRect`）
- AX Tree 文本构建（`buildAXTreeText` — 给 LLM 的结构化页面描述）
- 敏感字段过滤常量

**不做什么**：
- 不包含 CDP 表单检测（Desktop 保留 `Accessibility.getAXTree`）
- 不包含 UI 渲染
- 不包含按钮注入逻辑（属于 Extension content-script 层或 IIFE 层）

### 目录

```
packages/form-detection/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/
│   ├── index.ts              # 公开导出
│   ├── types.ts              # SimpleField, FillResult, FieldContext
│   ├── constants.ts          # FIELD_SELECTOR, SENSITIVE_PATTERNS
│   ├── dom-scan.ts           # querySelectorAllDeep(), detectFields()
│   ├── label-infer.ts        # inferLabel()
│   ├── field-fill.ts         # fillField()
│   ├── visibility.ts         # isVisible(), getRect()
│   └── ax-tree.ts            # buildAXTreeText()
└── __tests__/
    ├── dom-scan.test.ts
    ├── label-infer.test.ts
    ├── field-fill.test.ts
    └── fixtures/
        └── test-form.html    # 复用 desktop/e2e/fixtures/test-form.html
```

### 与 SDK `auto.ts` 的关系

`auto.ts` (IIFE) 当前包含按钮注入 + 字段交互的所有逻辑。抽取后：

```
auto.ts 保留 (IIFE 专属):
  ├── 按钮 UI 创建 + 定位
  ├── hover/focus/click 事件
  ├── 动画 + 状态管理
  └── sendToHost 通信

@ai-tip/form-detection 抽取:
  ├── FIELD_SELECTOR
  ├── SENSITIVE_PATTERNS
  ├── inferLabel()
  ├── fillField()
  └── detectFields()
```

`auto.ts` 改为 `import { FIELD_SELECTOR, fillField, ... } from '@ai-tip/form-detection'`（IIFE bundle 构建时会内联）。

### 依赖

```json
{
  "name": "@ai-tip/form-detection",
  "version": "0.1.0",
  "type": "module",
  "dependencies": {},
  "devDependencies": {
    "typescript": "^5.5",
    "vitest": "^2",
    "happy-dom": "^15"    // 用于 DOM 测试
  }
}
```

---

## 3. `@ai-tip/observability`

### 复用度分析

| 模块 | 当前在 Desktop | 可复用 | 需适配 |
|------|:-------------:|:-----:|:-----:|
| **Span 数据模型** (`TracingSpan.ts` — `SpanData`, `SpanEvent`, `SpanStatus`) | ✅ | ✅ 100% | — |
| **Span 生命周期** (`TracerProvider.ts` — `startSpan`, `finishSpan`) | ✅ | ✅ 90% | — |
| **OTLP 导出格式** (`OtlpExporter.ts` — `spanToOtlp`) | ✅ | ✅ 100% | — |
| **工具函数** (`utils.ts` — `generateId`, `nowMs`, `sanitizeHeaders`, `truncate`) | ✅ | ⚠️ 80% | `generateId` 用 `crypto.randomUUID()` 替代 Node `randomBytes` |
| **存储** (`TraceStore.ts` — JSONL 文件 + LRU 缓存) | ✅ | ❌ 30% | Desktop: JSONL 文件; Extension: `chrome.storage.local` |
| **导出传输** (`OtlpExporter.ts` — `fetch()` 到 OTLP endpoint) | ✅ | ✅ 100% | 都是 `fetch()` |
| **electron-log 桥接** | ✅ | ❌ 0% | Desktop 专属 |

**结论**：复用度 ~70%。核心数据模型 + OTLP 格式 + Span 生命周期完全可共享。存储层和日志桥接由各端提供适配器。

### 包定位

**做什么**：
- 定义 `SpanData`、`SpanEvent`、`SpanStatus` 类型
- 提供 `TracerProvider` 抽象（`startSpan` / `finishSpan`）
- 提供 OTLP JSON 序列化（`spanToOtlp`）
- 提供存储接口 `TraceStorage`（各端实现）
- 提供导出接口 `TraceExporter`（各端实现或使用内置 OTLP）
- 提供工具函数（`generateId`, `sanitizeHeaders`, `truncate`）

### 目录

```
packages/observability/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/
│   ├── index.ts
│   ├── types.ts                # SpanData, SpanEvent, SpanStatus, SpanLogInput
│   ├── tracer.ts               # TracerProvider: startSpan(), finishSpan(), getActiveSpan()
│   ├── span.ts                 # Span 类: addEvent(), setStatus(), finish(), toData()
│   ├── otlp.ts                 # spanToOtlp(), buildOtlpPayload()
│   ├── storage.ts              # TraceStorage 接口 + MemoryStorage 实现
│   ├── exporter.ts             # TraceExporter 接口 + OtlpHttpExporter 实现
│   └── utils.ts                # generateId(), sanitizeHeaders(), truncate()
└── __tests__/
    ├── span.test.ts
    ├── tracer.test.ts
    ├── otlp.test.ts
    └── exporter.test.ts
```

### 存储接口

```typescript
// storage.ts
export interface TraceStorage {
  save(span: SpanData): Promise<void>
  list(limit?: number, offset?: number): Promise<SpanData[]>
  getDetail(traceId: string): Promise<SpanData | null>
}
```

各端实现：

```typescript
// Desktop
import { TraceStorage } from '@ai-tip/observability'
class JsonlTraceStorage implements TraceStorage { /* JSONL 文件 + LRU */ }

// Extension
class ChromeStorageTraceStorage implements TraceStorage {
  async save(span: SpanData): Promise<void> {
    const { traces = [] } = await chrome.storage.local.get('traces')
    traces.push(span)
    if (traces.length > 500) traces.shift()  // LRU
    await chrome.storage.local.set({ traces })
  }
  async list(limit = 50, offset = 0): Promise<SpanData[]> {
    const { traces = [] } = await chrome.storage.local.get('traces')
    return traces.slice(offset, offset + limit)
  }
  // ...
}
```

### 导出接口

```typescript
// exporter.ts
export interface TraceExporter {
  export(spans: SpanData[]): Promise<ExportResult>
}

// 内置 OTLP HTTP 导出器（纯 fetch，跨平台）
export class OtlpHttpExporter implements TraceExporter {
  constructor(private endpoint: string) {}
  async export(spans: SpanData[]): Promise<ExportResult> {
    const payload = buildOtlpPayload(spans)
    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return { ok: res.ok, spansExported: spans.length, ... }
  }
}
```

### 工具函数适配

```typescript
// utils.ts — 浏览器兼容版
export function generateId(): string {
  // 浏览器环境: crypto.randomUUID() 返回 UUID (36 字符)
  // 提取 32 位 hex 以兼容 OTel traceId 格式
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, '')
  }
  // Fallback
  return Math.random().toString(16).slice(2) + Date.now().toString(16)
}
```

### 依赖

```json
{
  "name": "@ai-tip/observability",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist"],
  "dependencies": {},
  "devDependencies": {
    "typescript": "^5.5",
    "vitest": "^2"
  }
}
```

---

## UI 组件策略

### 为什么不上收为 npm 包

| 因素 | 说明 |
|------|------|
| **复用度仅 60%** | Desktop Sidebar (嵌入主窗口) 和 Extension Side Panel (独立 `chrome.sidePanel`) 的布局约束完全不同 |
| **路由差异** | Desktop 用 `vue-router` 多页面；Extension Side Panel 可能单页或简单切换 |
| **状态管理差异** | Desktop: IPC 直连 Main Process；Extension: `chrome.runtime.sendMessage` 异步 |
| **维护成本 > 收益** | 抽象出一套同时适配两端的组件 API，工作量接近写两套 |

### 替代方案：共享设计规范 + CSS 变量

```
┌─────────────────────────────────────────┐
│         shared-design-tokens/            │
│         (不是 npm 包，是源文件)           │
│                                          │
│  ├── variables.css    ← CSS 变量         │
│  │   --ai-color-primary: #6C5CE7        │
│  │   --ai-radius-sm: 6px                │
│  │   --ai-shadow-card: 0 2px 8px ...    │
│  │                                      │
│  ├── DESIGN_TOKENS.md ← 设计规范        │
│  │   颜色 / 间距 / 字体 / 圆角 / 阴影    │
│  │                                      │
│  └── COMPONENT_SPEC.md ← 组件清单       │
│      ChatBubble / SuggestionCard / ...  │
│      每个组件的 props / slots / states   │
└──────────────┬──────────────────────────┘
               │ 复制到 (或 symlink)
     ┌─────────┴─────────┐
     ▼                   ▼
desktop/src/        extension/src/
renderer/src/       side-panel/
styles/             styles/
```

Desktop 和 Extension 各自实现 Vue 组件，但引用同一套 CSS 变量名和设计规范。视觉一致性通过设计审查保证，不依赖 npm 包。

---

## 包管理方案

### 决策：pnpm workspace monorepo

所有包在同一个 Git repo 内，通过 pnpm workspace 协议互相引用：

```
ai-tip/                          # Git repo: ai-tip/ai-tip
├── pnpm-workspace.yaml         #   packages: ['sdk', 'desktop', 'extension', 'packages/*']
├── package.json                #   root: private, scripts
├── sdk/                        #   "@ai-tip/sdk"
├── desktop/                    #   "@ai-tip/desktop" (private)
├── extension/                  #   "@ai-tip/extension" (private)
└── packages/
    ├── llm-providers/          #   "@ai-tip/llm-providers"
    ├── form-detection/         #   "@ai-tip/form-detection"
    └── observability/          #   "@ai-tip/observability"
```

各包的 `package.json` 中通过 `workspace:*` 协议引用：

```json
// desktop/package.json
{
  "devDependencies": {
    "@ai-tip/sdk": "workspace:*",
    "@ai-tip/llm-providers": "workspace:*",
    "@ai-tip/observability": "workspace:*"
  }
}

// extension/package.json
{
  "dependencies": {
    "@ai-tip/llm-providers": "workspace:*",
    "@ai-tip/form-detection": "workspace:*",
    "@ai-tip/observability": "workspace:*"
  },
  "devDependencies": {
    "@ai-tip/sdk": "workspace:*"
  }
}
```

### 为什么选 monorepo

| 因素 | 说明 |
|------|------|
| **原子提交** | 改 sdk 类型 + desktop 适配 + extension 适配 → 一个 PR 搞定 |
| **开发体验** | 一次 clone，`pnpm install` 全装，`pnpm dev` 全启动 |
| **版本管理** | `changesets` 自动管理，发版时决定哪些包升版本 |
| **当前规模小** | 3-6 个包，小团队，monorepo 的优势远大于开销 |
| **CI 可选择性构建** | `turborepo` 检测文件变更，只构建受影响的包 |

### 开发工作流

```bash
# 1. 克隆（一次）
git clone git@github.com:ai-tip/ai-tip.git
cd ai-tip
pnpm install    # 安装所有依赖 + 建立 workspace symlinks

# 2. 开发（跨包热更新）
pnpm dev        # 启动 desktop dev server
# 修改 packages/llm-providers/src/chat.ts → desktop 自动热更新

# 3. 构建全部
pnpm build

# 4. 单独构建某个包
pnpm --filter @ai-tip/sdk build
```

---

## 迁移计划

> 所有包在当前 `ai-tip/` monorepo 内创建。

### Phase 1: 创建 llm-providers 包 (1 周)

```
1. mkdir packages/llm-providers
2. 从 desktop/src/main/providers/ 搬代码
3. 改编 chat.ts（去掉 electron-log 硬依赖 → ChatLogger 接口）
4. 编写单元测试
5. Desktop 添加依赖: "@ai-tip/llm-providers": "workspace:*"
6. Extension 添加依赖: "@ai-tip/llm-providers": "workspace:*"
```

### Phase 2: 创建 form-detection 包 (1 周)

```
1. mkdir packages/form-detection
2. 从 sdk/src/auto.ts 提取 FIELD_SELECTOR, fillField, SENSITIVE_PATTERNS
3. 新增 dom-scan.ts, label-infer.ts, ax-tree.ts
4. 编写单元测试
5. auto.ts 改为 import from '@ai-tip/form-detection'（IIFE bundle 内联）
6. Extension 添加依赖: "@ai-tip/form-detection": "workspace:*"
7. Extension content-script 开始使用
```

### Phase 3: 创建 observability 包 (1 周)

```
1. mkdir packages/observability
2. 从 desktop/src/main/tracing/ 提取核心模型 + OTLP 格式
3. 定义 TraceStorage / TraceExporter 接口
4. Desktop 实现 JsonlTraceStorage，Extension 实现 ChromeStorageTraceStorage
5. Desktop 添加依赖: "@ai-tip/observability": "workspace:*"
6. Extension 添加依赖: "@ai-tip/observability": "workspace:*"
```

### UI 组件不单独 Phase

Desktop 和 Extension 各自的 Vue 组件在 `desktop/src/renderer/` 和 `extension/src/side-panel/` 下独立开发。共享：
- CSS 变量体系（`styles/variables.css` 可放 `packages/` 或直接复制）
- 设计规范文档

---

## 参考资源

| 资源 | 链接 |
|------|------|
| npm `file:` protocol | `docs.npmjs.com/cli/v10/configuring-npm/package-json#local-paths` |
| Desktop LLM Provider 设计 | `../desktop/docs/04-llm-provider-design.md` |
| Desktop Observability 设计 | `../desktop/docs/13-llm-observability-design.md` |
| SDK auto.ts (IIFE bundle) | `sdk/src/auto.ts` |

---

> **下一步**: [05 — 目录结构](./05-extension-directory-structure.md) · [06 — 架构审视](./06-architecture-review.md) · [07 — 仓库方案对比](./07-repo-strategy-comparison.md)
