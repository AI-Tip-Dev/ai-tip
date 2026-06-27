/**
 * Bridge — the main entry point for creating a BridgeAPI instance.
 *
 * `createBridge()` detects the runtime environment and returns a fully-typed
 * BridgeAPI with 15 API domains, plugin system, middleware pipeline, and hooks.
 *
 * Usage:
 *   import { createBridge } from '@ai-tip/sdk'
 *   const bridge = await createBridge()
 *   await bridge.fs.readFile('/path/to/file.txt')
 *   bridge.aiTip.onFieldSelected((ctx) => showBanner(ctx))
 */

import type { BridgeAPI, BridgeMeta, SDKPlugin, Middleware, HookName, HookHandler } from './types'
import { BridgeNotAvailableError } from './types'

import { detectEnv, pingExtension } from './utils/env-detect'
import { SDK_VERSION, validateVersions } from './utils/version'

import { ElectronTransport, getElectronBridge } from './transports/electron'
import { ExtensionTransport } from './transports/extension'
import { FallbackTransport } from './transports/fallback'

// All API factory imports
import { createAITipAPI } from './apis/ai-tip'
import { createFormDetectAPI } from './apis/form-detect'
import { createPageSummaryAPI } from './apis/page-summary'
import { createBatchFillAPI } from './apis/batch-fill'
import { createLLMAPI } from './apis/llm-stream'
import { createModelConfigAPI } from './apis/model-config'
import { createSessionAPI } from './apis/session'
import { createWebviewAPI } from './apis/webview'
import { createTraceAPI } from './apis/trace'
import { createI18nAPI } from './apis/i18n'
import { createHistoryAPI } from './apis/history'
import { createSettingsAPI } from './apis/settings'

// Extension systems
import { PluginRegistry } from './plugins/registry'
import { HookRegistry } from './hooks/registry'
import { createPipeline } from './middleware/pipeline'

export interface CreateBridgeOptions {
  timeoutMs?: number
  plugins?: SDKPlugin[]
  middleware?: Middleware[]
}

export async function createBridge(options?: CreateBridgeOptions): Promise<BridgeAPI> {
  const timeoutMs = options?.timeoutMs ?? 500

  // 1. Try Electron
  const electronBridge = getElectronBridge()
  if (electronBridge) {
    const rawTransport = new ElectronTransport(electronBridge)
    const meta: BridgeMeta = electronBridge.meta
    validateVersions(SDK_VERSION, meta.version)
    return buildFullBridge(rawTransport, meta, options)
  }

  // 2. Try Extension (postMessage handshake)
  if (typeof window !== 'undefined') {
    const extAvailable = await pingExtension(timeoutMs)
    if (extAvailable) {
      const rawTransport = new ExtensionTransport()
      return buildFullBridge(rawTransport, { version: 'unknown', env: 'extension' }, options)
    }
  }

  // 3. Fallback
  throw new BridgeNotAvailableError()
}

export function createBridgeSync(options?: CreateBridgeOptions): BridgeAPI {
  const electronBridge = getElectronBridge()
  if (!electronBridge) {
    throw new BridgeNotAvailableError('No bridge available synchronously. Use createBridge() instead.')
  }
  const rawTransport = new ElectronTransport(electronBridge)
  const meta: BridgeMeta = electronBridge.meta
  validateVersions(SDK_VERSION, meta.version)
  return buildFullBridge(rawTransport, meta, options)
}

// ── Internal builder ──

function buildAllAPIs(transport: ElectronTransport | ExtensionTransport | FallbackTransport) {
  return {
    aiTip: createAITipAPI(transport),
    formDetect: createFormDetectAPI(transport),
    pageSummary: createPageSummaryAPI(transport),
    batchFill: createBatchFillAPI(transport),
    llm: createLLMAPI(transport),
    modelConfig: createModelConfigAPI(transport),
    session: createSessionAPI(transport),
    webview: createWebviewAPI(transport),
    trace: createTraceAPI(transport),
    i18n: createI18nAPI(transport),
    history: createHistoryAPI(transport),
    settings: createSettingsAPI(transport),
  }
}

function buildFullBridge(
  rawTransport: ElectronTransport | ExtensionTransport | FallbackTransport,
  meta: BridgeMeta,
  options?: CreateBridgeOptions
): BridgeAPI {
  const hookRegistry = new HookRegistry()
  const pluginRegistry = new PluginRegistry()
  const allMws = [...(options?.middleware ?? [])]

  let transport = allMws.length > 0 ? createPipeline(rawTransport, allMws) : rawTransport
  let apis = buildAllAPIs(transport as ElectronTransport)

  const bridge: BridgeAPI = {
    meta: Object.freeze({ ...meta }),
    ...apis,

    use(plugin: SDKPlugin): Promise<void> {
      return pluginRegistry.install(plugin, bridge)
    },

    useMiddleware(mw: Middleware): void {
      allMws.push(mw)
      transport = createPipeline(rawTransport, allMws)
      apis = buildAllAPIs(transport as ElectronTransport)
      Object.assign(bridge, apis)
    },

    onHook<T extends HookName>(name: T, handler: HookHandler<T>): void {
      hookRegistry.on(name, handler)
    },

    offHook<T extends HookName>(name: T, handler: HookHandler<T>): void {
      hookRegistry.off(name, handler)
    },

    destroy(): void {
      hookRegistry.clear()
      pluginRegistry.uninstallAll()
      if (rawTransport instanceof ExtensionTransport) rawTransport.destroy()
    },
  }

  // Install plugins
  if (options?.plugins) {
    for (const plugin of options.plugins) {
      pluginRegistry.install(plugin, bridge).catch(err =>
        console.error(`[ai-tip/sdk] Plugin "${plugin.name}" install failed:`, err)
      )
    }
  }

  return bridge
}

export async function isBridgeAvailable(timeoutMs?: number): Promise<boolean> {
  const { env } = await detectEnv(timeoutMs)
  return env !== 'unknown'
}
