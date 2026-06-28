# Extension Options Page — Design Doc

## 概述

Extension 的 Options 页面（`chrome-extension://xxx/options.html`）是 AI Tip 的设置入口，用于管理 AI 模型配置和语言偏好。

## 设计原则

**"Desktop Dialog → Full Page"**：直接把 Desktop 的 `SettingsDialog.vue` 从 Modal 对话框改为全屏页面。

- Desktop `SettingsDialog.vue` 是一个 `<Teleport to="body">` + overlay 的模态对话框（720×520px）
- Extension Options 页面把它变成 **全屏页面**，去掉 overlay/close 按钮，保留相同的布局结构和交互

## 布局结构

```
┌─────────────────────────────────────────────────┐
│  Left Nav (180px)    │  Main Content             │
│                      │                           │
│  🧠 Models           │  ┌─ Header ──────────────┐│
│                      │  │ Model Configuration   ││
│  🌐 Language         │  │ Connect to your ...   ││
│                      │  │           [+ Add Model]││
│                      │  └───────────────────────┘│
│                      │                           │
│                      │  ┌─ Model Card ─────────┐ │
│                      │  │ GPT-4o      [Active] │ │
│                      │  │ gpt-4o · OpenAI · ...│ │
│                      │  │ [Edit]  [Delete]     │ │
│                      │  │ ──────────────────   │ │
│                      │  │ [Set Active] [Test]  │ │
│                      │  └──────────────────────┘ │
│                      │                           │
│                      │  ┌─ Inline Form ────────┐ │
│                      │  │ Provider: [...]      │ │
│                      │  │ Model Name: [...]    │ │
│                      │  │ ...                  │ │
│                      │  │ [Cancel] [Save]      │ │
│                      │  └──────────────────────┘ │
└─────────────────────────────────────────────────┘
```

## Design System（与 Desktop 一致）

| Token | Value | 用途 |
|---|---|---|
| `--bg-page` | `#f8fafc` | 页面背景 |
| `--bg-card` | `#fff` | 卡片/内容区背景 |
| `--border` | `#e2e8f0` | 默认边框 |
| `--border-hover` | `#cbd5e1` | 悬停边框 |
| `--border-active` | `#93c5fd` | 选中边框 |
| `--text-primary` | `#1e293b` | 主文字 |
| `--text-secondary` | `#475569` | 次文字 |
| `--text-muted` | `#94a3b8` | 弱化文字 |
| `--accent` | `#2563eb` | 主题色 |
| `--accent-bg` | `#dbeafe` | 主题背景 |
| `--success` | `#15803d` | 成功色 |
| `--danger` | `#ef4444` | 危险色 |
| `--radius-sm` | `6px` | 小圆角 |
| `--radius-md` | `8px` | 中圆角 |
| `--radius-lg` | `10px` | 大圆角 |
| `--radius-xl` | `12px` | 超大圆角 |
| `--font-mono` | `SF Mono, monospace` | 等宽字体 |
| `--font-sans` | `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` | 无衬线字体 |

## 关键交互

### 1. 左侧导航
- 两个 tab：`🧠 Models` / `🌐 Language`
- 选中态：`background: #dbeafe; color: #2563eb;`
- 点击切换右侧内容区

### 2. Model 卡片
- 顶部行：DisplayName + Active badge + Edit/Delete 按钮
- 中间行：model name · provider · source
- 底部分隔行：Set Active + Test Connection + 测试结果

### 3. 添加/编辑 Model（Inline Form）
- 点击 `+ Add Model` → 列表顶部展开表单卡片（入场动画 `0.15s ease-out`）
- 点击 `Edit` → 该卡片内容替换为表单
- 表单字段与 Desktop `ModelConfigDialog.vue` 完全一致：
  - Provider (select)
  - Model Name (required)
  - Display Name (optional)
  - Base URL (required, remote only)
  - API Key (with show/hide toggle)
  - Custom Headers (+ Add row)
  - Test Connection button
  - Advanced Options (collapsible): Temperature slider + Max Tokens
- 点击 `Save` → 保存并收起表单
- 点击 `Cancel` → 放弃并收起表单

### 4. Language 设置
- Radio 列表：中文(简体) / English / 日本語
- 选中态用 radio button + 高亮行

## 与 Desktop 的对比

| 维度 | Desktop | Extension |
|---|---|---|
| 容器 | `<Teleport>` + overlay + 720×520px 对话框 | 全屏 `100vh` 页面 |
| 关闭 | ✕ 按钮 + Esc + 点击 overlay | 浏览器标签页关闭 |
| 导航 | 相同 | 相同 |
| Model 卡片 | 相同 | 相同 |
| Add/Edit | `<ModelConfigDialog>` Modal | **内嵌表单**（同一页面内展开） |
| Language | Radio 列表 | Radio 列表（相同） |
| 字体 | 系统字体 | 系统字体（相同） |
| 颜色体系 | 完全一致 | 完全一致 |

## 文件清单

| 文件 | 说明 |
|---|---|
| `extension/src/entrypoints/options/OptionsApp.vue` | 主页面组件 |
| `extension/src/entrypoints/options/types.ts` | 共享类型定义 |
| `extension/src/entrypoints/options/index.html` | HTML 入口 |
| `extension/src/entrypoints/options/main.ts` | Vue 挂载入口 |
| `extension/wxt.config.ts` | WXT 配置（含 `open_in_tab: true` hook） |
| `desktop/.../SettingsDialog.vue` | 参照源 |
| `desktop/.../ModelConfigDialog.vue` | 表单参照源 |
