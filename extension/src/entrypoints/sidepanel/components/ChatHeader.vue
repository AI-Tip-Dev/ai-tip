<script setup lang="ts">
/**
 * ChatHeader — Breadcrumb navigation for session context.
 *
 * Shows: 🏠 Page Title › ✨ Field Name
 * Clicking 🏠 goes back to Overview/home.
 */
import type { SessionKey } from '../composables/useSession'

defineProps<{
  pageTitle: string
  activeKey: SessionKey | null
  activeFieldLabel?: string
  /** Model display info */
  modelName?: string
  hasModel?: boolean
}>()

const emit = defineEmits<{
  backToOverview: []
}>()
</script>

<template>
  <div class="chat-header">
    <div class="breadcrumb">
      <button class="crumb home" @click="emit('backToOverview')" title="Back to Overview">
        🏠
      </button>
      <span class="crumb-sep">›</span>
      <span class="crumb page">{{ pageTitle }}</span>
      <template v-if="activeKey?.type === 'field'">
        <span class="crumb-sep">›</span>
        <span class="crumb field">✨ {{ activeFieldLabel || activeKey.fieldName }}</span>
      </template>
      <!-- Model status -->
      <span v-if="!hasModel" class="model-warn" title="No model configured">⚠️ No model</span>
      <span v-else-if="modelName" class="model-ok">{{ modelName }}</span>
    </div>
  </div>
</template>

<style scoped>
.chat-header {
  padding: 6px 12px;
  border-bottom: 1px solid var(--border-light, #e2e5e9);
  flex-shrink: 0;
  background: var(--app-white, #fff);
}

.breadcrumb {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  overflow: hidden;
}

.crumb {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.crumb.home {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  padding: 2px 4px;
  border-radius: 4px;
  flex-shrink: 0;
}
.crumb.home:hover {
  background: var(--app-gray-100, #f0f0f0);
}

.crumb-sep {
  color: var(--color-text-muted, #9ca3af);
  flex-shrink: 0;
}

.crumb.page {
  color: var(--color-text-secondary, #6b7280);
  font-weight: 500;
}

.crumb.field {
  color: var(--accent-color, #3b82f6);
  font-weight: 600;
}

.model-warn {
  margin-left: auto;
  font-size: 10px;
  color: #f59e0b;
  background: #fef3c7;
  padding: 2px 7px;
  border-radius: 10px;
  font-weight: 500;
  flex-shrink: 0;
  cursor: pointer;
}

.model-ok {
  margin-left: auto;
  font-size: 10px;
  color: #059669;
  background: #d1fae5;
  padding: 2px 7px;
  border-radius: 10px;
  font-weight: 500;
  flex-shrink: 0;
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
