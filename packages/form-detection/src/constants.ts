/**
 * @ai-tip/form-detection — Shared constants
 */

/** CSS selector for all fillable form fields */
export const FIELD_SELECTOR = [
  'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"])',
  'textarea',
  '[contenteditable="true"]',
  'select',
  '[role="textbox"]',
  '[role="combobox"]',
  '[role="spinbutton"]',
  '[role="searchbox"]',
].join(',')

/** Patterns for fields that should NOT be auto-filled */
export const SENSITIVE_PATTERNS =
  /password|passwd|pwd|credit|card|cvv|ssn|social.security|secret|token/i

/** Small field threshold in pixels */
export const SMALL_FIELD_THRESHOLD = 200
