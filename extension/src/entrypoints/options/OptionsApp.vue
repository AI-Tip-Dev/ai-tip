<script setup lang="ts">
/**
 * OptionsApp.vue — Extension Settings page (UX-optimized).
 * Layout mirrors desktop SettingsDialog.vue, adapted as full page.
 */
import { ref, reactive, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import type { ModelConfig, ProviderDef } from './types'

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

async function sendMessage(method: string, args: unknown[] = []): Promise<unknown> {
  console.log('[Options] sendMessage →', method, args)
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'BRIDGE_CALL', id: 'opt-' + Date.now(), method, args },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error('[Options] sendMessage error:', chrome.runtime.lastError.message)
          reject(new Error(chrome.runtime.lastError.message))
        }
        else if (response?.success) {
          console.log('[Options] sendMessage ←', method, 'success:', response.data)
          resolve(response.data)
        }
        else {
          console.error('[Options] sendMessage ←', method, 'failed:', response?.error)
          reject(new Error(response?.error || 'Unknown'))
        }
      },
    )
  })
}

// ── Toast ──
interface Toast { id: number; message: string; type: 'success' | 'error' | 'info' }
const toasts = ref<Toast[]>([])
let toastId = 0
function showToast(message: string, type: Toast['type'] = 'success'): void {
  const id = ++toastId
  toasts.value.push({ id, message, type })
  setTimeout(() => { toasts.value = toasts.value.filter(t => t.id !== id) }, 2500)
}

// ── Nav ──
const activeNav = ref<'models' | 'language'>('models')
const language = ref('zh-CN')

const LANGUAGES = [
  { code: 'zh-CN', nativeName: '中文 (简体)', englishName: 'Chinese (Simplified)' },
  { code: 'en', nativeName: 'English', englishName: 'English' },
  { code: 'ja', nativeName: '日本語', englishName: 'Japanese' },
]

// ── Models ──
const models = ref<ModelConfig[]>([])
const activeId = ref<string | null>(null)
const isLoading = ref(true)
const deleteConfirmId = ref<string | null>(null)
const isTesting = ref<string | null>(null)
const testResults = ref<Record<string, { ok: boolean; message: string }>>({})

// ── Inline form ──
const editingModelId = ref<string | null>(null)
const showInlineForm = ref(false)
const showApiKey = ref(false)
const isFormTesting = ref(false)
const formTestResult = ref<{ ok: boolean; message: string } | null>(null)
const showAdvanced = ref(false)
const formCardRef = ref<HTMLElement | null>(null)

const defaultForm = (): ModelConfig => ({
  id: '', name: '', displayName: '', provider: 'openai', source: 'remote',
  baseUrl: '', apiKey: '', temperature: 0.1, maxTokens: 2048, customHeaders: [],
})
const form = reactive<ModelConfig>(defaultForm())

const isEdit = computed(() => !!editingModelId.value)
const selectedProvider = computed(() => PROVIDERS.find(p => p.name === form.provider))

watch(() => form.provider, (p) => {
  const prov = PROVIDERS.find(x => x.name === p)
  if (prov) { form.source = prov.source; form.baseUrl = prov.defaultBaseUrl }
})

// ── Helpers ──
function getProviderDef(name: string): ProviderDef | undefined { return PROVIDERS.find(p => p.name === name) }
function getProviderLabel(name: string): string { return getProviderDef(name)?.displayName ?? name }

async function loadAll(): Promise<void> {
  console.log('[Options] loadAll — fetching models & active model')
  isLoading.value = true
  try { models.value = (await sendMessage('model-config:list')) as ModelConfig[] || []; console.log('[Options] loadAll — models:', models.value.length) } catch (e) { console.error('[Options] loadAll — list failed:', e) }
  try { activeId.value = (await sendMessage('model-config:getActive')) as string | null; console.log('[Options] loadAll — activeId:', activeId.value) } catch (e) { console.error('[Options] loadAll — getActive failed:', e) }
  isLoading.value = false
}

// ── Inline form actions ──
function openAddForm(): void {
  console.log('[Options] openAddForm — clicked')
  editingModelId.value = null
  Object.assign(form, defaultForm())
  showApiKey.value = false; formTestResult.value = null; showAdvanced.value = false
  showInlineForm.value = true
  console.log('[Options] openAddForm — showInlineForm:', showInlineForm.value, 'isEdit:', isEdit.value, 'models.length:', models.value.length)
  nextTick(() => formCardRef.value?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
}
function openEditForm(mid: string): void {
  const m = models.value.find(x => x.id === mid); if (!m) return
  deleteConfirmId.value = null; editingModelId.value = mid
  Object.assign(form, JSON.parse(JSON.stringify(m)))
  showApiKey.value = false; formTestResult.value = null; showAdvanced.value = false
  showInlineForm.value = true
}
function cancelForm(): void { showInlineForm.value = false; editingModelId.value = null }

function handleProviderChange(name: string): void { form.provider = name }
function addCustomHeader(): void { form.customHeaders!.push({ key: '', value: '' }) }
function removeCustomHeader(i: number): void { form.customHeaders!.splice(i, 1) }

// Clear stale test result when form fields change
watch([() => form.name, () => form.baseUrl, () => form.apiKey, () => form.provider], () => {
  if (formTestResult.value) formTestResult.value = null
})

async function handleFormTest(): Promise<void> {
  isFormTesting.value = true; formTestResult.value = null
  try {
    const config = JSON.parse(JSON.stringify(form))
    const r = await sendMessage('model:test-connection', [config]) as { success: boolean; message: string }
    formTestResult.value = { ok: r.success, message: r.message }
  } catch (e: any) { formTestResult.value = { ok: false, message: e.message || 'Connection failed' } }
  finally { isFormTesting.value = false }
}

async function handleFormSave(): Promise<void> {
  console.log('[Options] handleFormSave — form.name:', form.name)
  if (!form.name.trim()) { console.log('[Options] handleFormSave — empty name, aborting'); return }
  const cfg: ModelConfig = JSON.parse(JSON.stringify({
    ...form,
    id: editingModelId.value || `model-${Date.now()}`,
    name: form.name.trim(),
    displayName: form.displayName?.trim() || '',
  }))
  console.log('[Options] handleFormSave — saving:', cfg)
  try {
    await sendMessage('model-config:save', [cfg])
    console.log('[Options] handleFormSave — save OK')
    cancelForm()
    await loadAll()
    showToast(isEdit.value ? 'Model updated' : 'Model added')
  } catch (e: any) { console.error('[Options] handleFormSave — failed:', e); showToast(e.message || 'Save failed', 'error') }
}

// ── Card actions ──
function handleDeleteClick(mid: string): void {
  deleteConfirmId.value = deleteConfirmId.value === mid ? null : mid
}
async function handleDeleteConfirm(mid: string): Promise<void> {
  try {
    await sendMessage('model-config:delete', [mid])
    models.value = models.value.filter(m => m.id !== mid)
    deleteConfirmId.value = null
    showToast('Model deleted')
  } catch (e: any) { showToast(e.message || 'Delete failed', 'error') }
}

async function handleSetActive(mid: string): Promise<void> {
  try {
    await sendMessage('model-config:setActive', [mid])
    activeId.value = mid
    showToast('Active model updated')
  } catch (e: any) { showToast(e.message || 'Failed', 'error') }
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

// ── Keyboard ──
function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape' && showInlineForm.value) {
    cancelForm()
  }
}

const modelCount = computed(() => models.value.length)

onMounted(() => { console.log('[Options] onMounted — page ready'); loadAll(); window.addEventListener('keydown', onKeydown) })
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="settings-page">
    <!-- ══════════ Toast Container ══════════ -->
    <Teleport to="body">
      <div class="toast-container" aria-live="polite">
        <TransitionGroup name="toast">
          <div v-for="t in toasts" :key="t.id" class="toast" :class="t.type">
            <span class="toast-icon">{{ t.type === 'success' ? '✓' : t.type === 'error' ? '✕' : 'ℹ' }}</span>
            {{ t.message }}
          </div>
        </TransitionGroup>
      </div>
    </Teleport>

    <!-- ══════════ Left Nav ══════════ -->
    <nav class="settings-nav">
      <div class="nav-header">
        <h2 class="nav-title">Settings</h2>
      </div>
      <ul class="nav-list">
        <li class="nav-item" :class="{ active: activeNav === 'models' }" @click="activeNav = 'models'">
          <span class="nav-icon">🧠</span>
          <span class="nav-label">Models</span>
          <span v-if="modelCount > 0" class="nav-badge">{{ modelCount }}</span>
        </li>
        <li class="nav-item" :class="{ active: activeNav === 'language' }" @click="activeNav = 'language'">
          <span class="nav-icon">🌐</span>
          <span class="nav-label">Language</span>
        </li>
      </ul>
      <div class="nav-footer">
        <span class="nav-version">AI Tip v1.0</span>
      </div>
    </nav>

    <!-- ══════════ Main Content ══════════ -->
    <div class="settings-main">
      <div class="main-header">
        <div>
          <h3 class="main-title">{{ activeNav === 'models' ? 'Model Configuration' : 'Language' }}</h3>
          <p class="main-desc">{{ activeNav === 'models' ? 'Connect to your preferred AI provider' : 'Choose your interface language' }}</p>
        </div>
        <div class="header-actions">
          <button v-if="activeNav === 'models'" class="btn-add" @click="openAddForm">+ Add Model</button>
        </div>
      </div>

      <div class="main-body">
        <!-- ══════ Language Settings ══════ -->
        <Transition name="fade" mode="out-in">
          <div v-if="activeNav === 'language'" key="language" class="language-settings">
            <label v-for="lang in LANGUAGES" :key="lang.code" class="lang-radio" :class="{ selected: language === lang.code }">
              <input type="radio" name="ui-lang" :value="lang.code" :checked="language === lang.code" @change="language = lang.code" />
              <span class="lang-name">{{ lang.nativeName }}</span>
              <span class="lang-en">{{ lang.englishName }}</span>
              <svg v-if="language === lang.code" class="lang-check" width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="9" fill="#3b82f6"/><path d="M5.5 9l2.5 2.5 4.5-5" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </label>
          </div>

          <!-- ══════ Model Settings ══════ -->
          <div v-else key="models" class="models-section">
            <!-- Loading Skeleton -->
            <div v-if="isLoading" class="loading-skeleton">
              <div v-for="i in 2" :key="i" class="skeleton-card">
                <div class="skeleton-line skeleton-title" />
                <div class="skeleton-line skeleton-meta" />
                <div class="skeleton-line skeleton-actions" />
              </div>
            </div>

            <template v-else>
              <!-- Empty state -->
              <div v-if="models.length === 0 && !showInlineForm" class="empty-state">
                <div class="empty-icon">🧠</div>
                <p class="empty-title">No models configured</p>
                <p class="empty-desc">Add your first model to get started with AI-powered form filling.</p>
                <button class="btn-add btn-add-lg" @click="openAddForm">+ Add Your First Model</button>
              </div>

              <!-- Model Cards -->
              <div v-if="models.length > 0" class="model-list">
                <div
                  v-for="m in models"
                  :key="m.id"
                  class="model-card"
                  :class="{ 'is-active': m.id === activeId, 'is-editing': editingModelId === m.id }"
                >
                  <!-- ═══ Card View ═══ -->
                  <template v-if="editingModelId !== m.id">
                    <div class="card-top">
                      <div class="card-info">
                        <div class="card-name-row">
                          <span class="card-name">{{ m.displayName || m.name || 'Unnamed' }}</span>
                          <span v-if="m.id === activeId" class="badge-active">Active</span>
                        </div>
                        <div class="card-meta">
                          <span class="card-model">{{ m.name }}</span>
                          <span class="meta-sep">·</span>
                          <span class="card-provider">{{ getProviderLabel(m.provider) }}</span>
                          <span class="meta-sep">·</span>
                          <span class="card-source">{{ m.source === 'local' ? 'Local' : 'Remote' }}</span>
                        </div>
                      </div>
                      <div class="card-actions">
                        <button class="btn-card btn-edit" @click="openEditForm(m.id)">Edit</button>
                        <!-- Delete with popover -->
                        <div class="delete-wrapper">
                          <button
                            class="btn-card btn-delete"
                            :class="{ 'is-confirming': deleteConfirmId === m.id }"
                            @click="handleDeleteClick(m.id)"
                          >Delete</button>
                          <Transition name="popover">
                            <div v-if="deleteConfirmId === m.id" class="delete-popover">
                              <span class="popover-text">Delete this model?</span>
                              <button class="popover-btn popover-yes" @click="handleDeleteConfirm(m.id)">Yes, delete</button>
                              <button class="popover-btn popover-no" @click="deleteConfirmId = null">Cancel</button>
                            </div>
                          </Transition>
                        </div>
                      </div>
                    </div>
                    <div class="card-bottom">
                      <button v-if="m.id !== activeId" class="btn-card btn-active" @click="handleSetActive(m.id)">Set Active</button>
                      <span v-else class="active-label">● Active model</span>
                      <button class="btn-card btn-test" :disabled="isTesting === m.id" @click="handleTest(m.id)">
                        <span v-if="isTesting === m.id" class="spinner-sm" />
                        <span v-else>{{ testResults[m.id] ? 'Retest' : 'Test Connection' }}</span>
                      </button>
                      <Transition name="fade">
                        <span v-if="testResults[m.id]" class="test-result" :class="{ ok: testResults[m.id].ok, err: !testResults[m.id].ok }">
                          {{ testResults[m.id].ok ? '✓' : '✕' }} {{ testResults[m.id].message }}
                        </span>
                      </Transition>
                    </div>
                  </template>

                  <!-- ═══ Edit Form (inline in card) ═══ -->
                  <div v-else class="form-body">
                    <div class="inline-form-header">
                      <span class="inline-form-title">Edit Model</span>
                    </div>
                    <div class="form-group"><label class="form-label">Provider</label><select class="form-select" :value="form.provider" @change="handleProviderChange(($event.target as HTMLSelectElement).value)"><option v-for="p in PROVIDERS" :key="p.name" :value="p.name">{{ p.displayName }}</option></select></div>
                    <div class="form-group"><label class="form-label required">Model Name</label><input v-model="form.name" class="form-input" placeholder="e.g., deepseek-chat" /></div>
                    <div class="form-group"><label class="form-label">Display Name <span class="optional">(optional)</span></label><input v-model="form.displayName" class="form-input" placeholder="e.g., My DeepSeek" /></div>
                    <template v-if="form.source === 'remote'">
                      <div class="form-group"><label class="form-label required">Base URL</label><input v-model="form.baseUrl" class="form-input mono" placeholder="https://api.openai.com/v1" /></div>
                      <div class="form-group" v-if="selectedProvider?.requiresAuth">
                        <label class="form-label">API Key</label>
                        <div class="input-password">
                          <input v-model="form.apiKey" :type="showApiKey ? 'text' : 'password'" class="form-input" placeholder="sk-..." autocomplete="off" />
                          <button class="toggle-visibility" @click="showApiKey = !showApiKey" :aria-label="showApiKey ? 'Hide API key' : 'Show API key'">
                            <!-- Eye icon -->
                            <svg v-if="!showApiKey" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                            <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                          </button>
                        </div>
                      </div>
                      <div class="form-group">
                        <div class="form-label-row"><label class="form-label">Custom Headers</label><button class="btn-link" @click="addCustomHeader">+ Add</button></div>
                        <div v-if="form.customHeaders!.length > 0" class="headers-list">
                          <div v-for="(h, i) in form.customHeaders!" :key="i" class="header-row">
                            <input v-model="h.key" class="form-input header-key" placeholder="Header" />
                            <input v-model="h.value" class="form-input header-value" placeholder="Value" />
                            <button class="btn-icon" @click="removeCustomHeader(i)">✕</button>
                          </div>
                        </div>
                      </div>
                      <div class="form-group test-group">
                        <button class="btn-test" :disabled="!form.name || !form.baseUrl" @click="handleFormTest">
                          <span v-if="isFormTesting" class="spinner" /><span v-else>{{ formTestResult ? 'Retest' : 'Test Connection' }}</span>
                        </button>
                        <Transition name="fade">
                          <span v-if="formTestResult" class="test-result" :class="{ ok: formTestResult.ok, err: !formTestResult.ok }">
                            {{ formTestResult.ok ? '✓' : '✕' }} {{ formTestResult.message }}
                          </span>
                        </Transition>
                      </div>
                    </template>
                    <div class="form-group">
                      <button class="btn-link" @click="showAdvanced = !showAdvanced">
                        <span class="adv-arrow" :class="{ open: showAdvanced }">▸</span> Advanced Options
                      </button>
                    </div>
                    <Transition name="slide">
                      <div v-if="showAdvanced" class="advanced-panel">
                        <div class="form-group">
                          <label class="form-label">Temperature <code>{{ form.temperature }}</code></label>
                          <input v-model.number="form.temperature" type="range" min="0" max="2" step="0.05" class="form-range" />
                          <div class="range-labels"><span>Deterministic</span><span>Creative</span></div>
                        </div>
                        <div class="form-group">
                          <label class="form-label">Max Tokens</label>
                          <input v-model.number="form.maxTokens" type="number" class="form-input" min="1" max="128000" />
                        </div>
                      </div>
                    </Transition>
                    <div class="form-footer">
                      <button class="btn-cancel" @click="cancelForm">Cancel</button>
                      <button class="btn-save" :disabled="!form.name.trim()" @click="handleFormSave">Save Model</button>
                    </div>
                  </div>
                </div>

              </div>

              <!-- Add Form Card (outside model-list so it works with 0 models) -->
              <Transition name="form-slide">
                <div v-if="showInlineForm && !isEdit" ref="formCardRef" class="inline-form-card">
                  <div class="inline-form-header">
                    <span class="inline-form-title">Add New Model</span>
                    <button class="btn-icon btn-icon-close" @click="cancelForm">✕</button>
                  </div>
                  <div class="form-body">
                      <div class="form-group"><label class="form-label">Provider</label><select class="form-select" :value="form.provider" @change="handleProviderChange(($event.target as HTMLSelectElement).value)"><option v-for="p in PROVIDERS" :key="p.name" :value="p.name">{{ p.displayName }}</option></select></div>
                      <div class="form-group"><label class="form-label required">Model Name</label><input v-model="form.name" class="form-input" placeholder="e.g., deepseek-chat" /></div>
                      <div class="form-group"><label class="form-label">Display Name <span class="optional">(optional)</span></label><input v-model="form.displayName" class="form-input" placeholder="e.g., My DeepSeek" /></div>
                      <template v-if="form.source === 'remote'">
                        <div class="form-group"><label class="form-label required">Base URL</label><input v-model="form.baseUrl" class="form-input mono" placeholder="https://api.openai.com/v1" /></div>
                        <div class="form-group" v-if="selectedProvider?.requiresAuth">
                          <label class="form-label">API Key</label>
                          <div class="input-password">
                            <input v-model="form.apiKey" :type="showApiKey ? 'text' : 'password'" class="form-input" placeholder="sk-..." autocomplete="off" />
                            <button class="toggle-visibility" @click="showApiKey = !showApiKey" :aria-label="showApiKey ? 'Hide API key' : 'Show API key'">
                              <svg v-if="!showApiKey" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                              <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                            </button>
                          </div>
                        </div>
                        <div class="form-group">
                          <div class="form-label-row"><label class="form-label">Custom Headers</label><button class="btn-link" @click="addCustomHeader">+ Add</button></div>
                          <div v-if="form.customHeaders!.length > 0" class="headers-list">
                            <div v-for="(h, i) in form.customHeaders!" :key="i" class="header-row">
                              <input v-model="h.key" class="form-input header-key" placeholder="Header" />
                              <input v-model="h.value" class="form-input header-value" placeholder="Value" />
                              <button class="btn-icon" @click="removeCustomHeader(i)">✕</button>
                            </div>
                          </div>
                        </div>
                        <div class="form-group test-group">
                          <button class="btn-test" :disabled="!form.name || !form.baseUrl" @click="handleFormTest">
                            <span v-if="isFormTesting" class="spinner" /><span v-else>{{ formTestResult ? 'Retest' : 'Test Connection' }}</span>
                          </button>
                          <Transition name="fade">
                            <span v-if="formTestResult" class="test-result" :class="{ ok: formTestResult.ok, err: !formTestResult.ok }">
                              {{ formTestResult.ok ? '✓' : '✕' }} {{ formTestResult.message }}
                            </span>
                          </Transition>
                        </div>
                      </template>
                      <div class="form-group">
                        <button class="btn-link" @click="showAdvanced = !showAdvanced">
                          <span class="adv-arrow" :class="{ open: showAdvanced }">▸</span> Advanced Options
                        </button>
                      </div>
                      <Transition name="slide">
                        <div v-if="showAdvanced" class="advanced-panel">
                          <div class="form-group">
                            <label class="form-label">Temperature <code>{{ form.temperature }}</code></label>
                            <input v-model.number="form.temperature" type="range" min="0" max="2" step="0.05" class="form-range" />
                            <div class="range-labels"><span>Deterministic</span><span>Creative</span></div>
                          </div>
                          <div class="form-group">
                            <label class="form-label">Max Tokens</label>
                            <input v-model.number="form.maxTokens" type="number" class="form-input" min="1" max="128000" />
                          </div>
                        </div>
                      </Transition>
                      <div class="form-footer">
                        <button class="btn-cancel" @click="cancelForm">Cancel</button>
                        <button class="btn-save" :disabled="!form.name.trim()" @click="handleFormSave">Save Model</button>
                      </div>
                    </div>
                  </div>
                </Transition>
            </template>
          </div>
        </Transition>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ═══════════════════════════════════════════════
   Page — mirrors desktop SettingsDialog.vue
   ═══════════════════════════════════════════════ */
.settings-page {
  display: flex; height: 100vh;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: #1e293b;
}

/* ── Toast ── */
.toast-container {
  position: fixed; bottom: 24px; right: 24px; z-index: 99999;
  display: flex; flex-direction: column-reverse; gap: 8px;
  pointer-events: none;
}
.toast {
  padding: 10px 16px; border-radius: 8px;
  font-size: 13px; font-weight: 500; color: #fff;
  display: flex; align-items: center; gap: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  pointer-events: auto; min-width: 200px;
}
.toast.success { background: #15803d; }
.toast.error { background: #dc2626; }
.toast.info { background: #2563eb; }
.toast-icon { font-weight: 700; font-size: 14px; }
.toast-enter-active { transition: all 0.25s ease-out; }
.toast-leave-active { transition: all 0.2s ease-in; }
.toast-enter-from { opacity: 0; transform: translateX(40px); }
.toast-leave-to { opacity: 0; transform: translateX(40px); }

/* ── Left Nav ── */
.settings-nav {
  width: 180px; flex-shrink: 0;
  background: #f8fafc; border-right: 1px solid #e2e8f0;
  display: flex; flex-direction: column;
}
.nav-header { padding: 20px 16px 12px; }
.nav-title { font-size: 15px; font-weight: 700; color: #1e293b; margin: 0; }
.nav-list { list-style: none; margin: 0; padding: 4px 8px; flex: 1; }
.nav-item {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 10px; border-radius: 8px;
  font-size: 13px; color: #475569;
  cursor: pointer; transition: background 0.12s;
}
.nav-item:hover { background: #e2e8f0; }
.nav-item.active { background: #dbeafe; color: #2563eb; font-weight: 600; }
.nav-icon { font-size: 16px; }
.nav-badge {
  margin-left: auto; padding: 1px 7px; border-radius: 10px;
  background: #e2e8f0; color: #64748b;
  font-size: 11px; font-weight: 600; line-height: 1.4;
}
.nav-item.active .nav-badge { background: #93c5fd; color: #1e40af; }
.nav-footer { padding: 12px 16px; border-top: 1px solid #e2e8f0; }
.nav-version { font-size: 11px; color: #94a3b8; }

/* ── Main Content ── */
.settings-main {
  flex: 1; display: flex; flex-direction: column;
  min-width: 0; background: #fff;
}
.main-header {
  display: flex; align-items: flex-start; justify-content: space-between;
  padding: 20px 24px 12px; border-bottom: 1px solid #f1f5f9; flex-shrink: 0;
}
.main-title { font-size: 16px; font-weight: 700; color: #1e293b; margin: 0 0 4px; }
.main-desc { font-size: 12px; color: #94a3b8; margin: 0; }
.header-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.btn-add {
  padding: 8px 16px; border: none; border-radius: 8px;
  background: #2563eb; color: #fff; font-size: 13px; font-weight: 600;
  cursor: pointer; white-space: nowrap; font-family: inherit;
  transition: background 0.12s;
}
.btn-add:hover { background: #1d4ed8; }
.btn-add-lg { padding: 10px 24px; font-size: 14px; margin-top: 12px; }
.main-body { flex: 1; overflow-y: auto; padding: 16px 24px; }

.models-section { max-width: 600px; }

/* ── Language Settings ── */
.language-settings { display: flex; flex-direction: column; gap: 6px; max-width: 400px; }
.lang-radio {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 14px; border: 1px solid #e2e8f0; border-radius: 8px;
  cursor: pointer; transition: all 0.15s; position: relative;
}
.lang-radio:hover { border-color: #cbd5e1; background: #fafbfc; }
.lang-radio.selected { border-color: #93c5fd; background: #eff6ff; }
.lang-radio input[type="radio"] { accent-color: #3b82f6; }
.lang-name { font-size: 13px; font-weight: 500; color: #1e293b; flex: 1; }
.lang-en { font-size: 11px; color: #94a3b8; }
.lang-check { flex-shrink: 0; }

/* ── Loading Skeleton ── */
.loading-skeleton { display: flex; flex-direction: column; gap: 10px; }
.skeleton-card {
  border: 1px solid #e2e8f0; border-radius: 10px;
  padding: 16px; background: #fff;
}
.skeleton-line {
  height: 14px; border-radius: 6px; background: #e2e8f0;
  animation: shimmer 1.2s ease-in-out infinite;
}
.skeleton-title { width: 40%; margin-bottom: 10px; }
.skeleton-meta { width: 60%; margin-bottom: 12px; }
.skeleton-actions { width: 30%; height: 28px; border-radius: 6px; }
@keyframes shimmer {
  0% { opacity: 0.5; } 50% { opacity: 1; } 100% { opacity: 0.5; }
}

/* ── Model Cards ── */
.model-list { display: flex; flex-direction: column; gap: 10px; }
.model-card {
  border: 1px solid #e2e8f0; border-radius: 10px;
  padding: 14px 16px; background: #fff;
  transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
  position: relative; overflow: hidden;
}
.model-card:hover { border-color: #cbd5e1; }
.model-card.is-active {
  border-color: #93c5fd;
  box-shadow: 0 0 0 2px rgba(59,130,246,0.1);
  background: #fafbff;
}
.model-card.is-active::before {
  content: ''; position: absolute; left: 0; top: 0; bottom: 0;
  width: 3px; background: #3b82f6; border-radius: 10px 0 0 10px;
}
.model-card.is-editing { border-color: #3b82f6; }
.card-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.card-info { flex: 1; min-width: 0; }
.card-name-row { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; flex-wrap: wrap; }
.card-name { font-size: 14px; font-weight: 600; color: #1e293b; }
.badge-active {
  display: inline-block; padding: 1px 8px; border-radius: 10px;
  background: #dcfce7; color: #15803d; font-size: 11px; font-weight: 600;
}
.card-meta { font-size: 12px; color: #94a3b8; display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.card-model { font-family: 'SF Mono', monospace; font-size: 11px; }
.meta-sep { color: #cbd5e1; }
.card-provider { color: #64748b; }
.card-source { color: #94a3b8; }
.card-actions { display: flex; gap: 6px; flex-shrink: 0; align-items: flex-start; }
.btn-card {
  padding: 5px 12px; border: 1px solid #e2e8f0; border-radius: 6px;
  background: #fff; font-size: 12px; cursor: pointer;
  transition: all 0.12s; white-space: nowrap; font-family: inherit;
}
.btn-card:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-edit:hover { border-color: #93c5fd; color: #2563eb; background: #eff6ff; }
.btn-delete:hover { border-color: #fca5a5; color: #dc2626; background: #fef2f2; }
.btn-delete.is-confirming { border-color: #ef4444; background: #ef4444; color: #fff; }

/* Delete Popover */
.delete-wrapper { position: relative; }
.delete-popover {
  position: absolute; top: calc(100% + 6px); right: 0; z-index: 10;
  background: #fff; border: 1px solid #e2e8f0; border-radius: 8px;
  padding: 12px; box-shadow: 0 4px 16px rgba(0,0,0,0.1);
  display: flex; flex-wrap: wrap; gap: 6px; align-items: center;
  white-space: nowrap;
}
.popover-text { font-size: 12px; color: #475569; width: 100%; margin-bottom: 2px; }
.popover-btn {
  padding: 4px 12px; border-radius: 6px; font-size: 12px; font-weight: 500;
  border: none; cursor: pointer; font-family: inherit; transition: background 0.12s;
}
.popover-yes { background: #ef4444; color: #fff; }
.popover-yes:hover { background: #dc2626; }
.popover-no { background: #f1f5f9; color: #475569; }
.popover-no:hover { background: #e2e8f0; }
.popover-enter-active { transition: all 0.15s ease-out; }
.popover-leave-active { transition: all 0.1s ease-in; }
.popover-enter-from { opacity: 0; transform: scale(0.9) translateY(-4px); }
.popover-leave-to { opacity: 0; transform: scale(0.9) translateY(-4px); }

.card-bottom {
  display: flex; align-items: center; gap: 8px;
  margin-top: 10px; padding-top: 10px; border-top: 1px solid #f1f5f9;
}
.btn-active { color: #2563eb; border-color: #bfdbfe; }
.btn-active:hover { background: #eff6ff; border-color: #93c5fd; }
.active-label { font-size: 12px; color: #15803d; font-weight: 500; }
.btn-test { color: #64748b; }
.btn-test:hover:not(:disabled) { color: #334155; border-color: #cbd5e1; }

/* ── Empty State ── */
.empty-state {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; padding: 64px 24px; text-align: center;
}
.empty-icon { font-size: 48px; margin-bottom: 16px; }
.empty-title { font-size: 16px; font-weight: 600; color: #64748b; margin: 0 0 6px; }
.empty-desc { font-size: 13px; color: #94a3b8; margin: 0; }

/* ── Inline Form ── */
.inline-form-card {
  border: 1px solid #e2e8f0; border-radius: 10px;
  padding: 16px; background: #fff;
}
.form-slide-enter-active { transition: all 0.2s ease-out; }
.form-slide-leave-active { transition: all 0.15s ease-in; }
.form-slide-enter-from { opacity: 0; transform: translateY(-8px); }
.form-slide-leave-to { opacity: 0; transform: translateY(-8px); }

.inline-form-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid #f1f5f9;
}
.inline-form-title { font-size: 14px; font-weight: 600; color: #1e293b; }

.form-group { margin-bottom: 16px; }
.form-label { display: block; font-size: 12px; font-weight: 500; color: #475569; margin-bottom: 6px; }
.form-label.required::after { content: ' *'; color: #ef4444; }
.optional { font-weight: 400; color: #94a3b8; }
.form-input {
  width: 100%; padding: 8px 12px; border: 1px solid #e2e8f0; border-radius: 8px;
  font-size: 13px; color: #1e293b; background: #fff;
  transition: border-color 0.15s; box-sizing: border-box; font-family: inherit;
}
.form-input:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }
.form-input.mono { font-family: 'SF Mono', monospace; font-size: 12px; }
.form-select {
  width: 100%; padding: 8px 12px; border: 1px solid #e2e8f0; border-radius: 8px;
  font-size: 13px; color: #1e293b; background: #fff;
  cursor: pointer; box-sizing: border-box; font-family: inherit;
}
.form-select:focus { outline: none; border-color: #3b82f6; }
.form-label-row { display: flex; align-items: center; justify-content: space-between; }

.input-password { display: flex; position: relative; }
.input-password .form-input { padding-right: 40px; }
.toggle-visibility {
  position: absolute; right: 4px; top: 50%; transform: translateY(-50%);
  background: none; border: none; cursor: pointer;
  padding: 4px 6px; border-radius: 4px; line-height: 1;
  color: #94a3b8; display: flex; align-items: center;
}
.toggle-visibility:hover { background: #f1f5f9; color: #475569; }

.headers-list { display: flex; flex-direction: column; gap: 6px; margin-top: 6px; }
.header-row { display: flex; gap: 6px; align-items: center; }
.header-key { flex: 1; }
.header-value { flex: 2; }
.btn-icon {
  width: 28px; height: 28px; border: none; border-radius: 6px;
  background: transparent; font-size: 12px; color: #94a3b8;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; font-family: inherit;
}
.btn-icon:hover { background: #fee2e2; color: #ef4444; }
.btn-icon-close:hover { background: #f1f5f9; color: #475569; }

.btn-link {
  border: none; background: none; color: #3b82f6;
  font-size: 12px; font-weight: 500; cursor: pointer; padding: 0; font-family: inherit;
  display: inline-flex; align-items: center; gap: 4px;
}
.btn-link:hover { text-decoration: underline; }
.adv-arrow { display: inline-block; transition: transform 0.15s; font-size: 10px; }
.adv-arrow.open { transform: rotate(90deg); }

.test-group { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }

.btn-test {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 16px; border: 1px solid #e2e8f0; border-radius: 8px;
  background: #fff; font-size: 12px; color: #475569;
  cursor: pointer; transition: all 0.12s; font-family: inherit;
}
.btn-test:hover:not(:disabled) { border-color: #3b82f6; color: #3b82f6; }
.btn-test:disabled { opacity: 0.5; cursor: not-allowed; }

.spinner-sm, .spinner {
  display: inline-block; border-radius: 50%;
  animation: spin 0.6s linear infinite;
}
.spinner-sm { width: 12px; height: 12px; border: 2px solid #e2e8f0; border-top-color: #3b82f6; }
.spinner { width: 14px; height: 14px; border: 2px solid #e2e8f0; border-top-color: #3b82f6; }
@keyframes spin { to { transform: rotate(360deg); } }

.test-result { font-size: 12px; }
.test-result.ok { color: #15803d; }
.test-result.err { color: #dc2626; }

.form-footer {
  display: flex; justify-content: flex-end; gap: 10px;
  margin-top: 16px; padding-top: 14px; border-top: 1px solid #f1f5f9;
}
.btn-cancel {
  padding: 8px 20px; border: 1px solid #e2e8f0; border-radius: 8px;
  background: #fff; color: #475569; font-size: 13px; font-weight: 500;
  cursor: pointer; transition: all 0.12s; font-family: inherit;
}
.btn-cancel:hover { background: #f8fafc; }
.btn-save {
  padding: 8px 20px; border: none; border-radius: 8px;
  background: #3b82f6; color: #fff; font-size: 13px; font-weight: 500;
  cursor: pointer; transition: all 0.12s; font-family: inherit;
}
.btn-save:hover { background: #2563eb; }
.btn-save:disabled { opacity: 0.5; cursor: not-allowed; }

.form-range { width: 100%; margin: 4px 0; accent-color: #3b82f6; }
.range-labels { display: flex; justify-content: space-between; font-size: 10px; color: #94a3b8; }

/* ── Transitions ── */
.fade-enter-active, .fade-leave-active { transition: opacity 0.15s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.slide-enter-active { transition: all 0.2s ease-out; }
.slide-leave-active { transition: all 0.15s ease-in; }
.slide-enter-from, .slide-leave-to { opacity: 0; max-height: 0; overflow: hidden; }
.advanced-panel { overflow: hidden; }
</style>
