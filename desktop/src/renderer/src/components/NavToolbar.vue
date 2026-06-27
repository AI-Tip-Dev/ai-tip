<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from '../composables/useI18n'

const { t } = useI18n()

const emit = defineEmits<{
  navigate: [url: string]
  back: []
  forward: []
  reload: []
}>()

const inputRef = ref<HTMLInputElement | null>(null)
const isFocused = ref(false)
// The webview's real URL (full, with scheme)
const rawUrl = ref('')
// What the user sees / edits
const urlInput = ref('')

// ── URL sync: webview DOM events ──
let _navHandler: ((e: any) => void) | null = null

onMounted(() => {
  const wv = document.getElementById('main-webview') as any
  if (!wv) return
  _navHandler = (e: any) => {
    if (!isFocused.value && e.url && e.url !== 'about:blank') {
      rawUrl.value = e.url
      urlInput.value = labelFrom(e.url)
    }
  }
  wv.addEventListener('did-navigate', _navHandler)
  wv.addEventListener('did-navigate-in-page', _navHandler)
  wv.addEventListener('dom-ready', function onReady() {
    wv.removeEventListener('dom-ready', onReady)
    try {
      const cur = wv.getURL()
      if (cur && cur !== 'about:blank') {
        rawUrl.value = cur
        urlInput.value = labelFrom(cur)
      }
    } catch { /* not ready */ }
  })
})

onUnmounted(() => {
  const wv = document.getElementById('main-webview') as any
  if (wv && _navHandler) {
    wv.removeEventListener('did-navigate', _navHandler)
    wv.removeEventListener('did-navigate-in-page', _navHandler)
  }
})

// ── Helpers ──
function labelFrom(url: string): string {
  if (!url || url === 'about:blank') return ''
  // file:// → full path
  if (url.startsWith('file:///')) {
    return decodeURIComponent(url.slice(8)) // strip file:///
  }
  try {
    const u = new URL(url)
    return u.hostname + u.pathname.replace(/\/$/, '')
  } catch {
    return url
  }
}

function schemeOf(url: string): 'https' | 'file' | 'http' | 'other' {
  if (!url || url === 'about:blank') return 'other'
  if (url.startsWith('https://')) return 'https'
  if (url.startsWith('http://')) return 'http'
  if (url.startsWith('file:///')) return 'file'
  return 'other'
}

function ensureScheme(input: string): string {
  const trimmed = input.trim()
  // Already has a scheme
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed
  // Looks like a domain → add https://
  if (/^[\w.-]+\.[a-z]{2,}/i.test(trimmed) || trimmed.includes('/')) {
    return 'https://' + trimmed
  }
  // Single word → treat as search / domain
  if (/^[\w.-]+$/.test(trimmed)) {
    return 'https://' + trimmed
  }
  return trimmed
}

// ── Scheme icon (derived from rawUrl, not user input) ──
const scheme = computed(() => schemeOf(rawUrl.value))

// ── Edit ──
function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter') {
    event.preventDefault()
    const url = ensureScheme(urlInput.value)
    if (url) {
      // Sync rawUrl optimistically so blur doesn't revert
      rawUrl.value = url
      urlInput.value = labelFrom(url)
      inputRef.value?.blur()
      emit('navigate', url)
    }
  } else if (event.key === 'Escape') {
    event.preventDefault()
    urlInput.value = labelFrom(rawUrl.value)
    inputRef.value?.blur()
  }
}

function onFocus(): void {
  const alreadyFocused = isFocused.value
  isFocused.value = true
  if (!alreadyFocused) {
    // Switch from label → full URL, then select all
    urlInput.value = rawUrl.value
    requestAnimationFrame(() => {
      inputRef.value?.select()
    })
  }
}

function onBlur(): void {
  isFocused.value = false
  // Revert to clean label (discard any unsaved edit)
  urlInput.value = labelFrom(rawUrl.value)
}
</script>

<template>
  <div class="nav-toolbar">
    <!-- Nav buttons -->
    <div class="nav-buttons">
      <button class="nav-btn" :title="t('nav.backTooltip')" @click="$emit('back')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <button class="nav-btn" :title="t('nav.forwardTooltip')" @click="$emit('forward')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
      <button class="nav-btn" :title="t('nav.reloadTooltip')" @click="$emit('reload')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
      </button>
    </div>

    <!-- URL bar — single input, always editable (Chrome omnibox style) -->
    <div class="url-bar" :class="{ focused: isFocused }" @click="inputRef?.focus()">
      <svg v-if="scheme === 'https'" class="url-icon secure" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
      </svg>
      <svg v-else-if="scheme === 'file'" class="url-icon file" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/>
      </svg>
      <svg v-else-if="scheme !== 'other'" class="url-icon insecure" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>

      <input
        ref="inputRef"
        :value="urlInput"
        type="text"
        class="url-input"
        :placeholder="t('nav.placeholder')"
        spellcheck="false"
        @input="urlInput = ($event.target as HTMLInputElement).value"
        @focus="onFocus"
        @blur="onBlur"
        @keydown="handleKeydown"
      />
    </div>
  </div>
</template>

<style scoped>
.nav-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 38px;
  padding: 0 12px;
  background: var(--app-white);
  border-bottom: 1px solid var(--border-light);
  flex-shrink: 0;
  user-select: none;
}

/* ---- Nav buttons ---- */
.nav-buttons {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.nav-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
}
.nav-btn:hover {
  background: var(--btn-hover-bg);
  color: var(--color-text);
}
.nav-btn:active {
  background: var(--btn-active-bg);
}

/* ---- URL bar ---- */
.url-bar {
  display: flex;
  align-items: center;
  flex: 1;
  height: 28px;
  padding: 0 8px;
  background: var(--app-gray-50);
  border: 1px solid transparent;
  border-radius: 14px;
  cursor: text;
  min-width: 0;
}
.url-bar:hover {
  background: var(--app-gray-100);
}
.url-bar.focused {
  background: var(--app-white);
  border-color: var(--app-gray-300);
}

/* ---- Icon ---- */
.url-icon {
  flex-shrink: 0;
  margin-right: 4px;
  opacity: 0.5;
}
.url-icon.secure   { color: var(--app-green); opacity: 0.8; }
.url-icon.file     { color: var(--app-amber); opacity: 0.7; }
.url-icon.insecure { opacity: 0.5; }

/* ---- Input ---- */
.url-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--color-text);
  font-size: 13px;
  font-family: inherit;
  line-height: 28px;
}
.url-input::placeholder {
  color: var(--color-text-muted);
  opacity: 1;
}
.url-input::selection {
  background: var(--app-blue-pale);
}
</style>
