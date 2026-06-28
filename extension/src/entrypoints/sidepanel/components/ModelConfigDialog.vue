<script setup lang="ts">
/**
 * ModelConfigDialog.vue — Add/Edit model dialog.
 * Matches desktop ModelConfigDialog.vue design exactly.
 */
import { ref, reactive, computed, watch } from 'vue'

// ── Inline types (shared between settings views) ──
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

const props = defineProps<{
  visible: boolean
  model?: ModelConfig | null
  providers: ProviderDef[]
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  saved: []
}>()

const defaultForm = (): ModelConfig => ({
  id: '', name: '', displayName: '', provider: 'openai', source: 'remote',
  baseUrl: '', apiKey: '', temperature: 0.1, maxTokens: 2048, customHeaders: [],
})

const form = reactive<ModelConfig>(defaultForm())
const showApiKey = ref(false)
const isTesting = ref(false)
const testResult = ref<{ ok: boolean; message: string } | null>(null)
const showAdvanced = ref(false)

const isEdit = computed(() => !!form.id)
const selectedProvider = computed(() => props.providers.find(p => p.name === form.provider))

watch(() => props.visible, (v) => {
  if (v) {
    const src = props.model
    if (src) Object.assign(form, JSON.parse(JSON.stringify(src)))
    else Object.assign(form, defaultForm())
    showApiKey.value = false; testResult.value = null; showAdvanced.value = false
  }
})

watch(() => form.provider, (p) => {
  const prov = props.providers.find(x => x.name === p)
  if (prov) { form.source = prov.source; form.baseUrl = prov.defaultBaseUrl }
})

async function sendMessage(method: string, args: unknown[] = []): Promise<unknown> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'BRIDGE_CALL', id: 'mdl-' + Date.now(), method, args },
      (response) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message))
        else if (response?.success) resolve(response.data)
        else reject(new Error(response?.error || 'Unknown'))
      },
    )
  })
}

function handleProviderChange(name: string): void { form.provider = name }
function addCustomHeader(): void { form.customHeaders!.push({ key: '', value: '' }) }
function removeCustomHeader(i: number): void { form.customHeaders!.splice(i, 1) }

async function handleTest(): Promise<void> {
  isTesting.value = true; testResult.value = null
  try {
    const config = JSON.parse(JSON.stringify(form))
    const r = await sendMessage('model:test-connection', [config]) as { success: boolean; message: string }
    testResult.value = { ok: r.success, message: r.message }
  } catch (e: any) { testResult.value = { ok: false, message: e.message || 'Connection failed' } }
  finally { isTesting.value = false }
}

function handleSave(): void {
  if (!form.name.trim()) return
  const cfg: ModelConfig = JSON.parse(JSON.stringify({
    ...form,
    id: form.id || `model-${Date.now()}`,
    name: form.name.trim(),
    displayName: form.displayName.trim(),
  }))
  sendMessage('model-config:save', [cfg])
  emit('saved'); emit('update:visible', false)
}

function handleCancel(): void { emit('update:visible', false) }
function handleOverlayClick(e: MouseEvent): void {
  if ((e.target as HTMLElement).classList.contains('dialog-overlay')) handleCancel()
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="dialog-overlay" @click="handleOverlayClick">
      <div class="dialog" role="dialog" aria-modal="true">
        <div class="dialog-header">
          <h2 class="dialog-title">{{ isEdit ? 'Edit Model' : 'Add New Model' }}</h2>
          <button class="dialog-close" @click="handleCancel">✕</button>
        </div>

        <div class="dialog-body">
          <!-- Provider -->
          <div class="form-group">
            <label class="form-label">Provider</label>
            <select class="form-select" :value="form.provider" @change="handleProviderChange(($event.target as HTMLSelectElement).value)">
              <option v-for="p in providers" :key="p.name" :value="p.name">{{ p.displayName }}</option>
            </select>
          </div>

          <!-- Model Name -->
          <div class="form-group">
            <label class="form-label required">Model Name</label>
            <input v-model="form.name" class="form-input" placeholder="e.g., deepseek-chat" />
          </div>

          <!-- Display Name -->
          <div class="form-group">
            <label class="form-label">Display Name <span class="optional">(optional)</span></label>
            <input v-model="form.displayName" class="form-input" placeholder="e.g., My DeepSeek" />
          </div>

          <template v-if="form.source === 'remote'">
            <!-- Base URL -->
            <div class="form-group">
              <label class="form-label required">Base URL</label>
              <input v-model="form.baseUrl" class="form-input mono" placeholder="https://api.openai.com/v1" />
            </div>

            <!-- API Key -->
            <div class="form-group" v-if="selectedProvider?.requiresAuth">
              <label class="form-label">API Key</label>
              <div class="input-password">
                <input v-model="form.apiKey" :type="showApiKey ? 'text' : 'password'" class="form-input" placeholder="sk-..." autocomplete="off" />
                <button class="toggle-visibility" @click="showApiKey = !showApiKey">{{ showApiKey ? '🙈' : '👁' }}</button>
              </div>
            </div>

            <!-- Custom Headers -->
            <div class="form-group">
              <div class="form-label-row">
                <label class="form-label">Custom Headers</label>
                <button class="btn-link" @click="addCustomHeader">+ Add</button>
              </div>
              <div v-if="form.customHeaders!.length > 0" class="headers-list">
                <div v-for="(h, i) in form.customHeaders!" :key="i" class="header-row">
                  <input v-model="h.key" class="form-input header-key" placeholder="Header" />
                  <input v-model="h.value" class="form-input header-value" placeholder="Value" />
                  <button class="btn-icon" @click="removeCustomHeader(i)">✕</button>
                </div>
              </div>
            </div>

            <!-- Test Connection -->
            <div class="form-group">
              <button class="btn-test" :disabled="!form.name || !form.baseUrl" @click="handleTest">
                <span v-if="isTesting" class="spinner" />
                <span v-else>{{ testResult ? 'Retest' : 'Test Connection' }}</span>
              </button>
              <span v-if="testResult" class="test-result" :class="{ ok: testResult.ok, err: !testResult.ok }">
                {{ testResult.ok ? '✅' : '❌' }} {{ testResult.message }}
              </span>
            </div>
          </template>

          <!-- Advanced -->
          <div class="form-group">
            <button class="btn-link" @click="showAdvanced = !showAdvanced">
              {{ showAdvanced ? '▾' : '▸' }} Advanced Options
            </button>
          </div>

          <template v-if="showAdvanced">
            <div class="form-group">
              <label class="form-label">Temperature <code>{{ form.temperature }}</code></label>
              <input v-model.number="form.temperature" type="range" min="0" max="2" step="0.05" class="form-range" />
              <div class="range-labels"><span>Deterministic</span><span>Creative</span></div>
            </div>
            <div class="form-group">
              <label class="form-label">Max Tokens</label>
              <input v-model.number="form.maxTokens" type="number" class="form-input" min="1" max="128000" />
            </div>
          </template>
        </div>

        <div class="dialog-footer">
          <button class="btn-cancel" @click="handleCancel">Cancel</button>
          <button class="btn-save" :disabled="!form.name.trim()" @click="handleSave">Save Model</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.dialog-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.4);
  display: flex; align-items: center; justify-content: center;
  z-index: 10001; backdrop-filter: blur(2px);
}
.dialog {
  background: #fff; border-radius: 12px; width: 480px; max-width: 92vw; max-height: 85vh;
  display: flex; flex-direction: column;
  box-shadow: 0 20px 60px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.08);
  animation: dialog-in 0.18s ease-out;
}
@keyframes dialog-in { from { opacity: 0; transform: scale(0.96) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }

.dialog-header { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px 0; }
.dialog-title { font-size: 16px; font-weight: 600; color: #1e293b; margin: 0; }
.dialog-close { width: 28px; height: 28px; border: none; border-radius: 6px; background: transparent; font-size: 14px; color: #94a3b8; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.12s; }
.dialog-close:hover { background: #f1f5f9; color: #475569; }

.dialog-body { padding: 20px 24px; overflow-y: auto; flex: 1; }
.dialog-footer { display: flex; justify-content: flex-end; gap: 10px; padding: 16px 24px; border-top: 1px solid #f1f5f9; }

.form-group { margin-bottom: 16px; }
.form-label { display: block; font-size: 12px; font-weight: 500; color: #475569; margin-bottom: 6px; }
.form-label.required::after { content: ' *'; color: #ef4444; }
.optional { font-weight: 400; color: #94a3b8; }

.form-input { width: 100%; padding: 8px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 13px; color: #1e293b; background: #fff; transition: border-color 0.15s; box-sizing: border-box; font-family: inherit; }
.form-input:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }
.form-input.mono { font-family: 'SF Mono', monospace; font-size: 12px; }
.form-select { width: 100%; padding: 8px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 13px; color: #1e293b; background: #fff; cursor: pointer; box-sizing: border-box; font-family: inherit; }
.form-select:focus { outline: none; border-color: #3b82f6; }
.form-label-row { display: flex; align-items: center; justify-content: space-between; }

.input-password { display: flex; position: relative; }
.input-password .form-input { padding-right: 36px; }
.toggle-visibility { position: absolute; right: 4px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; font-size: 14px; padding: 4px 6px; border-radius: 4px; line-height: 1; }
.toggle-visibility:hover { background: #f1f5f9; }

.headers-list { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
.header-row { display: flex; gap: 6px; align-items: center; }
.header-key { flex: 1; }
.header-value { flex: 2; }
.btn-icon { width: 28px; height: 28px; border: none; border-radius: 6px; background: transparent; font-size: 12px; color: #94a3b8; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.btn-icon:hover { background: #fee2e2; color: #ef4444; }

.btn-link { border: none; background: none; color: #3b82f6; font-size: 12px; font-weight: 500; cursor: pointer; padding: 0; font-family: inherit; }
.btn-link:hover { text-decoration: underline; }

.btn-test { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; border: 1px solid #e2e8f0; border-radius: 8px; background: #fff; font-size: 12px; color: #475569; cursor: pointer; transition: all 0.12s; font-family: inherit; }
.btn-test:hover:not(:disabled) { border-color: #3b82f6; color: #3b82f6; }
.btn-test:disabled { opacity: 0.5; cursor: not-allowed; }
.test-result { margin-left: 10px; font-size: 12px; font-weight: 500; }
.test-result.ok { color: #16a34a; }
.test-result.err { color: #ef4444; }

.btn-cancel { padding: 8px 20px; border: 1px solid #e2e8f0; border-radius: 8px; background: #fff; color: #475569; font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.12s; font-family: inherit; }
.btn-cancel:hover { background: #f8fafc; }
.btn-save { padding: 8px 20px; border: none; border-radius: 8px; background: #3b82f6; color: #fff; font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.12s; font-family: inherit; }
.btn-save:hover { background: #2563eb; }
.btn-save:disabled { opacity: 0.5; cursor: not-allowed; }

.form-range { width: 100%; margin: 4px 0; accent-color: #3b82f6; }
.range-labels { display: flex; justify-content: space-between; font-size: 10px; color: #94a3b8; }
.spinner { width: 14px; height: 14px; border: 2px solid #e2e8f0; border-top-color: #3b82f6; border-radius: 50%; animation: spin 0.6s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
