/**
 * @ai-tip/form-detection — Field fill strategies
 *
 * 5-strategy element lookup + native value setter (React/Angular/Vue safe).
 */

import type { FieldContext, FillResult } from './types'

/**
 * Find the DOM element matching a previously collected FieldContext.
 * Uses 5 fallback strategies.
 */
export function findElementByContext(ctx: FieldContext): HTMLElement | null {
  // Strategy 1: by name
  if (ctx.name) {
    const el = document.querySelector(
      `input[name="${ctx.name}"], textarea[name="${ctx.name}"], select[name="${ctx.name}"]`,
    ) as HTMLElement | null
    if (el) return el
  }

  // Strategy 2: by id
  if (ctx.id) {
    try {
      const el = document.getElementById(ctx.id) as HTMLElement | null
      if (el) return el
    } catch {
      /* skip */
    }
  }

  // Strategy 3: label lookup
  if (ctx.label) {
    const labels = document.querySelectorAll('label')
    for (let i = 0; i < labels.length; i++) {
      const labelEl = labels[i]
      if ((labelEl.textContent || '').trim().indexOf(ctx.label) === 0) {
        const forId = labelEl.getAttribute('for')
        if (forId) {
          const el = document.getElementById(forId)
          if (el) return el as HTMLElement
        }
        const nested = labelEl.querySelector(
          'input, textarea, select',
        ) as HTMLElement | null
        if (nested) return nested
      }
    }
  }

  // Strategy 4: placeholder match
  if (ctx.label) {
    const inputs = document.querySelectorAll(
      'input, textarea',
    ) as NodeListOf<HTMLInputElement>
    for (let i = 0; i < inputs.length; i++) {
      if (
        (inputs[i].placeholder || '')
          .toLowerCase()
          .indexOf(ctx.label.toLowerCase()) !== -1
      ) {
        return inputs[i]
      }
    }
  }

  // Strategy 5: aria-label match
  if (ctx.label) {
    const el = document.querySelector(
      '[aria-label="' + ctx.label.replace(/"/g, '\\"') + '"]',
    ) as HTMLElement | null
    if (el) return el
  }

  return null
}

/**
 * Set a value on a DOM element using the native property setter.
 * This is safe for React, Angular, and Vue controlled components.
 */
export function setNativeValue(el: HTMLElement, value: string): FillResult {
  try {
    const tag = el.tagName.toLowerCase()

    // ── <select> ──
    if (tag === 'select') {
      const select = el as HTMLSelectElement
      const opts = select.options
      for (let i = 0; i < opts.length; i++) {
        if (opts[i].text.toLowerCase().indexOf(value.toLowerCase()) !== -1) {
          select.value = opts[i].value
          select.dispatchEvent(new Event('input', { bubbles: true }))
          select.dispatchEvent(new Event('change', { bubbles: true }))
          return { ok: true, label: value }
        }
      }
      return { ok: false, reason: 'No matching option' }
    }

    // ── contenteditable ──
    if (el.getAttribute('contenteditable') === 'true') {
      el.textContent = value
      el.dispatchEvent(new Event('input', { bubbles: true }))
      return { ok: true, label: value }
    }

    // ── <textarea> ──
    if (tag === 'textarea') {
      ;(el as HTMLTextAreaElement).value = value
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
      return { ok: true, label: value }
    }

    // ── <input type="checkbox|radio"> ──
    // Must set .checked instead of .value; otherwise the field appears
    // to fill successfully but the checkbox/radio remains unchecked.
    if (tag === 'input' && ((el as HTMLInputElement).type === 'checkbox' || (el as HTMLInputElement).type === 'radio')) {
      const inputEl = el as HTMLInputElement
      const truthy = ['true', 'yes', '1', 'on', 'checked', 'y'].includes(
        String(value).toLowerCase().trim(),
      )
      if (inputEl.type === 'checkbox') {
        inputEl.checked = truthy
        inputEl.dispatchEvent(new Event('input', { bubbles: true }))
        inputEl.dispatchEvent(new Event('change', { bubbles: true }))
        return { ok: true, label: value }
      }
      // radio — find matching option by value or label text
      const radioName = inputEl.name
      if (radioName) {
        const radioGroup = document.querySelectorAll(
          'input[type="radio"][name="' + radioName.replace(/"/g, '\\"') + '"]',
        )
        for (let i = 0; i < radioGroup.length; i++) {
          const radio = radioGroup[i] as HTMLInputElement
          const radioLabel = radio.labels?.[0]?.textContent?.trim() || radio.value
          if (
            radio.value.toLowerCase() === value.toLowerCase() ||
            radioLabel.toLowerCase().includes(value.toLowerCase())
          ) {
            radio.checked = true
            radio.dispatchEvent(new Event('input', { bubbles: true }))
            radio.dispatchEvent(new Event('change', { bubbles: true }))
            return { ok: true, label: value }
          }
        }
      }
      return { ok: false, reason: 'No matching radio option', label: value }
    }

    // ── <input> (use native setter for React/Angular/Vue bindings) ──
    const nativeSetter =
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value') ||
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')

    if (nativeSetter && nativeSetter.set) {
      nativeSetter.set.call(el as HTMLInputElement, value)
    } else {
      ;(el as HTMLInputElement).value = value
    }

    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))

    return { ok: true, label: value }
  } catch (e) {
    return {
      ok: false,
      reason: 'script error',
      error: String(e),
      stack: (e as Error).stack?.slice(0, 300),
    }
  }
}

/**
 * Fill a value into a field identified by FieldContext.
 * Returns the result with success/failure info.
 */
export function fillField(value: string, ctx: FieldContext): FillResult {
  const el = findElementByContext(ctx)
  if (!el) {
    return { ok: false, reason: 'element not found', label: ctx.label }
  }
  return setNativeValue(el, value)
}

/**
 * Green flash visual feedback on a field after successful fill.
 */
export function flashField(el: HTMLElement): void {
  const origOutline = el.style.outline
  const origBoxShadow = el.style.boxShadow
  el.style.transition = 'box-shadow 0.3s ease, outline 0.3s ease'
  el.style.outline = '2px solid #4caf50'
  el.style.boxShadow = '0 0 12px rgba(76, 175, 80, 0.5)'
  setTimeout(() => {
    el.style.outline = origOutline
    el.style.boxShadow = origBoxShadow
  }, 1500)
}
