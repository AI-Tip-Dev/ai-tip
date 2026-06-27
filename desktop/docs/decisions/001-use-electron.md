# ADR-001: 选择 Electron 作为桌面框架

**状态**: ✅ 已采纳
**日期**: 2026-06
**决策者**: 项目组
**关联**: [02 系统架构](../02-system-architecture.md)

---

## 背景

需要构建一个桌面应用，核心需求是：
1. 嵌入任意网页并安全隔离（不受同源策略限制）
2. 向网页注入 JavaScript（表单检测、AI Tip 按钮、回填）
3. Node.js 生态的 AI/ML 库可用（LLM SDK、文档解析等）

## 方案对比

| 维度 | Electron | Tauri |
|------|:---:|:---:|
| `<webview>` 独立浏览器上下文 | ✅ 原生 | ❌ 不支持 |
| preload 脚本注入 | ✅ | ❌ |
| Node.js 生态 | ✅ npm 全生态 | ⚠️ 需 Rust FFI |
| 应用体积 | ~150MB | ~5MB |

## 决策

选择 **Electron**。

## 后果

- ✅ `<webview>` 标签提供独立的 Chromium 渲染进程，满足安全隔离 + JS 注入需求
- ✅ `contextBridge` + `ipcRenderer` 安全通信模型
- ✅ 可直接使用 npm 生态（`electron-log`、`marked`、`@electron-toolkit/*`）
- ⚠️ 包体积 ~150MB（桌面办公场景可接受，对标 VS Code / Slack）
- ❌ Tauri 被否决：无 `<webview>` 等效能力，无法安全隔离外部网页
