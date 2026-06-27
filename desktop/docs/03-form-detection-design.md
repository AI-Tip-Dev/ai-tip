# 05 — 表单检测与智能填充设计

> **创建**: 2026-06-25（合并 Snapshot 简化方案 + 表单填充安全分析）
> **关联**: [01 产品规格](./01-product-spec.md) · [02 系统架构](./02-system-architecture.md) · [06 开发计划](./06-development-plan.md)
> **状态**: ✅ 简化方案已实施，逐字模拟填充已实施

---

## 目录

1. [架构决策：简化的 Snapshot 方案](#1-架构决策简化的-snapshot-方案)
2. [数据流设计](#2-数据流设计)
3. [字段检测实现](#3-字段检测实现)
4. [表单填充安全方案](#4-表单填充安全方案)
5. [三级回退策略](#5-三级回退策略)
6. [类型定义](#6-类型定义)

---

## 1. 架构决策：简化的 Snapshot 方案

### 1.1 废弃的方案

早期设计（`phase2-research.md`）提出了完整的 Snapshot + 可访问性树 + AI 分析管线：

```
WebView DOM → executeJavaScript(~400行) → Main Process 缓存 → IPC → Sidebar
```

**废弃原因**：过度工程化。引入了 PageSnapshot、A11yNode、AIAnalysisResult 等大量当前阶段不需要的类型和 IPC 通道，只是为了"展示页面有哪些表单字段"。

### 1.2 采用的方案

**直接在 WebView Preload 中检测，通过 `sendToHost` 直连 Sidebar，Main Process 不参与。**

```
webview-preload.ts (运行在 WebView 内部)
    │ 直接访问: document.querySelectorAll('input, select, textarea')
    │ 直接通信: ipcRenderer.sendToHost('form:fields-detected', { fields })
    │
    ▼ 零跳转
宿主 Renderer (Sidebar)
    │ webview.addEventListener('ipc-message', handler)
    ▼
Sidebar.vue 直接拿到字段列表
```

**为什么不需要 IPC？** WebView 的 preload 脚本本身就运行在 WebView 的渲染进程里，有完整的 DOM 访问权限。表单检测是纯粹的前端操作：DOM 在 WebView 里，UI 在 Sidebar 里，两者在同一个 Electron 窗口的不同区域，可以通过 `sendToHost` 直接通信。

### 1.3 简化收益

| 指标 | 旧方案 | 新方案 |
|------|:-----:|:-----:|
| 涉及文件 | 6 个 | 2 个 |
| 类型定义 | ~120 行 | ~15 行 |
| IPC 通道 | 4 个 | 0 个 |
| Main Process 参与 | ✅ 是 | ❌ 否 |
| 代码总行数 | ~700 行 | ~150 行 |

---

## 2. 数据流设计

```
┌─────────────────────────────────────────────────────┐
│                   WebView (独立进程)                  │
│                                                     │
│  webview-preload.ts                                 │
│  ┌─────────────────────────────────────────────┐    │
│  │ DOMContentLoaded                             │    │
│  │   ├── querySelectorAll('input, select, ...') │    │
│  │   ├── 提取 label/placeholder/aria            │    │
│  │   └── sendToHost('form:fields-detected')     │    │
│  └─────────────────────────────────────────────┘    │
│                         │                           │
└─────────────────────────┼───────────────────────────┘
                          │ sendToHost
                          ▼
┌─────────────────────────────────────────────────────┐
│                Sidebar Renderer                      │
│                                                     │
│  Sidebar.vue                                        │
│  ┌─────────────────────────────────────────────┐    │
│  │ webview.addEventListener('ipc-message')      │    │
│  │   → detectedFields.value = fields            │    │
│  │   → DetectedFieldsPanel 展示字段列表          │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## 3. 字段检测实现

### 3.1 核心检测逻辑

```typescript
// webview-preload.ts
document.addEventListener('DOMContentLoaded', () => {
  detectAndSendFields()
})

function detectAndSendFields(): void {
  const fields: SimpleField[] = []

  document.querySelectorAll(
    'input:not([type="hidden"]), select, textarea, [contenteditable="true"]'
  ).forEach((el) => {
    const input = el as HTMLInputElement
    fields.push({
      tagName: el.tagName.toLowerCase(),
      type: input.type || 'text',
      name: input.name || '',
      id: el.id || '',
      placeholder: input.placeholder || '',
      label: getLabel(el),
      required: input.required,
      value: input.value || '',
      disabled: input.disabled,
      readonly: input.readOnly,
      visible: isElementVisible(el),
    })
  })

  ipcRenderer.sendToHost('form:fields-detected', {
    url: window.location.href,
    title: document.title,
    fields,
  })
}
```

### 3.2 Label 提取策略

```typescript
function getLabel(el: Element): string {
  // 1. aria-label
  const aria = el.getAttribute('aria-label')
  if (aria) return aria

  // 2. <label for="id">
  if (el.id) {
    const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`)
    if (lbl) return lbl.textContent?.trim() || ''
  }

  // 3. 包裹的 <label>
  const parentLabel = el.closest('label')
  if (parentLabel) {
    const clone = parentLabel.cloneNode(true) as HTMLElement
    clone.querySelectorAll('input, select, textarea').forEach(c => c.remove())
    return clone.textContent?.trim() || ''
  }

  // 4. placeholder
  return (el as HTMLInputElement).placeholder || ''
}
```

---

## 4. 表单填充安全方案

### 4.1 直接 `el.value = "xxx"` 的问题

现代前端框架（React/Vue/Angular）会拦截原生 DOM 操作：

```
原生 DOM value  ──→  "张三科技"  ✅ 看起来填上了
React state     ──→  ""          ❌ 组件状态没变
提交时读的是   ──→  state        ❌ 提交了空值！
```

| 问题 | 影响 |
|------|------|
| React/Vue 拦截 value setter | 框架 state 不更新，提交空值 |
| 事件未触发（input/change/blur） | 验证器不执行，提交按钮仍 disabled |
| Shadow DOM | 外层 querySelector 找不到内部 `<input>` |
| 反自动化检测 | `isTrusted` 检查、键盘事件序列 |

### 4.2 推荐方案：逐字模拟用户输入

核心思路：**不直接设值，而是模拟人类打字过程。**

```typescript
async function fillField(selector: string, value: string) {
  const el = document.querySelector(selector) as HTMLInputElement
  if (!el) return { success: false, error: 'element not found' }

  // 1. 聚焦元素
  el.focus()
  el.dispatchEvent(new FocusEvent('focus', { bubbles: true }))

  // 2. 获取原生 value setter（绕过 React 拦截）
  const nativeSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype, 'value'
  )?.set

  // 3. 清空现有值
  if (nativeSetter) nativeSetter.call(el, '')

  // 4. 逐字符输入，每个字符触发 InputEvent
  for (const char of value) {
    if (nativeSetter) {
      nativeSetter.call(el, el.value + char)
    } else {
      el.value = el.value + char
    }

    el.dispatchEvent(new InputEvent('input', {
      bubbles: true, cancelable: true,
      data: char, inputType: 'insertText',
    }))

    // 人类化延迟 30-80ms
    await new Promise(r => setTimeout(r, 30 + Math.random() * 50))
  }

  // 5. 触发 change 和 blur
  el.dispatchEvent(new Event('change', { bubbles: true }))
  el.dispatchEvent(new FocusEvent('blur', { bubbles: true }))

  return { success: true }
}
```

### 4.3 为什么这个方案更好

| 特性 | 说明 |
|------|------|
| **React 兼容** | 用 `Object.getOwnPropertyDescriptor` 拿原生 setter，绕过框架拦截 |
| **事件完整** | 每字符触发 `InputEvent`，受控组件正确更新 state |
| **验证触发** | `change` 和 `blur` 事件触发验证逻辑 |
| **像真人** | 事件指纹完整，30-80ms 随机间隔 |

### 4.4 方案对比

| 方案 | React/Vue兼容 | 反检测 | 复杂度 | 推荐场景 |
|------|:---:|:---:|:---:|------|
| A. 原生 setter + 事件模拟 | ⭐⭐⭐ | ⭐⭐ | 中 | 一般网站 |
| B. CDP Input.dispatchKeyEvent | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 高 | 高安全网站 |
| C. 框架内部 API 注入 | ⭐⭐⭐⭐⭐ | ⭐ | 高 | 特定框架 |
| **D. 逐字模拟（推荐）** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 中 | **首选** |

---

## 5. 三级回退策略

```
Level 1: 逐字模拟输入（覆盖 90% 场景）
   ├── 原生 setter + InputEvent + change
   ├── 30-80ms 随机延迟
   └── Shadow DOM 递归穿透
   ↓ 失败

Level 2: 原生 setter + 全事件触发（兜底）
   ├── 直接设值
   ├── 批量触发 input/change/blur
   └── 尝试访问 React Fiber / Vue __vue_app__ 更新内部 state
   ↓ 失败

Level 3: 降级通知
   ├── 标记该字段为"需手动填写"
   ├── 将候选值复制到剪贴板
   └── 引导用户手动粘贴
```

---

## 6. 类型定义

```typescript
// src/shared/ipc-types.ts

/** 简化后的字段描述 — 直接从 DOM 提取 */
export interface SimpleField {
  tagName: string       // 'input' | 'select' | 'textarea'
  type: string          // 'text' | 'email' | 'checkbox' | 'radio' | ...
  name: string          // input.name
  id: string            // element id
  placeholder: string   // placeholder 文本
  label: string         // 就近提取的 label 文本
  required: boolean
  value: string         // 当前值
  disabled: boolean
  readonly: boolean
  visible: boolean      // 元素是否可见
}

/** 字段检测结果 — 由 webview-preload 通过 sendToHost 发送 */
export interface FieldsDetectedPayload {
  url: string
  title: string
  fields: SimpleField[]
}

/** 字段填充结果 */
export interface FillResult {
  success: boolean
  selector: string
  error?: string
  level: 1 | 2 | 3    // 使用的回退级别
}
```
