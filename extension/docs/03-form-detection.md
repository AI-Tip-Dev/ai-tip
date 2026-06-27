# 03 — Extension 表单检测设计

> **创建**: 2026-06-27 · **状态**: 📝 草案
> **关联**: [01 — 架构总览](./01-browser-extension-architecture.md) · [05 — Desktop 表单检测](../desktop/docs/05-form-detection-design.md)
> **场景**: Extension 在 Content Script 中直接扫描 DOM，提取表单字段元数据，无需 CDP

---

## 📋 文档导航

> - [一句话概述](#一句话概述) · [与 Desktop 的差异](#与-desktop-的差异) · [检测流程](#检测流程)
> - [字段选择器](#字段选择器) · [标签推断](#标签推断) · [敏感字段过滤](#敏感字段过滤)
> - [AI Tip 按钮注入](#ai-tip-按钮注入) · [字段回填](#字段回填) · [@ai-tip/form-detection 复用](#ai-tipform-detection-复用)

---

## 一句话概述

> 🎯 **Extension 的表单检测运行在 Content Script 的 Isolated World 中，通过 `querySelectorAll` 扫描可填充字段，结合 DOM 遍历推断 label，产生与 Desktop CDP 相同格式的 `SimpleField[]` 输出。核心逻辑抽取为 `@ai-tip/form-detection` 供 Desktop（可选）和 Extension 共享。**

---

## 与 Desktop 的差异

| 维度 | Desktop (CDP) | Extension (DOM) |
|------|--------------|----------------|
| **数据源** | `Accessibility.getAXTree` (CDP) | `document.querySelectorAll` |
| **执行位置** | Main Process → CDP session | Content Script (Isolated World) |
| **准确度** | 高（AX Tree 含语义角色） | 中高（需推断 label、role） |
| **性能** | CDP 协议往返 ~10-50ms | DOM 遍历 ~1-5ms |
| **跨域 iframe** | ✅ CDP 可访问 | ❌ Content Script 无法访问 |
| **Shadow DOM** | ✅ AX Tree 可穿透 | ⚠️ 需递归遍历 shadowRoot |
| **动态表单** | 每次重新检测 | 可结合 MutationObserver |
| **权限需求** | 无（Electron 内置） | 无（Content Script 默认 DOM 访问） |
| **CDP 备选** | — | `chrome.debugger` (optional_permission) |

---

## 检测流程

```
Content Script 注入 (document_idle)
         │
         ▼
① DOM 扫描 ──────────────────────────────────────────────
   │
   │  querySelectorAll(FIELD_SELECTOR)
   │  → 收集所有 <input>, <textarea>, <select>,
   │    [contenteditable], [role="textbox"], ...
   │
   ▼
② 字段过滤 ──────────────────────────────────────────────
   │
   │  排除: type="hidden" | "submit" | "button" | "reset" | "image"
   │  排除: disabled / readonly
   │  排除: 敏感字段 (password, credit card, SSN)
   │  排除: 不可见元素 (display:none, visibility:hidden)
   │
   ▼
③ 标签推断 ──────────────────────────────────────────────
   │
   │  每个 field 执行:
   │  ├─ <label for="fieldId"> → 取 label textContent
   │  ├─ 父级 <label> 包裹 → 取 label textContent
   │  ├─ aria-label / aria-labelledby
   │  ├─ 前一个兄弟元素的文本
   │  ├─ placeholder 作为 fallback
   │  └─ name 属性作为最终 fallback
   │
   ▼
④ 上下文丰富 ────────────────────────────────────────────
   │
   │  ├─ formPurpose: 推断表单用途 (login/signup/search/...)
   │  ├─ siblingLabels: 同表单内其他字段的 label
   │  ├─ pageTitle: document.title
   │  └─ pageUrl: window.location.href
   │
   ▼
⑤ 输出: SimpleField[] (与 SDK 类型一致)
   │
   ▼
⑥ (可选) 构建 AX Tree 文本 → 给 LLM 理解页面结构
```

### 输出类型

```typescript
// 与 @ai-tip/sdk 中的 SimpleField 完全一致
interface SimpleField {
  name: string           // name 属性或生成的唯一 ID
  type: string           // input type 或 tagName
  label: string          // 推断的标签文本
  placeholder: string    // placeholder 属性
  value: string          // 当前值 (仅元数据，不上报)
  tagName: string        // 'INPUT' | 'TEXTAREA' | 'SELECT'
  selector: string       // 唯一 CSS selector (用于回填定位)
  rect: {                // 边界框 (用于按钮定位)
    top: number
    left: number
    width: number
    height: number
  }
}
```

---

## 字段选择器

```typescript
const FIELD_SELECTOR = [
  // 标准表单元素
  'input:not([type="hidden"]):not([type="submit"]):not([type="button"])' +
    ':not([type="reset"]):not([type="image"])',
  'textarea',
  'select',

  // 富文本
  '[contenteditable="true"]',

  // ARIA roles (无标准标签的自定义组件)
  '[role="textbox"]',
  '[role="combobox"]',
  '[role="spinbutton"]',
  '[role="searchbox"]',
  '[role="listbox"]',

  // 常见组件库的输入类 (CodeMirror, Monaco, etc.)
  '.CodeMirror',
  '.monaco-editor',
].join(',')
```

### Shadow DOM 穿透

```typescript
function querySelectorAllDeep(selector: string): Element[] {
  const results: Element[] = []

  function traverse(root: Document | Element | ShadowRoot) {
    results.push(...root.querySelectorAll(selector))
    // 递归进入 shadow roots
    const all = root.querySelectorAll('*')
    for (const el of all) {
      if (el.shadowRoot) traverse(el.shadowRoot)
    }
    // 递归进入 iframe (同源)
    if (root instanceof HTMLIFrameElement) {
      try { traverse(root.contentDocument!) } catch { /* cross-origin */ }
    }
  }

  traverse(document)
  return results
}
```

---

## 标签推断

### 优先级链

```
1. aria-label          → 最高优先级（显式无障碍标注）
2. aria-labelledby     → 引用的元素文本
3. <label for="id">    → HTML 标准关联
4. 父级 <label> 包裹    → <label>文字<input></label>
5. 前一个兄弟元素文本    → <span>姓名</span><input>
6. placeholder          → 仅作 fallback
7. name 属性            → 最终 fallback
```

### 实现

```typescript
function inferLabel(el: Element): string {
  const input = el as HTMLInputElement

  // 1. aria-label
  const ariaLabel = el.getAttribute('aria-label')
  if (ariaLabel?.trim()) return ariaLabel.trim()

  // 2. aria-labelledby
  const labelledBy = el.getAttribute('aria-labelledby')
  if (labelledBy) {
    const labelEl = document.getElementById(labelledBy)
    if (labelEl?.textContent?.trim()) return labelEl.textContent.trim()
  }

  // 3. <label for="id">
  if (input.id) {
    const label = document.querySelector(`label[for="${CSS.escape(input.id)}"]`)
    if (label?.textContent?.trim()) return label.textContent.trim()
  }

  // 4. 父级 <label>
  const parentLabel = el.closest('label')
  if (parentLabel?.textContent?.trim()) return parentLabel.textContent.trim()

  // 5. 前一个兄弟元素
  const prev = el.previousElementSibling
  if (prev?.textContent?.trim() && prev.textContent.length < 100) {
    return prev.textContent.trim()
  }

  // 6. placeholder
  if (input.placeholder?.trim()) return input.placeholder.trim()

  // 7. name
  return input.name || ''
}
```

---

## 敏感字段过滤

```typescript
const SENSITIVE_PATTERNS = /password|passwd|pwd|credit|card|cvv|ssn|social.security|secret|token|pin/i

function isSensitiveField(el: Element): boolean {
  const input = el as HTMLInputElement

  // type="password" — 永远不检测
  if (input.type === 'password') return true

  // name/id/placeholder/aria-label 匹配敏感模式
  const attrs = [
    input.name, input.id, input.placeholder,
    input.getAttribute('aria-label'),
  ]
  return attrs.some(a => a && SENSITIVE_PATTERNS.test(a))
}
```

> ⚠️ 敏感字段仍然可以被 AI Tip 按钮标记（用户可能想手动触发），但不会被自动检测和填充。

---

## AI Tip 按钮注入

### 策略

与 Desktop 的 IIFE bundle (`auto.ts`) 不同，Extension 的按钮注入**直接在 Content Script 中实现**，不需要向 MAIN world 注入 `<script>` 标签：

| 方式 | Desktop | Extension |
|------|---------|-----------|
| **执行位置** | webview MAIN world (IIFE `<script>` 注入) | Content Script ISOLATED world |
| **DOM 访问** | 完整 DOM 权限 | 完整 DOM 权限（影子 DOM，事件不能冒泡到 MAIN world） |
| **事件监听** | 页面原生事件 | ISOLATED world 事件（不能直接监听页面 JS 事件） |
| **通信** | `window.__bridge__.sendToHost()` | `chrome.runtime.sendMessage()` |

### 按钮注入实现

```typescript
// content-script/src/button-inject.ts
interface ButtonState {
  el: HTMLDivElement
  field: Element
  state: 'idle' | 'loading' | 'hidden'
}

const buttons = new Map<Element, ButtonState>()

function createButton(field: Element, rect: DOMRect): HTMLDivElement {
  const btn = document.createElement('div')
  btn.className = '__ai-tip-btn'
  btn.innerHTML = SVG_ICON // inline SVG
  Object.assign(btn.style, {
    position: 'fixed',
    top: `${rect.top + rect.height / 2 - 14}px`,
    left: `${rect.right + 8}px`,
    width: '28px',
    height: '28px',
    zIndex: '2147483647',
    cursor: 'pointer',
    /* ...更多样式 */
  })
  return btn
}

function injectButtons() {
  const fields = querySelectorAllDeep(FIELD_SELECTOR)
  for (const field of fields) {
    if (buttons.has(field)) continue
    if (isSensitiveField(field)) continue
    if (!isVisible(field)) continue

    const rect = field.getBoundingClientRect()
    const btn = createButton(field, rect)
    document.body.appendChild(btn)

    // 点击按钮 → 发送 field-selected 事件
    btn.addEventListener('click', () => {
      const ctx = buildFieldContext(field)
      chrome.runtime.sendMessage({
        method: 'ai-tip:field-selected',
        args: [ctx]
      })
    })

    buttons.set(field, { el: btn, field, state: 'idle' })
  }
}

// 监听 DOM 变化（SPA 路由切换、动态表单）
const observer = new MutationObserver(() => {
  // debounce 200ms
  clearTimeout(injectTimer)
  injectTimer = setTimeout(injectButtons, 200)
})
observer.observe(document.body, { childList: true, subtree: true })
```

### 复用 Desktop auto.ts 逻辑

`auto.ts` 中的部分逻辑可以复用：
- **按钮样式常量**：`BTN_SIZE`, `FADE_DURATION`, `HIDE_DELAY` → 抽取为 `@ai-tip/form-detection` 的常量
- **`SENSITIVE_PATTERNS`**：敏感字段正则 → 抽取为共享常量
- **`FIELD_SELECTOR`**：字段选择器 → 抽取为共享常量
- **`fillField()` 逻辑**：value setter + Event dispatch → 抽取为 `@ai-tip/form-detection`

---

## 字段回填

### 框架兼容策略

React/Vue/Angular 等框架在内部维护虚拟 DOM → 真实 DOM 的映射。直接设置 `input.value = 'xxx'` 不会被框架感知，需要触发原生事件：

```typescript
// @ai-tip/form-detection/src/field-fill.ts
export function fillField(el: Element, value: string): FillResult {
  try {
    const input = el as HTMLInputElement

    // 1. 获取原生 setter（绕过 React 的 __reactFiber 等）
    const nativeSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype, 'value'
    )?.set
    if (nativeSetter) {
      nativeSetter.call(input, value)
    } else {
      input.value = value
    }

    // 2. 触发事件（让框架感知变更）
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))

    // 3. 特殊处理: contenteditable
    if (el.getAttribute('contenteditable') === 'true') {
      el.textContent = value
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }

    // 4. 特殊处理: select
    if (el.tagName === 'SELECT') {
      const option = Array.from((el as HTMLSelectElement).options)
        .find(o => o.value === value || o.text === value)
      if (option) {
        (el as HTMLSelectElement).value = option.value
        el.dispatchEvent(new Event('change', { bubbles: true }))
      }
    }

    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      reason: 'fill-error',
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}
```

### 为什么不用 CDP 回填？

- Desktop 用 CDP `DOM.setAttributeValue` + `Input.dispatchKeyEvent` 回填是最可靠的（框架无关）
- Extension 的 `chrome.debugger` 可以做到同样效果，但需要额外权限
- **推荐**：默认用 DOM 回填（覆盖 90% 场景），CDP 回填作为 fallback

---

## `@ai-tip/form-detection` 复用

### 包定位

```
@ai-tip/form-detection/          # npm 包
├── src/
│   ├── index.ts                 # 公开导出
│   ├── types.ts                 # SimpleField, FillResult, FieldContext
│   ├── constants.ts             # FIELD_SELECTOR, SENSITIVE_PATTERNS
│   ├── dom-scan.ts              # querySelectorAllDeep, detectFields()
│   ├── label-infer.ts           # inferLabel() 标签推断
│   ├── field-fill.ts            # fillField() 回填
│   ├── visibility.ts            # isVisible(), getRect()
│   └── ax-tree.ts               # buildAXTreeText() — 共享逻辑
└── __tests__/
```

### Desktop 和 Extension 的使用

```typescript
// Desktop (可选：替代部分 CDP 逻辑，或用于 webview fallback)
import { detectFields, fillField } from '@ai-tip/form-detection'
// 在 webview preload 中使用

// Extension (主要用户)
import { detectFields, fillField, FIELD_SELECTOR } from '@ai-tip/form-detection'
// 在 content-script 中使用
```

**Desktop 保留 CDP 作为主路径**——CDP 更准确（包含 AX roles、iframe 穿透、Shadow DOM 穿透），`@ai-tip/form-detection` 仅在 webview preload 需要轻量 DOM 检测时作备选。

---

## 参考资源

| 资源 | 链接 |
|------|------|
| ARIA Authoring Practices | `w3.org/WAI/ARIA/apg/patterns` |
| React Synthetic Events | `reactjs.org/docs/events.html` |
| Chrome Debugger API (CDP) | `developer.chrome.com/docs/extensions/reference/debugger` |
| Desktop CDP 表单检测设计 | `../desktop/docs/05-form-detection-design.md` |
| SDK auto.ts (IIFE bundle) | `sdk/src/auto.ts` |

---

> **下一步**: [04 — npm 包设计](./04-npm-packages-design.md)
