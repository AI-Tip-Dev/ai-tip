# 02 — 系统架构设计文档 (SAD)

> **创建**: 2026-06 · **更新**: 2026-06-26
> **关联**: [01 PRD](./01-product-spec.md) · [04 LLM Provider](./04-llm-provider-design.md) · [05 表单检测](./05-form-detection-design.md)
> **状态**: ✅ 活跃 — Phase 1-2 按此架构实施，Phase 3+ 选型已预留

---

## 📋 文档导航
> - [架构总览](#架构总览) · [桌面框架选型](#1-桌面框架选型) · [WebView 方案](#2-webview-方案)
> - [向量数据库](#3-向量数据库选型) · [嵌入模型](#4-嵌入模型选型) · [LLM](#5-llm-选型)
> - [Agent 框架](#6-agent-框架选型) · [文档解析](#7-文档解析选型) · [构建工具](#8-构建工具选型)
> - [UI 框架](#9-ui-框架选型) · [IPC 设计](#10-ipc-通信设计) · [最终决策汇总](#最终决策汇总)

---

## 架构总览

```
┌─────────────────────────────────────────────────────────┐
│                    Electron 主窗口                        │
│                                                         │
│  ┌──────────────────────┐   ┌─────────────────────────┐ │
│  │   WebView (Renderer) │   │   Sidebar (Renderer)    │ │
│  │                      │   │                         │ │
│  │  • 加载任意网页      │   │  • Vue 3 Composition API│ │
│  │  • ✨ AI Tip 按钮注入 │   │  • Chat-First 界面      │ │
│  │  • JS 注入回填       │   │  • Home / Chat 双视图   │ │
│  │  • 上下文采集        │   │  • 模型配置面板         │ │
│  │                      │   │  • 字段检测展示         │ │
│  └─────────┬────────────┘   └───────────┬─────────────┘ │
│            │                            │                │
│            │  sendToHost                │ IPC (bridge)   │
│            │                            │                │
│  ┌─────────┴────────────────────────────┴─────────────┐  │
│  │              主进程 (Main Process)                  │  │
│  │                                                    │  │
│  │  ┌──────────────┐ ┌──────────────┐ ┌────────────┐  │  │
│  │  │ LLM Provider │ │ CDP 字段检测  │ │ 文件 I/O    │  │  │
│  │  │ (10 个适配器) │ │ (AX Tree)    │ │ (本地文件)  │  │  │
│  │  └──────┬───────┘ └──────┬───────┘ └──────┬─────┘  │  │
│  │         │               │               │         │  │
│  │  ┌──────┴───────────────┴───────────────┴──────┐   │  │
│  │  │            IPC Handlers + 流式管理            │   │  │
│  │  └────────────────────────────────────────────┘   │  │
│  └──────────────────────┬─────────────────────────────┘  │
│                         │                                │
│          ┌──────────────┼──────────────┐                 │
│          │              │              │                 │
│     ┌────┴────┐   ┌────┴────┐   ┌────┴────┐            │
│     │ Ollama  │   │ OpenAI  │   │Anthropic│            │
│     │ (本地)  │   │ (云端)  │   │ (云端)  │            │
│     └─────────┘   └─────────┘   └─────────┘            │
│                                                        │
│  🔜 Phase 3+: LanceDB 向量库 + 文档解析器 + Agent Loop  │
└─────────────────────────────────────────────────────────┘
```

### 进程职责划分

| 进程 | 职责 | 不可做的事 |
|------|------|-----------|
| **主进程 (Main)** | LLM Provider 调度、CDP 字段检测、文件 I/O、IPC 路由、流式管理 | 直接访问 WebView DOM |
| **WebView Renderer** | 加载网页、执行 AI Tip 注入脚本、接收回填指令 | 访问 Node.js API（沙箱隔离） |
| **Sidebar Renderer** | Vue 3 UI 渲染、用户交互、Chat 消息管理、Session 管理 | 直接访问 WebView 或文件系统 |

---

## 1. 桌面框架选型

### 候选对比

| 维度 | **Electron** | Tauri | NW.js | Neutralinojs |
|------|:-----------:|:-----:|:-----:|:------------:|
| WebView 引擎 | Chromium (完整) | 系统 WebView | Chromium | 系统 WebView |
| Node.js 集成 | ✅ 完整 | ❌ 需 Rust 桥接 | ✅ 完整 | ❌ 受限 |
| `<webview>` 标签 | ✅ 原生支持 | ❌ 不支持 | ✅ 支持 | ❌ 不支持 |
| 应用体积 | ~150MB | ~5MB | ~120MB | ~2MB |
| 社区生态 | 🔥 最成熟 | 成长中 | 衰退中 | 小众 |
| AI/ML 库兼容 | ✅ npm 全生态 | ⚠️ Rust 绑定 | ✅ npm | ❌ 受限 |
| preload 脚本 | ✅ | ❌ | ✅ | ❌ |
| 跨平台 | Win/Mac/Linux | Win/Mac/Linux | Win/Mac/Linux | Win/Mac/Linux |

### 决策：Electron ✅

**核心理由**：

1. **`<webview>` 标签** — 这是项目的硬依赖。我们需要在渲染进程中嵌入一个**完全独立的浏览器上下文**来加载任意网页，并且能向其中注入 JS。Tauri 的系统 WebView 没有等效能力，也无法安全地隔离外部网页。

2. **npm AI/ML 生态** — `pdf-parse`、`tiktoken`、`langchain`、`chromadb` 等 Node.js 库直接可用，不需要走 Rust FFI 桥接，开发效率远高于 Tauri。

3. **体积不是核心矛盾** — 目标用户是桌面办公场景，150MB 完全可以接受（VS Code、Slack、Figma 都是 Electron）。

4. **社区成熟度** — 遇到 WebView 沙箱、IPC 安全问题有大量可参考方案。

---

## 2. WebView 方案

### 候选对比

| 维度 | **`<webview>`** | `BrowserView` | `iframe` |
|------|:--------------:|:------------:|:--------:|
| 独立渲染进程 | ✅ 是 | ✅ 是 | ❌ 同进程 |
| 沙箱隔离 | ✅ 强隔离 | ✅ 强隔离 | ❌ 弱 |
| preload 脚本 | ✅ | ✅ | ❌ |
| JS 注入 (`executeJavaScript`) | ✅ | ✅ | ⚠️ 受限 |
| 同源策略 | 独立 | 独立 | 受限 |
| 安全性（加载外部页） | ✅ 安全 | ✅ 安全 | ❌ 不安全 |
| API 稳定性 | ✅ 稳定 | ⚠️ 曾计划废弃 | ✅ 稳定 |

### 决策：`<webview>` ✅

虽然 Electron 曾计划用 `BrowserView` 替代 `<webview>`，但 `<webview>` 至今仍在维护且社区使用最广泛。最关键的是 `<webview>` 支持：

- `preload` 脚本注入（表单检测的主战场）
- `executeJavaScript()` 直接执行（回填表单的核心通道）
- 独立 cookie/session 存储（避免污染用户正常浏览）

---

## 3. 向量数据库选型

### 候选对比

| 维度 | **LanceDB** | ChromaDB | sqlite-vec | Qdrant | Milvus |
|------|:----------:|:--------:|:----------:|:------:|:------:|
| 部署模式 | 嵌入式 | 嵌入/CS | 嵌入式 | 服务端 | 服务端 |
| 零配置启动 | ✅ | ✅ | ✅ | ❌ 需 Docker | ❌ 需 Docker |
| Node.js SDK | ✅ | ✅ | ⚠️ 实验性 | ✅ | ❌ |
| 无服务器依赖 | ✅ | ✅ | ✅ | ❌ | ❌ |
| 支持磁盘索引 | ✅ | ⚠️ 内存优先 | ✅ | ✅ | ✅ |
| 过滤 + 向量混合查询 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 性能 (10 万条) | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| 包体积 | 小 | 中（Python 依赖） | 极小 | N/A | N/A |
| 活跃维护 | 🔥 | 🔥 | 🔥 | 🔥 | 🔥 |

### 决策：LanceDB ✅（首选），ChromaDB 备选

**核心理由**：

1. **真正的嵌入式** — LanceDB 是 columnar 向量数据库，直接读写磁盘文件，不需要任何服务进程。启动即用，零配置。这对桌面 App 是硬需求。
2. **Node.js 原生支持** — 有 `@lancedb/lancedb` npm 包，绑定方式干净，不依赖 Python 子进程。
3. **磁盘优先** — 不像 ChromaDB 默认全内存模式，LanceDB 天然支持磁盘索引，适合知识库长期存储的桌面场景。

**为什么不是 ChromaDB？**
ChromaDB 虽然功能丰富，但核心是 Python 生态，在 Electron 中需要起 Python 子进程或用 HTTP 模式，增加复杂度。其 `chromadb` npm 包实质是 HTTP client。

**为什么不是 sqlite-vec？**
非常轻量诱人（直接在 SQLite 上加向量扩展），但 Node.js 绑定目前是实验性的，生产稳定性不足。作为未来精简选项保留观察。

---

## 4. 嵌入模型选型

### 候选对比

| 模型 | 维度 | 大小 | 语言 | 速度 (本地) | 质量 (MTEB) |
|------|------|------|------|:---------:|:---------:|
| **bge-small-zh** | 512 | ~100MB | 中文优先 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **all-MiniLM-L6-v2** | 384 | ~80MB | 英文优先 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| bge-large-zh | 1024 | ~400MB | 中文优先 | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| text-embedding-3-small (OpenAI) | 1536 | N/A | 多语言 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| nomic-embed-text (Ollama) | 768 | ~270MB | 英文 | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| multilingual-e5-small | 384 | ~120MB | 多语言 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |

### 决策：双轨制

```
默认（离线）：bge-small-zh（中文文档）/ all-MiniLM-L6-v2（英文文档）
可选（云端）：text-embedding-3-small（混合中英文 / 高质量需求）
```

**核心理由**：

1. **多语言分离处理** — 中文文档用 `bge-small-zh`，英文用 `all-MiniLM-L6-v2`，根据文档语言自动选择。
2. **体积可控** — 两个本地模型加起来 ~180MB，对桌面 App 可接受。
3. **云端兜底** — 用户可以选择 OpenAI embedding API 获得更高质量（尤其是中英混合文档），但这不是默认行为。

---

## 5. LLM 选型

### 候选对比

| 维度 | **Ollama (本地)** | OpenAI (云端) | Anthropic (云端) | LM Studio |
|------|:----------------:|:------------:|:----------------:|:---------:|
| 隐私 | ✅ 零泄露 | ❌ 数据发云端 | ❌ 数据发云端 | ✅ |
| 延迟 | ⚠️ 取决于硬件 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⚠️ 取决于硬件 |
| 工具调用 | ⚠️ 弱模型不稳定 | ✅ 强 | ✅ 强 | ⚠️ |
| 成本 | 免费 | 按 token | 按 token | 免费 |
| 中文能力 | ⚠️ 模型差异大 | ✅ | ✅ | ⚠️ 模型差异大 |
| 安装难度 | ⭐⭐ (需装 Ollama) | 零 | 零 | ⭐⭐ |
| 推荐模型 | qwen2.5, llama3 | gpt-4o-mini | claude-haiku | qwen2.5 |

### 决策：分级策略

```
第一优先级（默认推荐）：Ollama + qwen2.5:7b（中文好 + 工具调用可用）
第二优先级（云端加速）：OpenAI gpt-4o-mini（成本低、工具调用强）
第三优先级（完全离线）：Ollama + llama3.2:3b（轻量级，低配机器也能跑）
```

**核心理由**：

1. **qwen2.5:7b 是当前中文 + 工具调用平衡最好的本地模型** — 对 Agent 填表场景来说，关键是工具调用 (function calling) 的可靠性。qwen2.5 原生支持 tool use，中文理解也好。
2. **分层降级** — 如果本地模型工具调用失败，自动降级到云端 (gpt-4o-mini 极低成本)；如果用户不需要填表，只用知识库问答，llama3.2:3b 足够。

---

## 6. Agent 框架选型

### 候选对比

| 维度 | **自建 ReAct Loop** | LangChain | Vercel AI SDK | CrewAI |
|------|:-----------------:|:---------:|:------------:|:------:|
| 学习曲线 | ⭐⭐ (需理解) | ⭐⭐⭐⭐ (陡峭) | ⭐⭐⭐ | ⭐⭐⭐ |
| 包体积 | 零 | 大 (~50MB) | 中 | 大 |
| 灵活性 | 🔥 完全控制 | ⚠️ 抽象泄露 | ⚠️ 偏 Vercel 生态 | 低 |
| 工具只有 3 个 | ✅ 刚好 | ⚠️ 杀鸡用牛刀 | ✅ | ❌ 面向多 Agent |
| 调试难度 | ⭐ 直观 | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ |
| Node.js 生态 | ✅ 原生 | ✅ | ✅ | ❌ Python |
| Electron 兼容 | ✅ | ⚠️ | ✅ | ❌ |

### 决策：自建 ReAct Loop ✅

**核心理由**：

> 我们就 3 个工具 (`search_kb`, `fill_field`, `read_field`)，不需要一个 50MB 的框架。

自建 ReAct 循环在 100 行代码以内：

```typescript
// 伪代码 — Agent 核心循环
async function agentLoop(fields: Field[], llm: LLM, tools: Tool[]) {
  const results: FillResult[] = []

  for (const field of fields) {
    // 1. 向量检索知识库
    const kbResults = await tools.search_kb(field.label)

    // 2. LLM 推理
    const response = await llm.chat({
      system: `你是表单填充助手。根据检索到的文档片段，为字段"${field.label}"推荐最合适的值。`,
      messages: [{ role: 'user', content: JSON.stringify(kbResults) }],
      tools: [{ name: 'fill_field', ... }],
    })

    // 3. 解析结果
    results.push({
      field: field.label,
      value: response.value,
      confidence: response.confidence,
      source: response.source,
    })
  }

  return results
}
```

**为什么不用 LangChain？**
- 抽象层太厚，Agent 的 3 个工具用 LangChain 是杀鸡用牛刀
- 包体积大，对 Electron 不友好
- 调试困难，出问题时层层 trace 非常痛苦
- 我们的 Agent 逻辑非常简单：搜 KB → LLM 推理 → 返回，不需要编排引擎

**Vercel AI SDK 也不错**，但它绑定 Vercel/Next.js 生态，在我们纯 Electron 环境里有不必要的耦合。

---

## 7. 文档解析选型

### 候选对比

| 工具 | 格式 | 优点 | 缺点 |
|------|------|------|------|
| **pdf-parse** | PDF | 纯 JS、轻量、零依赖 | 复杂排版丢格式 |
| pdfjs-dist | PDF | 保真度高 | 体积大 (~3MB) |
| **mammoth** | .docx | 转 Markdown 质量高 | 不支持 .doc |
| **turndown** | HTML | HTML→MD 标准方案 | 不处理非 HTML |
| unstructured (Python) | 全格式 | 最强解析能力 | 需 Python 子进程 |
| marker (Python) | PDF | 效果最好 | 需 GPU、重 |

### 决策：轻量 JS 管线 ✅

```
PDF  → pdf-parse     → 纯文本
.docx → mammoth       → Markdown
HTML  → turndown      → Markdown
.md   → 直接使用      → Markdown
.txt  → 直接使用      → 纯文本

统一输出：Markdown → 切片器 → 向量化
```

**核心理由**：全 JS 管线，无外部进程依赖。对填表检索场景来说，文档的结构丢失是可接受的——我们只需要语义片段，不需要完美排版还原。

---

## 8. 构建工具选型

### 候选对比

| 维度 | **electron-vite** | electron-forge + Vite | Webpack | 手动配置 |
|------|:----------------:|:--------------------:|:-------:|:-------:|
| 构建速度 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ |
| Electron 多入口支持 | ✅ 原生 | ⚠️ 需插件 | ⚠️ 需配置 | ⚠️ 手动 |
| Main/Preload HMR | ✅ 热重载 | ⚠️ 需配置 | ❌ 需 nodemon | ❌ |
| Renderer HMR | ✅ Vite HMR | ✅ Vite HMR | ⚠️ 较慢 | ❌ |
| TypeScript 开箱即用 | ✅ | ✅ | ⚠️ 需 loader | ⚠️ 手动 |
| Vue/React/Svelte 支持 | ✅ 开箱即用 | ✅ | ⚠️ 需 loader | ⚠️ 手动 |
| V8 字节码编译 | ✅ 内置 | ❌ | ❌ | ❌ |
| 源码保护 | ✅ | ❌ | ❌ | ❌ |
| Worker/Child Process | ✅ 简化 | ⚠️ | ⚠️ | ⚠️ |
| 社区活跃度 | 🔥 快速成长 | 🔥🔥 成熟 | 🔥🔥 成熟 | N/A |

### 决策：electron-vite ✅

**核心理由**：

1. **为 Electron 而生** — electron-vite 专为 Electron 多入口架构设计，天然理解 main / preload / renderer 三个构建目标，不需要手动拼接 webpack 配置。

2. **Vite 内核** — 继承 Vite 所有优势：毫秒级 HMR、ESBuild 转译 TypeScript、Rollup 生产打包。Renderer 侧开发体验与普通 Vite + Vue 项目完全一致。

3. **Main 进程热重载** — 修改主进程代码后自动重启，不需要 `nodemon` 或手动刷新，开发效率大幅提升。

4. **V8 字节码保护** — 可将 Main 进程代码编译为 V8 bytecode，防止源码被反编译，对商业桌面 App 是加分项。

5. **零配置启动** — `npm create @quick-start/electron` 一行命令创建 Vue + TypeScript + Electron 完整脚手架。

**项目结构（electron-vite 预设）**：

```
src/
├── main/           # 主进程 (Node.js)
│   └── index.ts    # Agent、LanceDB、文档解析
├── preload/        # 预加载脚本
│   └── index.ts    # contextBridge 白名单 API
└── renderer/       # 渲染进程 (Vue 3)
    ├── App.vue     # Sidebar 入口
    ├── components/ # UI 组件
    └── stores/     # Pinia 状态管理
```

---

## 9. UI 框架选型

### 候选对比

| 维度 | **Vue 3 + TypeScript** | React + TypeScript | 原生 TypeScript |
|------|:---------------------:|:-----------------:|:--------------:|
| 响应式系统 | `ref`/`reactive` 自动追踪，心智负担低 | `useState`/`useMemo`/`useCallback` 需手动优化 | 手动 DOM diff |
| 双向绑定 | `v-model` 原生支持，表单场景极简 | 受控组件模式，样板代码多 | 手动 `addEventListener` |
| 包体积 (运行时) | ~33KB (Vue runtime) | ~40KB (React + ReactDOM) | 0 |
| SFC 单文件组件 | ✅ 模板/逻辑/样式在一起 | ❌ JSX + 分离的 CSS | N/A |
| 学习曲线 | ⭐⭐ (直观) | ⭐⭐⭐ (Hooks 心智模型) | ⭐ (简单但低效) |
| TypeScript 支持 | ✅ 优秀 (Composition API) | ✅ 优秀 | ✅ 原生 |
| 生态规模 | 🔥🔥 大 | 🔥🔥🔥 最大 | N/A |
| electron-vite 集成 | ✅ 一等公民 | ✅ 一等公民 | ✅ |

### 决策：Vue 3 + Composition API + TypeScript ✅

**核心理由**：

1. **表单场景天然契合** — 本项目的核心 UI 是**表单字段候选列表**，`v-model` 双向绑定让表单交互代码量减少 30-40%。每个字段的 `FieldCard` 组件用 SFC 写，模板、逻辑、样式在一个 `.vue` 文件中，维护成本低。

2. **更轻的运行时** — Vue 3 runtime (~33KB) 比 React (~40KB) 轻约 20%，对 Sidebar 这种常驻面板更友好。

3. **响应式系统更直观** — `ref()` 和 `reactive()` 自动收集依赖，不需要 `useMemo`/`useCallback` 手动优化。对 Sidebar 这种状态密集（候选列表、置信度、筛选条件）的 UI，减少不必要的重渲染心智负担。

4. **electron-vite 一等支持** — electron-vite 对 Vue 和 React 都是开箱即用，但 Vue 的 SFC + Vite 组合更轻更快。

**为什么不是 React？**
- React 在 Electron 生态确实用户最多，但本项目 Sidebar 是紧凑面板而非复杂 SPA，React 的 Concurrent Features、Suspense 等高级特性用不上。
- 表单填充场景下，React 受控组件的 `value`+`onChange` 模式比 Vue 的 `v-model` 冗余。

**为什么不是原生 TypeScript？**
- Sidebar 有候选值列表（排序/筛选/分组）、置信度可视化、知识库面板、审计日志等多个交互组件。原生 DOM 操作会迅速失控。

### UI 技术栈（实际采用）

| 层 | 选型 | 理由 |
|----|------|------|
| UI 框架 | **Vue 3 + Composition API** | 轻量、表单场景最自然、electron-vite 一等支持 |
| 类型系统 | **TypeScript** | 类型安全，IPC 接口类型共享 |
| 构建工具 | **electron-vite** | 专为 Electron 设计，Vite 内核 |
| 样式 | **纯 CSS** | 简洁、无额外依赖、Sidebar 紧凑面板 |
| 状态管理 | **Composables (provide/inject)** | `useSession`、`useChat`、`useWebview` 等 composable 管理状态 |
| 国际化 | **自定义 composable** | `useI18n` 零依赖、类型安全、101 个翻译 key |
| 流式渲染 | **marked + DOMPurify** | Markdown 消息渲染 |

---

## 10. IPC 通信设计

### 安全模型 & 实际通道

所有 IPC 通过 `contextBridge` 白名单暴露，Renderer 永远不能直接访问 Node.js API。

```typescript
// preload/index.ts — Sidebar 侧暴露的 5 组 API

// ① Sidebar API (window.api)
contextBridge.exposeInMainWorld('api', {
  openLocalFile: () => ipcRenderer.invoke('open-local-file'),
  detectFields: (webContentsId) => ipcRenderer.invoke('detect-fields', webContentsId),
  summarizePage: (config, messages) => ipcRenderer.invoke('page:summarize', config, messages),
})

// ② LLM API (window.llmApi)
contextBridge.exposeInMainWorld('llmApi', {
  testConnection: (config) => ipcRenderer.invoke('model:test-connection', config),
  startStream: (config, messages, requestId, options?) => ipcRenderer.send('llm:stream:start', ...),
  stopStream: () => ipcRenderer.send('llm:stream:stop'),
  onStreamChunk: (cb) => ipcRenderer.on('llm:stream:chunk', cb),
  onStreamError: (cb) => ipcRenderer.on('llm:stream:error', cb),
})

// ③ Nav API (window.navApi)
contextBridge.exposeInMainWorld('navApi', {
  onNavAction: (cb) => ipcRenderer.on('nav:action', cb),
  addRecent: (url) => ipcRenderer.invoke('nav:add-recent', url),
  getRecent: () => ipcRenderer.invoke('nav:get-recent'),
  setLocale: (locale) => ipcRenderer.send('settings:set-locale', locale),
})

// ④ AI Tip API (window.aiTipApi)
contextBridge.exposeInMainWorld('aiTipApi', {
  onFieldSelected: (cb) => ipcRenderer.on('ai-tip:field-selected', cb),
})

// ⑤ Electron API (window.electron) — @electron-toolkit/preload
```

**15 个 IPC 通道总览**：

| 通道 | 方向 | 类型 | 用途 |
|------|------|------|------|
| `open-local-file` | Renderer→Main | invoke | 打开本地 HTML 文件 |
| `detect-fields` | Renderer→Main | invoke | CDP 字段检测 |
| `model:test-connection` | Renderer→Main | invoke | 测试 LLM 连接 |
| `page:summarize` | Renderer→Main | invoke | LLM 页面摘要（非流式） |
| `llm:stream:start` | Renderer→Main | send | 开始流式聊天 |
| `llm:stream:stop` | Renderer→Main | send | 取消流式聊天 |
| `llm:stream:chunk` | Main→Renderer | push | 流式 token |
| `llm:stream:error` | Main→Renderer | push | 流式错误 |
| `nav:action` | Main→Renderer | push | 菜单导航命令 |
| `nav:add-recent` | Renderer→Main | invoke | 添加最近 URL |
| `nav:get-recent` | Renderer→Main | invoke | 获取最近 URL |
| `settings:set-locale` | Renderer→Main | send | 切换语言 |
| `ai-tip:field-selected` | WebView→Renderer | sendToHost | AI Tip 按钮点击 |
| `ai-tip:fill-result` | WebView→Renderer | sendToHost | 回填结果 |

> 🔜 Phase 3+ 待添加：`kb:search`、`kb:upload`、`kb:list`、`agent:run` 等知识库和 Agent 通道

---

## 最终决策汇总

| 层 | ✅ 决策 | 状态 | 决策驱动力 |
|----|---------|:----:|-----------|
| 桌面框架 | **Electron** | ✅ | `<webview>` 是硬依赖 |
| WebView | **`<webview>`** | ✅ | 需要 preload + executeJavaScript |
| 字段检测 | **CDP Accessibility API** | ✅ | 零注入、覆盖 Shadow DOM |
| 构建工具 | **electron-vite** | ✅ | Electron 多入口原生支持、Vite 内核 |
| UI | **Vue 3 + 纯 CSS** | ✅ | 表单场景最自然、轻量 |
| 状态管理 | **Composables + provide/inject** | ✅ | 简洁、无额外依赖 |
| 国际化 | **自定义 composable** | ✅ | 零依赖、类型安全 |
| LLM 适配 | **Adapter 接口 + Registry** | ✅ | 10 个 Provider，一行扩展 |
| LLM 流式 | **SSE 解析 + 重试 + 超时** | ✅ | 120s 超时、3 次重试 |

### Phase 3+ 预留选型（文档内保留，待实施时最终确认）

| 层 | 预留方案 | 备选 |
|----|---------|------|
| 向量库 | LanceDB | ChromaDB |
| 嵌入 (中文) | bge-small-zh | bge-large-zh |
| 嵌入 (英文) | all-MiniLM-L6-v2 | — |
| LLM (默认) | Ollama + qwen2.5:7b | llama3.2:3b |
| Agent 框架 | 自建 ReAct | Vercel AI SDK |
| 文档解析 | pdf-parse + mammoth + turndown | — |
