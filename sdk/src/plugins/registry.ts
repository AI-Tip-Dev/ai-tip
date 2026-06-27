/**
 * Plugin registry — manages plugin lifecycle.
 */

import type { SDKPlugin, PluginContext, BridgeAPI } from '../types'
import type { Middleware } from '../types'

export class PluginRegistry {
  private plugins: Map<string, SDKPlugin> = new Map()

  getPluginContext(bridge: BridgeAPI): PluginContext {
    const usedMws: Middleware[] = []
    return {
      bridge,
      useMiddleware(mw: Middleware): void {
        usedMws.push(mw)
        bridge.useMiddleware(mw)
      },
      onHook(name, handler) {
        bridge.onHook(name, handler)
      },
      logger: console,
    }
  }

  async install(plugin: SDKPlugin, bridge: BridgeAPI): Promise<void> {
    if (this.plugins.has(plugin.name)) {
      console.warn(`[ai-tip/sdk] Plugin "${plugin.name}" is already installed.`)
      return
    }

    const ctx = this.getPluginContext(bridge)
    await plugin.install(ctx)
    this.plugins.set(plugin.name, plugin)
    console.debug(`[ai-tip/sdk] Plugin "${plugin.name}" v${plugin.version} installed.`)
  }

  async uninstall(name: string): Promise<void> {
    const plugin = this.plugins.get(name)
    if (!plugin) return
    await plugin.uninstall?.()
    this.plugins.delete(name)
    console.debug(`[ai-tip/sdk] Plugin "${name}" uninstalled.`)
  }

  async uninstallAll(): Promise<void> {
    const names = [...this.plugins.keys()]
    for (const name of names) {
      await this.uninstall(name)
    }
  }

  get installed(): string[] {
    return [...this.plugins.keys()]
  }
}
