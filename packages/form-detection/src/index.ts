/**
 * @ai-tip/form-detection — Public API
 */

// Types
export type { FieldContext, FillResult, SimpleField } from './types'
export type { RawAXNode } from './ax-tree'

// Constants
export { FIELD_SELECTOR, SENSITIVE_PATTERNS, SMALL_FIELD_THRESHOLD } from './constants'

// Visibility
export { isVisible, getRect, isFieldFillable } from './visibility'

// Label inference
export {
  inferLabel,
  collectSiblingLabels,
  inferFormPurpose,
  buildFieldContext,
} from './label-infer'

// Field fill
export {
  findElementByContext,
  setNativeValue,
  fillField,
  flashField,
} from './field-fill'

// DOM scanning
export { querySelectorAllDeep, detectFields } from './dom-scan'

// AX Tree
export { buildAXTreeText } from './ax-tree'
