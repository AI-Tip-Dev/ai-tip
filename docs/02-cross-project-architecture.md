# 14 — 三 Repo 架构：SaaS × Desktop × Extension × SDK

> **创建**: 2026-06-27 · **更新**: 2026-06-27 · **状态**: ✅ 已定稿
> **关联**: [02 系统架构](./02-system-architecture.md) · [15 目录结构](./15-directory-structure-design.md)
> **场景**: SaaS 嵌入 Desktop / 浏览器插件，不允许 inject script，通过 SDK 统一调用原生能力

---

## 📋 文档导航

> - [背景与约束](#背景与约束) · [整体架构](#整体架构) · [三 Repo 职责](#三-repo-职责)
> - [通信协议](#通信协议) · [类型契约](#类型契约) · [版本兼容](#版本兼容)
> - [安全模型](#安全模型) · [降级策略](#降级策略) · [开放问题](#开放问题)

---

## 一句话概述

> 🎯 **三个独立仓库——`sdk`（npm 包，定义 API 契约）、`desktop`（桌面 Shell，实现 Native 能力）、`extension`（浏览器插件，实现浏览器能力）——通过 `window.__bridge__` 协议通信，SaaS 只需 `npm install @ai-tip/sdk` 一行 import 适配所有环境。**

---

## 背景与约束

### 安全约束

| 约束 | 说明 |
|------|------|
| **不允许 inject script** | 不能向 SaaS 页面动态注入 `<script>` 标签、`executeJavaScript()`、`eval` |
| **允许 preload** | preload + `contextBridge` 是 Electron 壳的固定基础设施，不被视为注入 |
| **允许浏览器插件** | SaaS 用户在浏览器中安装 Extension，通过 `postMessage` 通信 |
| **JS 调用 Native** | SaaS 前端需调用原生能力（文件读写、系统通知、剪贴板、本地数据库等） |

### 如果 preload 被禁止？

如果 SaaS 安全团队将 preload 视为 "inject script"，回退到[自定义协议方案](#降级方案)。

---

## 整体架构

```
                        ┌──────────────────────┐
                        │     SaaS 前端          │
                        │                        │
                        │  npm install @ai-tip/  │
                        │             sdk        │
                        │                        │
                        │  import { createBridge }│
                        │       from '@ai-tip/   │
                        │            sdk'        │
                        │                        │
                        │  const bridge =        │
                        │    await createBridge()│
                        │                        │
                        │  await bridge.fs       │
                        │    .readFile('/path')  │
                        └──────────┬─────────────┘
                                   │ 同一行代码
                    ┌──────────────┼──────────────┐
                    │              │              │
                    ▼              ▼              ▼
           ┌────────────┐ ┌────────────┐ ┌────────────┐
           │  Electron   │ │  Browser   │ │  纯浏览器   │
           │  环境        │ │  Extension │ │  (降级)     │
           │             │ │  环境       │ │            │
           │ preload 暴露 │ │ content    │ │ 抛出明确    │
           │ window.     │ │ script     │ │ 错误提示    │
           │ __bridge__  │ │ postMessage│ │            │
           └──────┬──────┘ └─────┬──────┘ └────────────┘
                  │              │
                  ▼              ▼
        ┌─────────────┐  ┌──────────────┐
        │  repo:      │  │  repo:       │
        │  desktop/   │  │  extension/  │
        │  ipcMain    │  │  background  │
        │  .handle()  │  │  service     │
        │             │  │  worker      │
        │  Node.js    │  │  Chrome      │
        │  fs,        │  │  Extension   │
        │  clipboard, │  │  APIs        │
        │  ...        │  │  storage,    │
        │             │  │  downloads,  │
        │             │  │  ...         │
        └─────────────┘  └──────────────┘
```

---

## 三 Repo 职责

三个仓库**物理独立**，各自有自己的 `package.json`、`tsconfig.json`、CI/CD、版本号。

### Repo 1: `sdk`（npm 包）

**定位**：SaaS 前端的唯一依赖。定义 API 契约。零原生依赖。

```
sdk/
├── package.json          # name: "@ai-tip/sdk", 发布到 npm
├── tsconfig.json
├── src/
│   ├── index.ts          # 公开 API 导出
│   ├── bridge.ts         # createBridge() — 环境检测 + transport 选择
│   ├── types.ts          # 全部公开类型（SaaS 开发者可见）
│   ├── apis/             # 语义化 API 封装
│   │   ├── fs.ts         #   bridge.fs.readFile / writeFile / listDir
│   │   ├── clipboard.ts  #   bridge.clipboard.read / write
│   │   ├── notification.ts
│   │   └── system.ts
│   ├── transports/       # Transport Adapter
│   │   ├── base.ts       #   Transport 接口
│   │   ├── electron.ts   #   读 window.__bridge__（preload 暴露）
│   │   ├── extension.ts  #   postMessage 握手 + chrome.runtime
│   │   └── fallback.ts   #   抛出 BridgeNotAvailableError
│   └── utils/
│       ├── env-detect.ts  #   环境检测
│       └── version.ts    #   版本兼容检查
└── __tests__/
```

| 维度 | 说明 |
|------|------|
| **依赖** | 零外部运行时依赖 |
| **发布到** | npm registry |
| **版本策略** | 独立 semver，跟随 SaaS 需求迭代（周级） |
| **包含** | 类型定义、API 封装、环境检测、transport 选择 |
| **不包含** | Electron API、Node.js API、`chrome.*` API、任何原生实现 |

### Repo 2: `desktop`（桌面应用）

**定位**：Electron 桌面壳。实现 Native 能力的真实逻辑。最终打包为 `.exe` / `.dmg`。

```
desktop/
├── package.json          # private: true, 不发布到 npm
├── electron-vite.config.ts
├── electron-builder.yml
├── src/
│   ├── main/             # Main Process
│   │   ├── index.ts      #   窗口创建、生命周期
│   │   ├── ipc.ts        #   ipcMain.handle() 注册
│   │   ├── bridge/       #   Bridge API 的原生实现
│   │   │   ├── fs.ts     #     Node.js fs.readFile 等
│   │   │   ├── clipboard.ts
│   │   │   ├── notification.ts
│   │   │   └── system.ts
│   │   ├── providers/    #   LLM Provider 适配器
│   │   └── tracing/      #   可观测性
│   ├── preload/           # Preload 脚本
│   │   ├── index.ts      #   contextBridge → window.api / llmApi
│   │   └── bridge.ts     #   contextBridge → window.__bridge__
│   └── renderer/         # Vue 3 Sidebar UI
└── resources/
```

| 维度 | 说明 |
|------|------|
| **依赖** | `electron`, `vue`, `electron-vite`；devDependency: `@ai-tip/sdk`（仅类型引用） |
| **发布到** | GitHub Releases（`.exe` / `.dmg` / `.AppImage`） |
| **版本策略** | 独立 semver，低频更新（月级） |
| **包含** | preload 暴露 `window.__bridge__`、ipcMain 处理、Node.js 原生实现、Vue UI |
| **不包含** | SDK 代码、Extension 代码 |

### Repo 3: `extension`（浏览器插件）

**定位**：Chrome/Edge 浏览器插件。实现浏览器环境的 Bridge 能力。发布到 Chrome Web Store。

```
extension/
├── package.json          # private: true
├── tsconfig.json
├── manifest.json         # Manifest V3
├── src/
│   ├── background.ts     # Service Worker — 执行 chrome.* API
│   ├── content-script.ts # Isolated world — postMessage 桥接
│   └── popup/            # 插件弹窗 UI
└── __tests__/
```

| 维度 | 说明 |
|------|------|
| **依赖** | devDependency: `@ai-tip/sdk`（仅类型引用）；`@types/chrome` |
| **发布到** | Chrome Web Store / Edge Add-ons |
| **版本策略** | 独立 semver，中频更新 |
| **包含** | Service Worker、Content Script、postMessage 协议实现、chrome.* API 调用 |
| **不包含** | Electron/Node.js API、Vue UI |

---

## 通信协议

### 核心原则

JS SDK 是**纯 JS 库**，不感知 Electron 或 Chrome Extension API。它通过 `Transport` 接口与宿主环境通信：

```ts
// sdk/src/transports/base.ts — Transport 接口
interface Transport {
  invoke(method: string, args: unknown[]): Promise<unknown>
  onEvent?(event: string, callback: (data: unknown) => void): void
  offEvent?(event: string, callback: (data: unknown) => void): void
}
```

### Electron Transport

```
SaaS 页面                     Electron Preload              Electron Main
────────                      ────────────────              ─────────────
JS SDK:
  transport.invoke(           contextBridge 暴露:
    'fs:readFile',              window.__bridge__ = {
    ['/path'])                     fs: { readFile(path) {
  )                                  return ipcRenderer     ipcMain.handle(
                                       .invoke(               'fs:readFile',
                                       'fs:readFile', path)    (_, path) =>
                                     }                          fs.promises
                                   }                            .readFile(path)
                                                              )
```

**关键**：Electron 的 preload 脚本中暴露的 `window.__bridge__` 对象结构**必须与 JS SDK 中 `ElectronTransport` 期望的结构一致**。这个一致性通过共享类型定义保证，参见[类型契约](#类型契约)。

### Extension Transport（postMessage 握手）

```
SaaS 页面                   Content Script (isolated)       Background SW
────────                    ─────────────────────────       ─────────────
JS SDK:
  // 握手
  window.postMessage(        window.addEventListener(
    { type: '__BRIDGE_PING',   'message', (e) => {
      id: 1 }, '*')              if (e.data.type ===
  // 等待 PONG                    '__BRIDGE_PING') {
  // 确认 Extension 可用          window.postMessage(
                                  { type: '__BRIDGE_PONG',
                                    id: 1 }, '*')
                              }

  // 调用                       if (e.data.type ===
  window.postMessage(            '__BRIDGE_CALL') {
    { type: '__BRIDGE_CALL',       chrome.runtime
      id: 2,                         .sendMessage(...)
      method: 'fs:readFile',          .then(result =>
      args: ['/path']                   window.postMessage(
    }, '*')                               { type: '__BRIDGE_RESP',
  // 等待 RESPONSE                          id: 2, result }, '*'))
  // Promise resolve              .catch(err =>
                                     window.postMessage(
                                       { type: '__BRIDGE_ERR',
                                         id: 2, error }, '*'))
                             }
                           })
```

**备用路径**：如果 Extension 已知 ID（通过 URL query `?ext_id=xxx` 传入），JS SDK 可优先尝试 `chrome.runtime.sendMessage(extId, ...)` 直连。

### 环境检测逻辑

```ts
// sdk/src/bridge.ts
async function createBridge(): Promise<BridgeAPI> {
  // 1. 尝试 Electron
  if (typeof window !== 'undefined' && window.__bridge__) {
    return wrapTransport(new ElectronTransport(window.__bridge__))
  }

  // 2. 尝试 Extension（postMessage 握手）
  if (typeof window !== 'undefined') {
    const extAvailable = await pingExtension()
    if (extAvailable) {
      return wrapTransport(new ExtensionTransport())
    }
  }

  // 3. 降级
  throw new BridgeNotAvailableError(
    '请在 Electron 或浏览器插件环境中运行。'
  )
}
```

---

## Desktop 被动注入：SDK UMD Bundle（非 SDK 网站启用方案）

### 问题

SaaS 网站主动 `npm install @ai-tip/sdk` 是最佳体验，但现实中大量网站**未集成 SDK**。Desktop 作为桌面壳有能力让这些网站也用上 AI Tip，且应使用**同一套 SDK API**，避免维护两套注入脚本。

### 方案：Desktop 注入 SDK 构建产物

```
┌──────────────────────────────────────────────────────────┐
│                   WebView 页面 (任意网站)                  │
│                                                          │
│  ① preload 自动注入                                      │
│     window.__bridge__ = { ... }  ← contextBridge 暴露     │
│                                                          │
│  ② preload 注入 SDK IIFE bundle                          │
│     <script src="ai-tip-sdk.iife.js"></script>           │
│                                                          │
│  ③ SDK 检测到 window.__bridge__                          │
│     → autoInit() 自动创建 BridgeAPI                      │
│     → 执行 DOM 表单检测                                   │
│     → 注入 AI Tip 按钮                                    │
│     → 监听 fill 指令并回填                                │
│                                                          │
│  ④ 网站零改动，所有功能通过 SDK 统一 API 驱动              │
└──────────────────────────────────────────────────────────┘
```

### 与 SaaS 集成的一致性

```
          SaaS 集成模式                     Desktop 注入模式
   ┌──────────────────────┐         ┌──────────────────────┐
   │ import { createBridge }│        │ SDK IIFE 自动执行     │
   │ const bridge =        │        │ const bridge =        │
   │   await createBridge()│        │   await autoInit()    │
   │                       │        │ 同一套 API            │
   │ bridge.aiTip.fill()   │        │ bridge.aiTip.fill()   │
   │ bridge.formDetect     │        │ bridge.formDetect     │
   │   .detectFields()     │        │   .detectFields()     │
   └──────────────────────┘         └──────────────────────┘
               │                              │
               └──────────┬───────────────────┘
                          ▼
               window.__bridge__ (同一协议)
```

### SDK IIFE Bundle 结构

```
sdk/
├── src/
│   ├── index.ts            # ESM 入口 (SaaS 集成用)
│   └── auto.ts             # IIFE 入口 (Desktop 注入用)
│       ├── 环境检测: window.__bridge__?
│       ├── autoInit() → BridgeAPI
│       ├── DOM 表单扫描 (querySelectorAll)
│       ├── AI Tip 按钮注入 (createElement + insertAdjacentElement)
│       └── 字段回填 (value setter + Event dispatch)
│
├── scripts/
│   └── build-iife.ts       # esbuild 构建 IIFE → dist/ai-tip-sdk.iife.js
│
└── dist/
    ├── index.js             # ESM (npm 包入口)
    ├── index.d.ts           # 类型声明
    └── ai-tip-sdk.iife.js   # IIFE (Desktop 资源)
```

### Desktop webview preload 升级

```
当前 (webview-preload.ts):
  window.__aiBridge = { sendToHost(channel, data) }  ← 仅单向，自定协议

升级后 (webview-preload.ts):
  window.__bridge__ = {
    meta: { version, env, ... },
    aiTip: {
      onFieldSelected(cb) { ... },
      fillField(value, ctx) { ... },
      ...
    },
    formDetect: {
      detectFields() { ... },   ← 直接在 webview 内执行 DOM 查询
      ...
    },
    llm: { ... },
    ...
  }
  // 所有 API 通过 sendToHost + requestId 协议与 Sidebar 双向通信
```

### requestId 双向协议

```typescript
// webview-preload.ts — 通用 request/response 桥
const pending = new Map<string, { resolve: Function; reject: Function }>()

// 发起请求: webview → sidebar
function request(method: string, args: unknown[]): Promise<unknown> {
  const id = crypto.randomUUID()
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    ipcRenderer.sendToHost('bridge:request', { id, method, args })
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id)
        reject(new Error(`Bridge request timeout: ${method}`))
      }
    }, 30_000)
  })
}

// 接收响应: sidebar → webview
ipcRenderer.on('bridge:response', (_event, { id, result, error }) => {
  const p = pending.get(id)
  if (!p) return
  pending.delete(id)
  if (error) p.reject(new Error(error))
  else p.resolve(result)
})

// 暴露给 SDK
contextBridge.exposeInMainWorld('__bridge__', {
  meta: { version: '1.0.0', env: 'electron' },
  aiTip: { fillField: (v, c) => request('ai-tip:fillField', [v, c]), ... },
  formDetect: { detectFields: () => request('form-detect:detectFields', []), ... },
  llm: { ... },
  // ... 12 个 API 域
})
```

### 注入时机

SDK IIFE bundle 通过 preload 脚本注入，而非 `executeJavaScript`：

```typescript
// webview-preload.ts
// 1. 先暴露 window.__bridge__
// 2. 再注入 SDK bundle
const script = document.createElement('script')
script.src = 'file:///.../ai-tip-sdk.iife.js'  // 或内联
script.onload = () => {
  // SDK 的 autoInit() 自动检测 window.__bridge__ 并启动
}
document.head.appendChild(script)
```

> **注意**：preload 注入 `<script>` 标签比 `executeJavaScript` 更可靠——SDK 运行在页面 JS 上下文，可以访问完整 DOM、拦截表单事件。

---

## 类型契约

三个独立仓库的核心挑战：**类型定义如何保持一致？**

### 方案：「JS SDK 是真相源」

```
┌──────────────────────────────────────────────┐
│            @ai-tip/sdk (npm)                │
│                                                │
│  src/types.ts  ← 所有公开类型的定义            │
│    • BridgeAPI      (顶层接口)                 │
│    • FsAPI          (文件系统)                 │
│    • ClipboardAPI   (剪贴板)                   │
│    • NotificationAPI                           │
│    • SystemAPI                                 │
│    • Transport      (宿主需实现的接口)          │
│                                                │
│  exports: { './types': './src/types.ts' }      │
└──────────────────────┬───────────────────────┘
                       │  npm install --save-dev
          ┌────────────┼────────────┐
          ▼            ▼            ▼
   ┌──────────┐ ┌──────────┐ ┌──────────┐
   │ desktop  │ │ extension│ │  SaaS    │
   │ preload  │ │ content  │ │          │
   │ 中的     │ │ script   │ │ 直接使用  │
   │ bridge   │ │ 中的     │ │ BridgeAPI │
   │ 对象结构 │ │ 消息协议 │ │ 类型      │
   │ 对齐类型 │ │ 对齐类型 │ │          │
   └──────────┘ └──────────┘ └──────────┘
```

**具体做法**：

1. `sdk` 在 `package.json` 中通过 `exports` 字段导出类型路径：
   ```json
   {
     "exports": {
       ".": { "types": "./src/index.ts", "default": "./dist/index.js" },
       "./types": { "types": "./src/types.ts" }
     }
   }
   ```

2. `desktop` 和 `extension` 在 `devDependencies` 中引用：
   ```json
   { "devDependencies": { "@ai-tip/sdk": "^1.0.0" } }
   ```

3. preload / content-script 代码中 import 类型即可获得编译时校验：
   ```ts
   // desktop/src/preload/bridge.ts
   import type { BridgeAPI } from '@ai-tip/sdk/types'
   const bridge: BridgeAPI = { fs: { readFile(path) { ... } }, ... }
   // 结构不匹配时 TypeScript 编译报错
   ```

**优势**：不需要额外的 `bridge-shared` 包。JS SDK 自身就是契约。

---

## 版本兼容

三个仓库独立发版，需要解决兼容性问题。

### 版本协商

JS SDK 在 `createBridge()` 时检查宿主版本：

```ts
// desktop/src/preload/bridge.ts
contextBridge.exposeInMainWorld('__bridge__', {
  ...api,
  __meta: { version: '1.2.0', env: 'electron' }
})

// extension/src/content-script.ts
// 握手 PONG 响应中携带版本:
window.postMessage({
  type: '__BRIDGE_PONG',
  id: requestId,
  __meta: { version: '1.0.0', env: 'extension' }
}, '*')
```

JS SDK 启动时检查版本兼容性，不兼容时抛出明确错误提示升级。

### 发布节奏

```
sdk v1.0  ──→  sdk v1.1  ──→  sdk v1.2  ──→  sdk v2.0
  │                  │                  │                  │
  │ 兼容              │ 新增 API         │ 修复 bug         │ Breaking
  ▼                  ▼                  ▼                  ▼
desktop v1.0    desktop v1.0    desktop v1.1    desktop v2.0
                  (无需升级)                        (必须升级)
```

### 兼容矩阵

| JS SDK | Desktop 最低版本 | Extension 最低版本 |
|--------|:-----------------:|:------------------:|
| 1.x | 1.0.0 | 1.0.0 |
| 2.x | 2.0.0 | 2.0.0 |

---

## 安全模型

### Electron

| 层级 | 措施 | 说明 |
|------|------|------|
| **contextIsolation** | `true` | SaaS 页面与 preload 隔离，无法访问 `require` |
| **nodeIntegration** | `false` | SaaS 页面无法直接调用 Node.js |
| **sandbox** | `true` | 渲染进程沙箱 |
| **preload 白名单** | 只暴露 `window.__bridge__` 中定义的 API | 非任意 IPC 通道 |
| **参数校验** | main process 中校验 | 路径穿越、类型检查 |
| **权限分级** | safe / sensitive / critical | critical 操作弹出原生确认框 |
| **URL 白名单** | 仅允许指定 origin 加载 | 防止导航到恶意页面 |

### Browser Extension

| 层级 | 措施 |
|------|------|
| **Content Script 隔离** | `"world": "ISOLATED"`，无法访问页面 JS 变量 |
| **消息校验** | 校验 `event.origin`、消息结构 |
| **最小权限** | manifest 中只声明必要权限 |
| **Native Messaging** | 如需连接本地程序，走 Native Messaging |

---

## 降级方案

### 场景 1：preload 被 SaaS 安全策略禁止

退回自定义协议：

```ts
// Electron Main
protocol.handle('bridge', (req) => {
  const url = new URL(req.url)
  const result = await routeAndExecute(url.hostname, url.pathname, await req.json())
  return new Response(JSON.stringify(result))
})

// JS SDK 中的 CustomProtocolTransport
const resp = await fetch(`bridge://fs/readFile`, {
  method: 'POST',
  body: JSON.stringify({ path: '/path' })
})
```

**代价**：HTTP 序列化开销、DevTools 不可见、事件推送需要 SSE/轮询。仅作为最后手段。

### 场景 2：浏览器中未安装 Extension

JS SDK 抛出 `BridgeNotAvailableError`，SaaS 页面自行展示下载引导 UI。

---

## 开放问题

| # | 问题 | 状态 |
|---|------|------|
| 1 | preload 是否被 SaaS 安全策略视为 "inject script"？ | 待安全团队确认 |
| 2 | `@ai-tip/sdk` 发布到公开 npm 还是私有 registry？ | 待定 |
| 3 | Extension 的 `externally_connectable` 路径是否可行？ | 待验证 |
| 4 | postMessage 握手需要 nonce 防伪吗？ | 当前阶段不需要 |
| 5 | 三个仓库的集成测试如何组织？ | 建议 e2e 放在 desktop repo |
| 6 | SaaS URL 白名单如何配置和下发？ | 待定 |

---

## 参考资源

| 资源 | 链接 |
|------|------|
| WebView2 AddHostObjectToScript | `learn.microsoft.com/en-us/microsoft-edge/webview2/how-to/hostobject` |
| Electron contextBridge | `electronjs.org/docs/latest/api/context-bridge` |
| Chrome Extension Messaging | `developer.chrome.com/docs/extensions/mv3/messaging` |
| MetaMask Provider API | `docs.metamask.io/wallet/reference/provider-api` |
| Sentry Electron SDK | `github.com/getsentry/sentry-electron` |

---

> **下一步**：确认 preload 安全策略 → 实现 SDK v0.1 → Desktop preload 对接 → Extension content-script 对接。
