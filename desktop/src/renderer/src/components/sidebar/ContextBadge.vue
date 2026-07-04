<script setup lang="ts">
/**
 * ContextBadge — Page context status bar (Overview + Field modes).
 *
 * Context sources (in priority order):
 *   1. Overview conversation AI reply  → 用户已在 Overview 中讨论和优化
 *   2. Auto-generated page summary     → 自动生成的 baseline
 *
 * States:
 *   1. Loading:     "⏳ Generating page context…" (auto-summary in flight)
 *   2. Error:       "⚠️ Failed to generate context" + retry button
 *   3. No context:  "📄 No page context available" (skipped / 0 fields)
 *   4. Collapsed:   "📎 Context from: Overview ▸"
 *   5. Expanded:    Full context text + action button
 */
import { computed, ref } from 'vue'

const props = defineProps<{
  /** The overview-derived or auto-generated context text */
  overviewContext: string
  /** Whether any context is available (auto or chat) */
  hasOverviewContext: boolean
  /** Whether auto-summary is currently loading */
  summaryLoading?: boolean
  /** Error message if auto-summary failed */
  summaryError?: string | null
  /** Whether at least one AI model is configured */
  hasModel?: boolean
}>()

const emit = defineEmits<{
  /** Navigate to Overview to refine the context */
  generate: []
  /** Retry page summarization */
  retry: []
  /** Open settings to configure an AI model */
  configureModel: []
}>()

/** True when no model is configured (special case — needs user action, not retry). Also requires hasModel=false so it auto-hides once the user configures a model. */
const isNoModel = computed(() => !props.hasModel && !props.hasOverviewContext && props.summaryError === 'NO_MODEL_CONFIGURED' && !props.summaryLoading)

/** True when summary failed for other reasons and user hasn't written anything in Overview */
const isError = computed(() => !props.hasOverviewContext && !!props.summaryError && !props.summaryLoading && props.summaryError !== 'NO_MODEL_CONFIGURED')

/** True when summary is in-flight */
const isLoading = computed(() => !props.hasOverviewContext && !!props.summaryLoading)

/** True when summary wasn't attempted (too few fields etc.) */
const isEmpty = computed(() => !props.hasOverviewContext && !props.summaryLoading && !props.summaryError)

const expanded = ref(false)
</script>

<template>
  <div class="context-badge" :class="{ expanded }">
    <!-- Loading: auto-summary in flight -->
    <div v-if="isLoading" class="cb-empty cb-loading">
      <span class="cb-icon">⏳</span>
      <span class="cb-label">Generating page context…</span>
    </div>

    <!-- No model configured: tip user to configure an AI model -->
    <div v-else-if="isNoModel" class="cb-empty cb-no-model">
      <span class="cb-icon">⚙️</span>
      <span class="cb-label">No AI model configured</span>
      <button class="cb-config-btn" @click.stop="emit('configureModel')">Configure Model</button>
    </div>

    <!-- Error: auto-summary failed (fetch error, timeout, etc.) -->
    <div v-else-if="isError" class="cb-empty cb-error">
      <span class="cb-icon">⚠️</span>
      <span class="cb-label">Failed to generate context</span>
      <button class="cb-retry-btn" @click.stop="emit('retry')">Retry</button>
    </div>

    <!-- Empty: summary skipped (too few fields, etc.) -->
    <div v-else-if="isEmpty" class="cb-empty cb-skipped">
      <span class="cb-icon">📄</span>
      <span class="cb-label">No page context available</span>
    </div>

    <!-- Has context: collapsed toggle -->
    <template v-else>
      <button class="cb-toggle" @click="expanded = !expanded">
        <span class="cb-icon">📎</span>
        <span class="cb-label">Context from: Overview</span>
        <svg
          class="cb-chevron"
          width="12" height="12"
          viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
        >
          <polyline v-if="!expanded" points="9 18 15 12 9 6" />
          <polyline v-else points="6 9 12 15 18 9" />
        </svg>
      </button>

      <!-- Expanded: full context text -->
      <div v-if="expanded" class="cb-body">
        <p class="cb-summary">{{ overviewContext }}</p>
        <div class="cb-actions">
          <button class="cb-action" @click="emit('generate')">Refine in Overview</button>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.context-badge {
  margin: 0 10px;
  border-bottom: 1px solid var(--border-light);
  flex-shrink: 0;
}

.cb-empty {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  font-size: 11px;
  color: var(--color-text-muted);
  background: #f0f4ff;
}

/* State variants */
.cb-loading {
  background: #f0f4ff;
  color: var(--color-text-muted);
}

.cb-error {
  background: #fff5f5;
  color: var(--color-error, #c0392b);
}

.cb-no-model {
  background: #fff8e1;
  color: #8d6e00;
}

.cb-skipped {
  background: #fafafa;
  color: var(--color-text-muted);
  font-style: italic;
}

.cb-retry-btn {
  flex-shrink: 0;
  padding: 2px 8px;
  border: 1px solid var(--color-error, #c0392b);
  border-radius: 4px;
  background: transparent;
  color: var(--color-error, #c0392b);
  font-family: inherit;
  font-size: 10px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.12s;
}
.cb-retry-btn:hover {
  background: var(--color-error, #c0392b);
  color: #fff;
}

.cb-config-btn {
  flex-shrink: 0;
  padding: 2px 8px;
  border: 1px solid #8d6e00;
  border-radius: 4px;
  background: transparent;
  color: #8d6e00;
  font-family: inherit;
  font-size: 10px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.12s;
}
.cb-config-btn:hover {
  background: #8d6e00;
  color: #fff;
}

.cb-icon {
  flex-shrink: 0;
  font-size: 12px;
}

.cb-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cb-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 6px 8px;
  border: none;
  background: var(--accent-bg);
  color: var(--accent-color);
  font-family: inherit;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  text-align: left;
  transition: background 0.12s;
}
.cb-toggle:hover {
  background: #d6e4ff;
}

.cb-chevron {
  flex-shrink: 0;
  opacity: 0.5;
}

.cb-body {
  padding: 8px 8px 8px;
  border-top: 1px solid var(--border-light);
  animation: cb-expand 0.15s ease-out;
}

@keyframes cb-expand {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

.cb-summary {
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-text-secondary);
  margin-bottom: 6px;
  white-space: pre-wrap;
  word-break: break-word;
}

.cb-actions {
  display: flex;
  gap: 6px;
}

.cb-action {
  padding: 3px 8px;
  border: 1px solid var(--border-light);
  border-radius: 4px;
  background: var(--app-white);
  color: var(--accent-color);
  font-family: inherit;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.12s;
}
.cb-action:hover {
  background: var(--accent-bg);
}
</style>
