import { computed, type Ref } from 'vue'
import log from 'electron-log/renderer'
import type { RawAXNode } from '../../../preload/index.d'
import { FORM_AX_ROLES } from '../../../shared/ax-roles'

/** Maximum recursion depth to prevent stack overflow on deeply nested or cyclic AX trees */
const MAX_WALK_DEPTH = 200

export function useAXTree(rawAXNodes: Ref<RawAXNode[]>) {
  const axTreeText = computed<string>(() => {
    try {
      const nodes = rawAXNodes.value
      if (nodes.length === 0) return '(no AX nodes)'

      const nodeMap = new Map<string, RawAXNode>()
      const childToParent = new Map<string, string>()
      for (const n of nodes) {
        nodeMap.set(n.nodeId, n)
        for (const cid of n.childIds) {
          childToParent.set(cid, n.nodeId)
        }
      }

      const roots = nodes.filter((n) => !childToParent.has(n.nodeId))

      const lines: string[] = []
      const formCount = nodes.filter((n) => FORM_AX_ROLES.has(n.role)).length
      lines.push(
        `# AX Tree — ${nodes.length} nodes, ${formCount} form fields detected`
      )
      lines.push('')

      const visited = new Set<string>()

      function walk(nodeId: string, depth: number): void {
        // Guard: detect cycles (node already visited in current walk path)
        if (visited.has(nodeId)) {
          lines.push(`${'  '.repeat(depth)}(cycle → ${nodeId})`)
          return
        }
        // Guard: prevent stack overflow from excessively deep trees
        if (depth > MAX_WALK_DEPTH) {
          lines.push(`${'  '.repeat(depth)}(max depth reached, ${nodeId} not expanded)`)
          return
        }

        const n = nodeMap.get(nodeId)
        if (!n) {
          lines.push(`${'  '.repeat(depth)}(missing node: ${nodeId})`)
          return
        }

        visited.add(nodeId)

        const indent = '  '.repeat(depth)
        const isForm = FORM_AX_ROLES.has(n.role)

        let line = `${indent}${n.role}`
        if (n.name) line += ` "${n.name}"`
        if (n.value) line += ` value="${n.value}"`
        if (n.backendDOMNodeId) line += ` domId=${n.backendDOMNodeId}`
        if (isForm) line += ' [FORM]'
        if (n.childIds.length > 0) line += ` → ${n.childIds.length} children`

        lines.push(line)

        for (const cid of n.childIds) {
          walk(cid, depth + 1)
        }

        visited.delete(nodeId)
      }

      for (const r of roots) {
        walk(r.nodeId, 0)
      }

      return lines.join('\n')
    } catch (err) {
      log.error('useAXTree: computed failed:', err)
      return `(Error building AX tree: ${err instanceof Error ? err.message : String(err)})`
    }
  })

  return { axTreeText }
}
