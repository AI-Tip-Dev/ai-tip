# 06 — 开发计划与项目管理

> **创建**: 2026-06 · **更新**: 2026-06-26
> **关联**: [01 PRD](./01-product-spec.md) · [02 系统架构](./02-system-architecture.md) · [05 表单检测](./05-form-detection-design.md)
> **开发模式**: AI-assisted Spec-Driven Development
> **状态**: Phase 1 ✅ · Phase 2 ✅ · Phase 3-5 ⚪ 规划中

> **每个阶段**: Spec 定义 → AI 生成代码 → 验收 → 进入下一阶段

---

## 📐 AI Spec-Driven 开发流程

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ ① 写 Spec │ → │ ② AI 生成 │ → │ ③ 构建验证 │ → │ ④ 验收测试 │
│  明确输入  │    │  代码实现  │    │  pnpm dev │    │  对照Spec  │
│  输出/约束 │    │  单元测试  │    │  类型检查 │    │  逐项打勾  │
└──────────┘    └──────────┘    └──────────┘    └──────────┘
                                                     │
                                               ✅ 通过 → 下一阶段
                                               ❌ 失败 → 回到 ②
```

**核心原则**:
- **Spec 即契约** — 每个 Task 有明确的输入/输出/验收标准，AI 严格按 Spec 生成
- **渐进增强** — 每个 Phase 产出可运行、可演示的增量，不一口气做到完美
- **类型安全** — 所有 IPC 接口用 TypeScript 类型定义，编译期拦截错误

---

## 📊 总览

| Phase | 主题 | 状态 |
|-------|------|:----:|
| **Phase 1** | 项目骨架 + 基础布局 | ✅ |
| **Phase 2** | 表单检测 + AI Tip + LLM Chat + Session | ✅ |
| **Phase 3** | 知识库（上传/切片/向量检索） | ⚪ |
| **Phase 4** | AI Agent（ReAct + 批量填充） | ⚪ |
| **Phase 5** | 打磨 & 发布（E2E 完善、审计、打包） | ⚪ |

---

## Phase 1 — 项目骨架 ✅

| Task | 说明 | 状态 |
|------|------|:----:|
| 1.1 | electron-vite + Vue 3 + TypeScript 脚手架 | ✅ |
| 1.2 | WebView + Sidebar 左右分栏布局 | ✅ |
| 1.3 | URL 导航栏 + 历史记录（前进/后退/刷新/输入） | ✅ |
| 1.4 | electron-log 日志集成 + 本地文件打开 | ✅ |

---

## Phase 2 — 表单检测 + AI Tip + LLM Chat + Session ✅

> **目标**: 完整的 Chat-First AI Sidebar — CDP 字段检测、✨ AI Tip 按钮、流式 LLM 聊天、双会话模型。
> **已全部实施**: 以下为实际实施的摘要。

### 2.1 — CDP 字段检测 ✅

**实施方式**: Chrome DevTools Protocol `Accessibility.getFullAXTree`，零 JS 注入。
**文件**: `src/main/index.ts`（`detect-fields` IPC handler）、`src/shared/ax-roles.ts`
**要点**: 按 12 个 `FORM_AX_ROLES` 过滤，排除 date/time 子节点，返回 `{ fields, rawNodes }`

### 2.2 — AI Tip ✨ 按钮 ✅

**实施方式**: `executeJavaScript` 注入 IIFE 脚本到 WebView。
**文件**: `src/preload/ai-tip.ts`
**要点**: Hover/focus 时浮现渐变紫色按钮，七级 label 推算，排除 password/敏感字段

### 2.3 — LLM Provider 层 ✅

**实施方式**: Adapter 接口 + Registry 查表，10 个 Provider。
**文件**: `src/main/providers/`（types.ts, registry.ts, chat.ts, adapters/）
**要点**: 22/23 走 baseAdapter（OpenAI 兼容），仅 Anthropic 独立；120s 超时、3 次重试

### 2.4 — 流式聊天 ✅

**实施方式**: SSE 解析 + `marked` 渲染 + `[[OPTIONS]]`/`[[FILL]]` 标记解析。
**文件**: `src/renderer/src/composables/useChat.ts` + 12 个 chat 组件
**要点**: overview/field 双模式 prompt，AbortController 取消

### 2.5 — 双会话模型 + Home/Chat 双视图 ✅

**实施方式**: `PageSessionData` → `SubSession` 树形结构，`SidebarView` 状态机。
**文件**: `src/renderer/src/composables/useSession.ts`、`HomeView.vue`
**要点**: overviewContext 自动提取 Overview AI 回复注入 Field prompt

### 2.6 — 国际化 ✅

**实施方式**: 自定义 `useI18n` composable，101 个翻译 key，零依赖。
**文件**: `src/shared/locales/`（types.ts, en.ts, zh-CN.ts）

### 2.7 — 模型配置 UI ✅

**文件**: `SettingsDialog.vue` + `ModelConfigDialog.vue` + `useModelConfig.ts`
**要点**: 添加/编辑/删除/测试连接，localStorage 持久化

### 2.8 — Page Summary ✅

**IPC**: `page:summarize`（invoke，非流式），按 URL 缓存。
**文件**: `PageSummaryPanel.vue`

### 2.9 — E2E 测试 ✅

**文件**: `e2e/specs/ai-tip-fill.spec.ts`（4 个用例，Playwright + Mock LLM）

### 2.10 — 导航 & 历史记录 ✅

**文件**: `NavToolbar.vue` + `useRecentHistory.ts`，localStorage（max 15）

---

## Phase 3 — 知识库 🔜

> **目标**: 用户上传文档 → 切片 → 向量化 → 存 LanceDB → 语义检索。
> **详细 Spec**: 见 [`docs/archive/phase3-5-planning.md`](./archive/phase3-5-planning.md)（Phase 2 实施后架构变化较大，Phase 3 启动前需基于当前代码重新 Spec）

| 模块 | 说明 |
|------|------|
| 文档解析 | PDF (pdf-parse) / .docx (mammoth) / HTML (turndown) → 纯文本 |
| 文本切片 | chunkSize=500, overlap=50, 中文按句号优先切分 |
| 嵌入服务 | 本地 (bge-small-zh / all-MiniLM-L6-v2) + 云端 (text-embedding-3-small) 双轨 |
| 向量存储 | LanceDB 嵌入式，零配置，磁盘持久化 |
| IPC 通道 | `kb:upload`, `kb:search`, `kb:list`, `kb:delete`（待添加） |

---

## Phase 4 — AI Agent 🔜

> **目标**: 表单字段 → 检索知识库 → LLM 推理 → 候选值 + 来源 + 置信度。

| 模块 | 说明 |
|------|------|
| Agent 循环 | 自建 ReAct Loop（3 个工具: search_kb, fill_field, read_field） |
| 置信度 | >0.8 绿色 / 0.5-0.8 黄色 / <0.5 红色 |
| 来源追溯 | 每个候选值标注来源文档 + 片段位置 |
| UI 交互 | Auto Fill → 加载进度 → 候选值审查 → Apply All |

---

## Phase 5 — 打磨 & 发布 🔜

| 模块 | 说明 |
|------|------|
| 审计日志 | 每次填充操作记录（时间、字段、值、来源、用户决策） |
| 错误处理 | 全局异常兜底、LLM 降级策略、离线模式提示 |
| 性能优化 | 大表单 (>50 字段) 分页检测、消息列表虚拟滚动 |
| E2E 完善 | 扩展 Playwright 测试覆盖（KB 检索、Agent 填充、多 Provider） |
| 打包发布 | electron-builder 配置优化、自动更新 (electron-updater)、代码签名 |
