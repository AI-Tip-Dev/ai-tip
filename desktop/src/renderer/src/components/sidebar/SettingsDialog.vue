<script setup lang="ts">
import { ref, watch } from 'vue'
import { useModelConfig, type ModelConfig, PROVIDERS, type ProviderDef } from '../../composables/useModelConfig'
import { useLanguageSettings, UI_LANGUAGES } from '../../composables/useLanguageSettings'
import { useI18n } from '../../composables/useI18n'
import ModelConfigDialog from './ModelConfigDialog.vue'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  close: []
}>()

const { models, activeId, deleteModel, setActiveModel } = useModelConfig()
const { uiLanguage } = useLanguageSettings()
const { t } = useI18n()

// ========== Nav state ==========
const activeNav = ref<'models' | 'language'>('models')

// ========== Dialog state ==========
const showDialog = ref(false)
const dialogModel = ref<ModelConfig | null>(null)

// ========== Card list state ==========
const deleteConfirmId = ref<string | null>(null)
const isTesting = ref<string | null>(null)
const testResults = ref<Record<string, { ok: boolean; message: string }>>({})

// ========== Reset when closing ==========
watch(() => props.visible, (v) => {
  if (!v) {
    deleteConfirmId.value = null
  }
})

// ========== Provider helpers ==========
function getProviderDef(name: string): ProviderDef | undefined {
  return PROVIDERS.find(p => p.name === name)
}

function getProviderLabel(providerName: string): string {
  return getProviderDef(providerName)?.displayName ?? providerName
}

// ========== Dialog actions ==========
function handleAddNew(): void {
  dialogModel.value = null
  showDialog.value = true
}

function handleEdit(modelId: string): void {
  const m = models.value.find(x => x.id === modelId)
  if (!m) return
  deleteConfirmId.value = null
  dialogModel.value = JSON.parse(JSON.stringify(m))
  showDialog.value = true
}

function handleDialogSaved(): void {
  // Model was saved via dialog — list auto-updates via reactive models
}

// ========== Card actions ==========
function handleDelete(modelId: string): void {
  if (deleteConfirmId.value === modelId) {
    deleteModel(modelId)
    deleteConfirmId.value = null
  } else {
    deleteConfirmId.value = modelId
  }
}

function handleSetActive(modelId: string): void {
  setActiveModel(modelId)
}

async function handleTest(modelId: string): Promise<void> {
  isTesting.value = modelId
  try {
    const m = models.value.find(x => x.id === modelId)
    if (!m) return
    const config = JSON.parse(JSON.stringify(m))
    const result = await window.llmApi.testConnection(config)
    testResults.value[modelId] = { ok: result.ok, message: result.message || (result.ok ? t('model.testSuccess') : t('model.testFailed')) }
  } catch (e: any) {
    testResults.value[modelId] = { ok: false, message: e.message || t('model.connectionFailed') }
  } finally {
    isTesting.value = null
  }
}

// ========== Close ==========
function handleClose(): void {
  emit('update:visible', false)
  emit('close')
}

function handleOverlayClick(e: MouseEvent): void {
  if ((e.target as HTMLElement).classList.contains('settings-overlay')) {
    handleClose()
  }
}

function handleKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    handleClose()
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="settings-overlay"
      @click="handleOverlayClick"
      @keydown="handleKeydown"
    >
      <div class="settings-container" role="dialog" aria-modal="true" :aria-label="t('settings.title')">
        <!-- Left sidebar nav -->
        <nav class="settings-nav">
          <div class="nav-header">
            <h2 class="nav-title">{{ t('settings.title') }}</h2>
          </div>
          <ul class="nav-list">
            <li
              class="nav-item"
              :class="{ active: activeNav === 'models' }"
              @click="activeNav = 'models'"
            >
              <span class="nav-icon">🧠</span>
              <span class="nav-label">{{ t('settings.models') }}</span>
            </li>
            <li
              class="nav-item"
              :class="{ active: activeNav === 'language' }"
              @click="activeNav = 'language'"
            >
              <span class="nav-icon">🌐</span>
              <span class="nav-label">{{ t('settings.language') }}</span>
            </li>
          </ul>
        </nav>

        <!-- Main content -->
        <div class="settings-main">
          <!-- Header -->
          <div class="main-header">
            <div>
              <h3 class="main-title">{{ activeNav === 'models' ? t('settings.modelsTitle') : t('settings.languageTitle') }}</h3>
              <p class="main-desc">{{ activeNav === 'models' ? t('settings.modelsDesc') : t('settings.languageDesc') }}</p>
            </div>
            <div class="header-actions">
              <button
                v-if="activeNav === 'models'"
                class="btn-add"
                @click="handleAddNew"
              >{{ t('settings.addModel') }}</button>
              <button class="settings-close" @click="handleClose" :aria-label="t('settings.close')">✕</button>
            </div>
          </div>

          <!-- Content area -->
          <div class="main-body">
            <!-- ====== Language Settings ====== -->
            <div v-if="activeNav === 'language'" class="language-settings">
              <div class="lang-options">
                <label
                  v-for="lang in UI_LANGUAGES"
                  :key="lang.code"
                  class="lang-radio"
                  :class="{ selected: uiLanguage === lang.code }"
                >
                  <input
                    type="radio"
                    name="ui-lang"
                    :value="lang.code"
                    :checked="uiLanguage === lang.code"
                    @change="uiLanguage = lang.code"
                  />
                  <span class="lang-name">{{ lang.nativeName }}</span>
                  <span class="lang-english">{{ lang.englishName }}</span>
                </label>
              </div>
            </div>

            <!-- ====== Model Cards List ====== -->
            <template v-if="activeNav === 'models'">
            <div v-if="models.length === 0" class="empty-state">
              <div class="empty-icon">🧠</div>
              <p class="empty-title">{{ t('model.emptyTitle') }}</p>
              <p class="empty-desc">{{ t('model.emptyDesc') }}</p>
            </div>

            <div v-else class="model-list">
              <div
                v-for="m in models"
                :key="m.id"
                class="model-card"
                :class="{ active: m.id === activeId }"
              >
                <div class="card-top">
                  <div class="card-info">
                    <div class="card-name-row">
                      <span class="card-name">{{ m.displayName || m.name }}</span>
                      <span v-if="m.id === activeId" class="badge-active">{{ t('model.activeBadge') }}</span>
                    </div>
                    <div class="card-meta">
                      <span class="card-model">{{ m.name }}</span>
                      <span class="meta-sep">·</span>
                      <span class="card-provider">{{ getProviderLabel(m.provider) }}</span>
                      <span class="meta-sep">·</span>
                      <span class="card-source">{{ m.source === 'local' ? t('model.sourceLocal') : t('model.sourceRemote') }}</span>
                    </div>
                  </div>
                  <div class="card-actions">
                    <button
                      class="btn-card btn-edit"
                      @click="handleEdit(m.id)"
                      :title="t('model.edit')"
                    >{{ t('model.edit') }}</button>
                    <button
                      class="btn-card btn-delete"
                      :class="{ confirm: deleteConfirmId === m.id }"
                      @click="handleDelete(m.id)"
                      :title="deleteConfirmId === m.id ? t('model.delete') : t('model.delete')"
                    >{{ deleteConfirmId === m.id ? t('model.confirmDelete') : t('model.delete') }}</button>
                  </div>
                </div>

                <div class="card-bottom">
                  <button
                    v-if="m.id !== activeId"
                    class="btn-card btn-active"
                    @click="handleSetActive(m.id)"
                  >{{ t('model.setActive') }}</button>
                  <button
                    class="btn-card btn-test"
                    :disabled="isTesting === m.id"
                    @click="handleTest(m.id)"
                  >
                    <span v-if="isTesting === m.id" class="spinner-sm"></span>
                    <span v-else>{{ testResults[m.id] ? t('model.retest') : t('model.testConnection') }}</span>
                  </button>
                  <span
                    v-if="testResults[m.id]"
                    class="test-result"
                    :class="{ ok: testResults[m.id].ok, err: !testResults[m.id].ok }"
                  >
                    {{ testResults[m.id].ok ? '✅' : '❌' }} {{ testResults[m.id].message }}
                  </span>
                </div>
              </div>
            </div>
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- Add / Edit Model Dialog -->
    <ModelConfigDialog
      v-model:visible="showDialog"
      :model="dialogModel"
      @saved="handleDialogSaved"
    />
  </Teleport>
</template>

<style scoped>
/* ============================================ */
/* Overlay                                      */
/* ============================================ */
.settings-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(3px);
}

/* ============================================ */
/* Container                                    */
/* ============================================ */
.settings-container {
  display: flex;
  width: 720px;
  max-width: 94vw;
  height: 520px;
  max-height: 85vh;
  background: #fff;
  border-radius: 14px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(0, 0, 0, 0.06);
  overflow: hidden;
  animation: settings-in 0.2s ease-out;
}

@keyframes settings-in {
  from { opacity: 0; transform: scale(0.95) translateY(12px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

/* ============================================ */
/* Left Nav                                     */
/* ============================================ */
.settings-nav {
  width: 180px;
  flex-shrink: 0;
  background: #f8fafc;
  border-right: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
}

.nav-header {
  padding: 20px 16px 12px;
}

.nav-title {
  font-size: 15px;
  font-weight: 700;
  color: #1e293b;
  margin: 0;
}

.nav-list {
  list-style: none;
  margin: 0;
  padding: 4px 8px;
  flex: 1;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 13px;
  color: #475569;
  cursor: pointer;
  transition: background 0.12s;
}
.nav-item:hover {
  background: #e2e8f0;
}
.nav-item.active {
  background: #dbeafe;
  color: #2563eb;
  font-weight: 600;
}

.nav-icon { font-size: 16px; }
.nav-label { line-height: 1; }

/* ============================================ */
/* Top-right close button (PC convention)       */
/* ============================================ */
.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.settings-close {
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
.settings-close:hover {
  background: #f1f5f9;
  color: #475569;
}

/* ============================================ */
/* Main Content                                 */
/* ============================================ */
.settings-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: #fff;
}

.main-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 20px 24px 12px;
  border-bottom: 1px solid #f1f5f9;
  flex-shrink: 0;
}

.main-title {
  font-size: 16px;
  font-weight: 700;
  color: #1e293b;
  margin: 0 0 4px;
}

.main-desc {
  font-size: 12px;
  color: #94a3b8;
  margin: 0;
}

.btn-add {
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  background: #2563eb;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.12s;
  white-space: nowrap;
  flex-shrink: 0;
}
.btn-add:hover { background: #1d4ed8; }

.main-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 24px;
}

/* Model Cards                                  */
/* ============================================ */
.model-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.model-card {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 14px 16px;
  background: #fff;
  transition: border-color 0.12s, box-shadow 0.12s;
}
.model-card:hover {
  border-color: #cbd5e1;
}
.model-card.active {
  border-color: #93c5fd;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
}

.card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.card-info {
  flex: 1;
  min-width: 0;
}

.card-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.card-name {
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
}

.badge-active {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 10px;
  background: #dcfce7;
  color: #15803d;
  font-size: 11px;
  font-weight: 600;
}

.card-meta {
  font-size: 12px;
  color: #94a3b8;
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.card-model {
  font-family: 'SF Mono', 'Cascadia Code', monospace;
  font-size: 11px;
}

.meta-sep { color: #cbd5e1; }

.card-provider { color: #64748b; }
.card-source { color: #94a3b8; }

.card-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.btn-card {
  padding: 5px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.12s;
  white-space: nowrap;
}
.btn-card:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-edit:hover {
  border-color: #93c5fd;
  color: #2563eb;
  background: #eff6ff;
}

.btn-delete:hover {
  border-color: #fca5a5;
  color: #dc2626;
  background: #fef2f2;
}
.btn-delete.confirm {
  border-color: #ef4444;
  background: #ef4444;
  color: #fff;
}

.card-bottom {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid #f1f5f9;
}

.btn-active {
  color: #2563eb;
  border-color: #bfdbfe;
}
.btn-active:hover {
  background: #eff6ff;
  border-color: #93c5fd;
}

.btn-test {
  color: #64748b;
}
.btn-test:hover {
  color: #334155;
  border-color: #cbd5e1;
}

.spinner-sm {
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 2px solid #e2e8f0;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.test-result {
  font-size: 12px;
  margin-left: 4px;
}
.test-result.ok { color: #15803d; }
.test-result.err { color: #dc2626; }

/* ============================================ */
/* Empty State                                  */
/* ============================================ */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
}

.empty-icon { font-size: 40px; margin-bottom: 12px; }

.empty-title {
  font-size: 15px;
  font-weight: 600;
  color: #64748b;
  margin: 0 0 4px;
}

.empty-desc {
  font-size: 13px;
  color: #94a3b8;
  margin: 0;
}

/* ============================================ */
/* Language Settings                            */
/* ============================================ */
.language-settings {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.lang-section {
  display: flex;
  flex-direction: column;
}

.lang-section-title {
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
  margin: 0 0 4px;
}

.lang-section-desc {
  font-size: 12px;
  color: #94a3b8;
  margin: 0 0 12px;
}

.lang-options {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.lang-radio {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.12s;
}
.lang-radio:hover {
  border-color: #cbd5e1;
  background: #f8fafc;
}
.lang-radio.selected {
  border-color: #93c5fd;
  background: #eff6ff;
}

.lang-radio input {
  accent-color: #2563eb;
  width: 16px;
  height: 16px;
  margin: 0;
  flex-shrink: 0;
}

.lang-name {
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
  min-width: 70px;
}

.lang-english {
  font-size: 11px;
  color: #94a3b8;
}

.lang-warning {
  font-size: 12px;
  color: #d97706;
  margin: 8px 0 0;
}

/* ============================================ */
/* Empty State                                  */
</style>
