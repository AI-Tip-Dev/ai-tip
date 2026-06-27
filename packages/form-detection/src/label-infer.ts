/**
 * @ai-tip/form-detection — Label inference
 *
 * 6-strategy label detection chain (same logic as auto.ts).
 */

import type { FieldContext } from './types'

/**
 * Infer a human-readable label for a form field.
 * Priority chain: <label for> → parent <label> → aria-labelledby → aria-label → previous sibling → placeholder
 */
export function inferLabel(el: HTMLElement): string {
  const id = el.id
  const inputEl = el as HTMLInputElement

  // 1. <label for="...">
  if (id) {
    try {
      const labelEl = document.querySelector(
        'label[for="' + id.replace(/"/g, '\\"') + '"]',
      )
      if (labelEl) return (labelEl.textContent || '').trim()
    } catch {
      /* skip */
    }
  }

  // 2. Wrapped in <label>
  const parentLabel = el.closest('label')
  if (parentLabel) {
    const val = inputEl.value || ''
    return (parentLabel.textContent || '').replace(val, '').trim()
  }

  // 3. aria-labelledby
  const ariaLabelledBy = el.getAttribute('aria-labelledby')
  if (ariaLabelledBy) {
    const refEl = document.getElementById(ariaLabelledBy)
    if (refEl) return (refEl.textContent || '').trim()
  }

  // 4. aria-label
  const ariaLabel = el.getAttribute('aria-label')
  if (ariaLabel) return ariaLabel.trim()

  // 5. Previous sibling heuristic
  const prev = el.previousElementSibling
  if (
    prev &&
    prev.tagName !== 'INPUT' &&
    prev.tagName !== 'TEXTAREA' &&
    prev.tagName !== 'SELECT'
  ) {
    return (prev.textContent || '').trim().slice(0, 80)
  }

  // 6. Placeholder fallback
  return inputEl.placeholder || ''
}

/**
 * Collect sibling labels from the same form/container.
 * Returns up to 10 nearby labels for context.
 */
export function collectSiblingLabels(el: HTMLElement): string[] {
  const labels: string[] = []
  const form = el.closest('form')
  const container = form || el.parentElement
  if (!container) return labels

  const inputs = container.querySelectorAll(
    'input, textarea, select, [contenteditable]',
  )
  for (let i = 0; i < inputs.length; i++) {
    const inp = inputs[i] as HTMLInputElement
    if (inp === el) continue
    const sl =
      (inp.labels?.[0]?.textContent ?? '').trim() ||
      inp.getAttribute('aria-label') ||
      inp.placeholder ||
      inp.getAttribute('name') ||
      ''
    if (sl.length > 1 && sl.length < 60) labels.push(sl)
  }
  return labels.slice(0, 10)
}

/**
 * Infer the purpose of the form containing this field.
 */
export function inferFormPurpose(el: HTMLElement): string {
  const form = el.closest('form')
  if (!form) return 'unknown'

  const ft = (form.textContent || '').toLowerCase()
  const fa = (form.action || '').toLowerCase()
  const fi = (form.id || '').toLowerCase()
  const combined = ft + ' ' + fa + ' ' + fi

  if (/sign.?in|log.?in|signin/i.test(combined)) return 'login'
  if (/sign.?up|register|create.account/i.test(combined)) return 'register'
  if (/search/i.test(combined)) return 'search'
  if (/contact|message|feedback/i.test(combined)) return 'contact'
  if (/checkout|payment|billing|shipping/i.test(combined)) return 'checkout'
  if (/subscribe|newsletter/i.test(combined)) return 'subscribe'
  if (/settings|preference|profile/i.test(combined)) return 'settings'
  return 'unknown'
}

/**
 * Build a full FieldContext from a DOM element (combines all strategies).
 */
export function buildFieldContext(el: HTMLElement): FieldContext {
  const tagName = el.tagName.toLowerCase()
  const isCE = el.getAttribute('contenteditable') === 'true'
  const inputEl = el as HTMLInputElement
  const rect = el.getBoundingClientRect()

  return {
    tagName,
    type: isCE ? 'richtext' : inputEl.type || 'text',
    name: el.getAttribute('name') || '',
    id: el.id,
    placeholder: inputEl.placeholder || '',
    value: (inputEl.value || el.textContent || '').slice(0, 200),
    ariaLabel: el.getAttribute('aria-label') || '',
    label: inferLabel(el),
    formPurpose: inferFormPurpose(el),
    siblingLabels: collectSiblingLabels(el),
    pageTitle: document.title,
    pageUrl: window.location.href,
    rect: {
      top: Math.round(rect.top),
      left: Math.round(rect.left),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    },
  }
}
