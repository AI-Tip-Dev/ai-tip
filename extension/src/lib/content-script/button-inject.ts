/**
 * Content Script — AI Tip Button Injector
 * Injects ✨ buttons next to form fields on the page.
 */

import type { ContentBridge } from './bridge'

const BUTTON_STYLE_ID = 'ai-tip-button-styles'

function injectStyles(): void {
  if (document.getElementById(BUTTON_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = BUTTON_STYLE_ID
  style.textContent = `
    .ai-tip-btn{position:absolute;z-index:2147483646;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border:1.5px solid #003d8f;border-radius:6px;background:#fff;cursor:pointer;font-size:14px;line-height:1;transition:all .15s ease;box-shadow:0 1px 3px rgba(0,0,0,.1);user-select:none;pointer-events:auto}
    .ai-tip-btn:hover{background:#e8f0fe;border-color:#00529e;box-shadow:0 2px 6px rgba(0,61,143,.2);transform:scale(1.08)}
    .ai-tip-btn:active{background:#d0e0f8;transform:scale(.95)}
    .ai-tip-btn.ai-tip-loading{border-color:#f59e0b;animation:ai-tip-pulse 1.5s ease-in-out infinite}
    .ai-tip-btn.ai-tip-active{background:#003d8f;color:#fff;border-color:#003d8f}
    @keyframes ai-tip-pulse{0%,100%{opacity:1}50%{opacity:.5}}
    .ai-tip-highlight{outline:2px solid #003d8f!important;outline-offset:2px;transition:outline .3s ease}
    .ai-tip-tooltip{position:absolute;z-index:2147483647;background:#1a1d20;color:#fff;padding:4px 8px;border-radius:4px;font-size:11px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;white-space:nowrap;pointer-events:none;opacity:0;transition:opacity .15s ease;top:-28px;left:50%;transform:translateX(-50%)}
    .ai-tip-btn:hover .ai-tip-tooltip{opacity:1}
  `
  document.head.appendChild(style)
}

interface FieldInfo {
  label: string; type: string; required: boolean; value: string
  name?: string; id?: string; placeholder?: string
  rect?: { x: number; y: number; width: number; height: number }
}

let activeButton: HTMLElement | null = null

export function injectButtons(fields: FieldInfo[], bridge: ContentBridge): void {
  injectStyles()
  removeButtons()
  for (const field of fields) {
    const el = findElement(field)
    if (!el || el.parentElement?.querySelector('.ai-tip-btn')) continue
    const button = createButton(field, bridge)
    positionButton(button, el)
  }
}

export function removeButtons(): void {
  document.querySelectorAll('.ai-tip-btn').forEach(btn => btn.remove())
  activeButton = null
}

function createButton(field: FieldInfo, bridge: ContentBridge): HTMLElement {
  const button = document.createElement('div')
  button.className = 'ai-tip-btn'
  button.textContent = '✨'
  button.title = `AI Tip for "${field.label || field.name || 'this field'}"`
  button.setAttribute('data-ai-tip-field', field.label || field.name || field.id || '')

  const tooltip = document.createElement('div')
  tooltip.className = 'ai-tip-tooltip'
  tooltip.textContent = `AI Tip: ${field.label || field.name || 'Field'}`
  button.appendChild(tooltip)

  button.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation()
    if (activeButton === button) {
      button.classList.remove('ai-tip-active'); activeButton = null
      bridge.emit('ai-tip:field-deselected', { label: field.label, name: field.name, id: field.id })
    } else {
      if (activeButton) activeButton.classList.remove('ai-tip-active')
      button.classList.add('ai-tip-active'); activeButton = button
      bridge.emit('ai-tip:field-selected', { label: field.label, type: field.type, required: field.required, value: field.value, name: field.name, id: field.id, placeholder: field.placeholder, rect: field.rect })
    }
  })
  return button
}

function positionButton(button: HTMLElement, fieldEl: Element): void {
  const parent = fieldEl.parentElement
  if (!parent) return
  const wrapper = document.createElement('div')
  wrapper.style.cssText = 'position:relative;display:inline-block;'
  parent.insertBefore(wrapper, fieldEl)
  wrapper.appendChild(fieldEl)
  wrapper.appendChild(button)
  const fieldRect = fieldEl.getBoundingClientRect()
  const wrapperRect = wrapper.getBoundingClientRect()
  button.style.top = `${fieldRect.top - wrapperRect.top + (fieldRect.height - 28) / 2}px`
  button.style.right = `${-(28 + 8)}px`
}

function findElement(field: FieldInfo): Element | null {
  if (field.id) { const el = document.getElementById(field.id); if (el) return el }
  if (field.name) { const el = document.querySelector(`input[name="${CSS.escape(field.name)}"], textarea[name="${CSS.escape(field.name)}"], select[name="${CSS.escape(field.name)}"]`); if (el) return el }
  if (field.placeholder) { const el = document.querySelector(`input[placeholder="${CSS.escape(field.placeholder)}"], textarea[placeholder="${CSS.escape(field.placeholder)}"]`); if (el) return el }
  if (field.label) {
    const labelEl = Array.from(document.querySelectorAll('label')).find(l => l.textContent?.trim() === field.label)
    if (labelEl) {
      const forAttr = labelEl.getAttribute('for')
      if (forAttr) { const el = document.getElementById(forAttr); if (el) return el }
      const input = labelEl.querySelector('input, textarea, select')
      if (input) return input
    }
  }
  return null
}
