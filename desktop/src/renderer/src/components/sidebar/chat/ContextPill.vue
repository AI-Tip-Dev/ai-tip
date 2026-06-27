<script setup lang="ts">
/**
 * ContextPill — Compact dismissible field-context chip.
 *
 * Replaces the large AITipBanner with a single-line pill that sits
 * right above the chat input. Shows: field label, type badge,
 * form purpose (if known), and a dismiss button.
 *
 * Design ref: ChatGPT file/GPT pills, Claude project context chips
 */
import type { FieldContext } from '../../../../../preload/index.d'
import { useI18n } from '../../../composables/useI18n'

const { t } = useI18n()

defineProps<{
  context: FieldContext
  isLoading?: boolean
}>()

const emit = defineEmits<{
  dismiss: []
}>()

function fieldLabel(ctx: FieldContext): string {
  return ctx.label || ctx.placeholder || ctx.name || t('aiTip.thisField')
}

function fieldKey(ctx: FieldContext): string {
  return ctx.id || ctx.name || ctx.label || ctx.placeholder || t('misc.unknown')
}
</script>

<template>
  <Transition name="pill-switch" mode="out-in">
    <div v-if="context" :key="fieldKey(context)" class="context-pill-row">
      <div class="context-pill" :class="{ loading: isLoading }">
        <!-- Sparkle icon -->
        <span class="pill-icon">✨</span>

        <!-- Label -->
        <span class="pill-label">{{ fieldLabel(context) }}</span>

        <!-- Type badge -->
        <span class="pill-badge type">{{ context.type }}</span>

        <!-- Purpose badge (if known) -->
        <span
          v-if="context.formPurpose && context.formPurpose !== 'unknown'"
          class="pill-badge purpose"
        >
          {{ context.formPurpose }}
        </span>

        <!-- Loading spinner -->
        <span v-if="isLoading" class="pill-spinner" />

        <!-- Dismiss -->
        <button
          class="pill-dismiss"
          :disabled="isLoading"
          :title="t('context.clear')"
          @click="emit('dismiss')"
        >
          ✕
        </button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.context-pill-row {
  padding: 0 12px 4px;
  flex-shrink: 0;
}

.context-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 6px 4px 8px;
  border-radius: 20px;
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.08) 100%);
  border: 1px solid rgba(102, 126, 234, 0.25);
  font-size: 11px;
  max-width: 100%;
  transition: opacity 0.2s;
}
.context-pill.loading {
  opacity: 0.65;
  pointer-events: none;
}

.pill-icon {
  font-size: 12px;
  flex-shrink: 0;
}

.pill-label {
  font-weight: 600;
  color: var(--color-text, #1f2937);
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pill-badge {
  padding: 0px 5px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 500;
  white-space: nowrap;
  flex-shrink: 0;
}
.pill-badge.type {
  background: rgba(102, 126, 234, 0.18);
  color: #5b6be6;
}
.pill-badge.purpose {
  background: rgba(118, 75, 162, 0.15);
  color: #764ba2;
}

.pill-spinner {
  width: 12px;
  height: 12px;
  border: 2px solid rgba(102, 126, 234, 0.25);
  border-top-color: #667eea;
  border-radius: 50%;
  animation: pill-spin 0.6s linear infinite;
  flex-shrink: 0;
}
@keyframes pill-spin {
  to { transform: rotate(360deg); }
}

.pill-dismiss {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  padding: 0;
  margin-left: 2px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--color-text-muted, #9ca3af);
  cursor: pointer;
  font-size: 9px;
  line-height: 1;
  flex-shrink: 0;
  transition: background 0.12s, color 0.12s;
}
.pill-dismiss:hover:not(:disabled) {
  background: rgba(102, 126, 234, 0.15);
  color: #667eea;
}

/* Transition: slide up out / slide down in on field switch */
.pill-switch-enter-active {
  transition: all 0.2s ease-out;
}
.pill-switch-leave-active {
  transition: all 0.15s ease-in;
}
.pill-switch-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.pill-switch-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

/* Keep old pill-slide for dismiss (v-if toggling) */
.pill-slide-enter-active {
  transition: all 0.2s ease-out;
}
.pill-slide-leave-active {
  transition: all 0.15s ease-in;
}
.pill-slide-enter-from,
.pill-slide-leave-to {
  opacity: 0;
  transform: translateY(-4px);
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
  margin-bottom: 0;
}
</style>
