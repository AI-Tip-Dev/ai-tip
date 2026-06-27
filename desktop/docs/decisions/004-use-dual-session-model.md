# ADR-004: 采用 Home + Chat 双视图双会话模型

**状态**: ✅ 已采纳
**日期**: 2026-06
**决策者**: 项目组
**关联**: [03 UI/UX 设计](../03-ui-ux-design.md) · [10 Context Session 设计](../10-context-session-design.md)

---

## 背景

早期设计将 LLM 能力拆成"AI 推荐面板" + "知识库问答对话框"两个独立 UI，导致：
- 用户在两个界面间切换，认知负担高
- 表单填充和页面讨论无法自然融合
- 丢失对话历史

## 方案对比

| 维度 | Home + Chat 双视图 | 面板式（多 Tab） |
|------|:---:|:---:|
| 会话分离 | Page ↔ Field 清晰独立 | 混在同一个消息列表 |
| Context 可见性 | ContextBadge 可展开审查 | 隐式注入，不可见 |
| 切换效率 | FieldPills 一键切换 | 需切换 Tab/面板 |
| 学习成本 | 会打字就会用 | 需理解多个面板 |

## 决策

选择 **Home + Chat 双视图 + 双会话模型**。

核心概念：
- **Page Session**：URL 加载时创建，含自动 Overview 子会话
- **Page Chat**：页面级讨论，始终存在
- **Field Session**：用户点击 ✨ 时创建，附属 Page
- **overviewContext**：自动从 Overview AI 回复提取，注入 Field prompt

## 后果

- ✅ Home 视图：当前 Page Card（Overview + 有 Session 的 Fields）+ 历史 Pages
- ✅ Chat 视图：Header 面包屑 + FieldPills 快速切换 + ContextBadge + 消息区
- ✅ overviewContext 优先级：Overview AI 回复 > 自动摘要 > 空
- ✅ 状态管理：`useSession` composable（`PageSessionData[]` → `SubSession[]`）
- ⚠️ 当前无知识库，Field 对话的 context 仅有 Page Summary（Phase 3 后加入 KB 检索结果）
