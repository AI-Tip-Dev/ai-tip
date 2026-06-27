/**
 * @ai-tip/form-detection — Shared types
 */

/** Context about a form field collected from the DOM */
export interface FieldContext {
  tagName: string
  type: string
  name: string
  id: string
  placeholder: string
  value: string
  ariaLabel: string
  label: string
  formPurpose: string
  siblingLabels: string[]
  pageTitle: string
  pageUrl: string
  rect: { top: number; left: number; width: number; height: number }
}

/** Result of filling a field */
export interface FillResult {
  ok: boolean
  reason?: string
  label?: string
  error?: string
  stack?: string
}

/** A simplified form field (used by CDP detection and DOM scanning) */
export interface SimpleField {
  tagName: string
  type: string
  name: string
  id: string
  placeholder: string
  label: string
  required: boolean
  value: string
  visible: boolean
  backendNodeId: number | null
}
