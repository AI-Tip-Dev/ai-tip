# 01 — Browser Extension 架构设计

> **创建**: 2026-06-27 · **状态**: 📝 草案
> **关联**: [14 — 三 Repo 架构](../desktop/docs/14-electron-js-sdk-architecture.md) · [04 — npm 包设计](./04-npm-packages-design.md) · [06 — 架构审视](./06-architecture-review.md)
> **场景**: Chrome/Edge 浏览器插件，直接检测当前页面 URL（无需 webview），提供与 Desktop 相同的 AI Tip 体验

---

## 📋 文档导航

> - [一句话概述](#一句话概述) · [与 Desktop 的关键差异](#与-desktop-的关键差异) · [架构总览](#架构总览)
> - [组件职责](#组件职责) · [功能覆盖矩阵](#功能覆盖矩阵) · [代码复用总览](#代码复用总览)
> - [安全模型](#安全模型) · [参考资源](#参考资源)

---

## 一句话概述

> 🎯 **Extension 共享 `@ai-tip/sdk` 类型契约和 `@ai-tip/llm-providers` 等 npm 包，在浏览器沙箱内实现 AI Tip 全链路：Content Script 做 DOM 检测 + 按钮注入，Background SW 做 LLM 调度 + 存储，Side Panel 做用户交互。**

---

## 与 Desktop 的关键差异

| 维度 | Desktop (Electron) | Extension (Chrome) |
|------|-------------------|-------------------|
| **页面加载方式** | `<webview>` 标签嵌入 | 用户在浏览器中直接打开 |
| **页面 URL 获取** | webview.src / getURL() | `document.location.href`（Content Script 直接读取） |
| **表单检测** | CDP `Accessibility.getAXTree` | DOM `querySelectorAll` + 可选 `chrome.debugger` CDP |
| **JS 注入** | preload `contextBridge` + `<script>` 标签注入 | Content Script 直接操作 DOM / `chrome.scripting.executeScript` |
| **原生能力** | Node.js `fs`, `electron.clipboard`, `new Notification()` | `chrome.storage`, `chrome.downloads`, `chrome.notifications` |
| **UI 框架** | Vue 3 Sidebar 嵌入主窗口 | Vue 3 Side Panel（独立 `chrome.sidePanel`） |
| **进程模型** | Main Process (常驻) + Renderer | Service Worker (非持久) + Content Script + Side Panel |
| **存储** | 内存 Map + JSON 文件 | `chrome.storage.local` / `sync` |
| **通信** | IPC (`ipcMain.handle` / `ipcRenderer.invoke`) | `postMessage` + `chrome.runtime.sendMessage` |

> ⚠️ Extension **不存在 webview**——SaaS 页面就是浏览器 Tab 自身，Content Script 在 `document_idle` 时自动注入。

---

## 架构总览

```
┌──────────────────────────────────────────────────────────────────┐
│                    浏览器 Tab (任意 HTTPS 页面)                   │
│                                                                  │
│  SaaS 页面 (MAIN world)                                          │
│  ├─ import { createBridge } from '@ai-tip/sdk'                  │
│  │    → ExtensionTransport → postMessage                        │
│  └─ 未集成 SDK 的页面:                                            │
│       → Content Script 注入 AI Tip 按钮 (直接 DOM 操作)           │
│                                                                  │
│  Content Script (ISOLATED world)  ← 自动注入                     │
│  ├─ postMessage 桥接 (PING/PONG → CALL/RESP/ERR)                 │
│  ├─ DOM 表单检测 (querySelectorAll + AX roles)                   │
│  ├─ AI Tip 按钮注入 + 事件监听                                   │
│  ├─ 字段回填 (value setter + Event dispatch)                     │
│  └─ 页面摘要采集 (title + meta + text)                           │
└──────────────────────────┬───────────────────────────────────────┘
                           │ chrome.runtime.sendMessage / connect
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│              Background Service Worker (非持久)                   │
│                                                                  │
│  ├─ 消息路由 (method → handler)                                  │
│  ├─ LLM Provider 调度 (使用 @ai-tip/llm-providers)               │
│  ├─ chrome.storage.local — 配置 / 会话 / 追踪 / 历史             │
│  ├─ chrome.notifications / chrome.downloads — 原生 API           │
│  └─ 生命周期: SW 可被终止，有状态数据全量持久化                    │
└──────────┬──────────────────────────────────┬────────────────────┘
           │ chrome.runtime.sendMessage        │ chrome.runtime.connect
           ▼                                   ▼
┌─────────────────────┐          ┌─────────────────────────┐
│  Side Panel (常驻)   │          │     Options Page         │
│  Vue 3 + Pinia       │          │                           │
│  ├─ Chat 界面        │          │  • LLM Provider 配置      │
│  ├─ Home 仪表盘      │          │  • 通用设置               │
│  ├─ 建议审查         │          │  • 数据管理               │
│  └─ Session 管理     │          │                           │
└─────────────────────┘          └─────────────────────────┘
```

### 组件映射表

| Desktop | Extension | 核心差异 |
|---------|-----------|---------|
| `main/index.ts` + `main/ipc.ts` | `background/index.ts` + `background/router.ts` | SW 非持久，需 storage 持久化 |
| `preload/webview-preload.ts` | `content-script/index.ts` | Isolated World，直接 DOM 访问 |
| `preload/index.ts` (contextBridge) | 不需要 | Side Panel 通过 `chrome.runtime` 直接通信 |
| `renderer/` | `side-panel/` | 同为 Vue 3，组件可复用 |
| `window.__bridge__` | `postMessage` + `chrome.runtime.sendMessage` | 协议不同，语义一致 |

---

## 功能覆盖矩阵

| 功能域 | Desktop | Extension | 优先级 | 详见 |
|--------|:-------:|:---------:|:------:|------|
| AI Tip 按钮注入 + 回填 | CDP + webview JS 注入 | Content Script DOM 操作 | **P0** | [03](./03-extension-form-detection-design.md) |
| 表单字段检测 | CDP AX Tree | DOM `querySelectorAll` + 可选 CDP | **P0** | [03](./03-extension-form-detection-design.md) |
| LLM Chat / Stream | ipcMain → fetch | Background SW → fetch (复用 providers) | **P0** | [04](./04-npm-packages-design.md) |
| 模型配置 CRUD | JSON 文件 | chrome.storage.local | **P0** | — |
| Batch Fill 批量建议 | IPC 流式 | chrome.runtime 流式 | **P1** | — |
| 页面摘要 | webview JS | Content Script DOM 读取 | **P1** | — |
| Session 管理 | 内存 Map | chrome.storage.local | **P2** | — |
| i18n | renderer import | chrome.i18n | **P2** | — |
| Trace 可观测性 | 内存 + JSONL 文件 | chrome.storage.local (复用 @ai-tip/observability) | **P3** | [04](./04-npm-packages-design.md) |
| 文件下载 | Node.js fs | chrome.downloads | **P3** | — |
| 系统通知 | new Notification() | chrome.notifications | **P3** | — |
| WebView 导航 | webview.goBack() | ❌ 不适用（无 webview） | — | — |

---

## 代码复用总览

```
                    ┌──────────────────────────────┐
                    │       @ai-tip/sdk (npm)       │
                    │  types.ts + 12 APIs +         │
                    │  transports/ + utils/         │
                    │  复用度: 100%                 │
                    └──────────────┬───────────────┘
                                   │ devDependency / dependency
          ┌────────────────────────┼────────────────────────┐
          │                        │                        │
          ▼                        ▼                        ▼
   ┌─────────────┐         ┌──────────────┐         ┌──────────────┐
   │   desktop    │         │  extension   │         │    SaaS      │
   │              │         │              │         │              │
   │ @ai-tip/     │         │ @ai-tip/     │         │              │
   │ llm-providers│◄────────│ llm-providers│         │              │
   │              │ 共享    │              │         │              │
   │ @ai-tip/     │         │ @ai-tip/     │         │              │
   │ form-        │◄────────│ form-        │         │              │
   │ detection    │ 共享    │ detection    │         │              │
   │              │         │              │         │              │
   │ @ai-tip/     │         │ @ai-tip/     │         │              │
   │ observability│◄────────│ observability│         │              │
   └─────────────┘         └──────────────┘
```

> 详见 [04 — npm 包设计](./04-npm-packages-design.md)

---

## 安全模型

| 层级 | 措施 |
|------|------|
| **Content Script 隔离** | `"world": "ISOLATED"`，无法访问页面 JS 变量 |
| **Origin 校验** | postMessage 监听中校验 `event.origin` |
| **最小权限** | manifest 只声明 `storage`/`downloads`/`notifications`，CDP 为 `optional_permissions` |
| **敏感字段过滤** | 不检测 `type="password"`，不存储表单值 |
| **Host 限制** | `host_permissions` 限定 `https://*/*` + `localhost` |
| **LLM API Key** | 存储于 `chrome.storage.local`（本地明文，不上传） |

---

## 参考资源

| 资源 | 链接 |
|------|------|
| Chrome Extension Manifest V3 | `developer.chrome.com/docs/extensions/mv3` |
| Chrome Side Panel API | `developer.chrome.com/docs/extensions/reference/sidePanel` |
| Chrome Messaging | `developer.chrome.com/docs/extensions/mv3/messaging` |
| MetaMask Extension 架构 | `github.com/MetaMask/metamask-extension` |
| WXT Framework | `github.com/wxt-dev/wxt` |

---

> **下一步**: [02 — 通信协议](./02-extension-communication-protocol.md) · [03 — 表单检测](./03-extension-form-detection-design.md)
