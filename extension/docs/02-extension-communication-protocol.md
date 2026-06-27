# 02 — Extension 通信协议设计

> **创建**: 2026-06-27 · **状态**: 📝 草案
> **关联**: [01 — 架构总览](./01-browser-extension-architecture.md) · [14 — 三 Repo 架构](../desktop/docs/14-electron-js-sdk-architecture.md)
> **场景**: Extension 的三层通信——SaaS 页面 ↔ Content Script ↔ Background SW ↔ Side Panel

---

## 📋 文档导航

> - [一句话概述](#一句话概述) · [通信架构](#通信架构) · [握手协议](#握手协议)
> - [调用协议](#调用协议) · [事件推送](#事件推送) · [Side Panel 通信](#side-panel-通信)
> - [传输对比](#传输对比) · [错误处理](#错误处理)

---

## 一句话概述

> 🎯 **Extension 使用 postMessage（页面↔Content Script）+ chrome.runtime.sendMessage（Content Script↔Background）+ chrome.runtime.connect（Background↔Side Panel 流式），三层接力实现全双工通信。**

---

## 通信架构

```
SaaS 页面 (MAIN world)          Content Script (ISOLATED)        Background SW              Side Panel
─────────────────────          ─────────────────────────        ──────────────              ──────────

① postMessage                  window.addEventListener          chrome.runtime
   {type, id, method, args}  →   ('message')                    .sendMessage()
                                 ├─ 校验 origin                 └→ onMessage
                                 ├─ 握手: PING→PONG               ├─ 路由 method
                                 └─ 调用: CALL→RESP/ERR           │  → handler()
                                                                  └─ 返回 result

② (事件反向推)                  postMessage({                     chrome.runtime          chrome.runtime
                                 type, event,                    .sendMessage()         .onMessage
                                 payload})                      ← (主动推送)            ← (接收事件)
                               ← window.postMessage

③ (Side Panel ↔ Background)                                                              chrome.runtime
                                                                  chrome.runtime         .sendMessage()
                                                                  .onMessage           → config/get/...
                                                                  ← 返回 result

④ (流式 LLM)                                                                          chrome.runtime
                                                                  chrome.runtime         .connect({name})
                                                                  .onConnect           → port.postMessage
                                                                  port ↔ port            port.onMessage
```

---

## 消息格式

### 统一消息信封

```typescript
// 所有跨层消息的公共结构
interface BridgeMessage {
  type: '__BRIDGE_PING' | '__BRIDGE_PONG'
      | '__BRIDGE_CALL' | '__BRIDGE_RESP' | '__BRIDGE_ERR'
      | '__BRIDGE_EVENT'
  id: string        // 唯一请求 ID（UUID 或 `${ts}-${seq}-${random}`）
  ts: number        // 发送时间戳
}

// 握手
interface PingMessage extends BridgeMessage {
  type: '__BRIDGE_PING'
}

interface PongMessage extends BridgeMessage {
  type: '__BRIDGE_PONG'
  meta: {
    version: string       // Extension 版本 (semver)
    env: 'extension'
    hostName: string      // "AI Tip Extension"
    capabilities: string[] // ['llm', 'form-detect', 'batch-fill', ...]
  }
}

// 方法调用
interface CallMessage extends BridgeMessage {
  type: '__BRIDGE_CALL'
  method: string          // "ai-tip:fillField"
  args: unknown[]         // 位置参数数组
}

interface RespMessage extends BridgeMessage {
  type: '__BRIDGE_RESP'
  result: unknown
}

interface ErrMessage extends BridgeMessage {
  type: '__BRIDGE_ERR'
  method: string
  error: {
    message: string
    code?: string
    stack?: string
  }
}

// 事件推送
interface EventMessage extends BridgeMessage {
  type: '__BRIDGE_EVENT'
  event: string           // "ai-tip:field-selected"
  payload: unknown
}
```

---

## 握手协议

### 时序

```
SaaS 页面 (SDK)                           Content Script
──────────────                            ──────────────

1. pingExtension(timeoutMs=500)
   → postMessage({type:'__BRIDGE_PING',
                  id:'sdk-ping-xxx',
                  ts: Date.now()}, '*')
                                          → message event handler
                                          → 校验: 不是自己发的消息
                                          → 校验: data.type === '__BRIDGE_PING'
                                          → postMessage({
                                              type:'__BRIDGE_PONG',
                                              id: data.id,
                                              ts: Date.now(),
                                              meta: {
                                                version:'1.0.0',
                                                env:'extension',
                                                hostName:'AI Tip Extension',
                                                capabilities:[
                                                  'ai-tip',
                                                  'form-detect',
                                                  'batch-fill',
                                                  'llm',
                                                  ...
                                                ]
                                              }
                                            }, '*')

2. 收到 PONG (id 匹配)
   → markExtensionHandshakeComplete()
   → resolve(true)
   → 后续调用使用 ExtensionTransport
```

### 超时处理

```typescript
// sdk/src/utils/env-detect.ts
export function pingExtension(timeoutMs = 500): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      window.removeEventListener('message', handler)
      resolve(false)  // 超时 → 无 Extension
    }, timeoutMs)
    // ...
  })
}
```

500ms 是合理的超时——Content Script 在同一进程中，PONG 响应几乎是瞬时的。超时意味着 Extension 未安装或未激活。

---

## 调用协议

### 标准调用（请求-响应）

```
SaaS 页面 (SDK)                          Content Script                    Background SW
──────────────                           ──────────────                    ──────────────

1. bridge.aiTip.fillField(value, ctx)
   → transport.invoke('ai-tip:fillField',
                       [value, ctx])
   → postMessage({
       type:'__BRIDGE_CALL',
       id:'sdk-call-xxx',
       ts: Date.now(),
       method:'ai-tip:fillField',
       args:[value, ctx]
     }, '*')

2. 等待响应 (30s 超时)
                                         → message event handler
                                         → 校验 origin
                                         → chrome.runtime.sendMessage({
                                             method:'ai-tip:fillField',
                                             args:[value, ctx],
                                             requestId: data.id
                                           })
                                                                           → onMessage listener
                                                                           → router.route(method, args)
                                                                           → handler() → result
                                                                           → sendResponse({result})

                                         → sendMessage callback
                                         → postMessage({
                                             type:'__BRIDGE_RESP',
                                             id: requestId,
                                             ts: Date.now(),
                                             result: {ok:true}
                                           }, '*')

3. 收到 RESP (id 匹配)
   → pending.resolve(result)
   → bridge.aiTip.fillField() 返回 {ok:true}
```

### Content Script 超时转发

```typescript
// content-script/src/bridge.ts
function forwardToBackground(msg: CallMessage): void {
  const { id, method, args } = msg

  chrome.runtime.sendMessage(
    { method, args, requestId: id },
    (response) => {
      if (chrome.runtime.lastError) {
        // Background SW 可能已被终止
        window.postMessage({
          type: '__BRIDGE_ERR',
          id,
          ts: Date.now(),
          method,
          error: {
            message: chrome.runtime.lastError.message,
            code: 'SW_TERMINATED'
          }
        }, '*')
        return
      }
      window.postMessage({
        type: '__BRIDGE_RESP',
        id,
        ts: Date.now(),
        result: response
      }, '*')
    }
  )
}
```

---

## 事件推送

### 推送路径

事件从 Background SW 或 Content Script **主动推送**到 SaaS 页面，不走请求-响应模式。

```
Background SW                           Content Script                   SaaS 页面
──────────────                          ──────────────                   ──────────

chrome.runtime.sendMessage({            message event                   SDK
  type: 'event',                        → postMessage({                → transport.onEvent
  event: 'llm:stream-chunk',               type:'__BRIDGE_EVENT',         callback
  payload: {token:'你好'}                   event:'llm:stream-chunk',
})                                          payload:{token:'你好'}
                                        }, '*')
```

### 支持的事件

| 事件名 | 来源 | 触发时机 |
|--------|------|---------|
| `ai-tip:field-selected` | Content Script | 用户 hover/focus 字段 |
| `batch-fill:progress` | Background | 批量建议流式进度 |
| `llm:stream-chunk` | Background | LLM 返回一个 token |
| `llm:stream-error` | Background | LLM 流式错误 |
| `session:page-changed` | Content Script | 页面 URL 变更 |

---

## Side Panel 通信

### 请求-响应（配置读写等）

```typescript
// side-panel/src/composables/useBridge.ts
export function useBridge() {
  async function invoke(method: string, args: unknown[]): Promise<unknown> {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ method, args }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message))
        } else {
          resolve(response)
        }
      })
    })
  }

  return { invoke }
}
```

### 流式连接（LLM Chat / Batch Fill）

使用 `chrome.runtime.connect` 建立长连接（port），避免短连接在 SW 终止时丢失：

```typescript
// side-panel — 建立流式连接
const port = chrome.runtime.connect({ name: 'llm-stream' })

port.onMessage.addListener((msg) => {
  if (msg.type === 'chunk') {
    appendToken(msg.token)
  } else if (msg.type === 'done') {
    finishMessage()
    port.disconnect()
  }
})

port.postMessage({
  type: 'start',
  config: activeModel,
  messages: [...chatHistory],
})
```

```typescript
// background — 接收流式连接
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'llm-stream') {
    port.onMessage.addListener(async (msg) => {
      if (msg.type === 'start') {
        // 使用 @ai-tip/llm-providers 发起流式调用
        await localChatStream(
          msg.config, msg.messages,
          (chunk) => port.postMessage({ type: 'chunk', token: chunk.token }),
          { stream: true }
        )
        port.postMessage({ type: 'done' })
      }
    })
  }
})
```

> ⚠️ **关键**: port 保持打开期间，Service Worker 不会被浏览器终止。流式结束后应立即 `port.disconnect()`。

---

## 传输对比

### 与 Desktop IPC 的对比

| 维度 | Desktop (Electron IPC) | Extension (postMessage + chrome.runtime) |
|------|----------------------|----------------------------------------|
| **延迟** | ~0.1ms (同进程) | ~1-5ms (跨上下文) |
| **序列化** | Structured Clone (自动) | JSON (需手动序列化复杂类型) |
| **二进制** | 支持 Buffer/ArrayBuffer | 需 Base64 编码 |
| **流式** | IPC stream (ipcMain.handle 返回 AsyncIterable) | chrome.runtime.connect port |
| **事件推送** | ipcRenderer.on / sendToHost | postMessage EVENT 类型 |
| **超时** | 30s renderer 侧超时 | 30s SDK 侧 + 无回调超时 (SW 终止) |
| **生命周期** | Main Process 常驻 | SW 可能被终止，port 保持期间不终止 |

---

## 错误处理

### 错误码体系

```typescript
enum BridgeErrorCode {
  TIMEOUT           = 'TIMEOUT',            // 30s 无响应
  SW_TERMINATED     = 'SW_TERMINATED',      // Service Worker 已终止
  UNKNOWN_METHOD    = 'UNKNOWN_METHOD',     // method 未注册
  INVALID_ARGS      = 'INVALID_ARGS',       // 参数校验失败
  PERMISSION_DENIED = 'PERMISSION_DENIED',  // 缺少 chrome 权限
  LLM_ERROR         = 'LLM_ERROR',          // LLM 调用失败
  NETWORK_ERROR     = 'NETWORK_ERROR',      // fetch 失败
  INTERNAL_ERROR    = 'INTERNAL_ERROR',      // 未知内部错误
}
```

### 调用方错误处理

```typescript
// SDK 侧 (ExtensionTransport)
async invoke(method: string, args: unknown[]): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = genId()
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new BridgeInvokeError(method, `Timeout: no response in ${this.timeoutMs}ms`))
    }, this.timeoutMs)

    pending.set(id, { resolve, reject, timer })
    window.postMessage({ type: '__BRIDGE_CALL', id, ts: Date.now(), method, args }, '*')
  })
}
```

### Background 侧错误处理

```typescript
// background/src/router.ts
export async function route(method: string, args: unknown[]): Promise<unknown> {
  try {
    const handler = routes[method]
    if (!handler) {
      return { error: { code: 'UNKNOWN_METHOD', message: `Unknown method: ${method}` } }
    }
    // 参数校验
    validateArgs(method, args)
    return await handler(args)
  } catch (err) {
    return {
      error: {
        code: err instanceof BridgeError ? err.code : 'INTERNAL_ERROR',
        message: err instanceof Error ? err.message : 'Internal error',
      }
    }
  }
}
```

---

## 参考资源

| 资源 | 链接 |
|------|------|
| Chrome Extension Messaging | `developer.chrome.com/docs/extensions/mv3/messaging` |
| Chrome long-lived connections | `developer.chrome.com/docs/extensions/mv3/messaging#connect` |
| Window.postMessage | `developer.mozilla.org/en-US/docs/Web/API/Window/postMessage` |
| SDK ExtensionTransport 实现 | `sdk/src/transports/extension.ts` |
| SDK env-detect 实现 | `sdk/src/utils/env-detect.ts` |

---

> **下一步**: [03 — 表单检测](./03-extension-form-detection-design.md)
