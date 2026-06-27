<script setup lang="ts">
import { ref } from 'vue'
import CollapsiblePanel from '../shared/CollapsiblePanel.vue'
import EmptyPlaceholder from '../shared/EmptyPlaceholder.vue'
import FieldsView from './FieldsView.vue'
import TreeView from './TreeView.vue'
import type { SimpleField, RawAXNode } from '../../../../preload/index.d'
import { useI18n } from '../../composables/useI18n'

defineProps<{
  detectedFields: SimpleField[]
  rawAXNodes: RawAXNode[]
  /** Label of the currently AI-Tip-focused field */
  activeFieldName?: string
}>()

const emit = defineEmits<{
  rescan: []
}>()

const expanded = ref(false)
const fieldsViewMode = ref<'fields' | 'tree'>('fields')
const { t } = useI18n()
</script>

<template>
  <CollapsiblePanel :expanded="expanded" @toggle="expanded = !expanded">
    <template #icon>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
    </template>
    <template #label>{{ t('fields.title') }}</template>
    <template #badge>{{ detectedFields.length }}</template>

    <!-- Toolbar: Rescan + View toggle -->
    <div class="fields-toolbar">
      <div class="view-toggle">
        <button
          class="toggle-btn"
          :class="{ active: fieldsViewMode === 'fields' }"
          @click="fieldsViewMode = 'fields'"
        >{{ t('fields.tabFields') }}</button>
        <button
          class="toggle-btn"
          :class="{ active: fieldsViewMode === 'tree' }"
          @click="fieldsViewMode = 'tree'"
        >{{ t('fields.tabTree') }}</button>
      </div>
      <button class="action-btn small" @click="$emit('rescan')">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
      </button>
    </div>

    <!-- Fields View -->
    <template v-if="fieldsViewMode === 'fields'">
      <EmptyPlaceholder
        v-if="detectedFields.length === 0"
        :title="t('fields.empty')"
        :description="t('fields.emptyDesc')"
      >
        <template #icon>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
        </template>
      </EmptyPlaceholder>
      <FieldsView v-else :fields="detectedFields" :active-field-name="activeFieldName" />
    </template>

    <!-- Tree View -->
    <template v-if="fieldsViewMode === 'tree'">
      <EmptyPlaceholder
        v-if="rawAXNodes.length === 0"
        :description="t('fields.noAxData')"
      />
      <TreeView v-else :raw-a-x-nodes="rawAXNodes" />
    </template>
  </CollapsiblePanel>
</template>

<style scoped>
.fields-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.view-toggle {
  display: flex;
  gap: 0;
  border: 1px solid var(--input-border);
  border-radius: 4px;
  overflow: hidden;
}

.toggle-btn {
  padding: 3px 10px;
  border: none;
  background: transparent;
  font-size: 11px;
  font-weight: 500;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all 0.12s;
}

.toggle-btn:hover {
  background: var(--btn-hover-bg);
  color: var(--color-text);
}

.toggle-btn.active {
  background: var(--accent-color);
  color: #fff;
}

.action-btn.small {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  font-size: 11px;
  border: 1px solid var(--input-border);
  border-radius: 5px;
  background: var(--app-white);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.12s;
  white-space: nowrap;
}

.action-btn.small:hover {
  border-color: var(--accent-color);
  color: var(--accent-color);
}
</style>
