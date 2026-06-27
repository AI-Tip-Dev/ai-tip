/**
 * useBridgeHost — Sidebar-side bridge host.
 *
 * Listens for `bridge:request` from webview (sent by the injected SDK IIFE
 * or native SDK via webview-preload's sendToHost protocol) and routes to
 * ipcMain handlers / webview.executeJavaScript.
 *
 * Types are imported from @ai-tip/sdk — the single source of truth.
 */

import { ref, type Ref } from 'vue'
import log from 'electron-log/renderer'
import type { FieldContext } from '@ai-tip/sdk'

interface BridgeRequest {
  id: string
  method: string
  args: unknown[]
}

export interface BridgeHost {
  isActive: Ref<boolean>
  lastError: Ref<string | null>
  setup: () => void
  teardown: () => void
  sendEvent: (event: string, payload: unknown) => void
}

export function useBridgeHost(
  webviewRef: Ref<HTMLElement | null>,
): BridgeHost {
  const isActive = ref(false)
  const lastError = ref<string | null>(null)

  function getWebview(): Electron.WebviewTag | null {
    return webviewRef.value as unknown as Electron.WebviewTag | null
  }

  function respond(id: string, result?: unknown, error?: string): void {
    const wv = getWebview()
    if (!wv) return
    try { wv.send('bridge:response', { id, result, error }) } catch {}
  }

  function sendEvent(event: string, payload: unknown): void {
    const wv = getWebview()
    if (!wv) return
    try { wv.send('bridge:event', { event, payload }) } catch {}
  }

  async function handleRequest(req: BridgeRequest): Promise<void> {
    log.debug(`[bridge-host] ${req.method}`)
    try {
      const result = await route(req.method, req.args)
      respond(req.id, result)
    } catch (e: any) {
      lastError.value = `${req.method}: ${e.message}`
      respond(req.id, undefined, e.message)
    }
  }

  async function route(method: string, args: unknown[]): Promise<unknown> {
    const { ipcRenderer } = window.require('electron')

    switch (method) {
      // ── AI Tip ──
      case 'ai-tip:fillField': {
        const [value, ctx] = args as [string, FieldContext]
        return ipcRenderer.invoke('ai-tip:fill-field', { value, context: ctx })
      }
      case 'ai-tip:highlightField': {
        const [ctx] = args as [FieldContext]
        const wv = getWebview()
        if (!wv) return
        await wv.executeJavaScript(`
          (function(){
            var c=${JSON.stringify(ctx)};
            var el=document.getElementById(c.id)||document.querySelector('[name="'+(c.name||'').replace(/"/g,'\\\\"')+'"]');
            if(el){el.scrollIntoView({behavior:'smooth',block:'center'});el.style.outline='2px solid #7c3aed';el.style.outlineOffset='2px';setTimeout(function(){el.style.outline='';el.style.outlineOffset=''},3000)}
          })()`)
        return
      }
      case 'ai-tip:setButtonState':
      case 'ai-tip:setEnabled':
      case 'ai-tip:isEnabled':
        return method === 'ai-tip:isEnabled' ? true : undefined

      // ── Form Detect ──
      case 'form-detect:detectFields':
        return ipcRenderer.invoke('form:detect-fields', { webContentsId: args[0] })
      case 'form-detect:buildAXTreeText':
        return ipcRenderer.invoke('form:build-ax-tree-text', { rawNodes: args[0] })

      // ── Page Summary ──
      case 'page-summary:summarize':
        return ipcRenderer.invoke('page:summarize', { config: args[0], messages: args[1] })

      // ── Batch Fill ──
      case 'batch-fill:suggest':
        return ipcRenderer.invoke('batch:suggest', { config: args[0], fields: args[1], structuredCtx: args[2] })
      case 'batch-fill:autoFill': {
        const wv = getWebview()
        if (!wv) return []
        const [, fields] = args as [unknown, Array<{ id?: string; name?: string; value?: string }>]
        const results: unknown[] = []
        for (const f of fields) {
          try {
            const r = await wv.executeJavaScript(`
              (function(){
                var el=document.getElementById(${JSON.stringify(f.id||'')})||document.querySelector('[name=${JSON.stringify(f.name||'').replace(/"/g,'\\"')}]');
                if(!el)return JSON.stringify({ok:false,reason:'Not found'});
                var d=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')||Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value');
                if(d&&d.set)d.set.call(el,${JSON.stringify(f.value||'')});else el.value=${JSON.stringify(f.value||'')};
                el.dispatchEvent(new Event('input',{bubbles:true}));
                el.dispatchEvent(new Event('change',{bubbles:true}));
                return JSON.stringify({ok:true,label:${JSON.stringify(f.value||'')}})
              })()`)
            results.push(JSON.parse(r))
          } catch { results.push({ ok: false }) }
        }
        return results
      }

      // ── LLM ──
      case 'llm:testConnection': return ipcRenderer.invoke('model:test-connection', args[0])
      case 'llm:startStream':
        ipcRenderer.send('llm:stream:start', { config: args[0], messages: args[1], requestId: args[2], options: args[3] })
        return
      case 'llm:stopStream': ipcRenderer.send('llm:stream:stop'); return

      // ── Model Config ──
      case 'model-config:list': return ipcRenderer.invoke('model:list')
      case 'model-config:get': return ipcRenderer.invoke('model:get', args[0])
      case 'model-config:set': return ipcRenderer.invoke('model:set', args[0], args[1])
      case 'model-config:delete': return ipcRenderer.invoke('model:delete', args[0])

      // ── Session ──
      case 'session:getActive': return ipcRenderer.invoke('session:get-active')
      case 'session:list': return ipcRenderer.invoke('session:list')
      case 'session:create': return ipcRenderer.invoke('session:create', args[0])
      case 'session:delete': return ipcRenderer.invoke('session:delete', args[0])
      case 'session:addMessage': return ipcRenderer.invoke('session:add-message', args[0], args[1])

      // ── Webview ──
      case 'webview:navigate': { const wv = getWebview(); if (wv) wv.loadURL(args[0] as string); return }
      case 'webview:goBack': { const wv = getWebview(); if (wv?.canGoBack()) wv.goBack(); return }
      case 'webview:goForward': { const wv = getWebview(); if (wv?.canGoForward()) wv.goForward(); return }
      case 'webview:reload': { const wv = getWebview(); if (wv) wv.reload(); return }

      // ── Trace ──
      case 'trace:get': return ipcRenderer.invoke('trace:get', args[0])
      case 'trace:list': return ipcRenderer.invoke('trace:list', args[0])
      case 'trace:export': return ipcRenderer.invoke('trace:export', { profile: args[0], filter: args[1] })

      // ── Passthrough ──
      case 'i18n:getLocale':
      case 'i18n:setLocale':
      case 'i18n:t':
      case 'history:list':
      case 'history:add':
      case 'history:clear':
      case 'settings:get':
      case 'settings:set':
      case 'settings:delete':
      case 'settings:list':
        return ipcRenderer.invoke(method, ...args)

      default:
        throw new Error(`Unknown method: "${method}"`)
    }
  }

  function setup(): void {
    const wv = getWebview()
    if (!wv) { log.error('[bridge-host] setup: webview null'); return }

    wv.addEventListener('ipc-message', (event: any) => {
      if (event.channel === 'bridge:request') {
        const req = event.args[0] as BridgeRequest
        if (req?.id && req?.method) handleRequest(req)
      }
    })

    isActive.value = true
    log.info('[bridge-host] Active')
  }

  function teardown(): void { isActive.value = false }

  return { isActive, lastError, setup, teardown, sendEvent }
}

