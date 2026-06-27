# 11 — 批量预填与单字段精修设计

> **创建**: 2026-06-26
> **关联**: [05 表单检测](./05-form-detection-design.md) · [09 Page Summary](./09-page-summary-design.md) · [10 Context Session](./10-context-session-design.md)
> **状态**: ✅ 已实现
> **实现文件**:
> - `src/main/index.ts` — IPC `batch:suggest` handler + json_schema strict mode
> - `src/renderer/src/composables/useWebview.ts` — `runBatchSuggest()`, 结构化字段上下文, 动态 few-shot
> - `src/renderer/src/components/sidebar/chat/BatchFillCard.vue` — 三态卡片 (trigger/loading/done)
> - `src/renderer/src/components/sidebar/chat/FieldSuggestionCard.vue` — 单字段预填建议卡片
> - `src/renderer/src/components/Sidebar.vue` — `handleBatchStart()`, `createBatchFieldSessions()`
> - `src/shared/types.ts` — `FieldSummary`, `BatchFieldSuggestion`, `BatchSuggestResult`
> - `src/shared/ipc-channels.ts` — `IPC_BATCH_SUGGEST`

---

## 1. 问题定义

### 当前流程（逐字段交互）

```
hover 字段 → 点击 ✨ → 看 chip → 点 chip → 等回复 → 点采纳 → 填充
```

10 字段表单 = **~70 次操作**，比手动填还慢。

### 目标

一次 LLM 调用完成全表推理，高置信字段自动填，低置信字段一键精修。

---

## 2. 核心设计：融入双会话模型

> 参考 [10 Context Session](./10-context-session-design.md) 的 Page Session / Field Session 结构。

### 2.1 概念模型

```
Page Session (crm.example.com/customer)
│
├── 💬 Overview (page-chat)
│   ├── 🤖 Auto-summary: "这是一个 CRM 客户录入表单…"
│   ├── 📋 Batch Fill Card              ← 用户点击触发
│   └── 点击后 → LLM 返回所有字段值 → 生成所有 Field Session
│
├── ✨ Company Name (field session)
│   ├── 🤖 AI 预填值: "Acme Corp" (high)
│   ├── 💬 用户可聊天精修 / 修改 / 确认
│   └── 确认后 → fillField 注入 DOM
│
├── ✨ Contact Email (field session)
│   ├── 🤖 AI 预填值: "acme@corp.com" (medium)
│   └── 💬 用户可聊天精修
│
├── ✨ Phone (field session)
│   ├── 🤖 AI 预填值: "+86 138-xxxx" (medium)
│   └── 💬 用户可聊天精修
│
├── ✨ Country (field session)
│   ├── 🤖 AI 预填值: "China" (high)
│   └── 💬 用户可聊天精修
│
└── ... (所有检测到的字段都有一个 field session)
```

### 2.2 Batch Fill Card 的角色

Batch Fill Card 是 Overview 会话中的一条**操作型 bot 消息**：

| 阶段 | 卡片内容 | 用户操作 |
|------|---------|---------|
| **触发前** | "检测到 N 个表单字段，是否一键预填？" | [开始批量预填] |
| **加载中** | ⏳ "正在分析所有字段…" | — |
| **完成后** | 汇总结果："12 个字段已预填，其中 8 个高置信自动注入" | [查看全部字段] |

### 2.3 置信度分层

| 级别 | DOM 行为 | Field Session 标记 | 用户操作 |
|:---:|:---:|:---:|------|
| high | ✅ 自动注入 | 🟢 绿色 | 可进入 session 精修/确认 |
| medium | ✅ 自动注入 | 🟡 黄色 | 可进入 session 确认/修改 |
| low | ❌ 不注入 | ⚪ 灰色 | 进入 session 手动填写 |

> **实际行为**: high + medium 都会自动注入 DOM（low 不注入）。用户可在各 Field Session 中精修或覆盖任何字段。


---

## 3. 整体流程

```
Page Load
  │
  ├─→ detectFields (CDP)                       已有
  ├─→ summarizePage → Overview bot msg         已有
  │
  └─→ Overview 显示 Batch Fill Card           ★ 新增
        │  "检测到 12 个字段，是否一键预填？"
        │  [开始批量预填]
        │
        └─ 用户点击
              │
              ├─→ batchSuggest (LLM, 1次调用)
              │     └─ 返回所有字段的 { value, confidence, reasoning }
              │
              ├─→ high 置信 → fillField 逐个注入 DOM
              │
              ├─→ 为每个字段创建 Field Session
              │     └─ 每条 session 首条 bot 消息 = 预填值 Suggestion Card
              │
              └─→ Overview 卡片更新为完成状态
                    "12/12 字段已预填，8 个已自动注入"
                    [查看全部字段]
```

**关键时序**：用户手动触发，不是页面加载自动执行。这避免了不必要的 LLM 调用和自动创建大量 session。

**与现有流程的关系**：
- 不影响已有的 Overview auto-summary
- 不影响逐字段 AI Tip（hover → ✨ 仍可用）
- Field Session 创建后可独立精修，互不干扰

---

## 4. LLM Prompt 策略

### 请求（一次性传入所有字段）

**System prompt 核心约束**：

- 返回严格 JSON 结构，每个字段含 `fieldKey` / `suggestedValue` / `confidence` / `reasoning`
- `*required` 字段必须给出 medium 以上建议
- `password/credit/cvv` 字段标记 `low`，值用 `***`
- 利用 page summary 理解表单用途，利用 AX tree 理解字段关系

**User prompt**：

- 传入 `FieldSummary[]`：label、type、placeholder、required、currentValue
- 传入 page summary（如有）
- 可选：AX tree text

### 关键设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 调用次数 | **1 次** LLM 调用 | 10 个字段逐个调用 = 10 倍成本；一并发调用更高效 |
| 流式/非流式 | **非流式**（`stream: false`） | 结果需要完整解析 JSON，流式无意义 |
| max_tokens | 2048 | 10 字段 × ~150 chars ≈ 1500，留余量 |
| temperature | 0.2 | 低温度保证 JSON 格式稳定 |
| 超时 | 90s | 实际使用 90s，17 字段场景下 LLM 需要充裕时间 |
| response_format | `json_schema` strict mode（优先）→ `json_object`（降级） | 见 [12 LLM 结构化输出](./12-llm-structured-output-design.md) |
| fieldKey 约束 | `enum` 精确约束 | 动态构造 JSON Schema，`fieldKey` 只能从检测到的字段标签中选择 |
| few-shot | 动态生成 | 从检测字段抽取 5 个不同类型做示例，提升格式稳定性 |

---

## 5. 精修流程（每个 Field Session 内）

### 5.1 所有字段都有 Session

Batch Fill 完成后，**每个检测到的字段都会生成一个 Field Session**，不仅仅是中低置信的。

```
Home 视图：
  📍 CRM Customer Entry
  💬 Overview
  ✨ Company Name   🟢 "Acme Corp"
  ✨ Contact Email  🟡 "acme@corp.com"
  ✨ Phone          🟡 "+86 138-xxxx"
  ✨ Country        🟢 "China"
  ✨ Address        🟡 "北京市朝阳区"
  ✨ Tax ID         ⚪ (需手动填写)
  ... 全部 12 个字段
```

### 5.2 Field Session 内部结构

每条 Field Session 的初始消息流：

```
进入 ✨ Contact Email (field session)
┌─────────────────────────────────────────────┐
│ 🤖 Suggestion Card                          │
│   📋 AI 预填值: "acme@corp.com"             │
│   置信度: 🟡 medium                          │
│   理由: "根据 Company Name=Acme Corp 推断"   │
│   [采纳此值] [让 AI 重新建议]                 │
├─────────────────────────────────────────────┤
│  ← 用户可以在此聊天，深加工/refine 该字段     │
│                                             │
│ 👤 "这个邮箱格式不对，应该是 contact@acme.com" │
│ 🤖 "你说得对，已更新为 contact@acme.com"      │
│   [采纳]                                     │
├─────────────────────────────────────────────┤
│ 👤 "确认，就用 contact@acme.com"             │
│ 🤖 "✅ 已填充 Contact Email = contact@..."   │
├─────────────────────────────────────────────┤
│ [输入框]                                     │
└─────────────────────────────────────────────┘
```

### 5.3 精修时的 Context 协调

每个 Field Session 的 chat 中，LLM 的 system prompt 包含 `batchContext`——所有其他字段的预填值：

```
Other fields in this form:
- "Company Name": "Acme Corp" (🟢 high, auto-filled)
- "Phone": "+86 138-xxxx" (🟡 medium)
- "Country": "China" (🟢 high, auto-filled)
- "Address": "北京市朝阳区" (🟡 medium)
- ... (全部字段)

Your suggestion for this field MUST be consistent with values in other fields.
```

这样 LLM 精修 `Email` 时会考虑 `Company Name` 已填 "Acme Corp"，不会建议 `@gmail.com`。

### 5.4 高置信字段也可以精修

即使字段已被自动注入 DOM（high confidence），用户仍可进入其 Field Session：
- 查看 AI 的推理理由
- 聊天确认或覆盖
- 覆盖后重新 fillField

### 5.5 与现有 field chat 的集成

现有 `useChat` → `ChatContextOptions.mode = 'field'` 已支持：
- `overviewContext` — 页面语义上下文
- `fieldMeta` — 当前字段信息

新增：
- `batchContext` — 所有字段预填值（仅在 Batch Fill 完成后的 field session 中传入）

**零破坏性**：`batchContext` 为可选字段，不传时行为与现在完全一致。

---

## 6. 触发时机

```
Page Load
  → detectFields()                              已有，自动
  → summarizePage() → Overview bot msg          已有，自动
  → Overview 显示 Batch Fill Card               新增，自动出现
       │
       └─ 用户点击 [开始批量预填]
            → batchSuggest(LLM)                 用户触发
            → 生成所有 Field Session
            → high 置信自动注入 DOM
```

**Batch Fill Card 出现条件**：
- 字段数 ≥ 2
- page summary 已返回（确保 LLM 有语义上下文，卡片在 summary 返回时自动插入 Overview）
- 同一 URL 已存在 batch-fill 卡片时不重复插入

**不自动触发的原因**：
- 避免不必要的 LLM 成本（用户可能只想浏览页面）
- 避免自动创建大量 Field Session（噪音）
- 给用户选择权——有些页面不需要预填

> **实际条件**: 卡片在 page summary 返回后自动插入 Overview 会话，但 batch fill 需用户点击 `[开始批量预填]` 才触发。

---

## 7. UI 设计

### 7.1 Overview 中的 Batch Fill Card

Page summary 返回后，Overview 会话中自动出现一张操作卡片：

**触发前**（紧随 auto-summary bot message）：

```
┌─ BotMessage: Batch Fill Card ─────────────────────┐
│ 📋 检测到 12 个表单字段                              │
│                                                    │
│ 可以让 AI 一次性分析所有字段并提供预填建议。           │
│ 预填后可以在每个字段的会话中单独精修。                │
│                                                    │
│ [开始批量预填 (12 字段)]                             │
└────────────────────────────────────────────────────┘
```

**加载中**（无取消按钮，让 LLM 流式输出直接反馈）：

```
┌─ BotMessage: Batch Fill Card ─────────────────────┐
│ ⏳ 正在分析 12 个字段…                              │
└────────────────────────────────────────────────────┘
```

> **UX 决策**: 加载中不显示取消按钮，让用户尽快看到 LLM 返回结果。同时该状态下隐藏底部 follow-up chips（"总结本页" / "告诉我更多"），避免干扰。

**完成后**（卡片更新，显示汇总）：

```
┌─ BotMessage: Batch Fill Card ─────────────────────┐
│ ✅ 已完成 12/12 字段预填                             │
│ 🟢 8 个字段已自动注入 DOM                            │
│ 🟡 3 个字段建议审核                                  │
│ ⚪ 1 个字段需手动填写                                │
│                                                    │
│ [查看全部字段会话]                                    │
└────────────────────────────────────────────────────┘
```

点击 `[查看全部字段会话]` → 切换到 Home 视图，所有 Field Session 已列出。

### 7.2 Field Session 中的 Suggestion Card

每个 Field Session 的首条 bot 消息就是该字段的预填建议：

```
┌─ BotMessage: Suggestion Card ──────────┐
│ 📋 AI 预填值: "acme@corp.com"           │
│ 置信度: 🟡 medium                       │
│ 理由: 根据 Company Name=Acme Corp 推断  │
│                                        │
│ [采纳此值] [让 AI 重新建议]              │
└────────────────────────────────────────┘
```

**交互**：
- `[采纳]` → fillField 注入 DOM，卡片变为 "✅ 已填充"
- `[让 AI 重新建议]` → 自动发送请求 → 进入正常 field chat 流
- 之后的对话就是正常的聊天精修，可以深加工该字段

### 7.3 Home 视图中的表现

Batch Fill 完成后，Home 中所有字段都有 Session，并显示预填状态：

```
📍 CRM Customer Entry
💬 Overview
✨ Company Name   🟢 "Acme Corp"
✨ Contact Email  🟡 "acme@corp.com"
✨ Phone          🟡 "+86 138-xxxx"
✨ Country        🟢 "China"
✨ Address        🟡 "北京市朝阳区"
✨ Tax ID         ⚪ (需手动填写)
✨ Website        🟢 "www.acme.com"
✨ Description    🟡 "企业客户..."
... 全部 12 个字段
```

用户不用点进去就能看到每个字段的预填状态，点击任意字段即进入精修。

---

## 8. 字段匹配策略

问题：LLM 返回的 `fieldKey` 如何对应 DOM 中的实际字段？

### 匹配优先级

1. **label 精确匹配** — LLM 返回的 `fieldKey` === 字段的 `label`
2. **name 匹配** — `fieldKey` === `field.name`
3. **label 包含匹配** — `field.label` 包含 `fieldKey`（用于 LLM 简化 "Email Address" → "Email"）
4. **placeholder 匹配** — 兜底

### 填充复用

批量预填和精修的填充执行**完全复用现有 `useAITip.fillField()`** 的 4 策略回退机制（name/id → label → placeholder → aria-label）。不做重复实现。

---

## 9. 与现有系统的关系

```
                   现有                       新增
                 ─────────               ──────────────────
字段检测         ✅ CDP + preload        不变
Page Summary     ✅ LLM summarize        不变
逐字段 AI Tip    ✅ hover → ✨           保留（独立于 Batch Fill）
Field fill       ✅ 4-strategy           复用
Chat Stream      ✅ stream mode          增加 batchContext 参数
useSession       ✅ Page/Field Session   增加 createBatchFieldSessions()
BotMessage       ✅ 消息气泡             增加 card 类型 "batch-fill" + "suggestion"
Overview Chat    ✅ page-chat           插入 Batch Fill Card bot 消息
Field Chat       ✅ field session        首条消息为 Suggestion Card

新增内容         —                      llm:batch-suggest IPC + handler
                                        Batch Fill Card 消息类型
                                        Suggestion Card 消息类型
                                        批量创建 Field Session 逻辑
                                        无独立 Banner/面板组件
```

**核心原则**：所有新增 UI 都是消息流中的 card，不引入独立面板。

---

## 10. 降级策略

| 场景 | 降级行为 |
|------|---------|
| LLM 超时/报错 | Overview 中插入一条 "⚠️ 批量分析失败" 的 bot 消息，可重试。不影响逐字段 AI Tip |
| JSON 解析失败 | 同超时处理 |
| 单字段 fillField 失败 | 跳过该字段，Suggestion Card 中标记为 "填充失败" |
| 字段匹配率为 0 | 不自动填充，Suggestion Card 显示所有字段为 "待手动审核" |
| 用户关闭批量预填 | 完全不触发 batchSuggest，回到现有逐字段 AI Tip 流程 |

---

## 11. 安全性

- 敏感字段（password/credit/cvv）LLM prompt 强制返回 `low` + `***`
- 所有填充操作通过 `executeJavaScript` + native setter，不触碰 DOM prototype
- 用户任何时候可以一键拒绝所有预填

---

## 12. 实施状态

| 优先级 | 内容 | 状态 |
|:---:|------|:---:|
| P0 | `IPC_BATCH_SUGGEST` + Main handler（含 json_schema strict mode + enum 约束） | ✅ 完成 |
| P0 | `BatchFillCard` 三态组件（trigger / loading / done） | ✅ 完成 |
| P0 | `[开始批量预填]` 点击 → LLM 调用 → 结果存储 | ✅ 完成 |
| P0 | 为所有字段批量创建 Field Session，每条插入 `FieldSuggestionCard` | ✅ 完成 |
| P0 | 结构化字段上下文（替代原始 AX tree）+ 动态 few-shot | ✅ 完成 |
| P1 | Field Session 精修：`batchContext` 注入 `useChat` → `sendMessage` | ✅ 完成 |
| P1 | `[让 AI 重新建议]` 交互逻辑（`handleSuggestionReSuggest`） | ✅ 完成 |
| P1 | Home 列表显示预填状态（🟢/🟡/⚪ + 值） | ✅ 完成 |
| P2 | 撤销：一键清空所有预填 + 删除 Field Session | ⬜ 未实现 |
| UX | 加载中隐藏取消按钮 + 隐藏 follow-up chips | ✅ 完成 |
| UX | 有摘要时隐藏 "总结本页" chip | ✅ 完成 |
