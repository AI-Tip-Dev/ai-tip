# 13 — LLM Observability & Tracing 设计

> **创建**: 2026-06-26
> **关联**: [04 LLM Provider](./04-llm-provider-design.md) · [02 系统架构](./02-system-architecture.md)
> **状态**: 📋 设计中 — 待实施

---

## 1. 问题

当前 LLM 调用用 `electron-log` 打日志，无法按链路追踪、无法方便排查失败原因。

**痛点**: 日志纯文本无法筛选/排序 · 看不到完整调用链 · 失败时拿不到完整 request/response · 无法导出到 LangFuse/Aspire。

## 2. 目标

构建 **local-first + OTel 兼容** 的 LLM 可观测层：

- 自动记录每个 LLM 请求的 request、response、耗时、token 用量
- 本地持久化（JSONL 文件，重启不丢失）
- 每条 Chat 回复气泡里有个小图标，点击弹出流水线弹窗查看详情
- **electron-log 与 Trace 集成**：Span 内的 log 自动作为 Span Event 记录，一个弹窗看阶段 + 日志
- 可按需导出到 LangFuse 或 .NET Aspire Dashboard（OTLP/HTTP）

## 3. 技术选型

不用完整 `@opentelemetry/sdk-node`（过大，~15MB），只用 **`@opentelemetry/api`**（~30KB，纯类型） + 自建 TracerProvider + TraceStore。

| 方案 | 包大小 | 离线可用 | 本地查看 | 导出 |
|------|:------:|:------:|:------:|:----:|
| 完整 OTel SDK | ~15MB | ❌ | ❌ | ✅ |
| **轻量 Core + 自建** | ~50KB | ✅ | ✅ | ✅ |
| LangFuse SDK | ~2MB | ❌ | ❌ | ✅ |

**关键决策**: JSONL 按天存储（`{userData}/traces/`），内存 LRU 缓存 500 条，OTLP/HTTP JSON 导出。

## 4. 架构

```
Main Process                     Renderer Process
──────────                       ────────────────
LLM Calls                        ChatView
  │                                └─ BotMessage
  ▼                                     ├─ 🔍 图标 (点击)
traceLLMCall() 包装器                   └─ TraceDetailDialog (Modal)
  │                                       ├─ 流水线顶栏
  ├─ Span 生命周期                        ├─ 阶段树
  ├─ 自动子阶段 event                    ├─ Request/Response
  ├─ electron-log → span event 桥接      └─ Logs tab
  ▼
TraceStore (JSONL)
  │
  ├─ IPC_TRACE_GET  ← Renderer 查询
  └─ IPC_TRACE_EXPORT → OTLP HTTP → LangFuse / Aspire
```

**数据流**:
- **记录**: LLM 调用 → `traceLLMCall()` 创建 Span → 自动记录阶段事件 → electron-log 桥接到 span event → 写入 JSONL
- **查看**: 点击 BotMessage 的 🔍 → IPC 获取 span 详情 → Dialog 渲染流水线树 + Logs
- **导出**: Settings → Export → OtlpExporter POST 到目标 `/v1/traces`

## 5. 数据模型

对齐 OTel GenAI Semantic Conventions。每个 Span 记录：

| 字段 | 说明 |
|------|------|
| traceId / spanId / parentSpanId | OTel 标准标识 |
| provider / model / temperature | LLM 参数 |
| endpoint / httpStatus / durationMs | HTTP 层 |
| promptTokens / completionTokens | 用量 |
| status / statusMessage | 成功/失败 |
| events[] | 阶段事件 + **log 事件** |
| requestBody / responseBody | 完整内容（仅本地存储，不导出） |

### 阶段拆分

每个 LLM 调用自动产生子阶段（span events → 渲染为 Dialog 中的树节点）：

```
LLM 调用 ROOT
├─ 请求准备       (prepare)
├─ DNS 解析       (dns)
├─ TCP 连接       (tcp)
├─ LLM API 调用   (api_call)
│   ├─ 首 Token   (first_token)   ← 仅流式
│   └─ 流式接收   (streaming)     ← 仅流式，含 chunk 数
├─ 响应解析       (parse)
└─ 重试           (retry)         ← 仅失败重试时出现
```

非流式调用（batch-fill / page-summarize）直接用 `api_call` 包含完整请求-响应。

## 6. electron-log 与 Trace 集成

`electron-log` 保留不变（继续写文件，开发时 `tail -f` 看）。

**同时**，在 Span 上下文中，每次 `logger.info/debug/error` 也作为 **Span Event** 追加：

```
Span ──┬── event: pipeline.prepare      (12ms)
       ├── event: [INFO] Starting stream: model=gpt-4o
       ├── event: [DEBUG] Request body: {...}
       ├── event: pipeline.api_call     (4380ms)
       ├── event: [INFO] Response status: 200 OK
       ├── event: [INFO] Stream complete: chunks=42
       └── event: pipeline.parse        (129ms)
```

**实现方式**: `TracingSpan` 提供 `log(level, message)` 方法，同时写入 `electron-log` 和 `span.addEvent()`。`traceLLMCall` 内部把 logger 桥接到当前 Span。

**Dialog 展示**: 详情面板新增 **Logs** tab，按时间排序该阶段的 log：

```
┌─ Logs ───────────────────────────────┐
│  +0ms    [INFO]  Starting stream      │
│  +1ms    [DEBUG] Request body: {...}  │
│  +4380ms [INFO]  Response status: 200 │
│  +4382ms [INFO]  Stream complete: 42  │
└──────────────────────────────────────┘
```

一个弹窗同时看：阶段耗时 / request body / response body / 所有 log 行。

## 7. Trace Store

- **格式**: JSONL，每天一个文件 `{userData}/traces/2026-06-26.jsonl`
- **缓存**: 内存 LRU，最近 500 条
- **API**: `save(span)`, `getDetail(spanId)`, `query(filter)`, `exportRange(filter)`, `cleanup()`
- **数据量**: 日均 ~1MB，30 天 ~30MB
- **为什么不用 SQLite**: 零原生依赖，JSONL 可直接 `cat` 查看，打包无需 `electron-rebuild`

## 8. 埋点方式

用 `traceLLMCall(kind, fn, ctx)` **高阶函数**包装 4 个 LLM 调用点，不修改核心逻辑：

- `src/main/providers/chat.ts` — `localChatStream()`
- `src/main/index.ts` — `batch:suggest` / `page:summarize` / `model:test-connection` handlers

**Trace 关联**: 页面加载时生成 `pageTraceId`，通过 IPC 传递给每个 LLM 调用，形成 summary → batch → chat 完整链路树。

## 9. 本地查看器

### 交互

每条 BotMessage 右下角显示小图标：
- 正常: `🔍 · 2.3s`（灰色）
- 失败: `⚠️ · timeout`（红色）
- 点击: 弹出 `TraceDetailDialog`（Modal）

### Dialog 界面（对齐截图风格）

```
┌───────────────────────────────────────────────┐
│  ✕  处理流水线                                │
│                                               │
│  总耗时 4.52s · 已完成阶段 7/7 · 第 1 次尝试  ✅│
│                                               │
│  ┌─ LLM 调用 ROOT  4,521ms ─────────────────┐ │
│  │  ├─ 请求准备         12ms                 │ │
│  │  ├─ DNS 解析          8ms                 │ │
│  │  ├─ TCP 连接         45ms                 │ │
│  │  ├─ LLM API 调用  4,380ms                 │ │
│  │  │   ├─ 首 Token   1,200ms                │ │
│  │  │   └─ 流式接收   3,127ms (42 chunks)    │ │
│  │  ├─ 响应解析        129ms                 │ │
│  │  └─ 重试 [第2次]  2,100ms                 │ │
│  └───────────────────────────────────────────┘ │
│                                               │
│  [选中阶段详情]  开始/结束/耗时/偏移/属性     │
│                                               │
│  [📤 Request] [📥 Response] [📋 Logs]  ← tab  │
└───────────────────────────────────────────────┘
```

### ChatMessageItem 新增字段

`traceSpanId?` · `traceDurationMs?` · `traceError?`

### 各 UI 触达点

基于当前 UI 组件，trace 入口分布在以下位置：

| 组件 | 当前状态 | 建议加 trace | 优先级 |
|------|----------|-------------|:------:|
| **BotMessage** | 纯文本气泡 | 右下角 `🔍 · 2.3s`，点击弹出 Dialog | **P0** |
| **BatchFillCard** | loading: `⏳ 17 fields...`<br>done: `✅ 17 fields` + 统计 | loading 时显示实时耗时<br>done 时加 `🔍` 图标查看完整 trace | **P0** |
| **ModelConfigDialog** | "✅ Connection successful" / "❌ Connection failed" | 测试结果下方显示耗时分解：`DNS 8ms · TCP 45ms · API 1.2s`<br>失败时加 `🔍` 查看详细 trace | **P0** |
| **PageSummaryPanel** | loading: ⏳<br>error: ⚠️ + retry<br>success: 摘要文本 | error 状态旁加 `🔍`，查看为什么摘要失败 | **P1** |
| **FieldSuggestionCard** | 显示置信度 + 推荐值 + `Re-suggest` 按钮 | 每个 card 是 batch-fill 的一部分，hover 时 tooltip 显示 trace 摘要（model/tokens/耗时） | **P1** |
| **AITipBanner** | 填充成功/失败提示 | 失败时加 `🔍` 查看 trace | **P2** |
| **SettingsDialog > TracesTab** | 无 | 历史 traces 列表 + 筛选 + 导出按钮 | **P2** |

**不需要加 trace 的地方**：
- WelcomeView — 还没有发生 LLM 调用
- HomeView — 页面列表，不直接触发 LLM
- NavToolbar — 导航控件

### BatchFillCard 示例

当前只显示 `⏳ 17 fields...`，改造后 loading 阶段实时显示耗时：

```
┌─────────────────────────────────┐
│  ⏳ Pre-filling 17 fields...    │
│     ⏱ 3.2s elapsed              │  ← 新增：实时耗时
│     gpt-4o-mini · 1.2K tokens   │  ← 新增：模型 + token 预览
└─────────────────────────────────┘

Done 状态:
┌─────────────────────────────────┐
│  ✅ 17 fields pre-filled        │
│  🟢 8 auto-filled · 🟡 6 review │
│              🔍 4.5s · 1.8K tok │  ← 新增：trace 入口
│  [View All Fields]              │
└─────────────────────────────────┘
```

### ModelConfigDialog 测试连接

当前只显示 "✅ Success" 或 "❌ Failed"。改造后：

```
Test Result
┌─────────────────────────────────────┐
│  ✅ Connection successful           │
│  ───────────────────────────────    │
│  DNS resolve        · 8ms           │  ← 阶段分解
│  TCP connect        · 45ms          │
│  API response       · 1.2s          │
│  Total              · 1.3s          │
│  model: gpt-4o-mini                 │
│                              🔍     │  ← 查看完整 trace
└─────────────────────────────────────┘
```

失败状态尤其有用 — 一眼看出是 DNS 解析失败还是 API 返回 401。


## 10. 导出

### LangFuse

- 端点: `POST https://cloud.langfuse.com/api/public/otel/v1/traces`
- 认证: `Authorization: Basic base64(public_key:secret_key)`
- 可在 Settings 中配置 Public Key、Secret Key、Host，保存为 Export Profile

### Aspire Dashboard

- 端点: `POST http://localhost:4318/v1/traces`
- 免认证，本地: `docker run -p 4317:18889 mcr.microsoft.com/dotnet/aspire-dashboard`
- 与 LangFuse 共用同一套 OTLP/HTTP 逻辑

### 实现

`src/main/tracing/OtlpExporter.ts` — 本地 spans → OTLP JSON → `fetch()` POST 到目标。

## 11. IPC 通道

| 通道 | 方向 | 说明 |
|------|------|------|
| `trace:get` | Renderer→Main | 按 spanId 获取详情 |
| `trace:list` | Renderer→Main | 按条件查询列表 |
| `trace:export` | Renderer→Main | 导出到指定目标 |

## 12. 文件结构

```
src/main/tracing/          ← 新目录
├── TracerProvider.ts      Span 生命周期管理
├── TracingSpan.ts         Span 实现 + log() 桥接
├── TraceStore.ts          JSONL 持久化 + LRU 缓存
├── OtlpExporter.ts        OTLP/HTTP 导出
├── instrumentation/llm.ts traceLLMCall() 包装器
└── utils.ts               ID 生成

src/renderer/src/components/sidebar/chat/
├── BotMessage.vue          改动：🔍 图标 + 耗时
├── BatchFillCard.vue       改动：loading 实时耗时 + done trace 入口
├── FieldSuggestionCard.vue 改动：hover tooltip 显示 trace 摘要
└── TraceDetailDialog.vue   新：流水线弹窗

src/renderer/src/components/sidebar/
├── ModelConfigDialog.vue   改动：测试结果显示耗时分解 + trace 入口
├── PageSummaryPanel.vue    改动：error 状态加 trace 入口
└── AITipBanner.vue          改动：失败时加 trace 入口

src/renderer/src/composables/
└── useTraceDetail.ts       新
```

## 13. 实现路线图

| Phase | 内容 | 工作量 |
|-------|------|:------:|
| **P0** | Core Tracing：TracerProvider + TraceStore + 4 调用点埋点 + spanId 回传 + electron-log 桥接 | 2-3 days |
| **P0** | BotMessage `🔍` 图标 + TraceDetailDialog 弹窗 | 1-2 days |
| **P0** | BatchFillCard 实时耗时 + done trace 入口 | 0.5 day |
| **P0** | ModelConfigDialog 测试结果耗时分解 + trace 入口 | 0.5 day |
| **P1** | PageSummaryPanel error trace 入口 · FieldSuggestionCard tooltip · AITipBanner | 1 day |
| **P2** | 导出：OtlpExporter + LangFuse/Aspire + Settings TracesTab | 1-2 days |
| **P3** | 成本估算、自动清理 >30 天、API Key 脱敏 | 可选 |

### API Key 安全

`traceSpanDetail` 不存储 `apiKey`；header 记录自动脱敏为 `Bearer sk-****abcd`。
