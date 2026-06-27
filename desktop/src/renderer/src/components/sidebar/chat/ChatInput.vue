<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useModelConfig, type ModelConfig } from '../../../composables/useModelConfig'
import { useI18n } from '../../../composables/useI18n'

const props = defineProps<{
  isStreaming: boolean
  placeholder: string
  /** Optional field label to show in placeholder when AI Tip is active */
  contextLabel?: string
  /** True when batch pre-fill is in progress — disable input */
  batchInProgress?: boolean
}>()

const emit = defineEmits<{
  send: [text: string, modelId?: string]
  stop: []
  'open-settings': []
}>()

const { models, activeId } = useModelConfig()
const { t } = useI18n()

const inputText = ref('')
const selectedModelId = ref<string | null>(activeId.value)
const showModelMenu = ref(false)

const canSend = computed(() => inputText.value.trim().length > 0)

/** Dynamic placeholder based on context */
const effectivePlaceholder = computed(() => {
  if (props.contextLabel) {
    return `Ask about "${props.contextLabel}"...`
  }
  return props.placeholder
})

const selectedModel = computed<ModelConfig | null>(() =>
  models.value.find(m => m.id === selectedModelId.value) ?? null
)

const selectedModelLabel = computed(() => {
  let name = selectedModel.value?.displayName || selectedModel.value?.name
  if (!name) return t('chat.selectModel')
  // Strip provider prefix like "deepseek-ai/"
  const slash = name.lastIndexOf('/')
  return slash > 0 ? name.slice(slash + 1) : name
})

// All models flat list — no need to split by source
const modelList = computed(() => models.value)

// Close menu on outside click
function onDocumentClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (!target.closest('.model-picker')) {
    showModelMenu.value = false
  }
}

onMounted(() => document.addEventListener('click', onDocumentClick))
onUnmounted(() => document.removeEventListener('click', onDocumentClick))

function selectModel(id: string) {
  selectedModelId.value = id
  showModelMenu.value = false
}

function handleSend(): void {
  const text = inputText.value.trim()
  if (!text || props.isStreaming || props.batchInProgress) return
  emit('send', text, selectedModelId.value ?? undefined)
  inputText.value = ''
}

function handleKeydown(e: KeyboardEvent): void {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}
</script>

<template>
  <div class="chat-input">
    <div class="input-card">
      <textarea
        ref="textareaRef"
        v-model="inputText"
        class="input-area"
        :placeholder="effectivePlaceholder"
        :disabled="isStreaming || batchInProgress"
        rows="1"
        @keydown="handleKeydown"
      />

      <!-- Bottom bar -->
      <div class="input-toolbar">
        <!-- Model selector popover -->
        <div v-if="models.length > 0" class="model-picker" :class="{ open: showModelMenu }">
          <button
            class="model-pill"
            :disabled="isStreaming"
            @click.stop="showModelMenu = !showModelMenu"
          >
            <span class="model-icon">🧠</span>
            <span class="model-label">{{ selectedModelLabel }}</span>
            <span class="chevron" :class="{ up: showModelMenu }">▾</span>
          </button>

          <!-- Dropdown panel -->
          <Transition name="menu-fade">
            <div v-if="showModelMenu" class="model-menu" @click.stop>
              <button
                v-for="m in modelList"
                :key="m.id"
                class="menu-item"
                :class="{ selected: m.id === selectedModelId }"
                @click="selectModel(m.id)"
              >
                <span class="menu-item-name">{{ m.displayName || m.name }}</span>
                <span v-if="m.id === selectedModelId" class="menu-check">✓</span>
              </button>

              <!-- Manage models -->
              <div class="menu-footer">
                <button class="menu-item manage-models" @click="showModelMenu = false; $emit('open-settings')">
                  <span class="add-icon">⚙</span>
                  <span>{{ t('chat.manageModels') }}</span>
                </button>
              </div>
            </div>
          </Transition>
        </div>

        <div class="toolbar-spacer" />

        <!-- Send / Stop -->
        <button
          v-if="isStreaming"
          class="send-btn stop"
          @click="$emit('stop')"
          :title="t('chat.stopTooltip')"
        >
          <span class="btn-icon">■</span>
          <span class="btn-label">{{ t('chat.stop') }}</span>
        </button>
        <button
          v-else
          class="send-btn"
          :class="{ active: canSend }"
          :disabled="!canSend"
          @click="handleSend"
          :title="t('chat.sendTooltip')"
        >
          <span class="btn-icon">➤</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ============================================ */
/* Chat Input — card-based with model popover   */
/* ============================================ */
.chat-input {
  flex-shrink: 0;
  padding: 10px 12px 12px;
  border-top: 1px solid var(--border-light, #e5e7eb);
  background: var(--app-white, #fff);
}

/* ── Unified input card ── */
.input-card {
  border: 1px solid var(--input-border, #d1d5db);
  border-radius: 12px;
  background: var(--app-gray-50, #f9fafb);
  transition: border-color 0.15s, box-shadow 0.15s;
}
.input-card:focus-within {
  border-color: var(--accent-color, #3b82f6);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

/* ── Textarea ── */
.input-area {
  display: block;
  width: 100%;
  padding: 10px 12px 6px;
  border: none;
  background: transparent;
  font-size: 13px;
  font-family: inherit;
  line-height: 1.5;
  color: var(--color-text, #1f2937);
  resize: none;
  outline: none;
  min-height: 36px;
  max-height: 120px;
}
.input-area::placeholder {
  color: var(--color-text-muted, #9ca3af);
}
.input-area:disabled { opacity: 0.5; }

/* ── Bottom toolbar ── */
.input-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px 6px;
}

/* ============================================ */
/* Model picker — popover pattern               */
/* ============================================ */
.model-picker {
  position: relative;
}

.model-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 20px;
  border: 1px solid var(--border-light, #e5e7eb);
  background: var(--app-white, #fff);
  font-family: inherit;
  font-size: 12px;
  color: var(--color-text, #374151);
  cursor: pointer;
  transition: border-color 0.12s, background 0.12s;
  max-width: 180px;
  white-space: nowrap;
}
.model-pill:hover {
  border-color: var(--accent-color, #3b82f6);
  background: #f0f5ff;
}
.model-pill:disabled { opacity: 0.5; cursor: not-allowed; }

.model-picker.open .model-pill {
  border-color: var(--accent-color, #3b82f6);
  background: #eef2ff;
}

.model-icon { font-size: 13px; flex-shrink: 0; line-height: 1; }
.model-label {
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 500;
}
.chevron {
  font-size: 9px;
  color: var(--color-text-muted, #9ca3af);
  flex-shrink: 0;
  transition: transform 0.15s;
  line-height: 1;
}
.chevron.up { transform: rotate(180deg); }

/* ── Dropdown menu ── */
.model-menu {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  min-width: 220px;
  max-width: 280px;
  background: var(--app-white, #fff);
  border: 1px solid var(--border-light, #e5e7eb);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12), 0 2px 4px rgba(0, 0, 0, 0.06);
  z-index: 100;
  overflow: hidden;
  padding: 4px 0;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  border: none;
  background: transparent;
  font-family: inherit;
  font-size: 13px;
  color: var(--color-text, #374151);
  cursor: pointer;
  text-align: left;
  transition: background 0.1s;
}
.menu-item:hover { background: var(--app-gray-50, #f9fafb); }
.menu-item.selected {
  background: #eef2ff;
  color: var(--accent-color, #3b82f6);
}

.menu-item-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.menu-check {
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 600;
}

.menu-footer {
  border-top: 1px solid var(--border-light, #e5e7eb);
  margin-top: 2px;
  padding-top: 2px;
}
.menu-item.manage-models {
  color: var(--accent-color, #3b82f6);
  font-weight: 500;
}
.menu-item.manage-models:hover {
  background: #eff6ff;
}
.add-icon { font-size: 15px; font-weight: 600; }

/* ── Transition ── */
.menu-fade-enter-active,
.menu-fade-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.menu-fade-enter-from,
.menu-fade-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

/* ============================================ */
/* Send button                                  */
/* ============================================ */
.toolbar-spacer { flex: 1; }

.send-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 50%;
  background: var(--border-light, #d1d5db);
  color: #fff;
  font-size: 13px;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s, transform 0.12s;
}
.send-btn.active { background: var(--accent-color, #3b82f6); }
.send-btn.active:hover { background: #2563eb; transform: scale(1.05); }
.send-btn:disabled { cursor: not-allowed; transform: none; }

.send-btn.stop {
  width: auto;
  border-radius: 16px;
  padding: 0 12px;
  background: #ef4444;
  font-size: 11px;
  font-weight: 600;
}
.send-btn.stop:hover { background: #dc2626; }
.btn-icon { line-height: 1; }
.btn-label { font-size: 11px; font-weight: 600; }
</style>
