/**
 * Shared AX (Accessibility) role constants for CDP form field detection.
 *
 * Chromium CDP returns ALL roles in lowercase!
 *  textbox      → <input type=text|email|tel|url|password|...>, <textarea>
 *  searchbox    → <input type=search>
 *  spinbutton   → <input type=number>
 *  combobox     → <select> (custom-styled or macOS)
 *  popupbutton  → <select> (native OS rendering on Windows/Linux)
 *  listbox      → <select multiple>
 *  checkbox     → <input type=checkbox>
 *  radiobutton  → <input type=radio>
 *  slider       → <input type=range>
 *  colorwell    → <input type=color>
 *  date         → <input type=date>
 *  time         → <input type=time>
 */
export const FORM_AX_ROLES: ReadonlySet<string> = new Set([
  'textbox',
  'combobox',
  'popupbutton',
  'listbox',
  'checkbox',
  'radiobutton',
  'spinbutton',
  'searchbox',
  'slider',
  'colorwell',
  'date',
  'time'
])

/** CDP role → SimpleField tagName/type mapping */
export function axRoleToTagType(role: string): { tagName: string; type: string } {
  switch (role) {
    case 'combobox':
    case 'popupbutton':
      return { tagName: 'select', type: 'select-one' }
    case 'listbox':
      return { tagName: 'select', type: 'select-multiple' }
    case 'checkbox':
      return { tagName: 'input', type: 'checkbox' }
    case 'radiobutton':
      return { tagName: 'input', type: 'radio' }
    case 'spinbutton':
      return { tagName: 'input', type: 'number' }
    case 'searchbox':
      return { tagName: 'input', type: 'search' }
    case 'slider':
      return { tagName: 'input', type: 'range' }
    case 'colorwell':
      return { tagName: 'input', type: 'color' }
    case 'date':
      return { tagName: 'input', type: 'date' }
    case 'time':
      return { tagName: 'input', type: 'time' }
    case 'textbox':
    default:
      return { tagName: 'input', type: 'text' }
  }
}
