/**
 * @ai-tip/form-detection — AX Tree text builder
 *
 * Build a structured text representation of form fields for LLM context.
 */

import type { SimpleField } from './types'

/**
 * Raw accessibility tree node (from CDP or DOM scanning).
 */
export interface RawAXNode {
  nodeId: string
  role: string
  name: string
  value: string
  backendDOMNodeId: number | null
  childIds: string[]
  isFormField: boolean
}

/**
 * Build a structured text representation of detected fields.
 * This is fed to the LLM as part of the page context.
 */
export function buildAXTreeText(fields: SimpleField[]): string {
  if (fields.length === 0) return 'No form fields detected on this page.'

  const lines: string[] = [`Found ${fields.length} form fields:\n`]

  for (let i = 0; i < fields.length; i++) {
    const f = fields[i]
    const req = f.required ? ' [REQUIRED]' : ''
    lines.push(
      `[${i + 1}] ${f.label || '(unnamed)'} — ${f.tagName}[type=${f.type}] name="${f.name}"${req}`,
    )
    if (f.placeholder) lines.push(`    placeholder: "${f.placeholder}"`)
    if (f.value) lines.push(`    current value: "${f.value}"`)
  }

  return lines.join('\n')
}
