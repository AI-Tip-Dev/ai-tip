<script setup lang="ts">
defineProps<{
  title?: string
  description?: string
}>()
</script>

<template>
  <div class="empty-placeholder">
    <div v-if="$slots.icon" class="empty-icon">
      <slot name="icon" />
    </div>
    <p v-if="title" class="empty-title">{{ title }}</p>
    <p v-if="description" class="empty-desc">{{ description }}</p>
    <slot />
  </div>
</template>

<style scoped>
.empty-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 24px 16px;
  border: 1px dashed var(--border-color);
  border-radius: 8px;
  background: var(--app-gray-50);
  text-align: center;
}

.empty-icon {
  color: var(--color-text-muted);
  opacity: 0.5;
  margin-bottom: 2px;
}

.empty-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.empty-desc {
  font-size: 11px;
  color: var(--color-text-muted);
  line-height: 1.5;
  max-width: 240px;
}
</style>
