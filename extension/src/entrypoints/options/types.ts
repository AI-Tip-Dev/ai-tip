/** Shared types for Options page */
export interface ModelConfig {
  id: string; name: string; displayName?: string; provider: string
  baseUrl: string; apiKey: string; temperature: number; maxTokens: number
  source?: 'local' | 'remote'
  customHeaders?: { key: string; value: string }[]
}

export interface ProviderDef {
  name: string; displayName: string; defaultBaseUrl: string
  source: 'local' | 'remote'; requiresAuth: boolean
}
