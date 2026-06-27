/**
 * @ai-tip/form-detection — Visibility helpers
 */

/** Check if an element is visible in the viewport */
export function isVisible(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect()
  if (rect.width < 1 || rect.height < 1) return false
  if (rect.bottom < 0 || rect.top > window.innerHeight) return false
  if (rect.right < 0 || rect.left > window.innerWidth) return false

  const style = window.getComputedStyle(el)
  if (style.visibility === 'hidden' || style.display === 'none') return false
  if (parseFloat(style.opacity) === 0) return false

  return true
}

/** Get the bounding rect of an element (rounded) */
export function getRect(
  el: HTMLElement,
): { top: number; left: number; width: number; height: number } {
  const r = el.getBoundingClientRect()
  return {
    top: Math.round(r.top),
    left: Math.round(r.left),
    width: Math.round(r.width),
    height: Math.round(r.height),
  }
}

/** Check if a field should be eligible for AI Tip (not password, not tiny, etc.) */
export function isFieldFillable(el: HTMLElement): boolean {
  const name = (el.getAttribute('name') || '').toLowerCase()
  const id = (el.id || '').toLowerCase()
  const type = ((el as HTMLInputElement).type || '').toLowerCase()

  if (type === 'password') return false
  if (/password|passwd|pwd|credit|card|cvv|ssn|social.security|secret|token/i.test(name)) return false
  if (/password|passwd|pwd|credit|card|cvv|ssn|social.security|secret|token/i.test(id)) return false

  const rect = el.getBoundingClientRect()
  if (rect.width < 50 || rect.height < 20) return false

  return isVisible(el)
}
