<script setup lang="ts">
/**
 * BatchFillCard — Batch pre-fill UI card.
 *
 * Three states:
 *   'trigger' — Prompt user to start batch fill
 *   'loading' — Show streaming JSON output in real-time
 *   'done'    — Show confidence stats (🟢🟡⚪)
 */
import { computed } from 'vue'

const props = defineProps<{
  state: 'trigger' | 'loading' | 'done'
  fieldCount: number
  highCount?: number
  mediumCount?: number
  lowCount?: number
  /** Streaming partial JSON from LLM */
  streamContent?: string
}>()

const emit = defineEmits<{
  start: []
  cancel: []
  viewAll: []
}>()

const fieldLabel = computed(() => `${props.fieldCount} field${props.fieldCount > 1 ? 's' : ''}`)
</script>

<template>
  <!-- Trigger state -->
  <div v-if="state === 'trigger'" class="batch-card">
    <p class="card-text">📋 Smart pre-fill {{ fieldLabel }}?</p>
    <p class="card-sub">AI will analyze the form and suggest values for all fields at once.</p>
    <button class="card-btn" @click="emit('start')">
      Start Batch Fill
    </button>
  </div>

  <!-- Loading state -->
  <div v-else-if="state === 'loading'" class="batch-card">
    <p class="card-text">⏳ Filling {{ fieldLabel }}...</p>
    <pre v-if="streamContent" class="stream-output">{{ streamContent }}</pre>
    <p v-else class="card-sub waiting">Connecting to LLM...</p>
    <button class="card-btn secondary" @click="emit('cancel')">Cancel</button>
  </div>

  <!-- Done state -->
  <div v-else class="batch-card">
    <p class="card-text">✅ Batch fill complete</p>
    <div class="card-stats">
      <span v-if="highCount" class="stat high">🟢 {{ highCount }} auto-filled</span>
      <span v-if="mediumCount" class="stat medium">🟡 {{ mediumCount }} needs review</span>
      <span v-if="lowCount" class="stat low">⚪ {{ lowCount }} low confidence</span>
    </div>
    <div class="card-actions">
      <button class="card-btn" @click="emit('viewAll')">View All</button>
    </div>
  </div>
</template>

<style scoped>
.batch-card {
  max-width: 100%;
  padding: 10px 12px;
  margin-bottom: 8px;
  background: #fff;
  border: 1px solid #e2e5e9;
  border-left: 3px solid #667eea;
  border-radius: 8px;
  font-size: 12px;
}

.card-text {
  font-weight: 600;
  color: #1f2937;
  margin: 0 0 4px;
  font-size: 13px;
}

.card-sub {
  color: #6b7280;
  font-size: 11px;
  margin: 0 0 8px;
}

.card-sub.waiting {
  font-style: italic;
  color: #9ca3af;
}

.stream-output {
  background: #f9fafb;
  border: 1px solid #e2e5e9;
  border-radius: 6px;
  padding: 8px;
  margin-bottom: 8px;
  font-family: 'SF Mono', 'Menlo', monospace;
  font-size: 11px;
  max-height: 160px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-all;
  color: #374151;
}

.card-btn {
  padding: 5px 14px;
  border: none;
  border-radius: 6px;
  background: #667eea;
  color: #fff;
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.12s;
}
.card-btn:hover {
  background: #5b6be6;
}
.card-btn.secondary {
  background: #e2e5e9;
  color: #374151;
}
.card-btn.secondary:hover {
  background: #d1d5db;
}

.card-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.stat {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 12px;
  font-weight: 500;
}
.stat.high { background: #d1fae5; color: #065f46; }
.stat.medium { background: #fef3c7; color: #92400e; }
.stat.low { background: #f3f4f6; color: #6b7280; }

.card-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
