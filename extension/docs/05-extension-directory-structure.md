# 05 — Extension 目录结构与构建

> **创建**: 2026-06-27 · **状态**: 📝 草案
> **关联**: [01 — 架构总览](./01-browser-extension-architecture.md) · [04 — npm 包设计](./04-npm-packages-design.md) · [Desktop 目录结构](../desktop/docs/15-directory-structure-design.md)
> **场景**: Extension 的完整目录结构 + 多入口构建 + manifest 配置

---

## 📋 文档导航

> - [目录结构](#目录结构) · [manifest.json](#manifestjson) · [构建设计](#构建设计)
> - [package.json](#packagejson) · [CI/CD](#cicd)

---

## 目录结构

```
extension/
├── .github/
│   └── workflows/
│       ├── ci.yml              # lint + typecheck + test
│       └── release.yml         # 构建 .zip → 上传 Chrome Web Store
│
├── src/
│   ├── background/             # Service Worker (非持久)
│   │   ├── index.ts            #   入口: chrome.runtime.onInstalled, 生命周期
│   │   ├── router.ts           #   消息路由: method → handler
│   │   ├── storage.ts          #   chrome.storage.local 封装 (CRUD 工具)
│   │   ├── handlers/           #   各 API 域的处理函数
│   │   │   ├── ai-tip.ts       #     ai-tip:fillField / setEnabled / ...
│   │   │   ├── form-detect.ts  #     form-detect:detectFields (委托给 content-script)
│   │   │   ├── batch-fill.ts   #     batch-fill:suggest + 流式
│   │   │   ├── llm-stream.ts   #     llm:startStream / testConnection
│   │   │   ├── page-summary.ts #     page-summary:summarize
│   │   │   ├── model-config.ts #     model-config:list / save / delete / ...
│   │   │   ├── session.ts      #     session:listPages / initPage / ...
│   │   │   ├── trace.ts        #     trace:getDetail / list / exportTraces
│   │   │   ├── history.ts      #     history:list / add / clear
│   │   │   ├── settings.ts     #     settings:get / set / getAll
│   │   │   └── system.ts       #     通知 / 下载 (chrome.notifications / chrome.downloads)
│   │   └── utils/
│   │       └── keep-alive.ts   #   Service Worker 保活策略
│   │
│   ├── content-script/         # Content Script (ISOLATED world)
│   │   ├── index.ts            #   入口: 初始化 bridge + scanner + button injector
│   │   ├── bridge.ts           #   postMessage 桥接 (PING/PONG/CALL/RESP/ERR/EVENT)
│   │   ├── scanner.ts          #   DOM 表单扫描入口 (调用 @ai-tip/form-detection)
│   │   ├── button-inject.ts    #   AI Tip 按钮注入 + 事件监听
│   │   ├── field-fill.ts       #   字段回填适配 (调用 @ai-tip/form-detection)
│   │   ├── page-summary.ts     #   页面摘要采集 (title/meta/text)
│   │   └── utils/
│   │       └── dom.ts          #   按钮样式、定位、动画
│   │
│   ├── side-panel/             # Side Panel UI (Vue 3 + Pinia + Vite)
│   │   ├── index.html
│   │   ├── main.ts
│   │   ├── App.vue
│   │   ├── router.ts           #   路由: / → Home, /chat → ChatView
│   │   ├── components/
│   │   │   ├── HomeView.vue
│   │   │   ├── ChatView.vue
│   │   │   └── layout/
│   │   │       └── SidePanelLayout.vue
│   │   ├── composables/
│   │   │   ├── useBridge.ts    #   与 Background 通信封装
│   │   │   └── useLLM.ts       #   流式 LLM 调用
│   │   ├── stores/
│   │   │   ├── chat.ts         #   Pinia store: 消息列表
│   │   │   ├── model.ts        #   Pinia store: 模型配置
│   │   │   └── suggestion.ts   #   Pinia store: 批量建议
│   │   └── styles/
│   │       └── main.css
│   │
│   └── options/                # Options Page
│       ├── index.html
│       ├── options.ts
│       └── options.css
│
├── public/                     # 静态资源 (复制到 dist/)
│   ├── icons/
│   │   ├── icon16.png
│   │   ├── icon48.png
│   │   └── icon128.png
│   └── _locales/
│       ├── en/messages.json
│       └── zh_CN/messages.json
│
├── scripts/
│   ├── build.ts                # 多入口构建脚本
│   └── package-zip.ts          # 打包 .zip
│
├── __tests__/
│   ├── background/
│   │   └── router.test.ts
│   ├── content-script/
│   │   ├── bridge.test.ts
│   │   └── scanner.test.ts
│   └── fixtures/
│       └── test-form.html      # 复用 desktop/e2e/fixtures/
│
├── manifest.json
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── eslint.config.mjs
└── README.md
```

---

## manifest.json

```json
{
  "manifest_version": 3,
  "name": "AI Tip",
  "version": "0.1.0",
  "description": "AI 驱动的智能表单填充 — 理解你的文档，帮你填写任何网页表单",
  "minimum_chrome_version": "114",

  "icons": {
    "16": "public/icons/icon16.png",
    "48": "public/icons/icon48.png",
    "128": "public/icons/icon128.png"
  },

  "permissions": [
    "storage",
    "downloads",
    "notifications",
    "alarms",
    "sidePanel"
  ],

  "optional_permissions": [
    "debugger"
  ],

  "host_permissions": [
    "https://*/*",
    "http://localhost/*"
  ],

  "background": {
    "service_worker": "dist/background/index.js",
    "type": "module"
  },

  "content_scripts": [
    {
      "matches": ["https://*/*", "http://localhost/*"],
      "js": ["dist/content-script/index.js"],
      "run_at": "document_idle",
      "world": "ISOLATED"
    }
  ],

  "side_panel": {
    "default_path": "dist/side-panel/index.html"
  },

  "action": {
    "default_title": "AI Tip",
    "default_icon": {
      "16": "public/icons/icon16.png",
      "48": "public/icons/icon48.png"
    }
  },

  "options_page": "dist/options/index.html",

  "externally_connectable": {
    "matches": ["https://*/*", "http://localhost/*"]
  },

  "default_locale": "en",

  "web_accessible_resources": [
    {
      "resources": ["dist/injected/*"],
      "matches": ["https://*/*", "http://localhost/*"]
    }
  ]
}
```

### 权限说明

| 权限 | 用途 | 必要性 |
|------|------|:------:|
| `storage` | 模型配置、会话、追踪、历史持久化 | 必须 |
| `downloads` | 文件下载 | 推荐 |
| `notifications` | 系统通知 | 推荐 |
| `alarms` | SW 心跳保活 | 推荐 |
| `sidePanel` | 主 UI 入口 | 必须 |
| `debugger` | 可选 CDP 表单检测 | 可选 |

---

## 构建设计

### 多入口策略

| 入口 | 构建工具 | 理由 |
|------|---------|------|
| `background/index.ts` | esbuild | 纯 TS，无框架，轻量 |
| `content-script/index.ts` | esbuild | 纯 TS，无框架，需 IIFE 格式 |
| `side-panel/` | Vite | Vue 3 SFC + CSS + 资源处理 |
| `options/` | Vite | 独立 HTML 页面 |

### 构建脚本

```typescript
// scripts/build.ts
import * as esbuild from 'esbuild'
import { build as viteBuild } from 'vite'
import vue from '@vitejs/plugin-vue'
import { copyFileSync, existsSync, mkdirSync } from 'fs'

const isWatch = process.argv.includes('--watch')
const isProd = process.argv.includes('--prod')

async function buildBackground() {
  return esbuild.build({
    entryPoints: ['src/background/index.ts'],
    bundle: true,
    outfile: 'dist/background/index.js',
    format: 'esm',
    target: 'es2022',
    platform: 'browser',
    external: [
      '@ai-tip/llm-providers',
      '@ai-tip/observability',
    ],
    sourcemap: !isProd,
    minify: isProd,
  })
}

async function buildContentScript() {
  // Content Script 必须打包为 IIFE（不能是 ESM，因为通过 <script> 注入）
  return esbuild.build({
    entryPoints: ['src/content-script/index.ts'],
    bundle: true,
    outfile: 'dist/content-script/index.js',
    format: 'iife',
    target: 'es2022',
    platform: 'browser',
    external: [
      '@ai-tip/form-detection',  // 运行时从 npm 解析并内联
    ],
    sourcemap: !isProd,
    minify: isProd,
  })
}

async function buildSidePanel() {
  return viteBuild({
    root: 'src/side-panel',
    plugins: [vue()],
    build: {
      outDir: '../../dist/side-panel',
      emptyOutDir: true,
      sourcemap: !isProd,
      minify: isProd,
    },
  })
}

async function buildOptions() {
  return viteBuild({
    root: 'src/options',
    build: {
      outDir: '../../dist/options',
      emptyOutDir: true,
      sourcemap: !isProd,
      minify: isProd,
    },
  })
}

function copyStatic() {
  mkdirSync('dist/public', { recursive: true })
  mkdirSync('dist/_locales', { recursive: true })
  copyFileSync('manifest.json', 'dist/manifest.json')
  // 复制 icons + _locales...
}

async function main() {
  await Promise.all([
    buildBackground(),
    buildContentScript(),
    buildSidePanel(),
    buildOptions(),
  ])
  copyStatic()
  console.log('[extension] Build complete')
}

main()
```

### 为什么 Content Script 用 IIFE

Chrome Extension 的 Content Script `"world": "ISOLATED"` 中，`type: "module"` 仅用于顶层 `import`。但 `@ai-tip/form-detection` 需要被打包进 content-script。IIFE 格式确保所有代码内联到一个文件，无外部依赖。

> 或者使用 esbuild 的 `bundle: true` + `format: 'esm'`，但需验证 Chrome 是否支持 content-script ESM import。

---

## package.json

```json
{
  "name": "@ai-tip/extension",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "npx tsx scripts/build.ts",
    "build:prod": "npx tsx scripts/build.ts --prod",
    "dev": "npx tsx scripts/build.ts --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src/",
    "package": "npm run build:prod && npx tsx scripts/package-zip.ts"
  },
  "dependencies": {
    "@ai-tip/llm-providers": "workspace:*",
    "@ai-tip/form-detection": "workspace:*",
    "@ai-tip/observability": "workspace:*",
    "pinia": "^2.1.0"
  },
  "devDependencies": {
    "@ai-tip/sdk": "workspace:*",
    "@types/chrome": "^0.0.270",
    "esbuild": "^0.25.0",
    "vite": "^6.0.0",
    "@vitejs/plugin-vue": "^5.0.0",
    "vue": "^3.5.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0",
    "eslint": "^9.0.0",
    "tsx": "^4.19.0"
  }
}
```

---

## CI/CD

### CI (每次 PR)

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with: { node-version: '22', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm run typecheck
      - run: pnpm run lint
      - run: pnpm test
```

### Release (打 Tag 发布)

```yaml
# .github/workflows/release.yml
name: Release Extension
on:
  push:
    tags: ['v*']
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with: { node-version: '22', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm run build:prod
      - run: pnpm test
      - run: pnpm run package
      - uses: actions/upload-artifact@v4
        with:
          name: extension-zip
          path: dist/ai-tip-extension-*.zip
```

---

## 参考资源

| 资源 | 链接 |
|------|------|
| Chrome Extension Manifest V3 | `developer.chrome.com/docs/extensions/mv3` |
| esbuild API | `esbuild.github.io/api` |
| Vite Library Mode | `vitejs.dev/guide/build` |
| Desktop 目录结构设计 | `../desktop/docs/15-directory-structure-design.md` |

---

> **下一步**: [06 — 架构审视](./06-architecture-review.md)
