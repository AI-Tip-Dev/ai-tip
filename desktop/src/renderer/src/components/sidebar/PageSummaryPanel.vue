<script setup lang="ts">
/**
 * PageSummaryPanel — Collapsible panel showing AI's understanding of the page.
 * Polished card-style design with gradient background and clean typography.
 *
 * Three states: loading → success (with refresh) → error (with retry)
 * Defaults to expanded when summary is available, collapsed when loading/error.
 */
import { ref, watch } from 'vue'
import CollapsiblePanel from '../shared/CollapsiblePanel.vue'
import { useI18n } from '../../composables/useI18n'

const props = defineProps<{
  summary: string | null
  loading: boolean
  error: string | null
}>()

const emit = defineEmits<{
  retry: []
}>()

const { t } = useI18n()
const expanded = ref(false)

// Auto-expand when summary becomes available
watch(() => props.summary, (val) => {
  if (val) expanded.value = true
})
</script>

<template>
  <CollapsiblePanel :expanded="expanded" @toggle="expanded = !expanded">
    <template #icon>
      <span class="ps-header-icon">🤖</span>
    </template>
    <template #label>
      <span class="ps-header-label">{{ t('summary.title') }}</span>
    </template>
    <template #badge>
      <span v-if="loading" class="ps-badge ps-badge--loading">{{ t('summary.badgeLoading') }}</span>
      <span v-else-if="error" class="ps-badge ps-badge--error">!</span>
      <span v-else-if="summary" class="ps-badge ps-badge--ok">✓</span>
    </template>

    <!-- Loading -->
    <div v-if="loading" class="ps-body">
      <div class="ps-state ps-loading">
        <span class="ps-state-icon">⏳</span>
        <span class="ps-state-text">{{ t('summary.loading') }}</span>
      </div>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="ps-body">
      <div class="ps-state ps-error">
        <span class="ps-state-icon">⚠️</span>
        <span class="ps-state-text">{{ t('summary.error') }}</span>
        <button class="ps-action-btn" @click.stop="emit('retry')">{{ t('summary.retry') }}</button>
      </div>
    </div>

    <!-- Success -->
    <div v-else-if="summary" class="ps-body">
      <div class="ps-summary-card">
        <p class="ps-summary-text">{{ summary }}</p>
        <button class="ps-refresh-btn" :title="t('summary.refresh')" @click.stop="emit('retry')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
        </button>
      </div>
    </div>

    <!-- Empty (no summary yet) -->
    <div v-else class="ps-body">
      <p class="ps-empty">{{ t('summary.emptyHint') }}</p>
    </div>
  </CollapsiblePanel>
</template>

<style scoped>
/* ── Header ── */
.ps-header-icon {
  font-size: 14px;
  line-height: 1;
}

.ps-header-label {
  font-weight: 600;
}

/* ── Body wrapper ── */
.ps-body {
  padding: 2px 0;
}

/* ── Summary card (success state) ── */
.ps-summary-card {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px 14px;
  border-radius: 10px;
  background: linear-gradient(135deg, #f0f7ff 0%, #f8fbff 100%);
  border: 1px solid #dceeff;
}

.ps-summary-text {
  flex: 1;
  margin: 0;
  font-size: 12px;
  line-height: 1.65;
  color: var(--color-text, #1a1d20);
}

/* ── Refresh button ── */
.ps-refresh-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: 1px solid #c8ddf5;
  border-radius: 7px;
  background: #fff;
  color: var(--accent-color, #3b82f6);
  cursor: pointer;
  transition: all 0.15s;
  margin-top: 1px;
}
.ps-refresh-btn:hover {
  background: var(--accent-color, #3b82f6);
  color: #fff;
  border-color: var(--accent-color, #3b82f6);
}

/* ── State rows (loading / error / empty) ── */
.ps-state {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 10px;
  font-size: 12px;
  line-height: 1.5;
}

.ps-state-icon {
  flex-shrink: 0;
  font-size: 14px;
  line-height: 1;
}

.ps-state-text {
  flex: 1;
}

/* Loading */
.ps-loading {
  background: #f8fafc;
  border: 1px solid var(--border-light, #e5e7eb);
  color: var(--color-text-muted, #9ca3af);
}

/* Error */
.ps-error {
  background: #fffbeb;
  border: 1px solid #fde68a;
  color: #92400e;
}

/* ── Action button ── */
.ps-action-btn {
  flex-shrink: 0;
  padding: 4px 12px;
  border: 1px solid #fcd34d;
  border-radius: 6px;
  background: #fff;
  color: #92400e;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.12s;
  white-space: nowrap;
}
.ps-action-btn:hover {
  background: #f59e0b;
  color: #fff;
  border-color: #f59e0b;
}

/* ── Badge ── */
.ps-badge--loading {
  background: #e5e7eb;
  color: #6b7280;
}

.ps-badge--error {
  background: #fef3c7;
  color: #92400e;
}

.ps-badge--ok {
  background: #d1fae5;
  color: #059669;
}

/* ── Empty hint ── */
.ps-empty {
  margin: 0;
  padding: 8px 14px;
  font-size: 11px;
  color: var(--color-text-muted, #9ca3af);
  font-style: italic;
}
</style>
