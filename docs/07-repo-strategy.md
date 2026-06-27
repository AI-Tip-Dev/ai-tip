# 07 — 仓库管理方案对比分析

> **创建**: 2026-06-27 · **状态**: 📝 草案
> **关联**: [04 — npm 包设计](./04-npm-packages-design.md) · [14 — 三 Repo 架构](../desktop/docs/14-electron-js-sdk-architecture.md)
> **场景**: 对比 4 种仓库管理方案——独立 repo + file:、pnpm monorepo、单仓、git submodule——为 6 个包（sdk / desktop / extension / llm-providers / form-detection / observability）选择最优方案

---

## 📋 文档导航

> - [方案总览](#方案总览) · [详细对比](#详细对比) · [场景推演](#场景推演)
> - [量化评分](#量化评分) · [推荐方案](#推荐方案) · [迁移路径](#迁移路径)

---

## 方案总览

当前已有 3 个目录（`sdk/` / `desktop/` / `extension/`），计划新增 3 个 npm 包。6 个包的仓库组织有 4 种方案：

```
方案 A: 独立 Repo + file:      方案 B: pnpm monorepo       方案 C: 单仓              方案 D: git submodule
───────────────                ──────────                  ──────────                 ──────────
6 个独立 Git repo              1 个 Git repo               1 个 Git repo              6 个 Git repo
同级目录 clone                 pnpm-workspace.yaml         所有代码平铺               + 1 个父 repo
"file:../" 本地引用            workspace:* 协议            无包边界                   .gitmodules 管理
```

---

## 详细对比

### 方案 A: 独立 Git Repo + `"file:../"` (当前方案)

```
~/projects/
├── ai-tip-sdk/              # git@github.com:ai-tip/sdk.git
│   └── package.json          #   "name": "@ai-tip/sdk"
├── ai-tip-desktop/          # git@github.com:ai-tip/desktop.git
│   └── package.json          #   "devDependencies": {
│                              #     "@ai-tip/sdk": "file:../ai-tip-sdk"
│                              #   }
├── ai-tip-extension/        # git@github.com:ai-tip/extension.git
├── ai-tip-llm-providers/    # git@github.com:ai-tip/llm-providers.git
├── ai-tip-form-detection/   # git@github.com:ai-tip/form-detection.git
└── ai-tip-observability/    # git@github.com:ai-tip/observability.git
```

| 维度 | 评价 |
|------|------|
| **本地开发** | 🟢 clone 到同级目录，`pnpm install` 自动 symlink |
| **跨包修改** | 🟡 需要多个 PR。改 sdk 类型 → 提 sdk PR → 合并 → 回 desktop 更新 |
| **CI/CD** | 🟢 6 个独立的 `.github/workflows/`，互不阻塞 |
| **版本管理** | 🟢 各自独立 semver，灵活 |
| **权限控制** | 🟢 sdk 公开 npm，desktop/extension private，天然隔离 |
| **新人上手** | 🟡 需要 clone 6 个仓库到正确目录结构 |
| **原子提交** | 🔴 跨包 breaking change 无法原子提交 |

### 方案 B: pnpm workspace monorepo

```
ai-tip/                       # git@github.com:ai-tip/ai-tip.git
├── pnpm-workspace.yaml
│   packages:
│     - 'packages/*'
│     - 'apps/*'
├── package.json              #   root: private, scripts: { dev, build, test }
├── packages/
│   ├── sdk/                  #   "@ai-tip/sdk"
│   ├── llm-providers/        #   "@ai-tip/llm-providers"
│   ├── form-detection/       #   "@ai-tip/form-detection"
│   └── observability/        #   "@ai-tip/observability"
└── apps/
    ├── desktop/              #   "@ai-tip/desktop"
    └── extension/            #   "@ai-tip/extension"
```

| 维度 | 评价 |
|------|------|
| **本地开发** | 🟢 一次 clone，`pnpm install` 全装 |
| **跨包修改** | 🟢 一次 commit 改多个包，原子性 |
| **CI/CD** | 🟡 需要 `turborepo` / `nx` 检测变更，选择性构建 |
| **版本管理** | 🟢 `changesets` 自动管理，发版时决定哪些包升版本 |
| **权限控制** | 🔴 整个 repo 一套权限。sdk 想公开 npm 但 monorepo 包含 private 代码 |
| **新人上手** | 🟢 一次 clone，README 即可 |
| **原子提交** | 🟢 完美支持 |

> ⚠️ **最大痛点**：`packages/sdk/` 要发布到公开 npm，但 `apps/desktop/` 是 private。monorepo 包含 private 代码时，需要 `.npmignore` 或 publish 脚本排除 private 包。虽然技术上可行，但存在误操作泄露私有代码的风险。

### 方案 C: 单仓（无包边界）

```
ai-tip/                       # git@github.com:ai-tip/ai-tip.git
├── src/
│   ├── sdk/                  #   不是独立 npm 包
│   ├── desktop/
│   ├── extension/
│   ├── llm-providers/
│   ├── form-detection/
│   └── observability/
├── package.json              #   一个 package.json 管全部
└── tsconfig.json
```

| 维度 | 评价 |
|------|------|
| **本地开发** | 🟢 极简 |
| **跨包修改** | 🟢 天然原子性 |
| **CI/CD** | 🟢 一条 pipeline |
| **版本管理** | 🔴 无法独立发版。sdk 改一个注释→整个 repo 升版本 |
| **权限控制** | — 不适用 |
| **新人上手** | 🟢 最简单 |
| **npm 发布** | 🔴 **sdk 无法作为 npm 包发布**——这是致命缺陷 |

> 🔴 **否决**：SaaS 前端需要 `npm install @ai-tip/sdk`，单仓无法满足。

### 方案 D: Git Submodule

```
ai-tip-parent/                # git@github.com:ai-tip/parent.git (父 repo，仅含 .gitmodules)
├── .gitmodules
│   [submodule "sdk"]
│     path = packages/sdk
│     url = git@github.com:ai-tip/sdk.git
│   [submodule "desktop"]
│     path = apps/desktop
│     url = git@github.com:ai-tip/desktop.git
│   ...
├── packages/
│   ├── sdk/                  #   子模块，指向 ai-tip/sdk 的特定 commit
│   ├── llm-providers/
│   ├── form-detection/
│   └── observability/
└── apps/
    ├── desktop/
    └── extension/
```

| 维度 | 评价 |
|------|------|
| **本地开发** | 🔴 `git clone --recursive` + 子模块内 `git pull` + 父 repo `git add`，体验差 |
| **跨包修改** | 🔴 先 commit 子模块 → push → 回父 repo `git add` 子模块指针 → commit → push。**跨包改一个 bug 要两次 commit+push** |
| **CI/CD** | 🔴 CI 需要 `submodules: recursive`，子模块变更触发父 repo CI 很难配置 |
| **版本管理** | 🟡 子模块指针锁定版本（类似 lockfile），但手动管理繁琐 |
| **权限控制** | 🟢 各子模块独立权限 |
| **新人上手** | 🔴 最常见的错误：`git pull` 后子模块没更新，构建报错 |

> 🔴 **不推荐**：Git submodule 的 UX 是公认的痛点。跨包修改需要 double commit，CI 配置复杂。除非有明确的 "第三方依赖" 场景（如 vendor 一个外部库），否则不要用。

---

## 场景推演

### 场景 1: 修改 SDK 的一个类型 → Desktop/Extension 同步适配

| 步骤 | 方案 A (独立) | 方案 B (monorepo) |
|------|-------------|------------------|
| 1 | `cd ai-tip-sdk` → 改 `types.ts` | 直接改 `packages/sdk/src/types.ts` |
| 2 | 提 PR → review → merge | 改 `apps/desktop/` 适配代码 |
| 3 | `cd ai-tip-desktop` → 改适配代码 | 改 `apps/extension/` 适配代码 |
| 4 | 提 PR → review → merge | **一个 PR** 包含全部变更 |
| 5 | 两次 CI，两次 review | 一次 CI，一次 review |

**结论**: Monorepo 在此场景完胜——原子性、一次 review、不会出现 "sdk 合并了但 desktop 没适配"。

### 场景 2: 只改 Desktop 的 Sidebar 按钮颜色

| 步骤 | 方案 A (独立) | 方案 B (monorepo) |
|------|-------------|------------------|
| 1 | `cd ai-tip-desktop` → 改 CSS | 改 `apps/desktop/src/renderer/styles/main.css` |
| 2 | 提 PR | 提 PR |
| 3 | CI 只跑 desktop | CI 检测到只有 desktop 变更，只构建 desktop |

**结论**: 两者几乎一样。Monorepo 需要 CI 检测变更（turborepo），但体验差别不大。

### 场景 3: 发布 SDK v1.0 到公开 npm

| 步骤 | 方案 A (独立) | 方案 B (monorepo) |
|------|-------------|------------------|
| 1 | `cd ai-tip-sdk` → `npm publish` | `pnpm changeset` → 选 sdk → `pnpm publish -r` |
| 2 | 仅 sdk 发版 | 需要确保不误发 private 包 |

**结论**: 独立 repo 更安全——不会误操作。Monorepo 需要 publish 脚本配置 `"private": true` 过滤。

### 场景 4: 日常开发，频繁修改 llm-providers

| 步骤 | 方案 A (独立) | 方案 B (monorepo) |
|------|-------------|------------------|
| 1 | 两个终端：`ai-tip-llm-providers` watch + `ai-tip-desktop` dev | 一个终端：`pnpm dev`（workspace 协议自动 link） |
| 2 | `file:../` 是 symlink，改 llm-providers 代码 → desktop 自动热更新 | workspace 协议也是 symlink，效果一样 |

**结论**: 两者开发体验几乎相同。`file:` 和 `workspace:*` 都是 symlink。

---

## 量化评分

| 维度 | 权重 | 方案 A: 独立+file | 方案 B: monorepo | 方案 C: 单仓 | 方案 D: submodule |
|------|:----:|:-----------------:|:----------------:|:-----------:|:-----------------:|
| 本地开发体验 | 高 | 7 | 9 | 10 | 3 |
| 跨包修改效率 | 高 | 4 | 9 | 9 | 2 |
| CI/CD 简洁 | 中 | 9 | 6 | 7 | 3 |
| 独立发版能力 | 高 | 10 | 8 | 0 | 10 |
| 权限隔离 | 中 | 10 | 3 | — | 10 |
| 新人上手 | 中 | 6 | 8 | 9 | 3 |
| 原子性提交 | 中 | 2 | 10 | 10 | 4 |
| **加权总分** | | **6.6** | **7.8** | **7.0** | **4.3** |

---

## 最终决策

### 选择：方案 B — pnpm workspace monorepo ✅

**理由**：
1. **当前规模小**（3-6 个包，小团队），monorepo 优势远大于开销
2. **原子提交是刚需**——改 sdk 类型 → desktop + extension 同步适配 → 一个 PR 搞定
3. **开发体验最好**——一次 clone，`pnpm install` 全装，跨包修改立即生效
4. **已有目录结构天然适合**——`desktop/`、`sdk/`、`extension/` 已在同级目录
5. **sdk 单独发布到 npm**：`pnpm --filter @ai-tip/sdk publish --access public`，private 包自动跳过

### 目录结构

```
ai-tip/                          # Git repo: ai-tip/ai-tip
├── pnpm-workspace.yaml         #   packages: ['sdk', 'desktop', 'extension', 'packages/*']
├── package.json                #   root: { private: true }
├── sdk/                        #   "@ai-tip/sdk"         → 发布到公开 npm
├── desktop/                    #   "@ai-tip/desktop"     → private
├── extension/                  #   "@ai-tip/extension"   → private
└── packages/
    ├── llm-providers/          #   "@ai-tip/llm-providers"   → 发布到 npm
    ├── form-detection/         #   "@ai-tip/form-detection"  → 发布到 npm
    └── observability/          #   "@ai-tip/observability"   → 发布到 npm
```

### sdk 单独发布

```bash
# 只发布 sdk 到公开 npm（其他包 private: true 自动跳过）
pnpm --filter @ai-tip/sdk publish --access public
```

### 方案 C 和 D：否决

- **方案 C (单仓)**：sdk 无法发布到 npm
- **方案 D (submodule)**：double commit + UX 极差

---

## 决策记录

| # | 决策 | 理由 | 日期 |
|---|------|------|------|
| 1 | 采用方案 B: pnpm workspace monorepo | 当前规模小、原子提交刚需、目录结构天然适合、开发体验最优 | 2026-06-27 |
| 2 | 方案 C (单仓) 否决 | sdk 需发布到公开 npm | 2026-06-27 |
| 3 | 方案 D (git submodule) 否决 | UX 极差，跨包修改需 double commit | 2026-06-27 |

---

> **关联文档**: [04 — npm 包设计](./04-npm-packages-design.md) · [05 — 目录结构](./05-extension-directory-structure.md)
