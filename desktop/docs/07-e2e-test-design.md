# E2E Test Design — AI Tip → Suggestion → Fill + Home/Chat Navigation

Last updated: 2026-06-27  |  Status: ✅ Implemented

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│ Playwright Tests (e2e/specs/)                       │
│                                                     │
│  electronApp.evaluate() ← mock LLM in MAIN process  │
│  page.evaluate()        ← operate webview           │
│  page.locator()         ← assert sidebar UI         │
└──────────┬────────────────────────┬─────────────────┘
           │                        │
     electron.launch()        page.locator('.sug-card')
           │                        │
┌──────────▼──────────┐  ┌──────────▼──────────┐
│ Main Process        │  │ Renderer (Sidebar)  │
│  ipcMain.on()       │  │  Vue 3 App          │
│  ipcMain.handle()   │  │  ChatView           │
│  ← mock intercepts  │  │  WelcomeView        │
│    llm:stream:start  │  │  HomeView           │
│    batch:suggest     │  │  BatchFillCard      │
│    page:summarize    │  └─────────────────────┘
└─────────────────────┘
```

## Test Suites (Playwright Best-Practice Organization)

Tests are organized by **user journey domain** and **mock strategy**:

```
e2e/specs/
├── ai-tip/
│   ├── button-visibility.spec.ts    # 2 tests — hover → AI Tip button + suggestion cards (no mock)
│   └── field-fill.spec.ts           # 2 tests — fill pipeline + mock LLM → options → fill (mockLLMApi)
├── navigation/
│   ├── home-chat-overview.spec.ts   # 2 tests — Home ↔ Chat Overview + Chat → Home back (no mock)
│   └── home-chat-field.spec.ts      # 1 test  — Home ↔ Chat Field Session (mockLLMApi)
└── chat/
    ├── batch-fill.spec.ts           # 1 test  — Batch Fill three-state flow (mockPageSummary + mockBatchSuggest)
    └── state-machine.spec.ts        # 1 test  — Chat input idle → replying → done (mockLLMApi)
```

### Design Principles

| # | Principle | Implementation |
|---|---|---|
| 1 | **Test user-visible behavior** | All assertions use rendering-side selectors (`.home-view`, `.batch-card`, `.option-chip`) |
| 2 | **Tests are isolated** | Each file has its own `beforeAll` (Electron launch) / `afterAll` (close); no cross-file state dependency |
| 3 | **No serial mode** | Playwright official: *"Using serial is not recommended"* — each test independently sets up its preconditions |
| 4 | **Split by mock strategy** | Files with no mock run fast and independently; files sharing the same mock run together |
| 5 | **File-level parallelism** | All 6 spec files can run in parallel across workers; each worker launches its own Electron instance |
| 6 | **@tag filtering** | All tests tagged `@p0`; use `--grep @p0` to run only critical path |
| 7 | **`→` convention in test titles** | Describes user journey: `hover field → button appears → click → cards render` |
| 8 | **beforeEach state reset** | Each test calls `ensureHome()` / `goto()` at start to reset to known state |

### Suite Details

#### ai-tip/button-visibility.spec.ts — AI Tip Detection (2 tests, no mock)

| # | Test | Chat Msg | What it covers |
|---|---|---|---|
| 1 | hover field → AI Tip button appears → click → suggestion cards | ❌ | Button injection, IPC event, sidebar rendering |
| 2 | different field types (text / select / textarea) get suggestion cards | ❌ | Field-type-aware chip generation (3 fields) |

#### ai-tip/field-fill.spec.ts — AI Tip Fill Pipeline (2 tests, mockLLMApi)

| # | Test | Mock | What it covers |
|---|---|---|---|
| 1 | fill pipeline — executeJavaScript sets field value end-to-end | none | Native setter + event dispatch → verified value in webview |
| 2 | mock LLM → [[OPTIONS]] chips render → click fills webview field | mockLLMApi | Full flow: suggestion → LLM streaming → option chips → fill |

#### navigation/home-chat-overview.spec.ts — Overview Navigation (2 tests, no mock)

| # | Test | Mock | What it covers |
|---|---|---|---|
| 1 | Home → Chat Overview shows page breadcrumb + FieldPills → back | none | View switching, breadcrumb, Overview pill |
| 2 | Chat → Home back preserves state + allows re-entry | none | Back button, Home restoration, re-entry restores messages |

#### navigation/home-chat-field.spec.ts — Field Session Navigation (1 test, mockLLMApi)

| # | Test | Mock | What it covers |
|---|---|---|---|
| 1 | Home → Chat Field Session shows field breadcrumb + FieldPills → appears in Home | mockLLMApi | Field breadcrumb, FieldPills with field pill, field in Home card |

#### chat/batch-fill.spec.ts — Batch Fill (1 test)

| # | Test | Mock | What it covers |
|---|---|---|---|
| 1 | Batch Fill — trigger → loading → done with confidence stats | mockPageSummary + mockBatchSuggest | BatchFillCard three-state, confidence stats, field sessions created |

#### chat/state-machine.spec.ts — Chat State Machine (1 test, mockLLMApi)

| # | Test | Mock | What it covers |
|---|---|---|---|
| 1 | Chat state machine — input disables during reply, stop button visible | mockLLMApi | Input disable, Stop button, state restore after done |

### Test order rationale

With Playwright's **file-level parallelism** (default), each spec file runs in its own worker with its own Electron instance. Within each file, non-chat tests that don't modify chat state run **first** (`.sug-card` stays visible in WelcomeView). Tests that send chat messages run **after** (sidebar transitions to ChatView). This ordering is achieved by declaration order within the file — no `serial` mode needed.

## Mock LLM Strategy

Mock runs **entirely in test code** — zero production source changes.

### `mockLLMApi` — stream-based LLM

```
mockLLMApi(electronApp, { fieldLabel, options })
  │
  └─► electronApp.evaluate(({ ipcMain, BrowserWindow }) => {
        ipcMain.on('llm:stream:start', (event, data) => {
          const win = BrowserWindow.fromWebContents(event.sender)
          // Fire canned llm:stream:chunk events back to renderer
          win.webContents.send('llm:stream:chunk', { requestId, chunk: ... })
        })
      })
```

### `mockBatchSuggest` — invoke-based batch fill

```
mockBatchSuggest(electronApp, suggestions)
  │
  └─► electronApp.evaluate(({ ipcMain }) => {
        ipcMain.removeHandler('batch:suggest')
        ipcMain.handle('batch:suggest', async () => ({ suggestions }))
      })
```

### `mockPageSummary` — invoke-based page summary

```
mockPageSummary(electronApp, summary)
  │
  └─► electronApp.evaluate(({ ipcMain }) => {
        ipcMain.removeHandler('page:summarize')
        ipcMain.handle('page:summarize', async () => summary)
      })
```

### Why this is the right approach

| Attempt | Problem |
|---|---|
| Patch `window.llmApi` in renderer | contextBridge freezes the object |
| `Object.defineProperty` override | `Cannot redefine property: llmApi` |
| localStorage + preload hook | Test code in `src/preload/` |
| `ipcRenderer.emit` in renderer | `ipcRenderer.send` goes to main, not renderer |
| **`electronApp.evaluate()` in main** ✅ | Works, zero production code |

## Key Files

```
e2e/
  playwright.config.ts              # Playwright config (Electron, 60s timeout, file-level parallelism)
  helpers/
    index.ts                        # E2EContext, launchApp, closeApp, WebviewPO, SidebarPO,
                                    #   mockLLMApi, mockBatchSuggest, mockPageSummary,
                                    #   captureElectronLogs, captureElectronLogsTail
  specs/
    ai-tip/                         # AI Tip detection + fill (2 files, 4 tests)
      button-visibility.spec.ts     # 2 tests — hover → AI Tip button + field-type chips (no mock)
      field-fill.spec.ts            # 2 tests — fill pipeline + mock LLM → options → fill (mockLLMApi)
    navigation/                     # Home ↔ Chat navigation (2 files, 3 tests)
      home-chat-overview.spec.ts    # 2 tests — Home ↔ Chat Overview + Chat → Home back (no mock)
      home-chat-field.spec.ts       # 1 test  — Home ↔ Chat Field Session (mockLLMApi)
    chat/                           # Chat UX interactions (2 files, 2 tests)
      batch-fill.spec.ts            # 1 test  — Batch Fill three-state flow (mockPageSummary + mockBatchSuggest)
      state-machine.spec.ts         # 1 test  — Chat state machine idle → replying → done (mockLLMApi)
  fixtures/
    test-form.html                  # Self-contained test form (17 fields)
```

### Import paths

All spec files are now one level deeper (under domain subdirectories), so import paths use `../../helpers` instead of `../helpers`:

```typescript
// Before (flat structure)
import { launchApp, ... } from '../helpers'

// After (domain subdirectories)
import { launchApp, ... } from '../../helpers'
```

### Changelog

| Date | Change |
|---|---|
| 2026-06-27 | Initial implementation: 2 files, 9 tests |
| 2026-06-27 | **Refactored to Playwright best-practice structure**: split into 6 files across 3 domain folders (`ai-tip/`, `navigation/`, `chat/`). Each file is self-contained with its own `beforeAll`/`afterAll`. Organized by mock strategy (no-mock files first, mock-required files second). All tests tagged `@p0`. Removed inter-test dependencies — every test independently sets up its preconditions. |

## Selectors (production code)

| Component | Selector | Purpose |
|---|---|---|
| AI Tip Button | `#__ai_tip_btn__` | Injected in webview, appears on field hover |
| Suggestion Cards | `.sug-card` / `.sug-card-label` | WelcomeView field-specific chips |
| User Message | `.user-msg` | After suggestion clicked → ChatView |
| Bot Message | `.bot-msg` | Mock LLM response |
| Option Chips | `.option-chip` / `.opt-value` | Parsed from `[[OPTIONS:...]]` marker |
| Context Pill | `.context-pill` | Active field indicator above input |
| **Home View** | `.home-view` | Home page container |
| **Page Card** | `.page-card` | Current page info card in Home |
| **Overview Row** | `.card-overview` | Overview entry in page card |
| **Field Row** | `.card-field` / `.row-label` | Field session entries in page card |
| **Chat Header** | `.chat-header` / `.home-btn` | Chat view header with back button |
| **Breadcrumb** | `.breadcrumb-current` / `.breadcrumb-link` | Page › Field breadcrumb |
| **FieldPills** | `.field-pills-bar` / `.pill` | Inline pill bar with +N overflow |
| **Overflow Btn** | `.overflow-btn` / `.overflow-popup` | +N overflow popup |
| **ContextBadge** | `.context-badge` / `.cb-toggle` / `.cb-summary` | Field mode context source |
| **BatchFillCard** | `.batch-card` / `.card-btn` / `.card-stats` | Three-state batch fill card |
| **Chat Input** | `.input-area` / `.send-btn` / `.send-btn.stop` | Input box + send/stop button |
| **QuickActions** | `.quick-actions` | Quick action chips |

## Running

```bash
pnpm build              # Build Electron app (required first)
pnpm test:e2e           # Run all tests (headed by default)
pnpm test:e2e:ui        # Interactive Playwright UI mode
```

## Capturing Electron Logs Per Test

每个 E2E 测试运行时，`electron-log` 的主进程和渲染进程日志会自动写入临时目录。测试通过 `afterEach` hook 将日志附加到 Playwright report 中。

### 日志文件位置

```
{tmpdir}/electron-ai-sidebar-e2e-{timestamp}/electron.log
```

### 查看日志的三种方式

**1. Playwright HTML Report（推荐）**

```bash
pnpm test:e2e
npx playwright show-report e2e/report
```

在报告页面中，每个测试用例展开后可以看到 **"Attachments"** 区域，其中包含 `electron-log` 附件，点击即可查看完整的日志内容。

**2. 命令行直接查看**

```bash
# 运行测试后，日志文件保留在临时目录
# 查看最近一次测试的日志
ls -t $TMPDIR/electron-ai-sidebar-e2e-*/electron.log | head -1 | xargs cat
```

**3. 测试代码中手动捕获**

```typescript
import { captureElectronLogs, captureElectronLogsTail } from '../helpers'

// 捕获完整日志
const fullLog = captureElectronLogs(ctx)

// 捕获最后 200 行（避免大日志附件）
const tail = captureElectronLogsTail(ctx, 200)

// 在测试中主动附加
await test.info().attach('debug-log', { body: tail, contentType: 'text/plain' })
```

### 关键日志内容

| 日志来源 | 示例 | 用途 |
|---------|------|------|
| Main Process | `Main window created` | 窗口创建、IPC 处理 |
| IPC Handler | `batch:suggest: 17 fields, provider=ollama` | LLM 请求触发 |
| Session | `[useSession] Created page session: CRM (url)` | 页面会话管理 |
| AI Tip | `AI Tip: field selected — Company Name` | 字段点击事件 |
| WebView | `did-finish-load: auto-detecting fields for url` | 页面加载和表单检测 |

### 实现原理

```
launchApp()
  ├── 创建临时目录 {tmpdir}/e2e-{ts}
  ├── 设置 E2E_LOG_DIR 环境变量
  └── 启动 Electron app
        │
        ▼
src/main/index.ts
  ├── 检测 process.env.E2E_LOG_DIR
  └── log.transports.file.resolvePathFn → {E2E_LOG_DIR}/electron.log
        │
        ▼
每个测试的 afterEach
  ├── captureElectronLogsTail(ctx, 200)
  └── test.info().attach('electron-log', ...)
```

## Not in Scope (E2E)

These are covered by **Vitest unit tests**:

- `BotMessage` parsing of `[[OPTIONS:label]]` / `[[FILL:label]]` markers
- `useChat` message streaming state machine
- `useAITip` field context collection logic
- Individual Vue component rendering (snapshot tests)

### Playwright Trace 文件位置

每次失败后，以下 artifacts 可用于分析：

```
test-results/
  <test-name>/
    error-context.md    ← 包含 Page Snapshot (YAML) + 错误堆栈
    test-failed-1.png   ← 失败时的截图（整个窗口）
    test-failed-2.png   ← 失败时的截图（另一帧）
    trace.zip           ← Playwright trace viewer 文件
```

**优先级**：先读 `error-context.md` 中的 **Page Snapshot YAML**——它直接告诉你 DOM 结构、可见元素、CSS class、文本内容，远比截图更精确。
