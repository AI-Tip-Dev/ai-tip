/**
 * Content Script — Field Fill
 * Sets field values using native setter + event dispatch.
 * Compatible with React, Angular, Vue, and vanilla HTML.
 */

interface FieldContext { label?: string; name?: string; id?: string; placeholder?: string }
interface FillResult { success: boolean; filled: boolean; error?: string }

const nativeInputValueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
const nativeTextareaValueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  if (el instanceof HTMLInputElement && nativeInputValueSetter) nativeInputValueSetter.call(el, value)
  else if (el instanceof HTMLTextAreaElement && nativeTextareaValueSetter) nativeTextareaValueSetter.call(el, value)
  else el.value = value
}

function dispatchInputEvents(el: HTMLElement): void {
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
  el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }))
}

function flashElement(el: HTMLElement): void {
  const orig = el.style.backgroundColor
  el.style.transition = 'background-color 0.3s ease'
  el.style.backgroundColor = '#e8f0fe'
  setTimeout(() => { el.style.backgroundColor = orig; setTimeout(() => { el.style.transition = '' }, 300) }, 300)
}

export function fillFieldValue(ctx: FieldContext, value: string): FillResult {
  const el = findElementByContext(ctx)
  if (!el) return { success: false, filled: false, error: `Field not found: ${ctx.label || ctx.name || ctx.id}` }
  try {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      setNativeValue(el, value)
    } else if (el instanceof HTMLSelectElement) {
      const match = Array.from(el.options).find(o => o.value === value || o.text === value || o.label === value)
      el.value = match ? match.value : value
    } else if (el.getAttribute('contenteditable') === 'true') {
      el.textContent = value
      el.dispatchEvent(new Event('input', { bubbles: true }))
    } else {
      (el as HTMLInputElement).value = value
    }
    dispatchInputEvents(el)
    flashElement(el)
    return { success: true, filled: true }
  } catch (error: any) {
    return { success: false, filled: false, error: error.message }
  }
}

function findElementByContext(ctx: FieldContext): HTMLElement | null {
  if (ctx.id) { const el = document.getElementById(ctx.id); if (el) return el as HTMLElement }
  if (ctx.name) {
    const el = document.querySelector(`input[name="${CSS.escape(ctx.name)}"], textarea[name="${CSS.escape(ctx.name)}"], select[name="${CSS.escape(ctx.name)}"]`)
    if (el) return el as HTMLElement
  }
  if (ctx.placeholder) {
    const el = document.querySelector(`input[placeholder="${CSS.escape(ctx.placeholder)}"], textarea[placeholder="${CSS.escape(ctx.placeholder)}"]`)
    if (el) return el as HTMLElement
  }
  if (ctx.label) {
    const labelEl = Array.from(document.querySelectorAll('label')).find(l => l.textContent?.trim() === ctx.label)
    if (labelEl) {
      const forAttr = labelEl.getAttribute('for')
      if (forAttr) { const el = document.getElementById(forAttr); if (el) return el as HTMLElement }
      const el = labelEl.querySelector('input, textarea, select')
      if (el) return el as HTMLElement
    }
  }
  return null
}
