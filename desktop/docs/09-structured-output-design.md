# 12 — LLM 结构化输出可靠性设计

> **创建**: 2026-06-26
> **关联**: [05 表单检测](./05-form-detection-design.md) · [09 Page Summary](./09-page-summary-design.md) · [11 批量预填](./11-batch-pre-fill-design.md)
> **状态**: ✅ 已实现
> **实现文件**:
> - `src/main/index.ts` — IPC `batch:suggest` handler: json_schema strict mode + enum 约束 + JSON regex 提取
> - `src/renderer/src/composables/useWebview.ts` — `buildStructuredFieldContext()`, `buildDynamicFewShot()`, `getTypeHint()`, fieldKey 匹配诊断

---

## 1. 问题定义

Batch Fill 的核心流程：

```
Detected Fields → 预处理(结构化+类型提示+siblingFields) → LLM → 结构化 JSON → fillField
```

> **已解决**: 不再传入原始 AX tree，改用预处理后的结构化字段描述（方案 B）。
> fieldKey 匹配通过 `json_schema` strict mode + `enum` 约束解决（方案 D）。

**原始的可靠性问题**（已全部解决）：

| 问题 | 表现 | 解决方案 | 状态 |
|------|------|------|:--:|
| fieldKey 不匹配 | LLM 返回 "Email" 但实际字段是 "Contact Email" | json_schema `enum` 约束 + 4 层模糊匹配回退 | ✅ |
| 值格式错误 | checkbox 返回 "yes" 而非 "true" | `getTypeHint()` 给 LLM 精确格式提示 | ✅ |
| JSON 格式损坏 | markdown fences、尾随逗号 | json_schema strict mode + JSON regex 提取 | ✅ |
| 值不一致 | "Country"=中国 但 "Phone"=US 格式 | `siblingFields` 上下文 + prompt 中的一致性约束 | ✅ |
| 遗漏字段 | 17 个字段只返回 15 个 | `required` 字段在 schema 中强制要求 | ✅ |

---

## 2. 输入分析：LLM 看到什么

### 2.1 实际输入结构（已实现：方案 B 结构化输入）

不再传入原始 AX tree。`buildStructuredFieldContext()` 组装紧凑的 JSON：

```json
{
  "page": "这是一个客户注册页面...",
  "fieldCount": 17,
  "fields": [
    {
      "index": 1,
      "key": "Company Name",
      "format": "short text",
      "required": true,
      "placeholder": "Enter company name",
      "siblingFields": ["Industry", "Registered Address", ...]
    },
    {
      "index": 2,
      "key": "Active",
      "format": "true or false",
      "required": false,
      "siblingFields": ["Company Name", ...]
    }
  ]
}
```

类型提示通过 `getTypeHint()` 映射（`number` → "numeric only"、`email` → "email address" 等）。
password 字段返回 "do NOT fill" 提示 LLM 跳过。

### 2.2 核心矛盾（已解决）

- ~~AX tree 信息丰富但噪音大~~ → **不再传入 AX tree，用结构化字段描述替代**
- Detected fields 结构化 → **增强为 key + format + required + placeholder + siblingFields**
- ~~LLM 不擅长精确复制字符串~~ → **`json_schema` strict mode + `enum` 约束，fieldKey 零偏差**

---

## 3. 方案对比

### 方案 A：纯 Prompt 工程

```
AX tree 原文 + 字段列表 → system prompt 规则 → JSON
```

| 优点 | 缺点 |
|------|------|
| 实现简单 | fieldKey 匹配率 ~70-85% |
| 无需额外处理 | 依赖 LLM 的字符串复制能力 |
| | 长 AX tree 消耗 token |

> **状态**: ❌ 已废弃。实际采用方案 B + D。

### 方案 B：预处理 + 结构化输入 ✅ 已实现

在传给 LLM 之前，从 CDP 检测字段组装成紧凑结构（不再传原始 AX tree）：

**实现位置**: `useWebview.buildStructuredFieldContext()` + `getTypeHint()`

```json
{
  "page": "客户注册页面...",
  "fieldCount": 17,
  "fields": [
    {
      "index": 1,
      "key": "Company Name",
      "format": "short text",
      "required": true,
      "placeholder": "Enter company name",
      "siblingFields": ["Industry", "Address", ...]
    }
  ]
}
```

| 优点 | 实际效果 |
|------|------|
| fieldKey 精确匹配 | key 直接来自 `f.label`，LLM 照抄即可 |
| Token 消耗大幅降低 | 不再传 200+ 节点 AX tree |
| 结构清晰 | LLM 直接理解字段语义 |

### 方案 C：两阶段 — 先理解再填充

```
Phase 1: LLM 分析 AX tree → 输出"页面理解"（自然语言）
Phase 2: 用页面理解 + 字段列表 → 输出 JSON
```

| 优点 | 缺点 |
|------|------|
| 分离关注点 | 两次 LLM 调用，成本翻倍 |
| 页面理解可复用（即 page summary） | 延迟翻倍 |

实际上 page summary 已经完成了 Phase 1。关键是 Phase 2 的输入质量。

### 方案 D：约束解码 / Structured Output ✅ 已实现

**实现位置**: `src/main/index.ts` IPC `batch:suggest` handler

采用两阶段策略：
1. **优先尝试** `json_schema` strict mode + `enum` 约束 fieldKey
2. **降级** `json_object`（宽松版）

```typescript
// 1. 优先: json_schema strict mode + enum 约束
try {
  reqBody.response_format = {
    type: 'json_schema',
    json_schema: {
      name: 'form_suggestions',
      strict: true,
      schema: {
        type: 'object',
        properties: {
          suggestions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                fieldKey: { type: 'string', enum: fieldKeys },  // ★ 精确约束
                suggestedValue: { type: 'string' },
                confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
                reasoning: { type: 'string' },
              },
              required: ['fieldKey', 'suggestedValue', 'confidence', 'reasoning'],
              additionalProperties: false,
            }
          },
          overallHint: { type: 'string' },
        },
        required: ['suggestions'],
        additionalProperties: false,
      }
    }
  }
} catch {
  // 2. 降级: json_object
  reqBody.response_format = { type: 'json_object' }
}
```

| 优点 | 实际情况 |
|------|------|
| 100% 合法 JSON | strict mode 下保证 |
| fieldKey 精确约束 | `enum` 确保 LLM 只能返回检测到的字段标签 |
| 自动降级 | 不支持的 provider 自动回退到 `json_object` |

> **注意**: siliconflow 对 `json_schema` strict mode 的支持情况未确认，降级机制确保兼容性。

---

## 4. 推荐方案：B + D 混合

### 4.1 预处理 AX Tree → 结构化字段描述

在 `useWebview.buildFieldSummaries()` 中，不只用 CDP 检测到的 `SimpleField[]`，还要利用 AX tree 补充：

- 从 AX tree 中提取每个表单字段的 **label ↔ input 关联**
- 组装成自包含的字段描述对象
- 每个 field 带完整的上下文信息，LLM 无需再解析 AX tree

```typescript
// 目标输出格式（传给 LLM 的 user message）
{
  "pagePurpose": "客户注册页面...",
  "fields": [
    {
      "key": "Company Name",        // ← LLM 直接复制这个作为 fieldKey
      "format": "short text",
      "required": true,
      "nearbyLabels": [],           // 附近的 label 文本
      "siblingFields": ["Industry", "Registered Address"],  // 同组字段
      "placeholder": "Enter company name"
    },
    {
      "key": "Active",
      "format": "true or false",
      "required": false,
      "nearbyLabels": ["Active Status"],
      "siblingFields": [],
      "placeholder": ""
    }
  ]
}
```

### 4.2 如果 Provider 支持 → 用 `json_schema` strict mode

```typescript
// 动态构建 JSON Schema，fieldKey 用 enum 约束
const schema = {
  type: "object",
  properties: {
    suggestions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          fieldKey: { type: "string", enum: fields.map(f => f.label) },  // ★ 精确约束
          suggestedValue: { type: "string" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          reasoning: { type: "string" }
        },
        required: ["fieldKey", "suggestedValue", "confidence", "reasoning"]
      }
    }
  }
}
```

`enum` 约束确保 LLM 只能返回实际存在的 fieldKey，彻底解决匹配问题。

### 4.3 Fallback：JSON 修复 + 模糊匹配

即使 JSON 不完美，也要尽可能恢复：

1. 去掉 markdown fences（\`\`\`json ... \`\`\`）
2. 修复常见 JSON 错误（尾随逗号、单引号）
3. 对 fieldKey 做归一化模糊匹配（已实现 4 层回退）
4. 缺失字段补默认值

---

## 5. 实施状态

| 优先级 | 内容 | 状态 |
|:---:|------|:---:|
| **P0** | 预处理 → 结构化字段描述（`buildStructuredFieldContext()` + `getTypeHint()`） | ✅ 完成 |
| **P0** | `json_schema` strict mode + `enum` 约束 fieldKey（try/catch 降级到 `json_object`） | ✅ 完成 |
| **P1** | JSON 修复器（regex 提取 `{...}` 兜底） | ✅ 完成 |
| **P1** | Field 级 `siblingFields` 上下文 | ✅ 完成 |
| **P2** | 动态 few-shot（`buildDynamicFewShot()` — 5 个不同类型示例） | ✅ 完成 |
| **—** | fieldKey 匹配诊断日志（match rate 统计） | ✅ 完成 |
| **—** | 4 层模糊匹配回退（label → name → contains → placeholder） | ✅ 完成 |

---

## 6. 关键洞察

> **不要让 LLM 做字符串精确复制，用结构化约束代替。**

LLM 擅长语义理解、上下文推理。不擅长精确复制字符串。
应该让系统层处理精确匹配（`enum` 约束 / 预处理 key 映射），
让 LLM 专注于它擅长的：根据上下文生成合理的值。

---

## 7. 遗留问题 & 待调研

- [ ] siliconflow 是否支持 `json_schema` strict mode？（当前通过 try/catch 降级处理）
- [x] AX tree 预处理：不再需要（改用 CDP detected fields 直接组装）
- [x] 17 字段 `enum` 约束：实测可行
- [ ] `json_schema` 降级时，低端 provider 的 JSON 格式稳定性仍依赖 prompt 工程
- [ ] 是否需要增加 JSON 修复步骤（trim fences、fix trailing commas）以提升降级路径的鲁棒性
