# AI Tip — 智能表单填充助手

> 🎯 **不改一行代码，AI 帮你在任何网页自动填表。**

**一句话**：打开任意网页 → 自动检测表单 → AI 从你的合同/Excel/文档中检索答案 → 你审核确认 → 一键填入。**数据全程不离开你的电脑。**

---

## 为什么做这个？

每天有无数的销售、财务、HR、行政在 CRM、ERP、OA 系统里做同一件事：

> 翻 PDF → Ctrl+C → 切窗口 → Ctrl+V → 切回来 → 找下一个字段 → 重复 20 次。

现有工具要么只填账号密码（密码管理器），要么要逐站配置（RPA），要么把数据传到云端（大多数 AI 工具）。**没有一个工具能做到：理解你电脑里的私有文档 + 任意网站通用 + 数据不出本地。**

这就是 AI Tip 要解决的问题。

---

## 🎬 看看效果

| 单字段填充 | 批量填充 |
|-----------|---------|
| 鼠标悬停字段 → 点击 ✨ → AI 从你的文档检索 → 返回候选值+来源+置信度 → 确认填入 | 一键分析 15+ 字段 → 并发检索 → 逐个推荐 → 审核后全部填入 |

👉 在线演示：[ai-tip-dev.github.io/ai-tip](https://ai-tip-dev.github.io/ai-tip)

---

## 📊 当前进度

> **Phase 1-2 已完成，Phase 3-5 规划中。项目处于早期阶段，欢迎参与！**

| Phase | 主题 | 状态 |
|-------|------|:----:|
| Phase 1 | 项目骨架 + Electron 基础布局 | ✅ |
| Phase 2 | 表单检测 + AI Tip 按钮 + LLM 聊天 + 会话管理 | ✅ |
| Phase 3 | 知识库（文档上传 / 切片 / 向量检索） | 🔜 |
| Phase 4 | AI Agent（ReAct 循环 / 批量填充 / 置信度分层） | 🔜 |
| Phase 5 | 打磨发布（E2E 完善 / 审计日志 / 打包分发） | ⚪ |

### 已完成 ✅

- **网页嵌入**：Electron WebView 加载任意 URL，左侧网页右侧 Sidebar，支持前进/后退/刷新
- **表单检测**：CDP `Accessibility.getFullAXTree` 零注入识别所有可见表单字段（input、select、textarea）
- **AI Tip 按钮**：鼠标悬停字段时浮现 ✨ 按钮，点击触发 AI 建议
- **LLM 聊天**：Chat-First 界面，支持流式响应，10 个 Provider（OpenAI、Anthropic、DeepSeek、Ollama、阿里云百炼、智谱、硅基流动、Moonshot、OpenRouter、自定义）
- **双会话模型**：Home（页面全局）+ Chat（字段级钻入），上下文隔离

### 待实现 🔜

- **知识库**：PDF/Excel/Markdown 上传 → 切片 → 向量化 → 本地 LanceDB 存储 → 语义检索
- **Agent 填充**：ReAct 循环 → 多步推理 → 逐个字段检索+填充+校验 → 置信度分层
- **浏览器扩展**：Chrome/Edge Extension，与 Desktop 共享 SDK 契约
- **打包发布**：macOS/Windows 安装包、自动更新、审计日志

---

## 🤝 如何参与？

AI Tip 目前是一个**个人驱动的开源项目**，非常欢迎任何形式的贡献。不管你是写代码、写文档、提建议、还是单纯被填表折磨想吐槽，都可以参与。

### 我能做什么？

| 你的技能 | 可以参与的方向 |
|---------|-------------|
| 🖥️ **前端 / Electron** | Sidebar UI 优化、表单检测增强、WebView 交互 |
| 🧠 **AI / LLM** | 新增 Provider 适配器、优化 Prompt、Agent 推理链路 |
| 🐍 **Python / 数据处理** | 文档解析（PDF/Excel/Word）、切片策略、向量检索调优 |
| 🧪 **测试** | E2E 测试用例、边界场景覆盖、表单兼容性测试 |
| ✍️ **文档 / 产品** | 用户文档、产品文案、使用教程、Issue 管理 |
| 🎨 **设计** | UI/UX 改进、Sidebar 交互优化、Logo/品牌设计 |

### 第一步：把项目跑起来

```bash
# 环境要求：Node.js ≥ 20、pnpm ≥ 9

pnpm install
pnpm dev      # 启动 Desktop 开发模式
```

### 第二步：找一个 Issue 开始

去看看 [Issues](https://github.com/ai-tip-dev/ai-tip/issues)，找标了 `good first issue` 或 `help wanted` 的，挑一个感兴趣的入手。

不确定做什么？这些方向总有一个适合你：
- 加一个新的 LLM Provider 适配器
- 给某个 SaaS 系统的表单写检测规则
- 修复一个 UI 交互 Bug
- 写一篇使用教程

### 第三步：提交 PR

1. Fork 本仓库
2. 创建你的特性分支 (`git checkout -b feat/xxx`)
3. 确保类型检查和测试通过 (`pnpm typecheck && pnpm test`)
4. 提交 PR，描述你做了什么、为什么这样做

---

## 🧭 开发最佳实践

### 1. Spec-Driven Development（规范驱动开发）

本项目采用 **先写 Spec，再写代码** 的开发模式：

```
写 Spec（明确输入/输出/约束）→ AI 辅助生成代码 → 构建验证 → 对照 Spec 验收
```

每篇 Spec 放在 `docs/` 目录下，是代码的唯一事实来源。提交 PR 时，如果涉及新功能或大改动，请先更新或新建对应的 Spec。

👉 参考：[AI 编码基础设施](docs/08-ai-coding-infra.md)

### 2. 模块化 & 契约优先

项目采用 pnpm monorepo，公共能力抽取为独立包：

- `packages/form-detection` — 表单检测引擎，桌面端和扩展端共享
- `packages/llm-providers` — LLM 适配器，新增 Provider 只需实现一个接口
- `packages/observability` — 调用追踪，所有 LLM 调用自动埋点
- `sdk/` — 类型契约，桌面端和扩展端通过同一份类型定义通信

**原则**：能复用的绝不写两遍，能抽象的绝不硬编码。

### 3. 类型安全

全部 TypeScript strict mode，所有 IPC 接口、API 契约有明确的类型定义。编译期能拦住的问题，不要留到运行时。

### 4. 隐私优先

- 所有文档处理、向量检索默认在本地执行
- LLM 调用可选本地模型（Ollama），完全不联网
- 不做任何数据上传、不收集任何使用统计
- 新增功能时，默认假设：**用户的数据只属于用户**

### 5. Commit 规范

使用约定式提交：
- `feat:` 新功能
- `fix:` Bug 修复
- `docs:` 文档变更
- `refactor:` 重构
- `test:` 测试相关
- `chore:` 构建/工具变更

---

## 🏗️ 项目结构

```
ai-tip/
├── desktop/           # Electron 桌面应用（主产品）
├── extension/         # Chrome/Edge 浏览器扩展
├── packages/
│   ├── form-detection/  # 表单字段检测引擎
│   ├── llm-providers/   # 多 LLM 适配器
│   └── observability/   # LLM 调用追踪
├── sdk/               # 共享类型契约 npm 包
├── docs/              # 全局设计文档
└── gh-pages/          # 项目官网与在线演示
```

详细设计文档：[docs/](./docs/)

---

## 🛠️ 技术栈

Electron 35 · Vue 3 (Composition API) · TypeScript · pnpm workspace · Vitest · Playwright · LanceDB · CDP

---

## 📄 许可证

MIT

