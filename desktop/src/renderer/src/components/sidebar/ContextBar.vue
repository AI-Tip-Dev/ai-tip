<script setup lang="ts">
withDefaults(defineProps<{
  pageLabel?: string
}>(), {
  pageLabel: '',
})
</script>

<template>
  <div v-if="pageLabel" class="context-bar">
    <div class="context-row">
      <div class="context-item page-context">
        <span class="context-icon">🏷️</span>
        <span class="context-label">{{ pageLabel }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.context-bar {
  padding: 4px 12px;
  border-bottom: 1px solid var(--border-light);
  background: var(--app-gray-50, #f8fafc);
  font-size: 11px;
  line-height: 1.5;
  flex-shrink: 0;
}
.context-row {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}
.context-item {
  display: flex;
  align-items: center;
  gap: 3px;
}
.page-context {
  color: var(--accent-color, #3b82f6);
}
.context-icon {
  font-size: 11px;
}
.context-label {
  color: var(--color-text-secondary);
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
