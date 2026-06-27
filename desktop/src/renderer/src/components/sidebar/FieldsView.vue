<script setup lang="ts">
import type { SimpleField } from '../../../../preload/index.d'
import { useI18n } from '../../composables/useI18n'

const { t } = useI18n()

defineProps<{
  fields: SimpleField[]
  /** Name or label of the currently focused field (from AI Tip) */
  activeFieldName?: string
}>()

function fieldTypeBadge(f: SimpleField): string {
  if (f.type === 'select-one' || f.type === 'select-multiple') return 'select'
  if (f.type === 'checkbox') return 'checkbox'
  if (f.type === 'radio') return 'radio'
  if (f.type === 'number') return 'number'
  if (f.type === 'date') return 'date'
  if (f.type === 'time') return 'time'
  if (f.type === 'range') return 'range'
  if (f.type === 'color') return 'color'
  return f.type
}

function fieldLabel(f: SimpleField): string {
  return f.label || f.placeholder || f.name || `#${f.id}`
}

function isActive(f: SimpleField, activeName?: string): boolean {
  if (!activeName) return false
  const fl = fieldLabel(f).toLowerCase()
  return fl === activeName.toLowerCase()
}
</script>

<template>
  <ul v-if="fields.length > 0" class="field-list">
    <li
      v-for="(f, i) in fields"
      :key="f.id || i"
      class="field-item"
      :class="{ active: isActive(f, activeFieldName) }"
    >
      <div class="field-header">
        <span class="field-type-badge">{{ fieldTypeBadge(f) }}</span>
        <span v-if="f.required" class="field-required" :title="t('fields.required')">*</span>
      </div>
      <span class="field-label-text">{{ fieldLabel(f) }}</span>
      <span v-if="f.value" class="field-value">{{ f.value }}</span>
    </li>
  </ul>
</template>

<style scoped>
.field-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.field-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  border-radius: 4px;
  transition: background 0.1s;
}

.field-item:hover {
  background: var(--btn-hover-bg);
}

.field-item.active {
  background: rgba(102, 126, 234, 0.08);
  border-left: 3px solid var(--accent-color, #667eea);
  padding-left: 5px;
}

.field-item + .field-item {
  border-top: 1px solid var(--border-light);
}

.field-header {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  min-width: 60px;
}

.field-type-badge {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  padding: 1px 6px;
  border-radius: 3px;
  background: var(--accent-bg);
  color: var(--accent-color);
}

.field-required {
  color: #ef4444;
  font-weight: 700;
  font-size: 13px;
  line-height: 1;
}

.field-label-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--color-text-secondary);
  font-weight: 500;
}

.field-value {
  font-size: 11px;
  color: var(--color-text-muted);
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono, 'SF Mono', 'Cascadia Code', monospace);
}
</style>
