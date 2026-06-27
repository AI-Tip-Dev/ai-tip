/**
 * @ai-tip/form-detection — DOM field scanning
 */

import { FIELD_SELECTOR } from './constants'
import { inferLabel } from './label-infer'
import { isVisible } from './visibility'
import type { SimpleField } from './types'

/**
 * Query all form fields, including those inside Shadow DOM.
 */
export function querySelectorAllDeep(selector: string): HTMLElement[] {
  const results: HTMLElement[] = []

  function scan(root: Document | ShadowRoot | Element): void {
    try {
      const els = root.querySelectorAll(selector)
      for (let i = 0; i < els.length; i++) {
        results.push(els[i] as HTMLElement)
      }
    } catch {
      /* skip invalid selectors in cross-origin frames */
    }

    // Recurse into shadow roots
    const all = root.querySelectorAll('*')
    for (let i = 0; i < all.length; i++) {
      const el = all[i]
      if (el.shadowRoot) {
        scan(el.shadowRoot)
      }
    }
  }

  scan(document)
  return results
}

/**
 * Detect all visible form fields on the page.
 */
export function detectFields(): SimpleField[] {
  const els = querySelectorAllDeep(FIELD_SELECTOR)
  const fields: SimpleField[] = []

  for (const el of els) {
    const inputEl = el as HTMLInputElement
    const visible = isVisible(el)
    // Skip hidden fields
    if (!visible) continue

    const type =
      el.getAttribute('contenteditable') === 'true'
        ? 'richtext'
        : inputEl.type || 'text'

    fields.push({
      tagName: el.tagName.toLowerCase(),
      type,
      name: el.getAttribute('name') || '',
      id: el.id,
      placeholder: inputEl.placeholder || '',
      label: inferLabel(el),
      required: el.getAttribute('required') !== null || el.getAttribute('aria-required') === 'true',
      value: (inputEl.value || el.textContent || '').slice(0, 200),
      visible,
      backendNodeId: null, // Only available via CDP
    })
  }

  return fields
}
