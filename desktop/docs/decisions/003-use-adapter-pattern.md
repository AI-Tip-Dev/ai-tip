# ADR-003: LLM Provider 采用 Adapter 接口 + Registry 模式

**状态**: ✅ 已采纳
**日期**: 2026-06
**决策者**: 项目组
**关联**: [04 LLM Provider 设计](../04-llm-provider-design.md)

---

## 背景

需要支持多个 LLM Provider（OpenAI、Anthropic、Ollama、DeepSeek 等），早期设计采用 class 继承模式（`OllamaProvider extends BaseProvider`）。

参考 WeKnora 项目的实践后，决定改用 Adapter 接口 + Registry 模式。

## 方案对比

| 维度 | Adapter 接口 + Registry | Class 继承 |
|------|:---:|:---:|
| 新增 Provider | 一行 metadata | 新建 class 文件 |
| 灵活性 | 纯对象，可 compose | 继承链固定 |
| Ollama 处理 | 走 OpenAI 兼容（`/v1/chat/completions`） | 需独立适配器 |
| 代码量 | ~340 行 | ~340 行 |
| 测试 | 纯函数，可独立测 | 需 mock 类实例 |

## 决策

选择 **Adapter 接口 + Registry 查表**。

```typescript
interface ProviderAdapter {
  endpoint(baseUrl: string, isStream: boolean): string
  authHeaders(apiKey: string): Record<string, string>
  buildRequestBody(model, messages, options): unknown
  parseSSEEvent(event: string): StreamChunk | null
}
```

## 后果

- ✅ 22/23 个 Provider 共享 `baseAdapter`（OpenAI 兼容），仅 Anthropic 独立
- ✅ 10 个 Provider 注册：Ollama, OpenAI, Anthropic, DeepSeek, 阿里云百炼, 智谱, 硅基流动, Moonshot, OpenRouter, Generic
- ✅ 新增 Provider 只需在 `registry.ts` 加一行 metadata + Provider 名
- ✅ `localChatStream()` 内置 120s 超时、3 次重试、AbortController 取消
- ✅ 未来 Phase 3 的嵌入模型也可复用同一 Registry 机制
