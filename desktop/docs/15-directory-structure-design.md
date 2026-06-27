# 15 — 三 Repo 目录结构设计

> **创建**: 2026-06-27 · **更新**: 2026-06-27 · **状态**: ✅ 已定稿
> **关联**: [14 — 三 Repo 架构](./14-electron-js-sdk-architecture.md)
> **场景**: 三个独立仓库——`sdk` / `desktop` / `extension`——各自独立构建、发布、版本管理

---

## 📋 文档导航

> - [设计原则](#设计原则) · [Repo 1: sdk](#repo-1-sdk) · [Repo 2: desktop](#repo-2-desktop)
> - [Repo 3: extension](#repo-3-extension) · [类型共享](#类型共享)
> - [CI/CD](#cicd) · [现有代码迁移](#现有代码迁移)

---

## 一句话概述

> 🎯 **三个独立 Git 仓库，各自拥有完整的 `package.json`、`tsconfig.json`、CI/CD、版本号。SDK 是类型真相源，desktop 和 extension 通过 `devDependencies` 引用它来保持类型一致。**

---

## 设计原则

| 原则 | 说明 |
|------|------|
| **物理隔离** | 三个独立 repo，各自 clone、构建、发布 |
| **SDK 是真相源** | 所有公开类型定义在 `sdk`，其他 repo 通过 `devDependencies` 引用 |
| **独立版本** | 每个 repo 独立 semver，不强制同步 |
| **独立构建** | 各自有构建脚本，无 monorepo 编排 |
| **独立 CI** | 各自 `.github/workflows/`，互不阻塞 |

---

## Repo 1: sdk

**仓库**: `ai-tip/sdk`
**npm 包名**: `@ai-tip/sdk`
**发布**: npm registry

```
sdk/
├── .github/
│   └── workflows/
│       ├── ci.yml              # lint + typecheck + test
│       └── release.yml         # npm publish
│
├── src/
│   ├── index.ts                # 公开 API 导出
│   │   export { createBridge } from './bridge'
│   │   export type { BridgeAPI, FsAPI, ... } from './types'
│   │
│   ├── bridge.ts               # createBridge() facade
│   │   async function createBridge(): Promise<BridgeAPI>
│   │
│   ├── types.ts                # 🔑 所有公开类型（真相源）
│   │   interface BridgeAPI { fs: FsAPI; clipboard: ClipboardAPI; ... }
│   │   interface FsAPI { readFile(path): Promise<string>; ... }
│   │   interface Transport { invoke(method, args): Promise<unknown>; ... }
│   │
│   ├── apis/                   # 语义化 API 封装
│   │   ├── fs.ts               #   通过 transport.invoke() 封装
│   │   ├── clipboard.ts
│   │   ├── notification.ts
│   │   └── system.ts
│   │
│   ├── transports/             # Transport Adapter
│   │   ├── base.ts             #   Transport 接口定义
│   │   ├── electron.ts         #   读 window.__bridge__
│   │   ├── extension.ts        #   postMessage 握手
│   │   └── fallback.ts         #   抛出 BridgeNotAvailableError
│   │
│   └── utils/
│       ├── env-detect.ts       #   环境检测
│       └── version.ts          #   版本兼容检查
│
├── __tests__/
│   ├── bridge.test.ts
│   ├── transport-electron.test.ts
│   └── transport-extension.test.ts
│
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── eslint.config.mjs
├── .gitignore
└── README.md
```

### `package.json` 关键字段

```json
{
  "name": "@ai-tip/sdk",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    },
    "./types": {
      "types": "./dist/types.d.ts"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src/"
  },
  "dependencies": {},
  "devDependencies": {
    "typescript": "^5.5",
    "vitest": "^2",
    "eslint": "^9"
  }
}
```

**关键**：`dependencies` 为空——这是一个纯 JS 包，零运行时依赖。

---

## Repo 2: desktop

**仓库**: `ai-tip/desktop`
**发布**: GitHub Releases（`.exe` / `.dmg` / `.AppImage`）

```
desktop/
├── .github/
│   └── workflows/
│       ├── ci.yml              # lint + typecheck + test
│       └── release.yml         # electron-builder → GitHub Release
│
├── src/
│   ├── main/                   # Main Process (Node.js)
│   │   ├── index.ts            #   窗口创建、生命周期
│   │   ├── ipc.ts              #   ipcMain.handle() 集中注册
│   │   │
│   │   ├── bridge/             #   Bridge API 的原生实现
│   │   │   ├── index.ts        #     注册所有 bridge IPC handlers
│   │   │   ├── fs.ts           #     fs.promises.readFile / writeFile / readdir
│   │   │   ├── clipboard.ts    #     electron.clipboard
│   │   │   ├── notification.ts #     new Notification()
│   │   │   └── system.ts       #     os.platform() / arch() / ...
│   │   │
│   │   ├── providers/          #   LLM Provider 适配器（现有逻辑）
│   │   │   ├── types.ts
│   │   │   ├── registry.ts
│   │   │   ├── chat.ts
│   │   │   └── adapters/
│   │   │       ├── base.ts     #     OpenAI-compatible
│   │   │       └── anthropic.ts#     Anthropic
│   │   │
│   │   └── tracing/            #   可观测性
│   │       ├── TracerProvider.ts
│   │       ├── TracingSpan.ts
│   │       ├── TraceStore.ts
│   │       ├── OtlpExporter.ts
│   │       └── utils.ts
│   │
│   ├── preload/                # Preload 脚本
│   │   ├── index.ts            #   contextBridge → window.api / llmApi / aiTipApi
│   │   ├── index.d.ts          #   类型声明
│   │   ├── bridge.ts           #   contextBridge → window.__bridge__
│   │   └── webview-preload.ts  #   webview preload → window.__aiBridge
│   │
│   └── renderer/               # Vue 3 前端
│       ├── index.html
│       └── src/
│           ├── main.ts
│           ├── App.vue
│           ├── env.d.ts
│           ├── assets/
│           ├── locales/        #   i18n（UI 专属）
│           │   ├── types.ts
│           │   ├── en.ts
│           │   └── zh-CN.ts
│           ├── components/
│           │   ├── shared/
│           │   └── sidebar/
│           └── composables/
│
├── e2e/                        # 端到端测试
│   ├── playwright.config.ts
│   ├── fixtures/
│   │   └── test-form.html
│   ├── helpers/
│   │   └── index.ts
│   └── specs/
│       ├── ai-tip/
│       ├── chat/
│       └── navigation/
│
├── docs/                       # 设计文档
│   ├── README.md
│   ├── 01-product-spec.md
│   ├── 02-system-architecture.md
│   ├── ...
│   ├── 14-electron-js-sdk-architecture.md
│   ├── 15-directory-structure-design.md  # ← 本文档
│   ├── appendix/
│   ├── archive/
│   └── decisions/
│
├── build/                      # Electron 构建资源
│   └── entitlements.mac.plist
│
├── resources/                  # 应用图标
│   └── icon.png
│
├── package.json
├── electron-vite.config.ts
├── electron-builder.yml
├── tsconfig.json
├── tsconfig.node.json
├── tsconfig.web.json
├── vitest.config.ts
├── eslint.config.mjs
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── .gitignore
└── README.md
```

### `package.json` 关键字段

```json
{
  "name": "@ai-tip/desktop",
  "version": "1.0.0",
  "private": true,
  "main": "./out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "build:win": "electron-vite build && electron-builder --win",
    "build:mac": "electron-vite build && electron-builder --mac",
    "test": "vitest",
    "test:e2e": "playwright test",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src/"
  },
  "dependencies": {
    "electron-log": "^5",
    "electron-updater": "^6",
    "vue": "^3",
    "vue-router": "^4",
    "pinia": "^2"
  },
  "devDependencies": {
    "@ai-tip/sdk": "^0.1.0",
    "electron": "^31",
    "electron-vite": "^2",
    "electron-builder": "^24",
    "@electron-toolkit/preload": "^3",
    "typescript": "^5.5",
    "vitest": "^2",
    "playwright": "^1",
    "eslint": "^9"
  }
}
```

---

## Repo 3: extension

**仓库**: `ai-tip/extension`
**发布**: Chrome Web Store / Edge Add-ons

```
extension/
├── .github/
│   └── workflows/
│       ├── ci.yml              # lint + typecheck + test
│       └── release.yml         # 打包 .zip → 上传 Chrome Web Store
│
├── src/
│   ├── background.ts           # Service Worker
│   │   // 处理来自 content-script 的消息
│   │   // 调用 chrome.storage / chrome.downloads / chrome.notifications
│   │   chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
│   │     // 路由方法 → 执行 → 返回
│   │   })
│   │
│   ├── content-script.ts       # Content Script (isolated world)
│   │   // 监听 postMessage → 转发到 background
│   │   window.addEventListener('message', (event) => {
│   │     if (event.data.type === '__BRIDGE_PING') {
│   │       // 响应 PONG（告知 SDK Extension 可用）
│   │     }
│   │     if (event.data.type === '__BRIDGE_CALL') {
│   │       chrome.runtime.sendMessage({ method, args }, (response) => {
│   │         window.postMessage({ type: '__BRIDGE_RESP', id, result: response })
│   │       })
│   │     }
│   │   })
│   │
│   └── popup/                  # 插件弹窗 UI
│       ├── index.html
│       ├── popup.ts
│       └── popup.css
│
├── icons/                      # 插件图标
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
│
├── __tests__/
│   └── content-script.test.ts
│
├── manifest.json
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── eslint.config.mjs
├── .gitignore
└── README.md
```

### `manifest.json`

```json
{
  "manifest_version": 3,
  "name": "AI Tip Bridge",
  "version": "1.0.0",
  "description": "让 SaaS 页面调用浏览器原生能力",
  "permissions": ["storage", "downloads", "notifications"],
  "host_permissions": ["https://saas.example.com/*"],
  "background": {
    "service_worker": "dist/background.js"
  },
  "content_scripts": [
    {
      "matches": ["https://saas.example.com/*"],
      "js": ["dist/content-script.js"],
      "run_at": "document_start",
      "world": "ISOLATED"
    }
  ],
  "externally_connectable": {
    "matches": ["https://saas.example.com/*"]
  }
}
```

### `package.json` 关键字段

```json
{
  "name": "@ai-tip/extension",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "build": "tsc && node scripts/copy-manifest.js",
    "dev": "tsc --watch",
    "test": "vitest",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src/",
    "package": "npm run build && node scripts/package-zip.js"
  },
  "dependencies": {},
  "devDependencies": {
    "@ai-tip/sdk": "^0.1.0",
    "@types/chrome": "^0.0.268",
    "typescript": "^5.5",
    "vitest": "^2",
    "eslint": "^9"
  }
}
```

---

## 类型共享

三个独立仓库的核心问题：**如何保证 `window.__bridge__` 的结构与 JS SDK 期望的一致？**

### 方案

```
┌─────────────────────────────────────┐
│         @ai-tip/sdk (npm)           │
│                                      │
│  src/types.ts                        │
│    export interface BridgeAPI {      │
│      fs: FsAPI                       │
│      clipboard: ClipboardAPI         │
│      notification: NotificationAPI   │
│      system: SystemAPI               │
│    }                                 │
│                                      │
│    export interface Transport {      │
│      invoke(method, args):           │
│        Promise<unknown>              │
│    }                                 │
│                                      │
│  package.json exports:               │
│    "./types" → "./dist/types.d.ts"   │
└──────────────┬──────────────────────┘
               │  npm install --save-dev @ai-tip/sdk
    ┌──────────┴──────────┐
    ▼                     ▼
┌────────────┐      ┌──────────────┐
│  electron  │      │  browser-    │
│            │      │  extension   │
│ preload:   │      │ content:     │
│ import type│      │ import type  │
│ {BridgeAPI}│      │ {Transport}  │
│ from       │      │ from         │
│ '@ai-tip/  │      │ '@ai-tip/    │
│  sdk/      │      │  sdk/        │
│  types'    │      │  types'      │
│            │      │              │
│ const      │      │ // 握手响应  │
│ bridge:    │      │ // 结构匹配  │
│ BridgeAPI  │      │ // Transport  │
│ = { ... }  │      │ // 接口      │
│            │      │              │
│ // TS 编译 │      │ // TS 编译   │
│ // 时校验  │      │ // 时校验    │
│ // 结构    │      │ // 结构      │
└────────────┘      └──────────────┘
```

**不需要额外的 `bridge-shared` 包**。SDK 本身就是类型真相源。`desktop` 和 `extension` 各自 `npm install --save-dev @ai-tip/sdk`，import 类型即可获得编译时校验。

---

## CI/CD

### sdk CI

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm test

# .github/workflows/release.yml
name: Release
on:
  push:
    tags: ['v*']
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          registry-url: 'https://registry.npmjs.org'
      - run: npm ci
      - run: npm run build
      - run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### electron CI

```yaml
# .github/workflows/release.yml
name: Release
on:
  push:
    tags: ['v*']
jobs:
  build:
    strategy:
      matrix:
        os: [windows-latest, macos-latest, ubuntu-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run build
      - run: npm run build:${{ matrix.os == 'windows-latest' && 'win' || matrix.os == 'macos-latest' && 'mac' || 'linux' }}
      - uses: softprops/action-gh-release@v1
        with:
          files: dist/*.exe, dist/*.dmg, dist/*.AppImage
```

### extension CI

```yaml
# .github/workflows/release.yml
name: Release
on:
  push:
    tags: ['v*']
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run build
      - run: npm run package
      - uses: actions/upload-artifact@v4
        with:
          name: extension
          path: dist/extension.zip
```

---

## 现有代码迁移

从当前单体 `electron/` 仓库迁移到三 repo 结构：

### 保留在 `electron/`（不变）

| 路径 | 说明 |
|------|------|
| `src/main/` | Main process（窗口、IPC、LLM providers、tracing） |
| `src/main/bridge/` | 🆕 新增：Bridge API 原生实现 |
| `src/preload/` | Preload（含新增 `bridge.ts`） |
| `src/renderer/` | Vue 3 UI |
| `docs/` | 设计文档 |
| `e2e/` | 端到端测试 |
| `build/` | 构建资源 |
| `resources/` | 应用图标 |

### 需要抽取到 `sdk/`

| 当前路径 | 新位置 | 说明 |
|----------|--------|------|
| — | `sdk/src/types.ts` | 🆕 BridgeAPI、FsAPI 等类型 |
| — | `sdk/src/transports/` | 🆕 Desktop/Extension/Fallback transport |
| — | `sdk/src/apis/` | 🆕 语义化 API 封装 |

> ⚠️ `sdk` 是全新仓库，不需要从现有代码迁移，而是**从零编写**。现有 `src/shared/types.ts` 中的类型可以作为参考。

### 需要抽取到 `extension/`

| 当前路径 | 新位置 | 说明 |
|----------|--------|------|
| — | — | 🆕 全新仓库，全部从零编写 |

### 不再需要的文件

| 文件 | 原因 |
|------|------|
| `src/shared/ipc-channels.ts` | IPC channel 常量不再需要跨 repo 共享；electron 内部使用即可 |
| `src/shared/types.ts` | 类型定义移到 `sdk`，desktop 通过 devDependency 引用 |
| `src/shared/locales/` | 保留在 electron/renderer/src/locales/（UI 专属） |
| `src/shared/ax-roles.ts` | 保留在 desktop（仅 desktop 使用 CDP） |

---

## 参考资源

| 资源 | 链接 |
|------|------|
| Sentry JavaScript SDK | `github.com/getsentry/sentry-javascript` |
| Tauri JS API | `github.com/tauri-apps/tauri/tree/dev/packages/api` |
| MetaMask Extension | `github.com/MetaMask/metamask-extension` |
| Chrome Extension Manifest V3 | `developer.chrome.com/docs/extensions/mv3` |

---

> **下一步**：创建 `sdk` 仓库 → 实现 v0.1 → 发布到 npm → desktop 和 extension 各自引用对接。
