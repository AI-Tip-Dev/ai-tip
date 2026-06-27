<script setup lang="ts">
import { computed } from 'vue'
import log from 'electron-log/renderer'
import type { RawAXNode } from '../../../../preload/index.d'
import { FORM_AX_ROLES } from '../../../../shared/ax-roles'
import { useI18n } from '../../composables/useI18n'

const { t } = useI18n()

const props = defineProps<{
  rawAXNodes: RawAXNode[]
}>()

const nodeCount = computed(() => props.rawAXNodes.length)

const axTreeText = computed<string>(() => {
  const nodes = props.rawAXNodes
  if (nodes.length === 0) return ''

  const nodeMap = new Map<string, RawAXNode>()
  const childToParent = new Map<string, string>()
  for (const n of nodes) {
    nodeMap.set(n.nodeId, n)
    for (const cid of n.childIds) {
      childToParent.set(cid, n.nodeId)
    }
  }

  const roots = nodes.filter((n) => !childToParent.has(n.nodeId))
  const formCount = nodes.filter((n) => FORM_AX_ROLES.has(n.role)).length

  const lines: string[] = [
    `# AX Tree — ${nodes.length} nodes, ${formCount} form fields detected`,
    ''
  ]

  function walk(nodeId: string, depth: number, visited: Set<string>): void {
    if (visited.has(nodeId)) return
    const n = nodeMap.get(nodeId)
    if (!n) return

    visited.add(nodeId)

    const indent = '  '.repeat(depth)
    const isForm = FORM_AX_ROLES.has(n.role)

    let line = `${indent}${n.role}`
    if (n.name) line += ` "${n.name}"`
    if (n.value) line += ` value="${n.value}"`
    if (isForm) line += ' [FORM]'

    lines.push(line)

    for (const cid of n.childIds) {
      walk(cid, depth + 1, visited)
    }
  }

  const visited = new Set<string>()
  for (const r of roots) {
    walk(r.nodeId, 0, visited)
  }

  return lines.join('\n')
})

function copyAxTreeText(): void {
  navigator.clipboard.writeText(axTreeText.value).catch((e) => {
    log.error('copyAxTreeText failed:', e)
  })
}
</script>

<template>
  <div class="ax-text-toolbar">
    <span class="ax-text-info">{{ nodeCount }}{{ t('fields.nodesInfo') }}</span>
    <button class="action-btn small" @click="copyAxTreeText">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      {{ t('fields.copy') }}
    </button>
  </div>
  <textarea
    readonly
    class="ax-text-area"
    :value="axTreeText"
    spellcheck="false"
  ></textarea>
</template>

<style scoped>
.ax-text-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.ax-text-info {
  font-size: 10px;
  color: var(--color-text-muted);
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

.ax-text-area {
  width: 100%;
  height: 380px;
  padding: 8px;
  border: 1px solid var(--input-border);
  border-radius: 4px;
  background: var(--app-gray-50);
  color: var(--color-text-secondary);
  font-family: var(--font-mono, 'SF Mono', 'Cascadia Code', 'Consolas', monospace);
  font-size: 11px;
  line-height: 1.5;
  resize: vertical;
  tab-size: 2;
  white-space: pre;
  overflow-wrap: normal;
  overflow-x: auto;
}

.ax-text-area:focus {
  outline: none;
  border-color: var(--accent-color);
}
</style>
