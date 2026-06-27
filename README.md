# AI Tip — 智能表单填充助手

> 🎯 打开任意网页 → 分析表单 → 检索私有知识库 → AI Agent 决策 → 辅助填充，用户确认后写入。

**核心价值**：把你电脑里的文档（合同、Excel、笔记）变成 AI 填表的答案库，数据不离开本地，不依赖特定平台。

---

## 🏗️ 项目结构

```
ai-tip/
├── desktop/                  # Electron 桌面应用 (主产品)
│   ├── src/
│   │   ├── main/             #   主进程 — LLM 调度、CDP 表单检测、文件 I/O
│   │   ├── preload/          #   预加载脚本 — contextBridge 安全暴露 API
│   │   ├── renderer/         #   渲染进程 — Vue 3 Sidebar (Home / Chat 双视图)
│   │   └── shared/           #   前后端共享类型与常量
│   ├── docs/                 #   Desktop 专属设计文档
│   ├── e2e/                  #   Playwright E2E 测试
│   └── resources/            #   图标、原生资源
│
├── extension/                # Chrome/Edge 浏览器扩展
│   ├── docs/                 #   Extension 专属设计文档
│   └── src/                  #   Content Script + Service Worker + Side Panel
│
├── packages/
│   ├── form-detection/       #   @ai-tip/form-detection — 表单字段检测引擎
│   ├── llm-providers/        #   @ai-tip/llm-providers — 多 LLM 适配器 (10+)
│   └── observability/        #   @ai-tip/observability — LLM 调用追踪与可观测性
│
├── sdk/                      # @ai-tip/sdk — Desktop ↔ Extension 共享类型契约
│   └── docs/                 #   SDK 专属设计文档
│
└── docs/                     # 📚 项目全局文档 (扁平结构)
    ├── 01-product-spec.md            # 产品需求规格
    ├── 02-cross-project-architecture.md  # 三 Repo 跨项目架构
    ├── 03-directory-structure.md     # 目录结构设计
    ├── 04-development-plan.md        # 开发计划
    ├── 05-shared-packages-design.md  # 共享 npm 包设计
    ├── 06-architecture-review.md     # 架构审视与风险评估
    ├── 07-repo-strategy.md           # 仓库策略对比
    └── 08-ai-coding-infra.md         # AI 编码基础设施
```

---

## 🚀 快速开始

### 环境要求

- **Node.js** ≥ 20
- **pnpm** ≥ 9
- **Windows** / macOS / Linux

### 安装与运行

```bash
# 安装依赖
pnpm install

# 启动 Desktop 开发模式
pnpm dev

# 构建所有包
pnpm build

# 运行测试
pnpm test

# 类型检查
pnpm typecheck

# 代码检查
pnpm lint
```

---

## 📚 文档索引

### 全局文档（`docs/`）

| # | 文档 | 说明 |
|---|------|------|
| 01 | [产品需求规格说明书](docs/01-product-spec.md) | PRD，项目愿景、用户旅程、功能清单 |
| 02 | [三 Repo 跨项目架构](docs/02-cross-project-architecture.md) | Desktop × Extension × SDK 架构设计 |
| 03 | [目录结构设计](docs/03-directory-structure.md) | 项目目录规范 |
| 04 | [开发计划](docs/04-development-plan.md) | 迭代计划与里程碑 |
| 05 | [共享 npm 包设计](docs/05-shared-packages-design.md) | 共享包抽取策略 |
| 06 | [架构审视与风险评估](docs/06-architecture-review.md) | 三 Repo 架构回顾 |
| 07 | [仓库策略对比](docs/07-repo-strategy.md) | 多仓库 vs 单仓库对比分析 |
| 08 | [AI 编码基础设施](docs/08-ai-coding-infra.md) | AI 辅助开发方法论 |

### Desktop 专属文档（`desktop/docs/`）

| # | 文档 | 说明 |
|---|------|------|
| 00 | [系统架构设计](desktop/docs/00-system-architecture.md) | Electron 桌面端系统架构 |
| 01 | [UI/UX 设计](desktop/docs/01-ui-ux-design.md) | Chat-First 界面设计、Home/Chat 双视图 |
| 02 | [LLM Provider 设计](desktop/docs/02-llm-provider-design.md) | Adapter 模式、10 个 Provider |
| 03 | [表单检测设计](desktop/docs/03-form-detection-design.md) | CDP AX Tree 字段检测 |
| 04 | [E2E 测试设计](desktop/docs/04-e2e-test-design.md) | Playwright 端到端测试策略 |
| 05 | [国际化设计](desktop/docs/05-i18n-design.md) | 中英文双语方案 |
| 06 | [页面摘要设计](desktop/docs/06-page-summary-design.md) | LLM 页面语义摘要 |
| 07 | [上下文会话设计](desktop/docs/07-context-session-design.md) | 双会话模型、Context 传递 |
| 08 | [批量预填设计](desktop/docs/08-batch-pre-fill-design.md) | 批量字段预填充 + 置信度分层 |
| 09 | [结构化输出设计](desktop/docs/09-structured-output-design.md) | LLM JSON 输出可靠性 |
| 10 | [Observability 设计](desktop/docs/10-observability-design.md) | OTel Tracing、本地查看 |

**Desktop 子文档**：
- [技术决策记录](desktop/docs/decisions/) — 4 篇 ADR（Electron 选型、CDP 检测、适配器模式、双会话模型）
- [Phase 3-5 归档](desktop/docs/archive/phase3-5-planning.md)

### Extension 专属文档（`extension/docs/`）

| # | 文档 | 说明 |
|---|------|------|
| 01 | [扩展架构设计](extension/docs/01-architecture.md) | Content Script + SW + Side Panel |
| 02 | [通信协议设计](extension/docs/02-communication-protocol.md) | 三层进程间通信 |
| 03 | [表单检测设计](extension/docs/03-form-detection.md) | DOM 级字段检测方案 |
| 04 | [目录结构设计](extension/docs/04-directory-structure.md) | 扩展目录与构建规范 |

### SDK 专属文档（`sdk/docs/`）

| # | 文档 | 说明 |
|---|------|------|
| 01 | [SDK 契约设计](sdk/docs/01-sdk-design.md) | `@ai-tip/sdk` 完整 API 设计 |

---

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| **桌面框架** | Electron 35 |
| **前端框架** | Vue 3 (Composition API) + TypeScript |
| **构建工具** | electron-vite (桌面) / Vite (扩展) |
| **包管理** | pnpm workspace (monorepo) |
| **测试** | Vitest (单元) + Playwright (E2E) |
| **代码规范** | ESLint + Prettier |
| **LLM** | 多 Provider 适配 (OpenAI / Anthropic / 本地模型) |
| **向量数据库** | 本地嵌入式向量库 |
| **表单检测** | CDP Accessibility Tree / DOM querySelector |

---

## 📄 许可证

Private — 内部项目
