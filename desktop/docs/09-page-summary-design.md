# 09 — Page Summary & Field Relationship Context 设计

> **创建**: 2026-06-25 · **更新**: 2026-06-26
> **关联**: [03 UI/UX 设计](./03-ui-ux-design.md) · [04 LLM Provider](./04-llm-provider-design.md) · [05 表单检测](./05-form-detection-design.md)
> **状态**: ✅ 已实施 — IPC 通道、Main handler、Preload 桥接、PageSummaryPanel UI 已完成

---

## 目录

1. [问题定义](#1-问题定义)
2. [合理性分析](#2-合理性分析)
3. [Page Summary 架构](#3-page-summary-架构)
4. [Field Relationship（字段关联）设计](#4-field-relationship字段关联设计)
5. [Context 聚合策略](#5-context-聚合策略)
6. [UX/UI 设计](#6-uxui-设计)
7. [实现方案](#7-实现方案)
8. [风险 & 降级](#8-风险--降级)

---

## 1. 问题定义

### 1.1 当前痛点

当用户在页面中点击 AI Tip 按钮获取某个字段的 AI 建议时，LLM 收到的上下文仅包含：

| 上下文来源 | 内容 | 问题 |
|---|---|---|
| `pageTitle` | `document.title` | 标题可能很模糊（如 "Form"、"Untitled"） |
| `pageUrl` | `window.location.href` | URL 可能无意义（如 SPA hash route） |
| `fieldSummary` | 从 CDP AX Tree 提取的字段名/类型列表 | 只有字面信息，无语义 |
| `axSummary` | 原始 AX Node 结构 | 噪音大，LLM 难以提取有意义的上下文 |

**核心问题**：LLM 看到的是"一堆字段"，而不是"一个什么场景下的表单"。缺乏高层语义理解会导致：
- 对 `username` 字段，不知道这是 GitHub 注册、Slack 登录还是银行系统
- 无法理解字段之间的依赖关系（如 `country` → `state` 的级联关系）
- 无法根据页面类型给出风格合适的建议（注册页用真实邮箱 vs 测试页用 `test@example.com`）

### 1.2 目标

1. **Page Summary**：页面加载后，请求 LLM 生成一段高层语义摘要，描述"这个页面是什么、做什么的"
2. **Field Relationship**：捕获字段间的关联关系（依赖、分组、约束），让 LLM 给出更协调的建议
3. **Context 聚合**：将 Page Summary + Field Relationship + 现有字段上下文合并为 LLM 的 system prompt
4. **UX 可见性**：让用户感知到 AI 使用了哪些上下文，增强信任感

---

## 2. 合理性分析

### 2.1 Page Summary 是否必要？

#### ✅ 支持的理由

| 理由 | 说明 |
|---|---|
| **消歧义** | 同样是 `username` + `password`，GitHub 和银行系统的填写策略完全不同 |
| **风格适配** | 知道是"测试环境"还是"生产环境"的表单，AI 会给出不同风格的答案 |
| **降级兜底** | 当 `pageTitle` 为空白或无意义时，summary 是唯一的高层语义来源 |
| **一次性成本** | Summary 在页面加载时请求一次，后续所有 AI Tip 都复用，边际成本为零 |
| **弱依赖** | Summary 失败不影响核心功能，只是建议质量略降 |

#### ❌ 反对的理由 & 缓解

| 反对理由 | 缓解方案 |
|---|---|
| **额外 LLM 调用成本** | ① Summary 使用低参数/便宜模型（如 `qwen2.5:3b`）；② 按 URL 缓存；③ 仅字段 ≥ 3 时触发 |
| **延迟增加 1-2s** | 异步生成，不阻塞 UI；先展示无 summary 的 chips，summary 就绪后更新 |
| **可能冗余** | 对简单表单（如只有 1 个搜索框），不生成 summary；阈值为 ≥ 3 个字段 |
| **SPA 路由变化导致过期** | 检测 URL 实质性变化（忽略 hash/query 差异）才重新生成 |

#### 结论：**合理，但需要节制**

Page Summary 不是一个"所有情况都生成"的功能，而是：
- **触发条件**：页面有 ≥ 3 个可检测字段 且 上一次 summary 的 URL 与当前不同
- **成本控制**：优先使用本地模型（Ollama），summary 请求 `max_tokens=256`，温度 0.3
- **降级策略**：生成失败时静默回退到无 summary 模式

### 2.2 Field Relationship 为什么重要？

以"注册表单"为例：

```
┌──────────────────────────────────────┐
│  注册表单                             │
│  ┌────────────┐  ┌────────────┐      │
│  │ First Name  │  │ Last Name   │ ← 一组│
│  └────────────┘  └────────────┘      │
│  ┌────────────────────────────┐      │
│  │ Email                       │      │
│  └────────────────────────────┘      │
│  ┌────────────┐  ┌────────────┐      │
│  │ Country     │→ │ State       │ ← 依赖│
│  └────────────┘  └────────────┘      │
│  ┌────────────┐  ┌────────────┐      │
│  │ Password    │↔ │ Confirm Pwd │ ← 约束│
│  └────────────┘  └────────────┘      │
└──────────────────────────────────────┘
```

如果不告诉 LLM 这些关系：
- LLM 可能给 `First Name` 建议 "John"，`Last Name` 建议 "Smith"，但不知道应该用同一种语言/文化风格
- LLM 不知道 `Country` 的选择会影响 `State` 的候选值
- LLM 不知道 `Password` 和 `Confirm Password` 必须一致

当前 `siblingLabels` 只告诉 LLM "旁边有哪些字段"，但没有告诉它**是什么关系**。

### 2.3 多阶段 Context 策略

与其一次性把所有上下文塞给 LLM，不如分阶段：

```
Stage 1: Page Summary（页面级，一次性）
  → "This is a GitHub signup page with fields for username, email, password..."

Stage 2: Field Relationships（字段级，检测时计算）
  → "username + email + password form a registration group"
  → "password must match confirm-password"

Stage 3: User Intent（交互级，用户点击时）
  → "User is asking about the 'username' field"
  → "Current value: '', placeholder: 'Pick a username'"
```

三个阶段的信息逐步叠加到 LLM 的 system prompt 中，形成完整的上下文。

---

## 3. Page Summary 架构

### 3.1 数据流

```
┌──────────┐    did-finish-load     ┌──────────────┐
│  WebView │ ──────────────────────→│  Renderer     │
│  (page)  │                        │  (useWebview) │
└──────────┘                        └──────┬───────┘
                                           │
                             1. detectFields() (CDP)
                             2. summarizePage()
                                           │
                                    ┌──────▼───────┐
                                    │   Preload     │
                                    │ window.api    │
                                    │ .summarizePage│
                                    └──────┬───────┘
                                           │ IPC_PAGE_SUMMARIZE
                                    ┌──────▼───────┐
                                    │  Main Process │
                                    │  (handler)    │
                                    │               │
                                    │ POST /chat/   │
                                    │ completions   │
                                    │ stream: false │
                                    └──────┬───────┘
                                           │
                                    ┌──────▼───────┐
                                    │  LLM API      │
                                    │  → summary    │
                                    └──────────────┘

结果存储: window.__page_summary = "This page is..."
消费方:  useChat.ts 构建 system prompt 时读取
```

### 3.2 IPC 通道

```typescript
// src/shared/ipc-channels.ts
export const IPC_PAGE_SUMMARIZE = 'page:summarize' as const
```

| 属性 | 说明 |
|---|---|
| 方向 | Renderer → Main（invoke，有返回值） |
| 请求 | `{ config: LocalModelConfig, messages: ChatMessage[] }` |
| 响应 | `string \| null`（摘要文本，失败返回 null） |
| 超时 | 30s（Main 侧 AbortController） |

### 3.3 Summary Prompt

```
System: You are a page summarizer. Given the page metadata and detected form fields,
write ONE concise sentence (max 80 words) describing what this page is and what the
user is expected to do on it. Focus on the page's purpose, not individual fields.

User:
URL: https://github.com/signup
Title: Join GitHub · GitHub
Detected fields (5): username [text] *required, email [email] *required,
  password [password] *required, opt-in [checkbox], continue [submit]

Expected output:
"This is the GitHub account registration page where new users create an account
by providing a username, email, and password, with an optional newsletter subscription."
```

关键设计决策：
- **非流式调用**：`stream: false`，减少复杂度
- **小 token 限制**：`max_tokens=256`，确保快速响应
- **低温度**：`temperature=0.3`，需要事实性而非创造性

### 3.4 缓存策略

```typescript
// useWebview.ts 中的状态
let lastSummarizedUrl = ''
let pageSummary: string | null = null

// URL 比较：忽略 hash 和 trailing slash
function normalizeUrl(url: string): string {
  try {
    const u = new URL(url)
    return `${u.origin}${u.pathname.replace(/\/$/, '')}${u.search}`
  } catch { return url }
}
```

**规则**：
- `normalizeUrl(currentUrl) === lastSummarizedUrl` → 复用缓存
- URL 变化 → 重新生成
- SPA 内 hash 变化（`#section-2`）→ 不重新生成

---

## 4. Field Relationship（字段关联）设计

### 4.1 关系类型

| 关系类型 | 检测方式 | 示例 | 权重 |
|---|---|---|---|
| **Semantic Pair** | 字段名模式匹配 | `first_name` ↔ `last_name` | 高 |
| **Constraint** | 字段名相似 + 语义推断 | `password` ↔ `confirm_password` | 高 |
| **Dependency** | DOM 层级 + 标签推断 | `country` → `state` | 中 |
| **Sibling Group** | 同一 `<fieldset>` / `<div>` | 地址组：street, city, zip | 中 |
| **Label Proximity** | label 文本包含关系 | "Full Name" 可能关联 first + last | 低 |

### 4.2 关系检测算法（客户端侧）

不依赖 LLM（避免额外延迟），在注入脚本 `useAITip.ts` 中增加关系检测：

```javascript
// 伪代码：在 injected script 的 collectContext 中扩展
function detectRelations(field, allFields) {
  const relations = []
  const name = (field.name || '').toLowerCase()
  const id = (field.id || '').toLowerCase()

  // 1. Semantic Pairs: "first" ↔ "last", "start" ↔ "end"
  const pairPatterns = [
    { a: /first|fname|given/, b: /last|lname|surname|family/, type: 'name-pair' },
    { a: /start|from|begin/,  b: /end|to|finish/,         type: 'range-pair' },
    { a: /street|address1/,   b: /address2|apt|unit/,     type: 'address-pair' },
    { a: /city|town/,         b: /state|province|region/,  type: 'geo-pair' },
  ]

  for (const other of allFields) {
    if (other === field) continue
    const otherName = (other.name || '').toLowerCase()

    // Pattern match
    for (const p of pairPatterns) {
      if ((p.a.test(name) && p.b.test(otherName)) ||
          (p.b.test(name) && p.a.test(otherName))) {
        relations.push({
          type: p.type,
          relatedField: other,
          relation: 'pair'
        })
      }
    }

    // Constraint: "password" / "confirm"
    if (/password|pwd|pass/.test(name) &&
        /confirm|verify|repeat|again/.test(otherName)) {
      relations.push({
        type: 'password-confirm',
        relatedField: other,
        relation: 'must-match'
      })
    }
  }

  // 2. DOM-based: same fieldset
  const fieldset = field.closest('fieldset')
  if (fieldset) {
    const siblings = fieldset.querySelectorAll('input,select,textarea')
    // ...
  }

  return relations
}
```

### 4.3 FieldContext 类型扩展

```typescript
// src/shared/types.ts

/** 字段关联关系 */
export interface FieldRelation {
  type: 'name-pair' | 'range-pair' | 'address-pair' | 'geo-pair'
       | 'password-confirm' | 'same-fieldset' | 'dependency'
  relatedField: {
    name: string
    label: string
    type: string
    value: string
  }
  relation: 'pair' | 'must-match' | 'depends-on' | 'same-group'
}

export interface FieldContext {
  // ... 现有字段 ...
  /** 与其他字段的关联关系 */
  relations?: FieldRelation[]
}
```

### 4.4 在 LLM Prompt 中使用关系

```
System Context（充实后）:

Page Summary: This is the GitHub account registration page where new users
create an account by providing a username, email, and password.

Field: "username" [text]
- Placeholder: "Pick a username"
- Relations:
  → "email" [email] — paired field (username+email identify the account)
  → "password" [password] — same registration form group

The user is asking for suggestions for the "username" field.
Suggest a username that would be appropriate for a developer-oriented platform.
```

这比单纯的"这个字段叫 username" 提供了更多可操作的上下文。

---

## 5. Context 聚合策略

### 5.1 Context 层级

```
┌─────────────────────────────────────────────┐
│ Layer 1: Page Summary (全局，缓存)           │
│ "This is a GitHub signup page..."           │
├─────────────────────────────────────────────┤
│ Layer 2: Form Structure (检测时)             │
│ Detected fields, form purpose, sibling labels│
├─────────────────────────────────────────────┤
│ Layer 3: Field Relations (检测时计算)        │
│ name-pair, password-confirm, same-fieldset   │
├─────────────────────────────────────────────┤
│ Layer 4: User Intent (交互时)                │
│ Which field user is asking about, user query  │
├─────────────────────────────────────────────┤
│ Layer 5: Conversation History (可选)         │
│ Previous Q&A in this session                 │
└─────────────────────────────────────────────┘
```

### 5.2 Token Budget 分配

假设目标模型的 context window 为 4096 tokens，建议分配：

| 层级 | Token 预算 | 说明 |
|---|---|---|
| System instruction | ~100 | 角色设定 + 输出格式要求 |
| Page Summary | ~80 | 一段话 |
| Form Structure | ~200-500 | 取决于字段数量 |
| Field Relations | ~100-200 | 取决于关系复杂度 |
| User Message | ~100-300 | 用户的提问 |
| Response reserve | ~500 | 留给 LLM 的回答空间 |
| **总计** | **~1100-1700** | 在 4K 窗口内安全 |

### 5.3 Context 压缩策略

当字段很多时（> 20 个），需要压缩：

```typescript
function buildCompactContext(fields: SimpleField[], relations: FieldRelation[]): string {
  // 1. 只保留有 label 或 name 的字段
  const meaningful = fields.filter(f => f.label || f.name)

  // 2. 按 formPurpose 分组
  const groups = groupByPurpose(meaningful)

  // 3. 压缩为一行一个字段
  // "fields: username[text]* email[email]* password[password]* … (+12 more)"
  const compact = meaningful.slice(0, 15).map(f =>
    `${f.label || f.name}[${f.type}]${f.required ? '*' : ''}`
  ).join(' ')

  // 4. 关系摘要
  const relSummary = relations.length > 0
    ? `\nrelations: ${relations.map(r => `${r.type}(${r.relatedField.label})`).join(', ')}`
    : ''

  return compact + (meaningful.length > 15 ? ` … (+${meaningful.length - 15} more)` : '') + relSummary
}
```

---

## 6. UX/UI 设计

### 6.1 设计原则

1. **渐进式披露**：先展示简单的 chips，用户需要时才展开详细上下文
2. **透明度**：让用户知道 AI "看到了什么"，建立信任
3. **可操作性**：用户可以修正 AI 对页面的理解
4. **非侵入性**：上下文信息不应抢占主交互区域

### 6.2 Page Summary 的展示

#### 方案 A：ContextBar 中的小型提示（推荐）

```
┌──────────────────────────────────────────┐
│ 📄  GitHub 注册页面    [页面摘要 ▼]      │  ← ContextBar
├──────────────────────────────────────────┤
│                                          │
│         （聊天区域）                       │
│                                          │
└──────────────────────────────────────────┘
```

点击展开：
```
┌──────────────────────────────────────────┐
│ 📄  AI 理解：这是一个 GitHub 账号注册页面  │
│ 用户在此创建账户，需要提供用户名、邮箱和   │
│ 密码。检测到 5 个表单字段。               │
│                              [✕ 关闭]    │
├──────────────────────────────────────────┤
```

#### 方案 B：ContextPill 扩展（在 AI Tip 激活时）

```
┌──────────────────────────────────────────┐
│ ┌────────────────────────────────────┐   │
│ │ 📧 Email  │ GitHub 注册页 · 5 字段 │ ✕ │  ← ContextPill v2
│ │ 加载中... │                        │   │
│ └────────────────────────────────────┘   │
│ ┌────────────────────────────────────┐   │
│ │ 💬 输入消息...                      │   │
│ └────────────────────────────────────┘   │
└──────────────────────────────────────────┘
```

Pill 第一行：目标字段
Pill 第二行：页面摘要（极简版）

### 6.3 Field Relationship 的展示

关系信息主要作为 LLM 的内部上下文，**不需要**全部展示给用户。但在关键场景下提供可视化的关联提示：

```
┌──────────────────────────────────────────┐
│ 🔗 Password 必须与 Confirm Password 一致  │  ← Relationship Hint
│                                          │
│ 建议值：                                 │
│ ┌────────────────────────────────────┐   │
│ │ • P@ssw0rd!2024                     │   │
│ │ • MySecur3P@ss                       │   │
│ │ • Tr0ub4dor&3                        │   │
│ └────────────────────────────────────┘   │
│                                          │
│ 💡 此值将自动同步到 "Confirm Password"    │  ← Cross-field action
│    [一键填充两个字段]                      │
└──────────────────────────────────────────┘
```

### 6.4 "一键填充关联字段" 功能

当 LLM 识别到字段关联时，提供批量填充能力：

```
用户点击 "Email" 字段的 AI Tip
  → LLM 建议: email = "john.doe@example.com"
  → 同时检测到 username 与 email 关联（name-pair）
  → 额外建议: username = "john-doe"
  → 展示:

┌──────────────────────────────────────────┐
│ ✨ Email 建议                             │
│                                          │
│ 📧 john.doe@example.com   [填充]         │
│                                          │
│ 🔗 关联字段建议：                        │
│ 👤 Username: john-doe      [填充]        │
│ 📝 Full Name: John Doe     [填充]        │
│                                          │
│ [一键填充全部 (3 个字段)]                 │
└──────────────────────────────────────────┘
```

### 6.5 Context 透明度面板

长期功能：在设置或侧边栏中提供一个"Context Inspector"：

```
┌──────────────────────────────────────────┐
│ 🔍 AI Context Inspector                   │
│                                          │
│ 📄 Page Summary                          │
│ "GitHub registration page..."            │
│                                          │
│ 📋 Detected Fields (5)                   │
│ • username [text] *required              │
│ • email [email] *required                │
│ • password [password] *required          │
│ • opt-in [checkbox]                      │
│ • continue [submit]                      │
│                                          │
│ 🔗 Field Relations                       │
│ • username ↔ email (name-pair)           │
│                                              │
│ [修改理解] [刷新摘要]                     │
└──────────────────────────────────────────┘
```

---

## 7. 实现方案

### 7.1 分阶段实施

#### Phase 1: Page Summary（当前进行中）

| 任务 | 文件 | 状态 |
|---|---|---|
| 添加 `IPC_PAGE_SUMMARIZE` 通道 | `src/shared/ipc-channels.ts` | ✅ 已完成 |
| Main 侧 handler（非流式 LLM 调用） | `src/main/index.ts` | ✅ 已完成 |
| Preload 桥接 | `src/preload/index.ts` | ✅ 已完成 |
| 类型声明 | `src/preload/index.d.ts` | ✅ 已完成 |
| useWebview 中触发 summarize | `src/renderer/src/composables/useWebview.ts` | 🚧 进行中 |
| useChat 中包含 page summary | `src/renderer/src/composables/useChat.ts` | ⬜ 待实施 |
| ContextBar 展示 summary | `src/renderer/src/components/sidebar/ContextBar.vue` | ⬜ 待实施 |

#### Phase 2: Field Relationship Detection

| 任务 | 文件 | 状态 |
|---|---|---|
| 扩展 `FieldContext` 类型 | `src/shared/types.ts` | ⬜ 待实施 |
| 注入脚本增加关系检测 | `src/renderer/src/composables/useAITip.ts` | ⬜ 待实施 |
| useChat 中包含关系上下文 | `src/renderer/src/composables/useChat.ts` | ⬜ 待实施 |
| 关联字段批量填充 UI | `ChatView.vue` / `BotMessage.vue` | ⬜ 待实施 |

#### Phase 3: Context 透明度 & 高级 UX

| 任务 | 文件 | 状态 |
|---|---|---|
| Context Inspector 面板 | 新组件 | ⬜ 待实施 |
| Summary 修正/刷新 | `ContextBar.vue` | ⬜ 待实施 |
| Context 压缩策略 | `useChat.ts` | ⬜ 待实施 |

### 7.2 关键代码路径

#### useWebview.ts 改动（Phase 1）

```typescript
// 新增状态
let lastSummarizedUrl = ''
const pageSummary = ref<string | null>(null)

// 新增函数
async function summarizePage(url: string): Promise<void> {
  const { toLLMConfig } = useModelConfig()
  const config = toLLMConfig()
  if (!config) {
    log.debug('summarizePage: no model configured, skipped')
    return
  }

  const normalizedUrl = normalizeUrl(url)
  if (normalizedUrl === lastSummarizedUrl) {
    log.debug('summarizePage: URL unchanged, using cached summary')
    return
  }

  const fields = detectedFields.value
  if (fields.length < 3) {
    log.debug(`summarizePage: only ${fields.length} fields, skipped`)
    return
  }

  const fieldList = fields.slice(0, 20).map(f =>
    `${f.label || f.name || '(unnamed)'} [${f.type}]${f.required ? ' *required' : ''}`
  ).join(', ')

  const messages = [
    {
      role: 'system' as const,
      content: 'You are a page summarizer. Write ONE concise sentence (max 80 words) describing what this page is and what the user is expected to do on it. Focus on the page\'s purpose, not individual fields. Reply with ONLY the summary sentence, no prefixes.'
    },
    {
      role: 'user' as const,
      content: `URL: ${url}\nTitle: ${document.title}\nDetected fields (${fields.length}): ${fieldList}${fields.length > 20 ? ` … (+${fields.length - 20} more)` : ''}`
    }
  ]

  try {
    lastSummarizedUrl = normalizedUrl
    const result = await window.api.summarizePage(config, messages)
    if (result) {
      pageSummary.value = result
      ;(window as any).__page_summary = result
      log.info(`summarizePage: summary (${result.length} chars): ${result.slice(0, 100)}...`)
    } else {
      log.warn('summarizePage: LLM returned empty summary')
      ;(window as any).__page_summary = null
    }
  } catch (e) {
    log.error('summarizePage: failed:', e)
    ;(window as any).__page_summary = null
  }
}

// 在 did-finish-load 中调用
wv.addEventListener('did-finish-load', () => {
  // ... existing ...
  setTimeout(() => detectFields(), 800)
  setTimeout(() => {
    summarizePage(currentUrl.value)
    aiTip.inject()
  }, 2000) // 等待 detectFields 完成后再 summarize
})
```

#### useChat.ts 改动（Phase 1）

```typescript
// handleGeneralChat 中，构建 systemMsg 时加入 page summary
const pageSummary = (window as any).__page_summary || ''
const pageSummaryBlock = pageSummary
  ? `\n\nPage summary: ${pageSummary}`
  : ''

const systemMsg = `You are an AI assistant embedded in a browser sidebar. The user is currently viewing:
- URL: ${pageUrl}
- Page title: ${pageTitle}${pageSummaryBlock}${fieldSummary}${axSummary}

Use the information above to answer the user's questions about this page. Be concise and helpful.`
```

---

## 8. 风险 & 降级

### 8.1 风险矩阵

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| Summary LLM 调用失败 | 中 | 低 | 静默回退，不影响核心功能 |
| Summary 内容不准确 | 中 | 中 | 用户可手动刷新；低温 + 明确 prompt 降低幻觉 |
| Token 超限 | 低 | 中 | Context 压缩策略；分层 system prompt |
| SPA 中 summary 过期 | 中 | 低 | URL 规范化比较；用户可手动触发刷新 |
| 关系检测误报 | 中 | 低 | Pattern 匹配保守（宁缺毋滥）；LLM 作为最终决策者 |

### 8.2 降级路径

```
最佳 ─── Page Summary + Field Relations ──→ 最佳建议质量
  │
  ├─ Summary 生成失败
  │  └─→ 仅 Field Relations + 原始字段上下文 ──→ 良好建议质量
  │
  ├─ 无模型配置
  │  └─→ 仅原始字段上下文（当前行为）────────→ 可接受建议质量
  │
  └─ 无字段 / 页面无表单
     └─→ 仅 pageUrl + pageTitle ────────────→ 基础建议质量
```

### 8.3 性能考量

| 指标 | 目标 | 备注 |
|---|---|---|
| Summary 生成延迟 | < 3s (P95) | 30s 超时保底 |
| Summary token 开销 | < 200 tokens/页 | 输入 + 输出 |
| 关系检测延迟 | < 50ms | 纯客户端计算 |
| UI 阻塞 | 0ms | 全部异步 |

---

## 附录 A：对比现有方案

| 特性 | 当前实现 | Phase 1 (Page Summary) | Phase 2 (+Relations) |
|---|---|---|---|
| 页面语义理解 | ❌ 仅 URL + Title | ✅ LLM Summary | ✅ LLM Summary |
| 字段关联感知 | ⚠️ siblingLabels（无序） | ⚠️ siblingLabels | ✅ 结构化 Relations |
| 上下文 token 效率 | 低（原始 AX Node） | 中 | 高（压缩 + 关系摘要） |
| 用户可见性 | ❌ 不可见 | ⚠️ ContextBar 小提示 | ✅ Context Inspector |
| LLM 额外调用 | 0 | 1次/页面 | 1次/页面 |
| 降级安全性 | N/A | ✅ 完全降级 | ✅ 完全降级 |

---

## 附录 B：Summary Prompt 优化方向

1. **多语言支持**：根据用户 locale 生成对应语言的 summary
2. **风格标签**：让 LLM 输出 `[purpose: registration] [industry: tech]` 结构化标签
3. **置信度评分**：让 LLM 输出 `confidence: 0.95` 帮助 UI 决定展示方式
4. **增量更新**：SPA 内 URL 变化时，让 LLM 输出 diff 而非全新 summary
