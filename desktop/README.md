# Electron AI Sidebar

> 🎯 AI 驱动的智能表单填充助手 — 打开任意网页，AI 自动分析表单，辅助填充，你确认后写入。

## ✨ 核心能力

- **🌐 任意网页兼容** — 内嵌 Chromium WebView，可加载任何 Web 应用（CRM、ERP、OA 等），不受平台限制
- **🔍 智能表单检测** — 基于 Chrome DevTools Protocol (CDP) 自动检测页面中所有表单字段（`<input>`、`<select>`、`<textarea>`）
- **✨ AI Tip 按钮** — 鼠标悬停任意表单字段即浮现 ✨ 按钮，一键请求 AI 为该字段生成建议值
- **💬 Chat-First 交互** — 统一聊天界面承载所有 AI 交互，支持流式响应、多模型切换
- **📄 双会话模型** — Page 级 Overview 对话 + Field 级钻入对话，Context 自动继承
- **🔌 多 LLM Provider** — 支持 10 个 LLM Provider（OpenAI、Anthropic、Ollama、DeepSeek、阿里云百炼、智谱、硅基流动、Moonshot、OpenRouter、自定义），Adapter 模式一键扩展
- **🌍 国际化** — 中英文双语支持（UI + AI 输出语言独立配置）
- **🛡️ 隐私优先** — 支持 Ollama 本地 LLM，数据可完全不离开电脑
- **✏️ 人工把关** — 所有填充建议需你审查确认后才写入

## 🏗️ 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Electron 39 |
| 前端框架 | Vue 3 + Composition API + TypeScript |
| 构建工具 | electron-vite + Vite 7 |
| 打包工具 | electron-builder |
| 测试 | Vitest（单元）+ Playwright（E2E） |
| IPC 日志 | electron-log |
| 代码规范 | ESLint + Prettier |
| 包管理器 | pnpm |

## 🚀 快速开始

### 环境要求

- Node.js >= 18
- pnpm >= 8

### 安装 & 开发

```bash
pnpm install
pnpm dev
```

### 构建

```bash
pnpm build:win    # Windows
pnpm build:mac    # macOS
pnpm build:linux  # Linux
```

### 测试 & 检查

```bash
pnpm typecheck    # TypeScript 类型检查
pnpm lint         # ESLint
pnpm format       # Prettier 格式化
pnpm test         # Vitest 单元测试
pnpm test:e2e     # Playwright E2E 测试
```

## 📁 项目结构

```
src/
├── main/                          # 主进程
│   ├── index.ts                   # IPC handlers、CDP 字段检测、LLM 流式调用
│   └── providers/                 # LLM Provider 层
│       ├── types.ts               # ProviderAdapter 接口 + 共享类型
│       ├── registry.ts            # 10 个 Provider 注册表
│       ├── chat.ts                # 流式聊天入口（重试 + 超时 + 取消）
│       └── adapters/
│           ├── base.ts            # OpenAI 兼容适配器（覆盖 22/23 Provider）
│           └── anthropic.ts       # Anthropic 独立适配器
├── preload/                       # 预加载脚本
│   ├── index.ts                   # Sidebar 侧 contextBridge（5 组 API）
│   ├── webview-preload.ts         # WebView 侧 bridge（sendToHost 白名单）
│   ├── ai-tip.ts                  # AI Tip ✨ 按钮注入脚本（IIFE）
│   └── index.d.ts                 # 全局 Window 类型声明
├── renderer/src/                  # 渲染进程 (Vue 3)
│   ├── App.vue                    # 主布局（WebView + Sidebar 340px）
│   ├── main.ts
│   └── components/
│       ├── NavToolbar.vue         # URL 导航栏
│       ├── Sidebar.vue            # Chat-First 主容器（Home/Chat 双视图）
│       ├── sidebar/               # Sidebar 面板组件
│       │   ├── HomeView.vue       # 主页：当前 Page + 历史
│       │   ├── SettingsDialog.vue # 模型/语言设置
│       │   ├── DetectedFieldsPanel.vue
│       │   ├── FieldsView.vue / TreeView.vue
│       │   ├── ContextBar.vue / ContextBadge.vue
│       │   ├── PageSummaryPanel.vue
│       │   └── chat/              # Chat 子组件（13 个）
│       └── shared/                # 通用组件
└── shared/                        # 三进程共享
    ├── types.ts                   # 共享类型定义
    ├── ipc-channels.ts            # IPC 通道常量（15 个）
    ├── ax-roles.ts                # ARIA 角色映射
    └── locales/                   # 国际化文本（en / zh-CN）
```

> 📖 完整设计文档见 [`docs/`](./docs/) · 文档索引见 [`docs/README.md`](./docs/README.md)

## 🧩 推荐 IDE

- [VS Code](https://code.visualstudio.com/) + [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar)

## 📄 License

MIT
