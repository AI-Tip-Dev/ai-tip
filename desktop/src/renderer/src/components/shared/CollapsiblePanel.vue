<script setup lang="ts">
defineProps<{
  expanded: boolean
}>()

defineEmits<{
  toggle: []
}>()
</script>

<template>
  <section class="panel" :class="{ collapsed: !expanded }">
    <button class="panel-toggle" @click="$emit('toggle')">
      <slot name="icon" />
      <span class="panel-label"><slot name="label" /></span>
      <span class="panel-badge"><slot name="badge" /></span>
      <svg class="panel-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>
    <div v-if="expanded" class="panel-content">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.panel {
  border-bottom: 1px solid var(--border-light, #e5e7eb);
  background: var(--app-white, #fff);
  transition: background 0.15s;
}

.panel:first-child {
  border-top: 1px solid var(--border-light, #e5e7eb);
}

.panel.collapsed .panel-chevron {
  transform: rotate(-90deg);
}

.panel-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 14px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary, #6b7280);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.12s;
  text-align: left;
}

.panel-toggle:hover {
  color: var(--color-text, #1a1d20);
  background: var(--app-gray-50, #f8f9fa);
}

.panel-label {
  flex: 1;
}

.panel-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 10px;
  background: var(--accent-bg, #e8f0fe);
  color: var(--accent-color, #3b82f6);
  min-width: 22px;
  text-align: center;
  line-height: 1.5;
}

.panel-chevron {
  flex-shrink: 0;
  transition: transform 0.18s ease;
  opacity: 0.4;
  color: currentColor;
}

.panel-content {
  padding: 0 14px 12px;
  animation: panel-expand 0.18s ease-out;
}

@keyframes panel-expand {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
