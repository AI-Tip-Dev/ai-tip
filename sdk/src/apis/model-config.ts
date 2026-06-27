/**
 * Model Config API — model CRUD, provider listing, and adapter access.
 *
 * Usage:
 *   const models = await bridge.modelConfig.list()
 *   await bridge.modelConfig.save({ id: 'gpt4', name: 'GPT-4', provider: 'openai', ... })
 *   const adapter = await bridge.modelConfig.getAdapter('openai')
 */

import type { Transport, ModelConfigAPI, ModelConfig, ProviderMeta, ProviderAdapter } from '../types'

export function createModelConfigAPI(transport: Transport): ModelConfigAPI {
  return {
    async list(): Promise<ModelConfig[]> {
      return transport.invoke('model-config:list', []) as Promise<ModelConfig[]>
    },

    async save(config: ModelConfig): Promise<void> {
      return transport.invoke('model-config:save', [config]) as Promise<void>
    },

    async delete(id: string): Promise<void> {
      return transport.invoke('model-config:delete', [id]) as Promise<void>
    },

    async setActive(id: string): Promise<void> {
      return transport.invoke('model-config:setActive', [id]) as Promise<void>
    },

    async getActive(): Promise<ModelConfig | null> {
      return transport.invoke('model-config:getActive', []) as Promise<ModelConfig | null>
    },

    async listProviders(): Promise<ProviderMeta[]> {
      return transport.invoke('model-config:listProviders', []) as Promise<ProviderMeta[]>
    },

    async getAdapter(provider: string): Promise<ProviderAdapter | null> {
      return transport.invoke('model-config:getAdapter', [provider]) as Promise<ProviderAdapter | null>
    },
  }
}
