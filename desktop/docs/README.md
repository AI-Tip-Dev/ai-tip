# Electron AI Sidebar — 文档中心

> **项目**: 桌面 AI 表单填充助手 | Electron + Vue 3 + TypeScript
> **更新**: 2026-06-26 | **状态**: Phase 2 已完成，Phase 3 规划中

---

## � 目录结构

```
docs/
├── README.md                       # 文档索引（本文件）
│
├── 01-product-spec.md              # PRD：产品愿景、用户旅程、功能清单
├── 02-system-architecture.md       # SAD：技术选型、进程模型、IPC 设计
├── 03-ui-ux-design.md              # UI Design：Chat-First、Home/Chat 双视图
├── 04-llm-provider-design.md       # Subsystem：Adapter 模式、10 个 Provider
├── 05-form-detection-design.md     # Feature：CDP 字段检测、逐字模拟填充
├── 06-development-plan.md          # Plan：Phase 1-5 总览、当前进度
├── 07-e2e-test-design.md           # Test：Playwright E2E 策略 + 用例
├── 08-i18n-design.md               # Feature：中英文双语、101 translation keys
├── 09-page-summary-design.md       # Feature：LLM 页面摘要、Context 聚合
├── 10-context-session-design.md    # UI/UX：双会话模型、Context 传递机制
├── 11-batch-pre-fill-design.md    # Feature：批量预填 + 置信度分层 + 单字段精修
├── 12-llm-structured-output-design.md  # Research：LLM 结构化 JSON 输出可靠性
├── 13-llm-observability-design.md   # Subsystem：OTel Tracing、本地查看、LangFuse/Aspire 导出
├── 14-electron-js-sdk-architecture.md  # Research：借鉴 WebView2 AddHostObjectToScript，preload + contextBridge 双库架构
│
├── decisions/                      # ADR 决策记录
│   ├── 001-use-electron.md
│   ├── 002-use-cdp-for-detection.md
│   ├── 003-use-adapter-pattern.md
│   └── 004-use-dual-session-model.md
│
├── archive/                        # 归档
│   └── phase3-5-planning.md        # Phase 3-5 早期 Task Spec（待重新设计）
│
└── appendix/
    └── ai-coding-infra.md          # AI 编码基础设施
```

## 📚 文档导航

| 编号 | 文档 | 类型 | 说明 | 状态 |
|:---:|------|:----:|------|:----:|
| 01 | [产品需求规格说明书](./01-product-spec.md) | **PRD** | 产品愿景、用户旅程、功能清单、竞品分析 | ✅ 活跃 |
| 02 | [系统架构设计文档](./02-system-architecture.md) | **SAD** | 技术选型、进程模型、IPC 设计 | ✅ 活跃 |
| 03 | [UI/UX 设计文档](./03-ui-ux-design.md) | **UI Design** | Chat-First、Home/Chat 双视图、AI Tip 按钮 | ✅ 活跃 |
| 04 | [LLM Provider 子系统设计](./04-llm-provider-design.md) | **Subsystem** | Adapter 模式、10 Provider、流式聊天 | ✅ 已实施 |
| 05 | [表单检测与智能填充设计](./05-form-detection-design.md) | **Feature** | CDP 字段检测、回填安全、逐字模拟 | ✅ 已实施 |
| 06 | [开发计划与项目管理](./06-development-plan.md) | **Plan** | Phase 1-2 已完成、Phase 3-5 规划 | ✅ 活跃 |
| 07 | [E2E 测试设计](./07-e2e-test-design.md) | **Test** | Playwright 策略、4 个用例、Mock LLM | ✅ 已实施 |
| 08 | [i18n 国际化设计](./08-i18n-design.md) | **Feature** | 中英文双语、composable、菜单同步 | ✅ 已实施 |
| 09 | [Page Summary 设计](./09-page-summary-design.md) | **Feature** | LLM 摘要、字段关系、Context 聚合 | ✅ 已实施 |
| 10 | [双会话 Context 传递设计](./10-context-session-design.md) | **UI/UX** | Home+Chat 双视图、Context 继承 | ✅ 已实施 |
| 11 | [批量预填与单字段精修设计](./11-batch-pre-fill-design.md) | **Feature** | 用户触发全量预填、生成所有 Field Session、每个字段可深加工 | ✅ 已实施 |
| 12 | [LLM 结构化输出可靠性设计](./12-llm-structured-output-design.md) | **Research** | AX tree 预处理、json_schema 约束、JSON 修复、field 一致性 | ✅ 已实现 |
| 13 | [LLM Observability & Tracing 设计](./13-llm-observability-design.md) | **Subsystem** | OTel Tracing、本地 Traces 查看器、LangFuse/Aspire 导出 | 📋 设计中 |
| 14 | [Electron + JS SDK 双库架构](./14-electron-js-sdk-architecture.md) | **Research** | 借鉴 WebView2 AddHostObjectToScript，preload + contextBridge 双库 | 📋 调研中 |
| — | [ADR 决策记录](./decisions/) | **Decisions** | 4 个关键架构决策 | ✅ 活跃 |
| — | [AI 编码基础设施](./appendix/ai-coding-infra.md) | **附录** | `.agents/` 体系、Skills、VS Code 集成 | 📋 已实施 |
| — | [Phase 3-5 早期规划](./archive/phase3-5-planning.md) | **归档** | 原始 Task Spec，Phase 3 启动前需重设计 | 📦 已归档 |

---

## 🗺️ 阅读路线

```
新手入门:          01 PRD → 02 架构概览 → 06 开发计划
前端开发者:        03 UI 设计 → 10 Context Session → 01 PRD
后端/AI 开发者:    04 LLM Provider → 05 表单检测 → 02 架构
项目管理者:        01 PRD → 06 开发计划 → decisions/
了解决策背景:      decisions/ 下的 4 个 ADR
```

---

## 📐 文档规范

- **PRD** (Product Requirements Document): 定义"做什么"和"为什么"
- **SAD** (Software Architecture Document): 定义"怎么做"的技术方案
- **ADR** (Architecture Decision Record): 记录关键架构决策及其后果
- **UI Design**: 定义用户交互和视觉规范
- **Subsystem / Feature Design**: 定义子系统的详细接口和实现
- **Plan**: 定义迭代计划和任务管理

所有文档采用 Markdown 格式，包含 Mermaid 图表，关联文档间交叉引用。

---

## 🔄 文档维护规则

1. **PRD 优先** — 需求变更必须先更新 PRD，再同步架构和计划
2. **ADR 不可变** — 已采纳的 ADR 只增不改；废弃时新建 ADR 标记"已替代"并引用新 ADR
3. **代码同步** — 修改代码涉及文档描述的，同 PR 更新文档
4. **交叉引用** — 每个文档顶部标注关联文档链接
5. **版本标注** — 每个文档标注创建时间和最后更新
6. **归档而非删除** — 不再使用的文档移至 `archive/` 并标注废弃原因
7. **Plan 保持精简** — 开发计划只保留 Phase 摘要；详细 Task Spec 在进入 Phase 时重写
