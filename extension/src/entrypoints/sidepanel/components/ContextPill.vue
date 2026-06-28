<script setup lang="ts">
/**
 * ContextPill — Compact field-context chip above chat input.
 *
 * Shows ✨ field label, type badge, and a dismiss button
 * when a field is active for AI Tip.
 */
defineProps<{
  fieldLabel: string
  fieldType?: string
  isLoading?: boolean
}>()

const emit = defineEmits<{
  dismiss: []
}>()
</script>

<template>
  <Transition name="pill" mode="out-in">
    <div v-if="fieldLabel" class="context-pill-row">
      <div class="context-pill" :class="{ loading: isLoading }">
        <span class="pill-icon">✨</span>
        <span class="pill-label">{{ fieldLabel }}</span>
        <span v-if="fieldType" class="pill-badge">{{ fieldType }}</span>
        <span v-if="isLoading" class="pill-spinner" />
        <button class="pill-dismiss" :disabled="isLoading" title="Clear" @click="emit('dismiss')">✕</button>
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

.pill-icon { font-size: 12px; flex-shrink: 0; }

.pill-label {
  font-weight: 600;
  color: #1f2937;
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
  background: rgba(102, 126, 234, 0.18);
  color: #5b6be6;
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
@keyframes pill-spin { to { transform: rotate(360deg); } }

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
  color: #9ca3af;
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

.pill-enter-active { transition: all 0.2s ease-out; }
.pill-leave-active { transition: all 0.15s ease-in; }
.pill-enter-from, .pill-leave-to { opacity: 0; transform: translateY(-8px); }
</style>
