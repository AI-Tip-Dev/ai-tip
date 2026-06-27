# 06 — 三 Repo 架构审视与风险评估

> **创建**: 2026-06-27 · **状态**: 📝 草案
> **关联**: [01 — Extension 架构](./01-browser-extension-architecture.md) · [14 — 三 Repo 架构](../desktop/docs/14-electron-js-sdk-architecture.md) · [04 — npm 包设计](./04-npm-packages-design.md)
> **场景**: 对当前 SDK + Desktop + Extension 三 Repo 架构进行批判性审视，识别风险与改进点

---

## 📋 文档导航

> - [审视方法](#审视方法) · [架构优点](#架构优点) · [已识别问题](#已识别问题)
> - [风险评估矩阵](#风险评估矩阵) · [改进建议](#改进建议) · [决策记录](#决策记录)

---

## 审视方法

从 4 个维度审视当前架构：

1. **类型安全**：跨仓库的类型一致性是否可靠？
2. **可维护性**：修改一个 API 需要改几个仓库？
3. **可测试性**：各层级能否独立测试？
4. **扩展性**：新增一个环境（如 VS Code Extension）的成本？

---

## 架构优点

| 优点 | 说明 |
|------|------|
| ✅ **Transport 抽象** | SDK 不感知底层通信细节，Electron/Extension 通过统一 `Transport` 接口接入 |
| ✅ **类型契约** | SDK 是类型真相源，Desktop/Extension 通过 `devDependencies` 引用，编译时校验 |
| ✅ **Repository 隔离** | 三个仓库独立构建/发布/版本管理，互不阻塞 |
| ✅ **环境检测透明** | `createBridge()` 一行代码自动适配，SaaS 零感知 |
| ✅ **npm 包复用** | 4 个共享包覆盖 LLM、表单、UI、可观测性 |

---

## 已识别问题

### 问题 1: SDK 的 12 个 API 域过于"大而全"

**现状**：`BridgeAPI` 定义了 12 个 API 域，包括 `webview`（仅 Desktop）。Extension 无法实现全部。

```typescript
// 当前 BridgeAPI (sdk/src/types.ts)
interface BridgeAPI {
  aiTip: AITipAPI
  formDetect: FormDetectAPI
  pageSummary: PageSummaryAPI
  batchFill: BatchFillAPI
  llm: LLMAPI
  modelConfig: ModelConfigAPI
  session: SessionAPI
  webview: WebviewAPI          // ← Extension 无法实现
  trace: TraceAPI
  i18n: I18nAPI
  history: HistoryAPI
  settings: SettingsAPI
}
```

**风险**：Extension 对所有 `webview.*` 方法返回 `NOT_SUPPORTED`，SaaS 代码需要判断返回值。SDK 的 TypeScript 类型不区分环境能力。

**严重度**: 🟡 中等

**建议方案 A**：引入 capability 机制（已在 `BridgeMeta.capabilities` 中有预留）

```typescript
interface BridgeMeta {
  version: string
  env: BridgeEnv
  capabilities: string[]     // ['ai-tip', 'form-detect', 'llm', ...]
  unsupportedAPIs?: string[] // ['webview'] — 显式声明不支持
}

// SDK 提供能力检查
bridge.meta.capabilities.includes('webview')  // → false in Extension
```

**建议方案 B**：拆分 `BridgeAPI` 为 Core + Extensions

```typescript
interface CoreBridgeAPI {
  aiTip: AITipAPI
  llm: LLMAPI
  modelConfig: ModelConfigAPI
  settings: SettingsAPI
  i18n: I18nAPI
  trace: TraceAPI
}

interface DesktopBridgeAPI extends CoreBridgeAPI {
  webview: WebviewAPI
  formDetect: FormDetectAPI       // CDP 版本
}

interface ExtensionBridgeAPI extends CoreBridgeAPI {
  formDetect: FormDetectAPI       // DOM 版本
}
```

**推荐**：方案 A（capability）+ 方案 B 作为长期演进方向。当前阶段方案 A 足够。

---

### 问题 2: `auto.ts` (IIFE) 与 Content Script 职责重叠

**现状**：
- Desktop：`auto.ts` IIFE 注入到 webview MAIN world → 按钮 + 字段交互 + `sendToHost` 通信
- Extension：Content Script 直接在 ISOLATED world 操作 DOM → 按钮 + 字段交互

**问题**：两套按钮注入逻辑独立维护。`auto.ts` 使用 `window.__bridge__.sendToHost()`，Content Script 使用 `chrome.runtime.sendMessage()`。

**严重度**: 🟡 中等

**建议**：
1. 抽取 `@ai-tip/form-detection` 后，`auto.ts` 和 Content Script 都 import 该包
2. 按钮渲染 + 样式 + 动画逻辑也抽取到 `@ai-tip/form-detection`
3. 仅通信层（`sendToHost` vs `chrome.runtime.sendMessage`）保留在各自端

```
@ai-tip/form-detection (共享):
  ├── FIELD_SELECTOR, SENSITIVE_PATTERNS
  ├── inferLabel(), fillField(), detectFields()
  └── createAITipButton(el, rect) → HTMLDivElement  ← 🔨 新增

auto.ts (Desktop):
  import { createAITipButton, fillField } from '@ai-tip/form-detection'
  // 仅负责: sendToHost 通信 + 生命周期

content-script/button-inject.ts (Extension):
  import { createAITipButton, fillField } from '@ai-tip/form-detection'
  // 仅负责: chrome.runtime.sendMessage 通信 + MO 监听
```

---

### 问题 3: 表单检测两条路径差异过大

**现状**：
- Desktop: CDP `Accessibility.getAXTree` → `RawAXNode[]` → `SimpleField[]`（在 Main Process 执行）
- Extension: DOM `querySelectorAll` → `SimpleField[]`（在 Content Script 执行）

**问题**：两条路径的检测结果可能不一致。CDP 能捕获 Shadow DOM 和跨域 iframe，DOM 不能。`@ai-tip/form-detection` 只覆盖 DOM 路径。

**严重度**: 🟢 低（CDP 天然优于 DOM，差异可接受）

**建议**：
- `SimpleField[]` 输出格式保持一致（已由 SDK 类型保证）
- `@ai-tip/form-detection` 提供 DOM 扫描
- Desktop CDP 路径保存在 `desktop/src/main/`（不抽取）
- Extension CDP 路径通过 `chrome.debugger` 可选启用

---

### 问题 4: Service Worker 非持久性带来的状态管理复杂度

**现状**：Background SW 可能在 30 秒无活动后被终止。所有内存状态丢失。

**影响**：
- 流式 LLM 连接：必须通过 `chrome.runtime.connect` port 保活
- 模型配置读写：必须全量持久化到 `chrome.storage.local`
- 路由表：每次 SW 启动需要重新注册 handler

**严重度**: 🟡 中等

**建议**：
- 流式连接用 port，非流式用 `sendMessage`
- 所有状态（模型配置、会话、追踪、历史）全量 `chrome.storage.local`
- SW 启动时从 storage 恢复（`chrome.runtime.onStartup`）
- 对频繁读的数据（如模型配置），在 SW 内部加一层内存缓存（SW 生命周期内有效）

---

### 问题 5: npm 包数量膨胀风险

**问题**：计划创建 3 个 npm 包（llm-providers / form-detection / observability）+ 现有 sdk = 4 个包。

**问题**：
- 版本依赖地狱：sdk v2 不兼容 llm-providers v1
- 发布流程复杂：改一个 bug 可能要发 3 个包
- 开发者认知负担：5 个包的文档需要分别维护

**严重度**: 🟡 中等

**建议**：
- 各包之间**零运行时依赖**（不互相 import）
- 仅在 devDependencies 中引用 SDK 的类型
- 版本号不强制同步，用 semver range 声明兼容性
- 用 Changesets 管理多包发布
- 提供 umbrella package `@ai-tip/all`（一次性安装所有包）

```json
// @ai-tip/all/package.json
{
  "name": "@ai-tip/all",
  "dependencies": {
    "@ai-tip/sdk": "^0.1.0",
    "@ai-tip/llm-providers": "^0.1.0",
    "@ai-tip/form-detection": "^0.1.0",
    "@ai-tip/observability": "^0.1.0"
  }
}
```

---

### 问题 6: 缺少集成测试层

**现状**：三个仓库独立测试，没有跨仓库的集成测试。

**问题**：SDK + Extension 的 `postMessage` 握手、调用-响应、事件推送只能在手动测试中验证。

**严重度**: 🟡 中等

**建议**：
- 在 `extension/` 仓库中增加 E2E 测试（用 Playwright + Chrome Extension 测试框架）
- 测试 `pingExtension()` → `invoke()` → `onEvent()` 全链路
- 详见 `desktop/docs/07-e2e-test-design.md` 的参考模式

---

## 风险评估矩阵

| 风险 | 严重度 | 可能性 | 影响 | 缓解措施 |
|------|:------:|:-----:|------|---------|
| SDK API 变更需同步 3 个仓库 | 🟡 中 | 高 | 类型不匹配，编译报错 | SDK types 是真相源，devDependency 引用 |
| SW 终止导致流式连接断开 | 🟡 中 | 中 | 用户看到"连接断开" | port 保活 + 自动重连 |
| postMessage origin 未校验 | 🔴 高 | 低 | 恶意页面伪造消息 | Content Script 严格校验 origin |
| npm 包版本不兼容 | 🟡 中 | 低 | 运行时错误 | 零跨包依赖 + semver range |
| Chrome Web Store 审核不通过 | 🟡 中 | 低 | 无法发布 | 最小权限 + 隐私说明 + host_permission 合理 |
| Desktop 和 Extension 检测结果不一致 | 🟢 低 | 中 | 用户体验不一致 | `SimpleField[]` 格式一致，由 SDK 保证 |

---

## 改进建议

### 短期（Phase 1-2）

1. ✅ 实现 `BridgeMeta.capabilities` 检查
2. ✅ Content Script 严格校验 `postMessage` origin
3. ⏳ 抽取 `@ai-tip/llm-providers`

### 中期（Phase 3-4）

4. ⏳ 抽取 `@ai-tip/form-detection` + `@ai-tip/observability`
5. ⏳ `auto.ts` 和 Content Script 共享按钮注入逻辑
6. ⏳ 添加 E2E 测试

### 长期（Phase 5+）

7. 拆分 `BridgeAPI` 为 Core + 平台扩展
8. 考虑 VS Code Extension 作为第三环境

---

## 决策记录

| # | 决策 | 理由 | 日期 |
|---|------|------|------|
| 1 | SDK 保持 12 个 API 域不变 | Extension 对不支持的 API 返回 `NOT_SUPPORTED`，由 capability 标记 | 2026-06-27 |
| 2 | `@ai-tip/observability` 可行且建议实施 | 核心模型 70% 可复用，存储/导出通过接口适配 | 2026-06-27 |
| 3 | 全部包统一在 pnpm monorepo (`ai-tip/ai-tip`)，用 `workspace:*` 协议引用 | 原子提交、一次 clone、`changesets` 管理版本 | 2026-06-27 |
| 4 | Side Panel > Popup | 可以保持打开，适合 Chat 交互 | 2026-06-27 |
| 5 | `@ai-tip/i18n-locales` 暂缓 | 复用度不如其他 4 个包高（仅 locale 文件），可后续评估 | 2026-06-27 |

---

## 参考资源

| 资源 | 链接 |
|------|------|
| Desktop 三 Repo 架构 | `../desktop/docs/14-electron-js-sdk-architecture.md` |
| Desktop 系统架构 | `../desktop/docs/02-system-architecture.md` |
| SDK 设计 | `../sdk/docs/01-sdk-ai-tip-split-design.md` |
| Changesets | `github.com/changesets/changesets` |
