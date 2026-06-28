<script setup lang="ts">
/**
 * SettingsPanel.vue — Embedded settings panel in sidepanel.
 *
 * Shows model list + general toggle. Opens ModelConfigDialog for add/edit.
 * Better UX for browser extensions than a separate Options page.
 */
import { ref, onMounted } from 'vue'
import ModelConfigDialog from './ModelConfigDialog.vue'

// ── Types ──
interface ModelConfig {
  id: string; name: string; displayName?: string; provider: string
  baseUrl: string; apiKey: string; temperature: number; maxTokens: number
  source?: 'local' | 'remote'
  customHeaders?: { key: string; value: string }[]
}
interface ProviderDef {
  name: string; displayName: string; defaultBaseUrl: string
  source: 'local' | 'remote'; requiresAuth: boolean
}

const PROVIDERS: ProviderDef[] = [
  { name: 'ollama', displayName: 'Ollama (Local)', defaultBaseUrl: 'http://localhost:11434/v1', source: 'local', requiresAuth: false },
  { name: 'openai', displayName: 'OpenAI', defaultBaseUrl: 'https://api.openai.com/v1', source: 'remote', requiresAuth: true },
  { name: 'anthropic', displayName: 'Anthropic', defaultBaseUrl: 'https://api.anthropic.com/v1', source: 'remote', requiresAuth: true },
  { name: 'deepseek', displayName: 'DeepSeek', defaultBaseUrl: 'https://api.deepseek.com/v1', source: 'remote', requiresAuth: true },
  { name: 'aliyun', displayName: 'Alibaba Bailian', defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', source: 'remote', requiresAuth: true },
  { name: 'zhipu', displayName: 'Zhipu AI', defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4', source: 'remote', requiresAuth: true },
  { name: 'siliconflow', displayName: 'SiliconFlow', defaultBaseUrl: 'https://api.siliconflow.cn/v1', source: 'remote', requiresAuth: true },
  { name: 'moonshot', displayName: 'Moonshot', defaultBaseUrl: 'https://api.moonshot.cn/v1', source: 'remote', requiresAuth: true },
  { name: 'openrouter', displayName: 'OpenRouter', defaultBaseUrl: 'https://openrouter.ai/api/v1', source: 'remote', requiresAuth: true },
  { name: 'generic', displayName: 'Generic OpenAI', defaultBaseUrl: 'http://localhost:8080/v1', source: 'remote', requiresAuth: false },
]

const emit = defineEmits<{
  close: []
  modelsChanged: []
}>()

// ── Bridge ──
async function sendMessage(method: string, args: unknown[] = []): Promise<unknown> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'BRIDGE_CALL', id: 'sp-set-' + Date.now(), method, args },
      (response) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message))
        else if (response?.success) resolve(response.data)
        else reject(new Error(response?.error || 'Unknown'))
      },
    )
  })
}

// ── State ──
const models = ref<ModelConfig[]>([])
const activeId = ref<string | null>(null)
const aiTipEnabled = ref(true)
const deleteConfirmId = ref<string | null>(null)
const isTesting = ref<string | null>(null)
const testResults = ref<Record<string, { ok: boolean; message: string }>>({})

// Dialog
const showDialog = ref(false)
const dialogModel = ref<ModelConfig | null>(null)

// ── Helpers ──
function getProviderLabel(name: string): string {
  return PROVIDERS.find(p => p.name === name)?.displayName ?? name
}

// ── Load ──
async function loadAll(): Promise<void> {
  try { const v = await sendMessage('settings:get', ['aiTipEnabled']); aiTipEnabled.value = v !== false } catch {}
  try { models.value = (await sendMessage('model-config:list')) as ModelConfig[] || [] } catch {}
  try { activeId.value = (await sendMessage('model-config:getActive')) as string | null } catch {}
}
async function toggleAiTip(v: boolean): Promise<void> {
  aiTipEnabled.value = v; await sendMessage('settings:set', ['aiTipEnabled', v])
}

// ── Dialog ──
function handleAddNew(): void { dialogModel.value = null; showDialog.value = true }
function handleEdit(mid: string): void {
  const m = models.value.find(x => x.id === mid); if (!m) return
  deleteConfirmId.value = null; dialogModel.value = JSON.parse(JSON.stringify(m)); showDialog.value = true
}
function handleDialogSaved(): void { loadAll(); emit('modelsChanged') }

// ── Card actions ──
function handleDelete(mid: string): void {
  if (deleteConfirmId.value === mid) {
    sendMessage('model-config:delete', [mid]); models.value = models.value.filter(m => m.id !== mid)
    deleteConfirmId.value = null; emit('modelsChanged')
  } else { deleteConfirmId.value = mid }
}
async function handleSetActive(mid: string): Promise<void> {
  await sendMessage('model-config:setActive', [mid]); activeId.value = mid; emit('modelsChanged')
}
async function handleTest(mid: string): Promise<void> {
  isTesting.value = mid
  try {
    const m = models.value.find(x => x.id === mid); if (!m) return
    const r = await sendMessage('model:test-connection', [JSON.parse(JSON.stringify(m))]) as { success: boolean; message: string }
    testResults.value[mid] = { ok: r.success, message: r.message }
  } catch (e: any) { testResults.value[mid] = { ok: false, message: e.message || 'Connection failed' } }
  finally { isTesting.value = null }
}

onMounted(loadAll)
</script>

<template>
  <div class="settings-panel">
    <!-- Header -->
    <div class="sp-header">
      <button class="sp-back" @click="emit('close')">← Back</button>
      <span class="sp-title">Settings</span>
      <button class="btn-add" @click="handleAddNew">+ Add Model</button>
    </div>

    <div class="sp-body">
      <!-- General -->
      <div class="sp-section">
        <div class="section-label">General</div>
        <div class="setting-card">
          <div>
            <div class="setting-label">Enable AI Tip</div>
            <div class="setting-desc">Show AI buttons on form fields</div>
          </div>
          <label class="toggle">
            <input type="checkbox" :checked="aiTipEnabled" @change="toggleAiTip(($event.target as HTMLInputElement).checked)" />
            <span class="toggle-slider" />
          </label>
        </div>
      </div>

      <!-- Models -->
      <div class="sp-section">
        <div class="section-label">AI Models</div>

        <div v-if="models.length === 0" class="empty-state">
          <p>No models configured</p>
          <p class="hint">Add a model to get started</p>
        </div>

        <div v-for="m in models" :key="m.id" class="model-card" :class="{ active: m.id === activeId }">
          <div class="card-top">
            <div class="card-info">
              <div class="card-name-row">
                <span class="card-name">{{ m.displayName || m.name || 'Unnamed' }}</span>
                <span v-if="m.id === activeId" class="badge-active">Active</span>
              </div>
              <div class="card-meta">
                <span class="card-model">{{ m.name }}</span>
                <span class="meta-sep">·</span>
                <span>{{ getProviderLabel(m.provider) }}</span>
              </div>
            </div>
            <div class="card-actions">
              <button class="btn-sm" @click="handleEdit(m.id)">Edit</button>
              <button
                class="btn-sm btn-del" :class="{ confirm: deleteConfirmId === m.id }"
                @click="handleDelete(m.id)"
              >{{ deleteConfirmId === m.id ? 'Sure?' : 'Del' }}</button>
            </div>
          </div>
          <div class="card-bottom">
            <button v-if="m.id !== activeId" class="btn-sm btn-activate" @click="handleSetActive(m.id)">Activate</button>
            <button class="btn-sm btn-test" :disabled="isTesting === m.id" @click="handleTest(m.id)">
              {{ isTesting === m.id ? '...' : (testResults[m.id] ? 'Retest' : 'Test') }}
            </button>
            <span v-if="testResults[m.id]" class="test-result" :class="{ ok: testResults[m.id].ok, err: !testResults[m.id].ok }">
              {{ testResults[m.id].ok ? '✅' : '❌' }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <ModelConfigDialog
    v-model:visible="showDialog"
    :model="dialogModel"
    :providers="PROVIDERS"
    @saved="handleDialogSaved"
  />
</template>

<style scoped>
.settings-panel { display: flex; flex-direction: column; height: 100%; background: #fff; }
.sp-header { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid #e2e8f0; flex-shrink: 0; }
.sp-back { border: none; background: none; font-size: 13px; color: #2563eb; cursor: pointer; padding: 4px 8px; border-radius: 6px; font-family: inherit; }
.sp-back:hover { background: #eff6ff; }
.sp-title { font-size: 14px; font-weight: 600; color: #1e293b; flex: 1; }
.btn-add { padding: 5px 12px; border: none; border-radius: 6px; background: #2563eb; color: #fff; font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit; }
.btn-add:hover { background: #1d4ed8; }

.sp-body { flex: 1; overflow-y: auto; padding: 12px; }
.sp-section { margin-bottom: 16px; }
.section-label { font-size: 11px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }

.setting-card { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; }
.setting-label { font-size: 12px; font-weight: 600; color: #1e293b; }
.setting-desc { font-size: 11px; color: #94a3b8; margin-top: 2px; }
.toggle { position: relative; width: 40px; height: 22px; flex-shrink: 0; }
.toggle input { opacity: 0; width: 0; height: 0; }
.toggle-slider { position: absolute; inset: 0; background: #cbd5e1; border-radius: 22px; cursor: pointer; transition: background 0.2s; }
.toggle-slider::before { content: ''; position: absolute; left: 2px; top: 2px; width: 18px; height: 18px; background: #fff; border-radius: 50%; transition: transform 0.2s; }
.toggle input:checked + .toggle-slider { background: #2563eb; }
.toggle input:checked + .toggle-slider::before { transform: translateX(18px); }

.model-card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; margin-bottom: 6px; background: #fff; transition: border-color 0.12s; }
.model-card.active { border-color: #93c5fd; box-shadow: 0 0 0 2px rgba(59,130,246,0.08); }
.card-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
.card-info { flex: 1; min-width: 0; }
.card-name-row { display: flex; align-items: center; gap: 6px; margin-bottom: 2px; }
.card-name { font-size: 13px; font-weight: 600; color: #1e293b; }
.badge-active { padding: 1px 6px; border-radius: 8px; background: #dcfce7; color: #15803d; font-size: 10px; font-weight: 600; }
.card-meta { font-size: 11px; color: #94a3b8; display: flex; align-items: center; gap: 4px; }
.card-model { font-family: 'SF Mono', monospace; font-size: 10px; }
.meta-sep { color: #cbd5e1; }
.card-actions { display: flex; gap: 4px; flex-shrink: 0; }
.card-bottom { display: flex; align-items: center; gap: 6px; margin-top: 8px; padding-top: 8px; border-top: 1px solid #f1f5f9; }
.btn-sm { padding: 3px 10px; border: 1px solid #e2e8f0; border-radius: 5px; background: #fff; font-size: 11px; cursor: pointer; font-family: inherit; transition: all 0.12s; white-space: nowrap; }
.btn-sm:hover { background: #f8fafc; border-color: #cbd5e1; }
.btn-sm:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-del:hover { border-color: #fca5a5; color: #dc2626; background: #fef2f2; }
.btn-del.confirm { background: #ef4444; color: #fff; border-color: #ef4444; }
.btn-activate { color: #2563eb; border-color: #bfdbfe; }
.btn-activate:hover { background: #eff6ff; }
.btn-test { color: #64748b; }
.test-result { font-size: 11px; margin-left: 2px; }
.test-result.ok { color: #15803d; }
.test-result.err { color: #dc2626; }

.empty-state { text-align: center; padding: 20px 0; color: #94a3b8; font-size: 12px; }
.empty-state .hint { font-size: 11px; margin-top: 4px; }
</style>
