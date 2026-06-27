/**
 * @ai-tip/sdk — Auto-init entry point (IIFE build target)
 *
 * This module is the **single source of truth** for AI Tip button injection
 * into webview pages. It is self-contained (no BridgeAPI dependency) —
 * it directly accesses `window.__bridge__` exposed by webview-preload.ts
 * via contextBridge for IPC communication.
 *
 * Responsibilities:
 * 1. Inject polished AI Tip buttons (gradient + SVG icon, fixed positioning)
 * 2. Collect field context on hover/focus/click
 * 3. Send field-selected events via sendToHost → renderer IPC
 * 4. Expose `window.__aiTipSDK__` for renderer's executeJavaScript calls:
 *    - fillField(value, ctx) → fills field locally, returns {ok, reason?}
 *    - highlightField(ctx) → purple glow animation
 *    - setButtonState(state) → idle/loading spinner
 *
 * Uses @ai-tip/form-detection for DOM utilities (bundled inline by esbuild).
 *
 * Built via: pnpm build:iife → dist/ai-tip-sdk.iife.js
 */

import {
  FIELD_SELECTOR,
  buildFieldContext,
  findElementByContext,
  setNativeValue,
  flashField,
  isFieldFillable,
  type FieldContext,
  type FillResult,
} from '@ai-tip/form-detection'

// ============================================================
// Constants
// ============================================================

const BTN_SIZE = 28
const BTN_SIZE_SMALL = 24
const SMALL_FIELD_THRESHOLD = 200
const FADE_DURATION = 150
const HIDE_DELAY = 300

// ============================================================
// Bridge access (window.__bridge__ exposed by webview-preload)
// ============================================================

function getBridge(): any {
  return (window as any).__bridge__
}

function sendToHost(channel: string, data: unknown): void {
  const bridge = getBridge()
  if (bridge && bridge.sendToHost) {
    bridge.sendToHost(channel, data)
  }
}

// ============================================================
// CSS injection (once)
// ============================================================

let stylesInjected = false

function injectStyles(): void {
  if (stylesInjected || document.getElementById('__ai_tip_styles__')) {
    stylesInjected = true
    return
  }
  const style = document.createElement('style')
  style.id = '__ai_tip_styles__'
  style.textContent = `
@keyframes __ai_tip_glow__ {
  0%, 100% { box-shadow: 0 2px 10px rgba(102,126,234,0.45); }
  50% { box-shadow: 0 2px 18px rgba(102,126,234,0.7); }
}
@keyframes __ai_tip_spin__ {
  100% { transform: rotate(360deg); }
}
`
  document.head.appendChild(style)
  stylesInjected = true
}

// ============================================================
// Button state
// ============================================================

let currentBtn: HTMLElement | null = null
let currentField: HTMLElement | null = null
let hideTimer: ReturnType<typeof setTimeout> | null = null
let isHoveringBtn = false
let isHoveringField = false

// ============================================================
// Button creation
// ============================================================

function createButton(): HTMLElement {
  // Remove any stale button before creating a new one
  const existing = document.getElementById('__ai_tip_btn__')
  if (existing) {
    console.error('[AI-Tip] Stale button in DOM, removing | url=' + window.location.href)
    existing.remove()
  }

  const btn = document.createElement('div')
  btn.id = '__ai_tip_btn__'
  btn.innerHTML =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l1.5 6.5L20 9l-6.5 1.5L12 17l-1.5-6.5L4 9l6.5-1.5L12 2z"></path><path d="M20 15l-1.5 3L15 19.5l3.5 1.5L20 24l1.5-3L25 19.5l-3.5-1.5L20 15z"></path></svg>'

  Object.assign(btn.style, {
    position: 'fixed',
    width: BTN_SIZE + 'px',
    height: BTN_SIZE + 'px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    boxShadow: '0 2px 10px rgba(102, 126, 234, 0.45)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    zIndex: '2147483646',
    opacity: '0',
    transform: 'translateY(-4px)',
    transition: `opacity ${FADE_DURATION}ms ease-out, transform ${FADE_DURATION}ms ease-out, box-shadow 200ms ease`,
    pointerEvents: 'none',
    userSelect: 'none',
    animation: '__ai_tip_glow__ 2s ease-in-out infinite',
  })

  // ── Hover ──
  btn.addEventListener('mouseenter', () => {
    isHoveringBtn = true
    btn.style.transform = 'translateY(-4px) scale(1.15)'
    btn.style.boxShadow = '0 4px 16px rgba(102,126,234,0.6)'
  })

  btn.addEventListener('mouseleave', () => {
    isHoveringBtn = false
    btn.style.transform = 'translateY(-4px) scale(1)'
    btn.style.boxShadow = '0 2px 10px rgba(102,126,234,0.45)'
    scheduleHide()
  })

  // ── Click ──
  btn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (!currentField) return
    const ctx = buildFieldContext(currentField)
    sendToHost('ai-tip:field-selected', { type: 'field-selected', context: ctx })
    // Click feedback
    btn.style.transform = 'translateY(-4px) scale(0.9)'
    setTimeout(() => {
      btn.style.transform = 'translateY(-4px) scale(1)'
    }, 120)
  })

  document.body.appendChild(btn)
  return btn
}

// ============================================================
// Show / Hide — uses isFieldFillable from @ai-tip/form-detection
// ============================================================

function positionButton(btn: HTMLElement, field: HTMLElement): void {
  const rect = field.getBoundingClientRect()
  const size = rect.width < SMALL_FIELD_THRESHOLD ? BTN_SIZE_SMALL : BTN_SIZE
  btn.style.width = size + 'px'
  btn.style.height = size + 'px'
  btn.style.top = Math.max(0, rect.top - size / 2) + 'px'
  btn.style.left = (rect.right - size - 4) + 'px'
}

function showButton(field: HTMLElement): void {
  if (currentBtn && currentField === field) return
  hideButton(true)

  if (!isFieldFillable(field)) return

  const btn = createButton()
  positionButton(btn, field)
  currentBtn = btn
  currentField = field

  requestAnimationFrame(() => {
    // Clean up any orphan buttons (keep only the last one)
    const allBtns = document.querySelectorAll('#__ai_tip_btn__')
    if (allBtns.length > 1) {
      console.error('[AI-Tip] Orphan buttons in DOM, count=' + allBtns.length + ' | url=' + window.location.href)
      for (let bi = 0; bi < allBtns.length - 1; bi++) (allBtns[bi] as HTMLElement).remove()
    }
    btn.style.opacity = '1'
    btn.style.transform = 'translateY(0)'
    btn.style.pointerEvents = 'auto'
  })
}

function hideButton(immediate?: boolean): void {
  if (hideTimer) {
    clearTimeout(hideTimer)
    hideTimer = null
  }
  const btn = currentBtn
  if (!btn) return

  if (immediate) {
    btn.style.opacity = '0'
    btn.style.pointerEvents = 'none'
    setTimeout(() => {
      if (btn === currentBtn) {
        btn.remove()
        currentBtn = null
        currentField = null
      }
    }, FADE_DURATION + 20)
  } else {
    hideTimer = setTimeout(() => {
      if (!isHoveringBtn && !isHoveringField) hideButton(true)
    }, HIDE_DELAY)
  }
}

function scheduleHide(): void {
  hideButton(false)
}

// ============================================================
// Field event handlers
// ============================================================

function handleFieldEnter(this: HTMLElement, e: MouseEvent | FocusEvent): void {
  const field = e.target as HTMLElement
  isHoveringField = true
  if (hideTimer) {
    clearTimeout(hideTimer)
    hideTimer = null
  }
  if (currentBtn && currentField !== field) hideButton(true)
  setTimeout(() => {
    if (isHoveringField && (document.activeElement === field || e.type === 'mouseenter')) {
      showButton(field)
    }
  }, 80)
}

function handleFieldLeave(): void {
  isHoveringField = false
  scheduleHide()
}

function handleFieldFocus(this: HTMLElement, e: FocusEvent): void {
  isHoveringField = true
  showButton(e.target as HTMLElement)
}

function handleFieldBlur(): void {
  isHoveringField = false
  scheduleHide()
}

function handleReposition(): void {
  if (currentBtn && currentField) positionButton(currentBtn, currentField)
}

// ============================================================
// Attach to fields
// ============================================================

function attach(field: HTMLElement): void {
  field.addEventListener('mouseenter', handleFieldEnter)
  field.addEventListener('mouseleave', handleFieldLeave)
  field.addEventListener('focus', handleFieldFocus)
  field.addEventListener('blur', handleFieldBlur)
}

function scanAndAttach(): void {
  const els = document.querySelectorAll(FIELD_SELECTOR)
  for (let i = 0; i < els.length; i++) {
    const el = els[i] as HTMLElement
    if ((el as any).__aiTipAttached) continue
    ;(el as any).__aiTipAttached = 1
    attach(el)
  }
}

// ============================================================
// MutationObserver — watch for dynamically added fields
// ============================================================

let observer: MutationObserver | null = null

function startObserver(): void {
  if (observer) return
  observer = new MutationObserver(() => {
    scanAndAttach()
  })
  observer.observe(document.body, { childList: true, subtree: true })
}

// ============================================================
// Public API exposed on window.__aiTipSDK__
// ============================================================

function fillField(value: string, ctx: FieldContext): FillResult {
  const el = findElementByContext(ctx)
  if (!el) {
    return { ok: false, reason: 'element not found', label: ctx.label }
  }
  const result = setNativeValue(el, value)
  if (result.ok) {
    flashField(el)
  }
  return result
}

function highlightField(ctx: FieldContext): void {
  const el = findElementByContext(ctx)
  if (!el) return
  el.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
  el.style.transition = 'box-shadow 0.4s ease, outline 0.4s ease'
  el.style.outline = '2px solid rgba(102, 126, 234, 0.6)'
  el.style.boxShadow = '0 0 14px rgba(102, 126, 234, 0.35)'
  setTimeout(() => {
    el.style.outline = ''
    el.style.boxShadow = ''
  }, 4000)
}

function setButtonState(state: 'idle' | 'loading'): void {
  const btn = document.getElementById('__ai_tip_btn__')
  if (!btn) return

  if (state === 'loading') {
    btn.style.animation = '__ai_tip_spin__ 0.8s linear infinite'
    btn.style.opacity = '0.7'
  } else {
    btn.style.animation = '__ai_tip_glow__ 2s ease-in-out infinite'
    btn.style.opacity = '1'
  }
}

// ============================================================
// Initialization
// ============================================================

function init(): void {
  // Guard: skip duplicate injection (did-finish-load fires per frame, and
  // the renderer also guards with window.__sdkInjected before <script> tag)
  if ((window as any).__aiTipInjected) return
  ;(window as any).__aiTipInjected = true

  injectStyles()

  const start = () => {
    scanAndAttach()
    startObserver()
    window.addEventListener('scroll', handleReposition, { passive: true })
    window.addEventListener('resize', handleReposition)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start)
  } else {
    start()
  }
}

// ============================================================
// Expose public API on window
// ============================================================

;(window as any).__aiTipSDK__ = {
  fillField,
  highlightField,
  setButtonState,
}

// ── IIFE auto-execute ──
// When loaded as a <script> tag (IIFE), auto-init immediately.
// The renderer also guards with window.__sdkInjected before
// appending the <script> tag, so duplicates are prevented.
if (typeof document !== 'undefined' && document.currentScript) {
  init()
}

// Also export for ESM consumers (optional, for testing)
export { init, fillField, highlightField, setButtonState, buildFieldContext }
export type { FieldContext, FillResult }
