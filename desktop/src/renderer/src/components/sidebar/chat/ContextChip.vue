<script setup lang="ts">
/**
 * ContextChip — Context source chip shown in BotMessage footer.
 *
 * Only rendered for Field-mode assistant messages that used Page Context.
 * Clicking expands the parent ContextBadge.
 */
defineProps<{
  sourceTitle: string
}>()

const emit = defineEmits<{
  click: []
}>()
</script>

<template>
  <button class="context-chip" @click="emit('click')">
    <span class="cc-icon">📎</span>
    <span class="cc-label">Source: {{ sourceTitle }}</span>
    <svg class="cc-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  </button>
</template>

<style scoped>
.context-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
  padding: 3px 8px;
  border: 1px solid var(--accent-ring);
  border-radius: 12px;
  background: var(--accent-bg);
  color: var(--accent-color);
  font-family: inherit;
  font-size: 10px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.12s;
}
.context-chip:hover {
  background: #d6e4ff;
}

.cc-icon {
  font-size: 10px;
  flex-shrink: 0;
}

.cc-chevron {
  flex-shrink: 0;
  opacity: 0.5;
}
</style>
