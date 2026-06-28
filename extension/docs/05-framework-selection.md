# 05 — 跨浏览器插件开发框架选型

> **创建**: 2026-06-27 · **状态**: ✅ 已完成
> **关联**: [01 — 架构总览](./01-architecture.md) · [04 — 目录结构与构建](./04-directory-structure.md)
> **场景**: 评估主流浏览器插件开发框架，为 AI Tip Extension 选择最佳技术方案

---

## 📋 文档导航

> - [一句话结论](#一句话结论) · [候选框架](#候选框架) · [对比矩阵](#对比矩阵)
> - [深度分析](#深度分析) · [与项目匹配度](#与项目匹配度) · [迁移路径](#迁移路径)

---

## 一句话结论

> 🎯 **推荐 WXT** — 它是 2026 年最成熟、维护最活跃的跨浏览器插件框架，对 Vue 3 + TypeScript 有一流支持，且能最大程度保留现有 manifest.json 控制力和共享 npm 包体系。

如果只需 Chrome/Edge、快速上线 → **CRXJS** 也可以考虑（零配置、最轻量）。
如果需要 React 生态、"Next.js 风格"开发体验 → **Plasmo**。
如果追求最简、从零新建 → **Extension.js**。

---

## 候选框架

| 框架 | 定位 | GitHub Stars | npm 周下载 | 许可证 |
|------|------|:-----------:|:----------:|:------:|
| [**WXT**](https://wxt.dev) | 全功能跨浏览器框架 | ~6k+ | ~15k/wk | MIT |
| [**Plasmo**](https://docs.plasmo.com) | "Next.js for Extensions" | ~10k+ | ~25k/wk | MIT |
| [**CRXJS**](https://crxjs.dev) | Vite/Rollup 插件 | ~4.1k | ~20k/wk | MIT |
| [**Extension.js**](https://extension.js.org) | 新一代零配置框架 | ~2k+ | ~3k/wk | MIT |

---

## 对比矩阵

### 浏览器支持

| 浏览器 | WXT | Plasmo | CRXJS | Extension.js |
|--------|:---:|:------:|:-----:|:------------:|
| Chrome | ✅ | ✅ | ✅ | ✅ |
| Firefox | ✅ | ✅ | 🟡 beta | ✅ |
| Edge | ✅ | ✅ | 🟡 beta | ✅ |
| Safari | ✅ | ✅ | ❌ | ❌ |
| Opera | ✅ | ✅ | ❌ | ✅ |
| Brave | ✅ | ✅ | ❌ | ✅ |

> **WXT 是唯一对全部主流浏览器都提供 Production 级别支持的框架。**

### 技术栈支持

| 特性 | WXT | Plasmo | CRXJS | Extension.js |
|------|:---:|:------:|:-----:|:------------:|
| TypeScript 一等支持 | ✅ | ✅ | ✅ | ✅ |
| Vue 3 SFC | ✅ | 🟡 可选 | ✅ | ✅ |
| React JSX | ✅ | ✅ 一等 | ✅ | ✅ |
| Svelte | ✅ | 🟡 可选 | ✅ | ✅ |
| Solid | ✅ | ❌ | 🟡 | ❌ |
| 多框架混合 | ✅ | ❌ | ✅ | ❌ |
| pnpm workspace | ✅ | ✅ | ✅ | ✅ |

> **WXT 是对 Vue 3 支持最好的框架，且允许在一个项目中混合使用多种框架。**

### Manifest & 构建

| 特性 | WXT | Plasmo | CRXJS | Extension.js |
|------|:---:|:------:|:-----:|:------------:|
| manifest.json 控制力 | ✅ 完全控制 | 🟡 自动生成 | ✅ 完全控制 | ✅ 浏览器前缀 |
| MV3 支持 | ✅ | ✅ | ✅ | ✅ |
| MV2 支持 | ✅ | ❌ | 🟡 二选一 | ❌ |
| ZIP 打包 | ✅ 内置 | ✅ 内置 | ❌ | ✅ 内置 |
| Firefox Sources ZIP | ✅ | ❌ | ❌ | ❌ |
| 自动打开浏览器 | ✅ | ❌ | ❌ | ❌ |
| 多浏览器一次构建 | ✅ `-b` flag | ✅ `--target` | 🟡 | ✅ `--browser` |
| .env 文件支持 | ✅ | ✅ | ✅ | ✅ |

> **WXT 和 Plasmo 都提供完整的开发→构建→打包→发布流水线，WXT 对 manifest 控制更精细。**

### 开发体验

| 特性 | WXT | Plasmo | CRXJS | Extension.js |
|------|:---:|:------:|:-----:|:------------:|
| HMR (UI) | ✅ 全部框架 | 🟡 React only | ✅ | ✅ |
| HMR (Content Script) | ✅ 重载 | 🟡 重载 | ✅ 真 HMR | ✅ 重载 |
| HTML 热重载 | ✅ | 🟡 | ✅ | ✅ |
| 文件式入口发现 | ✅ | ✅ | ❌ | ❌ |
| 自动导入 | ✅ | ❌ | ❌ | ❌ |
| 可复用模块系统 | ✅ | ❌ | ❌ | ❌ |

> **WXT 的开发体验最完善：自动打开浏览器、全部框架 HMR、文件式入口发现、WXT Modules 可复用模块。**

### 内置能力

| 特性 | WXT | Plasmo | CRXJS | Extension.js |
|------|:---:|:------:|:-----:|:------------:|
| Storage 封装 | ✅ | ✅ | ❌ | ❌ |
| Messaging 封装 | ❌ | ✅ | ❌ | ❌ |
| Content Script UI | ✅ | ✅ | ❌ | ❌ |
| i18n | ✅ | ❌ | ❌ | ❌ |
| 图标自动生成 | ❌ | ✅ | ❌ | ❌ |
| 自动发布 (CI/CD) | ✅ | ✅ BPP | ❌ | ❌ |

> **Plasmo 的内置能力最"电池全含"，但 WXT 也覆盖了核心需求。AI Tip 已有自己的 storage/messaging/i18n 体系，不需要这些内置封装。**

### 维护状态 (2026 H1)

| 指标 | WXT | Plasmo | CRXJS | Extension.js |
|------|:---:|:------:|:-----:|:------------:|
| 活跃维护 | ✅ 非常活跃 | ✅ 活跃 | 🟡 维护模式 | ✅ 活跃 |
| 最近发布 | 持续 | 持续 | 偶尔 | 频繁 |
| 社区活跃度 | 高 | 很高 | 中 | 成长中 |
| 文档质量 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |

> ⚠️ **CRXJS 已被 WXT 官方标记为"维护模式"**（[参考](https://github.com/wxt-dev/wxt/pull/1404#issuecomment-2643089518)），不建议用于新项目。

---

## 深度分析

### WXT — 推荐 ⭐⭐⭐⭐⭐

**优势：**

```
✅ 浏览器支持最全面（Chrome/Firefox/Edge/Safari/Opera/Brave 全部 Production 级）
✅ Vue 3 一等公民 — 官方模板、SFC 支持、HMR
✅ TypeScript 深度集成 — auto-imports、类型安全的 browser/chrome API
✅ 文件式入口发现 — entrypoints/ 目录下放文件即注册
✅ manifest.json 完全可控 — 不隐藏、不自动生成
✅ 内置 i18n / storage / ZIP 打包 / 自动发布
✅ pnpm monorepo 友好 — 与现有 workspace 无缝集成
✅ 开发体验最佳 — dev 命令自动打开浏览器并安装插件
✅ WXT Modules — 可复用的插件功能模块
✅ 迁移路径清晰 — 支持从 CRXJS/Plasmo 逐步迁移
```

**劣势：**
- ESM Content Script 仍在开发中（WIP，进度慢）
- 没有内置 messaging 封装（但直接用 `chrome.runtime` 即可）
- 相对年轻（2023年启动），但已非常成熟

**典型项目结构：**
```
extension/
├── entrypoints/
│   ├── background.ts          # Service Worker
│   ├── content.ts             # Content Script
│   ├── sidepanel/             # Side Panel (Vue SPA)
│   │   ├── index.html
│   │   ├── main.ts
│   │   └── App.vue
│   └── options/               # Options Page
│       ├── index.html
│       └── main.ts
├── components/                # 共享 Vue 组件
├── composables/               # 共享 Composables
├── public/                    # 静态资源
│   └── icons/
├── wxt.config.ts              # WXT 配置
├── package.json
└── tsconfig.json
```

**命令示例：**
```bash
pnpm dev          # Chrome 开发
pnpm dev:firefox  # Firefox 开发
pnpm build        # Chrome 构建
pnpm build:firefox# Firefox 构建
pnpm zip          # 打包 Chrome .zip
pnpm zip:firefox  # 打包 Firefox .zip
```

---

### Plasmo — 备选 ⭐⭐⭐⭐

**优势：**
- "Next.js for Extensions" — 声明式开发，写组件即得页面
- React 一等公民，生态最大
- 内置 Storage / Messaging API（类似 Plasmo 专有 API）
- BPP 自动发布到 Chrome/Firefox/Edge 商店
- Itero 测试平台（beta 分发）
- 图标自动多尺寸生成
- 社区最大、项目最多

**劣势：**
- manifest.json 自动生成 — **控制力弱**（AI Tip 需要精细配置 side_panel 等）
- Vue 支持是二等公民 — 需要额外配置，模板和文档偏少
- HMR 仅支持 React
- 对现有项目迁移侵入性大 — 需要改为 Plasmo 的文件约定
- 存储和消息 API 与标准 chrome.* API 不同，有锁定风险

**不适合 AI Tip 的原因：**
1. 已有自己的 storage/messaging/i18n 体系 → Plasmo 内置 API 是冗余的
2. 需要精细控制 manifest.json（side_panel 配置） → Plasmo 自动生成不够灵活
3. 已经用 Vue 3 写了大量组件 → Plasmo 的 Vue 支持不完善

---

### CRXJS — 轻量备选 ⭐⭐⭐

**优势：**
- 最轻量 — 只是一个 Vite 插件，无框架锁定
- 零配置启动
- Content Script HMR（真正的热更新，非全量重载）
- 与现有 Vite 项目集成最简单

**劣势：**
- ⚠️ **维护模式** — 开发停滞，未来不确定
- 跨浏览器支持不完整（Firefox/Safari 处于 beta）
- 不是完整框架 — 没有 storage/messaging/i18n 等封装
- 功能覆盖最少

**适合场景：** 仅需 Chrome、快速原型、不关心长期维护。

---

### Extension.js — 观察中 ⭐⭐⭐

**优势：**
- 最新一代框架，设计理念现代
- 浏览器前缀 manifest key（`chrome:background` / `firefox:background`）
- Vue/React/Svelte 全支持
- 构建速度快

**劣势：**
- 太新（社区和生态较小）
- 不支持 Safari
- 文档和案例不够丰富
- 与 pnpm monorepo 的兼容性未充分验证

**适合场景：** 关注其发展，暂不推荐用于生产项目。

---

## 与项目匹配度

### AI Tip Extension 的需求清单

| 需求 | WXT | Plasmo | CRXJS | Extension.js |
|------|:---:|:------:|:-----:|:------------:|
| Vue 3 + TypeScript | ✅ | 🟡 | ✅ | ✅ |
| pnpm workspace 集成 | ✅ | ✅ | ✅ | 🟡 |
| 精细 manifest.json 控制 | ✅ | ❌ | ✅ | ✅ |
| Side Panel API | ✅ | 🟡 | ✅ | ✅ |
| 共享 @ai-tip/* npm 包 | ✅ | ✅ | ✅ | ✅ |
| 复用 Desktop Vue 组件 | ✅ | 🟡 | ✅ | ✅ |
| Chrome + Edge 支持 | ✅ | ✅ | ✅ | ✅ |
| Firefox 支持（远期） | ✅ | ✅ | 🟡 | ✅ |
| Content Script isolated world | ✅ | ✅ | ✅ | ✅ |
| chrome.storage.local | ✅ | ✅ | ✅ | ✅ |
| 已有 i18n 体系 | ✅ | N/A | N/A | N/A |
| 最小改动迁移 | ✅ | ❌ | ✅ | ✅ |
| 自动化构建 + ZIP | ✅ | ✅ | ❌ | ✅ |

> **WXT 在所有 13 项需求中全部满足，且对现有代码改动最小。**

---

## 迁移路径

### 当前状态（手动 Vite 构建）

```
extension/
├── src/
│   ├── background/       # 手动 ES build
│   ├── content-script/   # 手动 IIFE build
│   ├── side-panel/       # Vue SPA
│   └── options/          # 简单 HTML
├── vite.config.ts        # 主构建 (side-panel + options)
├── vite.background.config.ts  # 后台构建
├── vite.content.config.ts     # 内容脚本构建
├── scripts/build.ts      # 编排脚本
└── manifest.json         # 手动维护
```

### 迁移到 WXT 后

```
extension/
├── entrypoints/
│   ├── background.ts          # WXT 自动识别
│   ├── content.ts             # WXT 自动识别
│   ├── sidepanel/             # WXT 自动识别 HTML 入口
│   │   ├── index.html
│   │   ├── main.ts
│   │   └── App.vue
│   └── options/
│       ├── index.html
│       └── main.ts
├── components/                # 共享组件
├── composables/               # 共享 composables
├── public/
│   └── icons/
├── wxt.config.ts              # 单一配置文件
├── package.json
└── tsconfig.json
```

**迁移步骤（预估 1-2 天）：**

1. 安装 WXT：`pnpm add -D wxt`
2. 创建 `wxt.config.ts`（合并三个 vite 配置）
3. 移动文件到 `entrypoints/` 目录
4. 删除手动的 `vite.*.config.ts` 和 `scripts/build.ts`
5. 更新 `package.json` scripts：
   ```json
   {
     "dev": "wxt",
     "dev:firefox": "wxt -b firefox",
     "build": "wxt build",
     "build:firefox": "wxt build -b firefox",
     "zip": "wxt zip",
     "zip:firefox": "wxt zip -b firefox"
   }
   ```
6. 验证构建和所有功能

**改动量：** 约 200 行代码变更，主要是配置文件简化 + 目录结构调整。业务逻辑代码（background handlers / content script / Vue 组件）**零改动**。

---

## 总结建议

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   🏆 首选：WXT                                              │
│                                                             │
│   理由：                                                     │
│   1. Vue 3 一等公民，与现有技术栈完美匹配                      │
│   2. 浏览器支持最全面（含 Firefox/Safari 远期扩展）           │
│   3. 对现有代码改动最小（~200行配置变更）                     │
│   4. 维护最活跃，文档质量最高                                  │
│   5. manifest.json 完全可控，不绑定专有 API                   │
│   6. dev 体验最佳（自动打开浏览器 + 安装插件）                 │
│                                                             │
│   ⚠️ 不推荐：                                                │
│   • CRXJS — 维护模式，未来不确定                               │
│   • Plasmo — Vue 二等公民，manifest 控制力弱                  │
│   • Extension.js — 太新，生态不成熟                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 参考资源

| 资源 | 链接 |
|------|------|
| WXT 官网 | https://wxt.dev |
| WXT vs Plasmo vs CRXJS 对比 | https://wxt.dev/guide/resources/compare.html |
| WXT Vue 模板 | https://github.com/wxt-dev/wxt/tree/main/templates/vue |
| Plasmo 官网 | https://docs.plasmo.com |
| CRXJS 官网 | https://crxjs.dev |
| Extension.js 官网 | https://extension.js.org |
| Chrome Extension MV3 文档 | https://developer.chrome.com/docs/extensions/mv3 |

---

> **下一步**: 确认选型后，执行 [迁移到 WXT](#迁移路径) 或保持当前手动构建方案。
