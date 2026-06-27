# Phase 3-5 详细任务 Spec（归档）

> **归档日期**: 2026-06-26
> **原因**: 这些是前期设计的详细 Task Spec，Phase 2 实际实施时架构发生了显著变化（CDP 替代 DOM 注入、Adapter 模式替代 class 继承等），Phase 3-5 实施前需基于当前代码重新设计。
> **原始位置**: `docs/06-development-plan.md`

---

## Phase 3 — 知识库（原始设计）

> **目标**: 用户上传文档 → 切片 → 向量化 → 存 LanceDB → 语义检索。

### Task 3.1 — 依赖安装 & 环境配置

- `pnpm add @lancedb/lancedb @xenova/transformers pdf-parse mammoth turndown`
- 验证所有包在 Electron 环境中可正常 import

### Task 3.2 — 文档解析器 (`src/main/document-parser.ts`)

```
PDF  → pdf-parse     → 纯文本
.docx → mammoth       → Markdown → turndown → 纯文本
.html → turndown      → Markdown → 纯文本
.md   → 直接读取      → 纯文本
.txt  → 直接读取      → 纯文本
```

### Task 3.3 — 文本切片器 (`src/main/text-splitter.ts`)

- `chunkSize = 500`, `overlap = 50`
- 优先按段落 → 句子 → 长度硬切

### Task 3.4 — 嵌入服务 (`src/main/embedding-service.ts`)

双轨制:
- 默认: Xenova/bge-small-zh (中文) / all-MiniLM-L6-v2 (英文)
- 云端: OpenAI text-embedding-3-small

### Task 3.5 — 知识库服务 (`src/main/knowledge-base.ts`)

```typescript
class KnowledgeBase {
  async addDocument(filePath: string): Promise<{ docId, chunkCount }>
  async search(query: string, topK?: number): Promise<SearchResult[]>
  async listDocuments(): Promise<DocInfo[]>
  async deleteDocument(docId: string): Promise<void>
}
```

LanceDB Table: id, doc_id, doc_name, text, chunk_index, vector(512), created_at

---

## Phase 4 — AI Agent（原始设计）

> **目标**: 表单字段 → 检索知识库 → LLM 推理 → 候选值 + 来源 + 置信度。

### Task 4.1 — LLM 服务 (`src/main/llm-service.ts`)

双轨 LLM: Ollama (qwen2.5:7b) / OpenAI (gpt-4o-mini)

### Task 4.2 — Agent 核心循环 (`src/main/agent.ts`)

ReAct 模式:
```
for each field:
  1. searchKB(field.label + pageTitle) → top-5 片段
  2. LLM 推理 → { value, confidence, reasoning }
  3. 累积到 results[]
```

置信度: >0.8 绿色 / 0.5-0.8 黄色 / <0.5 红色

### Task 4.3 — Sidebar Agent 交互 UI

- Auto Fill → loading → 候选值列表 → 用户审查 → Apply All

### Task 4.4 — 端到端 AI 集成验证

---

## Phase 5 — 打磨 & 发布（原始设计）

- Task 5.1: 审计日志系统
- Task 5.2: 错误处理 & 降级策略
- Task 5.3: 性能优化
- Task 5.4: 打包发布 & 自动更新
