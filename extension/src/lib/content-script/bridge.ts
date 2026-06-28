/**
 * Content Script Bridge
 *
 * postMessage-based bridge between:
 *   - Page (MAIN world)  ←→  Content Script (ISOLATED world)
 *   - Content Script      ←→  Background SW (chrome.runtime)
 *
 * Protocol: PING/PONG/CALL/RESP/ERR/EVENT
 */

interface BridgeMessage {
  type: 'PING' | 'PONG' | 'CALL' | 'RESP' | 'ERR' | 'EVENT'
  id?: string; method?: string; args?: unknown[]; data?: unknown
  error?: string; event?: string; payload?: unknown
  origin: 'page' | 'content-script' | 'background'
}

type CallHandler = (method: string, args: unknown[]) => Promise<unknown>

interface ContentBridge {
  onCall(handler: CallHandler): void
  handleCall(method: string, args: unknown[]): Promise<unknown>
  emit(event: string, payload: unknown): void
}

const pendingCalls = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>()
let callSeq = 0
const CALL_TIMEOUT = 30000

export function initBridge(): ContentBridge {
  let callHandler: CallHandler | null = null

  window.addEventListener('message', (event) => {
    if (event.source !== window) return
    const msg = event.data as BridgeMessage | undefined
    if (!msg || typeof msg.type !== 'string') return
    handlePostMessage(msg, callHandler)
  })

  function handlePostMessage(msg: BridgeMessage, handler: CallHandler | null): void {
    switch (msg.type) {
      case 'PING':
        window.postMessage({
          type: 'PONG', id: msg.id, origin: 'content-script',
          data: { version: '0.1.0', env: 'extension', hostName: 'AI Tip Extension',
            capabilities: ['ai-tip','form-detect','batch-fill','llm','model-config','session','trace','i18n','history','settings'] }
        } satisfies BridgeMessage, '*')
        break

      case 'CALL': {
        if (!msg.method || !handler) {
          window.postMessage({ type: 'ERR', id: msg.id, origin: 'content-script', error: 'No handler' } satisfies BridgeMessage, '*')
          return
        }
        handler(msg.method, msg.args ?? [])
          .then(data => window.postMessage({ type: 'RESP', id: msg.id, origin: 'content-script', data } satisfies BridgeMessage, '*'))
          .catch((error: Error) => window.postMessage({ type: 'ERR', id: msg.id, origin: 'content-script', error: error.message } satisfies BridgeMessage, '*'))
        break
      }

      case 'RESP':
      case 'ERR': {
        if (msg.id) {
          const pending = pendingCalls.get(msg.id)
          if (pending) {
            clearTimeout(pending.timer); pendingCalls.delete(msg.id)
            msg.type === 'ERR' ? pending.reject(new Error(msg.error || 'Unknown error')) : pending.resolve(msg.data)
          }
        }
        break
      }

      case 'EVENT':
        if (msg.event) chrome.runtime.sendMessage({ type: 'PAGE_EVENT', event: msg.event, payload: msg.payload }).catch(() => {})
        break
    }
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'BRIDGE_CALL' && callHandler) {
      callHandler(message.method, message.args ?? [])
        .then(result => sendResponse({ success: true, data: result }))
        .catch((error: Error) => sendResponse({ success: false, error: error.message }))
      return true
    }
    return false
  })

  return {
    onCall(handler: CallHandler) { callHandler = handler },
    async handleCall(method: string, args: unknown[]): Promise<unknown> {
      const id = `cs-call-${++callSeq}`
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pendingCalls.delete(id); reject(new Error(`Call timeout: ${method}`)) }, CALL_TIMEOUT)
        pendingCalls.set(id, { resolve, reject, timer })
        window.postMessage({ type: 'CALL', id, method, args, origin: 'content-script' } satisfies BridgeMessage, '*')
      })
    },
    emit(event: string, payload: unknown) {
      chrome.runtime.sendMessage({ type: 'CS_EVENT', event, payload }).catch(() => {})
      window.postMessage({ type: 'EVENT', event, payload, origin: 'content-script' } satisfies BridgeMessage, '*')
    },
  }
}
