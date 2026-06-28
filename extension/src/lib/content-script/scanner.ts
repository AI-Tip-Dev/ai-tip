/**
 * Content Script — Form Scanner
 * DOM-based form field detection with Shadow DOM penetration.
 */

const FIELD_SELECTOR = [
  'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"])',
  'textarea', 'select', '[contenteditable="true"]',
  '[role="textbox"]', '[role="combobox"]', '[role="spinbutton"]', '[role="searchbox"]', '[role="listbox"]',
].join(',')

const SENSITIVE_PATTERNS = /password|passwd|credit|card|cardnumber|cvv|cvc|ssn|social.security|secret|token|pin/i
const SMALL_FIELD_THRESHOLD = 100

interface DetectedField {
  label: string; type: string; required: boolean; value: string
  name?: string; id?: string; placeholder?: string
  rect?: { x: number; y: number; width: number; height: number }
}

export function scanFields(): DetectedField[] {
  const elements = querySelectorAllDeep(FIELD_SELECTOR)
  const fields: DetectedField[] = []
  for (const el of elements) {
    if (!isVisible(el) || !isFieldFillable(el)) continue
    const field = buildFieldInfo(el)
    if (field) fields.push(field)
  }
  return fields
}

function querySelectorAllDeep(selector: string): Element[] {
  const results: Element[] = []
  function collect(root: Document | Element | ShadowRoot): void {
    try {
      for (const el of root.querySelectorAll(selector)) results.push(el)
      for (const el of root.querySelectorAll('*')) {
        if ((el as any).shadowRoot) collect((el as any).shadowRoot)
      }
    } catch { /* cross-origin */ }
  }
  collect(document)
  return results
}

function isVisible(el: Element): boolean {
  const rect = el.getBoundingClientRect()
  if (rect.width === 0 || rect.height === 0) return false
  if (rect.width * rect.height < SMALL_FIELD_THRESHOLD) return false
  if (rect.bottom < -2000 || rect.top > window.innerHeight + 2000) return false
  const style = window.getComputedStyle(el)
  if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) return false
  let parent = el.parentElement
  while (parent) {
    const ps = window.getComputedStyle(parent)
    if (ps.display === 'none' || ps.visibility === 'hidden') return false
    parent = parent.parentElement
  }
  return true
}

function isFieldFillable(el: Element): boolean {
  if (el instanceof HTMLInputElement && el.type === 'password') return false
  const combined = `${(el as HTMLInputElement).name || ''} ${el.id || ''} ${(el as HTMLInputElement).placeholder || ''} ${el.getAttribute('aria-label') || ''}`
  return !SENSITIVE_PATTERNS.test(combined)
}

function buildFieldInfo(el: Element): DetectedField | null {
  const inputEl = el as HTMLInputElement
  const label = inferLabel(el)
  const type = inferType(el)
  const required = inputEl.required || el.getAttribute('aria-required') === 'true'
  const value = inputEl.value || (el as HTMLTextAreaElement).value || el.textContent?.trim() || ''
  const name = inputEl.name || undefined
  const id = el.id || undefined
  const placeholder = inputEl.placeholder || undefined
  if (!label && !name && !id && !placeholder) return null
  const rect = el.getBoundingClientRect()
  return { label, type, required, value, name, id: id || undefined, placeholder, rect: { x: Math.round(rect.x + window.scrollX), y: Math.round(rect.y + window.scrollY), width: Math.round(rect.width), height: Math.round(rect.height) } }
}

function inferLabel(el: Element): string {
  if (el.id) { const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`); if (l?.textContent?.trim()) return l.textContent.trim() }
  let parent = el.parentElement
  while (parent && parent !== document.body) {
    if (parent.tagName === 'LABEL') { const t = parent.textContent?.trim(); if (t) return t.replace(/\s+/g, ' ').slice(0, 100) }
    parent = parent.parentElement
  }
  const labelledBy = el.getAttribute('aria-labelledby')
  if (labelledBy) { const le = document.getElementById(labelledBy); if (le?.textContent?.trim()) return le.textContent.trim() }
  const ariaLabel = el.getAttribute('aria-label'); if (ariaLabel) return ariaLabel.trim()
  const placeholder = (el as HTMLInputElement).placeholder; if (placeholder) return placeholder.trim()
  return ((el as HTMLInputElement).name || el.id || '').replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function inferType(el: Element): string {
  if (el instanceof HTMLInputElement) return el.type || 'text'
  if (el instanceof HTMLTextAreaElement) return 'textarea'
  if (el instanceof HTMLSelectElement) return 'select'
  if (el.getAttribute('contenteditable') === 'true') return 'richtext'
  const role = el.getAttribute('role')
  if (role === 'combobox') return 'combobox'
  if (role === 'spinbutton') return 'number'
  if (role === 'searchbox') return 'search'
  return 'text'
}

export function buildAXTree(): string {
  const lines: string[] = []
  for (const f of scanFields()) {
    const parts: string[] = []
    if (f.label) parts.push(`label="${f.label}"`)
    if (f.type) parts.push(`type="${f.type}"`)
    if (f.required) parts.push('required')
    if (f.name) parts.push(`name="${f.name}"`)
    if (f.id) parts.push(`id="${f.id}"`)
    if (f.placeholder) parts.push(`placeholder="${f.placeholder}"`)
    lines.push(`field: ${parts.join(', ')}`)
  }
  return lines.join('\n')
}
