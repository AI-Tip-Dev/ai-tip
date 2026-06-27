<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from '../../../composables/useI18n'
import { useTraceDetail } from '../../../composables/useTraceDetail'
import TraceDetailDialog from './TraceDetailDialog.vue'

const props = defineProps<{
  state: 'trigger' | 'loading' | 'done'
  fieldCount: number
  highCount?: number
  mediumCount?: number
  lowCount?: number
  traceSpanId?: string
  modelName?: string
  tokenCount?: number
  startedAt?: number
  /** Streaming partial JSON content from LLM */
  streamContent?: string
}>()

const emit = defineEmits<{
  start: []
  cancel: []
  viewAll: []
  openTrace: [spanId: string]
}>()

const { t } = useI18n()

const { span: traceSpan, fetchDetail: fetchTraceDetail, reset: resetTrace } = useTraceDetail()
const showTraceDialog = ref(false)

async function handleOpenTrace(): Promise<void> {
  if (!props.traceSpanId) return
  showTraceDialog.value = true
  await fetchTraceDetail(props.traceSpanId)
}

function handleCloseTrace(): void {
  showTraceDialog.value = false
  resetTrace()
}
</script>

<template>
  <!-- Trigger state: user hasn't clicked yet -->
  <div v-if="state === 'trigger'" class="batch-card">
    <p class="card-text">📋 {{ t('batchFill.triggerTitle', { '{}': fieldCount }) }}</p>
    <p class="card-sub">{{ t('batchFill.triggerDesc') }}</p>
    <button class="card-btn" @click="emit('start')">
      {{ t('batchFill.startBtn', { '{}': fieldCount }) }}
    </button>
  </div>

  <!-- Loading state: show streaming JSON output in real-time -->
  <div v-else-if="state === 'loading'" class="batch-card">
    <p class="card-text">⏳ {{ t('batchFill.loadingTitle', { '{}': fieldCount }) }}</p>
    <pre v-if="streamContent" class="stream-output">{{ streamContent }}</pre>
    <p v-else class="card-sub waiting">Connecting to LLM...</p>
  </div>

  <!-- Done state: show summary + trace entry -->
  <div v-else class="batch-card">
    <p class="card-text">✅ {{ t('batchFill.doneTitle', { '{}': fieldCount }) }}</p>
    <div class="card-stats">
      <span v-if="highCount" class="stat high">🟢 {{ highCount }} {{ t('batchFill.autoFilled') }}</span>
      <span v-if="mediumCount" class="stat medium">🟡 {{ mediumCount }} {{ t('batchFill.needsReview') }}</span>
      <span v-if="lowCount" class="stat low">⚪ {{ lowCount }} {{ t('batchFill.lowConfidence') }}</span>
    </div>
    <div class="card-actions">
      <button class="card-btn" @click="emit('viewAll')">
        {{ t('batchFill.viewAllBtn') }}
      </button>
      <span
        v-if="traceSpanId"
        class="trace-entry"
        @click="handleOpenTrace"
        title="View trace details"
      >
        🔍
        <span v-if="modelName" class="trace-meta">{{ modelName }}</span>
      </span>
    </div>
  </div>

  <!-- Trace Detail Dialog -->
  <TraceDetailDialog
    v-if="showTraceDialog"
    :span="traceSpan"
    @close="handleCloseTrace"
  />
</template>

<style scoped>
.batch-card {
  max-width: 100%;
  padding: 10px 12px;
  background: var(--app-bg, #fff);
  border: 1px solid var(--border-light, #e2e8f0);
  border-left: 3px solid var(--accent, #667eea);
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-text);
}

.card-text {
  margin: 0 0 4px;
  font-size: 12px;
  font-weight: 500;
}

.card-sub {
  margin: 0 0 8px;
  font-size: 11px;
  color: var(--text-secondary, #666);
}

.card-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.stat {
  font-size: 11px;
  padding: 1px 5px;
  border-radius: 4px;
}

.stat.high { background: #e6f7e6; }
.stat.medium { background: #fff8e1; }
.stat.low { background: #f0f0f0; }

.card-btn {
  display: inline-block;
  padding: 5px 14px;
  font-size: 11px;
  font-weight: 500;
  border-radius: 6px;
  border: none;
  cursor: pointer;
  background: var(--accent, #667eea);
  color: #fff;
}

.card-btn:hover { opacity: 0.85; }

.card-btn.ghost {
  background: transparent;
  color: var(--text-secondary, #666);
  border: 1px solid var(--border-light, #e2e8f0);
}

.stream-output {
  margin: 6px 0 0;
  padding: 6px 8px;
  background: var(--app-bg, #fff);
  border: 1px solid var(--border-light, #e2e8f0);
  border-radius: 6px;
  font-family: 'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace;
  font-size: 10px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 160px;
  overflow-y: auto;
  color: var(--color-text, #333);
}

.waiting {
  margin: 4px 0 0;
  opacity: 0.6;
}

.card-btn.ghost:hover { background: #00000008; }

/* Card actions row */
.card-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* Trace entry */
.trace-entry {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #94a3b8;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  transition: all 0.12s;
  user-select: none;
}
.trace-entry:hover {
  background: #f1f5f9;
  color: #64748b;
}

.trace-meta {
  font-size: 10px;
  color: #94a3b8;
  font-family: 'SF Mono', 'Consolas', monospace;
}
</style>

