<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { useModelConfig, type ModelConfig, PROVIDERS } from '../../composables/useModelConfig'
import { useI18n } from '../../composables/useI18n'
import { useTraceDetail } from '../../composables/useTraceDetail'
import TraceDetailDialog from './chat/TraceDetailDialog.vue'

const props = defineProps<{
  visible: boolean
  /** null = 添加新模型, ModelConfig = 编辑已有模型 */
  model?: ModelConfig | null
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  saved: []
}>()

const { saveModel } = useModelConfig()
const { t } = useI18n()

const defaultForm = (): ModelConfig => ({
  id: '',
  name: '',
  displayName: '',
  provider: 'openai',
  source: 'remote',
  baseUrl: '',
  apiKey: '',
  temperature: 0.1,
  maxTokens: 2048,
  customHeaders: [],
})

const form = reactive<ModelConfig>(defaultForm())
const showApiKey = ref(false)
const isTesting = ref(false)
const testResult = ref<{ ok: boolean; message: string } | null>(null)
const testTraceSpanId = ref<string | null>(null)
const showAdvanced = ref(false)

const isEdit = computed(() => !!form.id)
const dialogTitle = computed(() => isEdit.value ? t('modelDialog.editTitle') : t('modelDialog.addTitle'))
const selectedProvider = computed(() => PROVIDERS.find(p => p.name === form.provider))

// Populate form when dialog opens
watch(() => props.visible, (v) => {
  if (v) {
    const src = props.model
    if (src) {
      Object.assign(form, JSON.parse(JSON.stringify(src)))
    } else {
      Object.assign(form, defaultForm())
    }
    showApiKey.value = false
    testResult.value = null
    showAdvanced.value = false
  }
})

// Auto-fill baseUrl on provider change
watch(() => form.provider, (p) => {
  const prov = PROVIDERS.find(x => x.name === p)
  if (prov) {
    form.source = prov.source
    form.baseUrl = prov.defaultBaseUrl
  }
})

// ========== Actions ==========
function handleProviderChange(providerName: string): void {
  form.provider = providerName
}

function addCustomHeader(): void {
  form.customHeaders.push({ key: '', value: '' })
}

function removeCustomHeader(index: number): void {
  form.customHeaders.splice(index, 1)
}

async function handleTest(): Promise<void> {
  isTesting.value = true
  testResult.value = null
  testTraceSpanId.value = null
  try {
    // JSON round-trip strips Vue reactive proxies for IPC structured clone
    const config = JSON.parse(JSON.stringify(form))
    const result = await window.llmApi.testConnection(config)
    testResult.value = { ok: result.ok, message: result.message || (result.ok ? t('model.testSuccess') : t('model.testFailed')) }
    testTraceSpanId.value = result.traceSpanId ?? null
  } catch (e: any) {
    testResult.value = { ok: false, message: e.message || t('model.connectionFailed') }
  } finally {
    isTesting.value = false
  }
}

function handleSave(): void {
  if (!form.name.trim()) return
  const cfg: ModelConfig = JSON.parse(JSON.stringify({
    ...form,
    id: form.id || `model-${Date.now()}`,
    name: form.name.trim(),
    displayName: form.displayName.trim(),
  }))
  saveModel(cfg)
  emit('saved')
  emit('update:visible', false)
}

function handleCancel(): void {
  emit('update:visible', false)
}

// ── Trace detail ──
const { span: traceSpan, fetchDetail: fetchTraceDetail, reset: resetTrace } = useTraceDetail()
const showTraceDialog = ref(false)

async function handleOpenTrace(): Promise<void> {
  if (!testTraceSpanId.value) return
  showTraceDialog.value = true
  await fetchTraceDetail(testTraceSpanId.value)
}

function handleCloseTrace(): void {
  showTraceDialog.value = false
  resetTrace()
}

function handleOverlayClick(e: MouseEvent): void {
  if ((e.target as HTMLElement).classList.contains('dialog-overlay')) {
    handleCancel()
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="dialog-overlay" @click="handleOverlayClick">
      <div class="dialog" role="dialog" aria-modal="true" :aria-label="dialogTitle">
        <!-- Header -->
        <div class="dialog-header">
          <h2 class="dialog-title">{{ dialogTitle }}</h2>
          <button class="dialog-close" @click="handleCancel" :aria-label="t('modelDialog.close')">✕</button>
        </div>

        <!-- Body -->
        <div class="dialog-body">
          <!-- Provider -->
          <div class="form-group">
            <label class="form-label">{{ t('modelDialog.provider') }}</label>
            <select
              class="form-select"
              :value="form.provider"
              @change="handleProviderChange(($event.target as HTMLSelectElement).value)"
            >
              <option v-for="p in PROVIDERS" :key="p.name" :value="p.name">
                {{ p.displayName }}
              </option>
            </select>
          </div>

          <!-- Model Name -->
          <div class="form-group">
            <label class="form-label required">{{ t('modelDialog.modelName') }}</label>
            <input
              v-model="form.name"
              class="form-input"
              :placeholder="t('modelDialog.modelNamePlaceholder')"
            />
          </div>

          <!-- Display Name -->
          <div class="form-group">
            <label class="form-label">{{ t('modelDialog.displayName') }} <span class="optional">{{ t('modelDialog.displayNameOptional') }}</span></label>
            <input
              v-model="form.displayName"
              class="form-input"
              :placeholder="t('modelDialog.displayNamePlaceholder')"
            />
          </div>

          <!-- Remote-only fields -->
          <template v-if="form.source === 'remote'">
            <!-- Base URL -->
            <div class="form-group">
              <label class="form-label required">{{ t('modelDialog.baseUrl') }}</label>
              <input
                v-model="form.baseUrl"
                class="form-input mono"
                placeholder="https://api.openai.com/v1"
              />
            </div>

            <!-- API Key -->
            <div class="form-group" v-if="selectedProvider?.requiresAuth">
              <label class="form-label">{{ t('modelDialog.apiKey') }}</label>
              <div class="input-password">
                <input
                  v-model="form.apiKey"
                  :type="showApiKey ? 'text' : 'password'"
                  class="form-input"
                  :placeholder="t('modelDialog.apiKeyPlaceholder')"
                  autocomplete="off"
                  spellcheck="false"
                />
                <button
                  class="toggle-visibility"
                  @click="showApiKey = !showApiKey"
                  :title="showApiKey ? t('modelDialog.hide') : t('modelDialog.show')"
                >{{ showApiKey ? '🙈' : '👁' }}</button>
              </div>
            </div>

            <!-- Custom Headers -->
            <div class="form-group">
              <div class="form-label-row">
                <label class="form-label">{{ t('modelDialog.customHeaders') }}</label>
                <button class="btn-link" @click="addCustomHeader">{{ t('modelDialog.addHeader') }}</button>
              </div>
              <div v-if="form.customHeaders.length > 0" class="headers-list">
                <div v-for="(h, i) in form.customHeaders" :key="i" class="header-row">
                  <input v-model="h.key" class="form-input header-key" :placeholder="t('modelDialog.headerName')" />
                  <input v-model="h.value" class="form-input header-value" :placeholder="t('modelDialog.headerValue')" />
                  <button class="btn-icon" @click="removeCustomHeader(i)" :title="t('modelDialog.removeHeader')">✕</button>
                </div>
              </div>
            </div>

            <!-- Test Connection -->
            <div class="form-group">
              <button
                class="btn-test"
                :disabled="!form.name || !form.baseUrl"
                @click="handleTest"
              >
                <span v-if="isTesting" class="spinner"></span>
                <span v-else>{{ testResult ? t('model.retest') : t('model.testConnection') }}</span>
              </button>
              <span v-if="testResult" class="test-result" :class="{ ok: testResult.ok, err: !testResult.ok }">
                {{ testResult.ok ? '✅' : '❌' }} {{ testResult.message }}
                <span
                  v-if="testTraceSpanId"
                  class="trace-link"
                  @click="handleOpenTrace"
                  title="View trace details"
                >🔍</span>
              </span>
            </div>
          </template>

          <!-- Advanced Options -->
          <div class="form-group">
            <button class="btn-link advanced-toggle" @click="showAdvanced = !showAdvanced">
              {{ showAdvanced ? '▾' : '▸' }} {{ t('modelDialog.advanced') }}
            </button>
          </div>

          <template v-if="showAdvanced">
            <div class="form-group">
              <label class="form-label">{{ t('modelDialog.temperature') }} <code>{{ form.temperature }}</code></label>
              <input
                v-model.number="form.temperature"
                type="range"
                min="0"
                max="2"
                step="0.05"
                class="form-range"
              />
              <div class="range-labels">
                <span>{{ t('modelDialog.tempDeterministic') }}</span>
                <span>{{ t('modelDialog.tempCreative') }}</span>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">{{ t('modelDialog.maxTokens') }}</label>
              <input
                v-model.number="form.maxTokens"
                type="number"
                class="form-input"
                min="1"
                max="128000"
                placeholder="2048"
              />
            </div>
          </template>
        </div>

        <!-- Footer -->
        <div class="dialog-footer">
          <button class="btn-cancel" @click="handleCancel">{{ t('modelDialog.cancel') }}</button>
          <button
            class="btn-save"
            :disabled="!form.name.trim()"
            @click="handleSave"
          >{{ t('modelDialog.save') }}</button>
        </div>
      </div>
    </div>

    <!-- Trace Detail Dialog -->
    <TraceDetailDialog
      v-if="showTraceDialog"
      :span="traceSpan"
      @close="handleCloseTrace"
    />
  </Teleport>
</template>

<style scoped>
/* ========== Overlay ========== */
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10001;
  backdrop-filter: blur(2px);
}

/* ========== Dialog ========== */
.dialog {
  background: #fff;
  border-radius: 12px;
  width: 480px;
  max-width: 92vw;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.08);
  animation: dialog-in 0.18s ease-out;
}

@keyframes dialog-in {
  from { opacity: 0; transform: scale(0.96) translateY(8px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 0;
}

.dialog-title {
  font-size: 16px;
  font-weight: 600;
  color: #1e293b;
  margin: 0;
}

.dialog-close {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  font-size: 14px;
  color: #94a3b8;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.12s;
}
.dialog-close:hover {
  background: #f1f5f9;
  color: #475569;
}

.dialog-body {
  padding: 20px 24px;
  overflow-y: auto;
  flex: 1;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 24px;
  border-top: 1px solid #f1f5f9;
}

/* ========== Form ========== */
.form-group {
  margin-bottom: 16px;
}

.form-label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: #475569;
  margin-bottom: 6px;
}

.form-label.required::after {
  content: ' *';
  color: #ef4444;
}

.optional {
  font-weight: 400;
  color: #94a3b8;
}

.form-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 13px;
  color: #1e293b;
  background: #fff;
  transition: border-color 0.15s;
  box-sizing: border-box;
  font-family: inherit;
}
.form-input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}
.form-input.mono {
  font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
  font-size: 12px;
}

.form-select {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 13px;
  color: #1e293b;
  background: #fff;
  cursor: pointer;
  box-sizing: border-box;
  font-family: inherit;
}
.form-select:focus {
  outline: none;
  border-color: #3b82f6;
}

.form-hint {
  margin: 4px 0 0;
  font-size: 11px;
  color: #94a3b8;
  line-height: 1.4;
}

.form-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

/* ========== Source Toggle ========== */
.source-toggle {
  display: flex;
  gap: 0;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
}

.source-btn {
  flex: 1;
  padding: 8px 12px;
  border: none;
  background: #fff;
  font-size: 13px;
  color: #64748b;
  cursor: pointer;
  transition: all 0.12s;
  font-family: inherit;
}
.source-btn:first-child {
  border-right: 1px solid #e2e8f0;
}
.source-btn.active {
  background: #3b82f6;
  color: #fff;
}
.source-btn:hover:not(.active) {
  background: #f8fafc;
}

/* ========== Password Input ========== */
.input-password {
  display: flex;
  position: relative;
}
.input-password .form-input {
  padding-right: 36px;
}
.toggle-visibility {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  padding: 4px 6px;
  border-radius: 4px;
  line-height: 1;
}
.toggle-visibility:hover {
  background: #f1f5f9;
}

/* ========== Custom Headers ========== */
.headers-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
}

.header-row {
  display: flex;
  gap: 6px;
  align-items: center;
}

.header-key {
  flex: 1;
}

.header-value {
  flex: 2;
}

.btn-icon {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  font-size: 12px;
  color: #94a3b8;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.btn-icon:hover {
  background: #fee2e2;
  color: #ef4444;
}

/* ========== Buttons ========== */
.btn-link {
  border: none;
  background: none;
  color: #3b82f6;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  padding: 0;
  font-family: inherit;
}
.btn-link:hover {
  text-decoration: underline;
}

.advanced-toggle {
  font-size: 12px;
  color: #64748b;
}

.btn-test {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fff;
  font-size: 12px;
  color: #475569;
  cursor: pointer;
  transition: all 0.12s;
  font-family: inherit;
}
.btn-test:hover:not(:disabled) {
  border-color: #3b82f6;
  color: #3b82f6;
}
.btn-test:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.test-result {
  margin-left: 10px;
  font-size: 12px;
  font-weight: 500;
}
.test-result.ok { color: #16a34a; }
.test-result.err { color: #ef4444; }

.trace-link {
  margin-left: 6px;
  font-size: 12px;
  cursor: pointer;
  opacity: 0.6;
  transition: opacity 0.12s;
  vertical-align: middle;
}
.trace-link:hover {
  opacity: 1;
}

.btn-cancel {
  padding: 8px 20px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fff;
  color: #475569;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.12s;
  font-family: inherit;
}
.btn-cancel:hover {
  background: #f8fafc;
}

.btn-save {
  padding: 8px 20px;
  border: none;
  border-radius: 8px;
  background: #3b82f6;
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.12s;
  font-family: inherit;
}
.btn-save:hover {
  background: #2563eb;
}
.btn-save:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ========== Range ========== */
.form-range {
  width: 100%;
  margin: 4px 0;
  accent-color: #3b82f6;
}

.range-labels {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: #94a3b8;
}

/* ========== Spinner ========== */
.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid #e2e8f0;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
