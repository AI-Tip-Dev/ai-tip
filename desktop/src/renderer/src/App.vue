<script setup lang="ts">
import { ref, onMounted, provide } from 'vue'
import log from 'electron-log/renderer'
import Sidebar from './components/Sidebar.vue'
import NavToolbar from './components/NavToolbar.vue'
import { useRecentHistory } from './composables/useRecentHistory'
import { useWebview } from './composables/useWebview'

const webviewRef = ref<HTMLElement | null>(null)

/** Preload path for the webview — injected at build time via Vite define */
const preloadPath = __WEBVIEW_PRELOAD__

// --- History ---
const { currentUrl, recentUrls, loadHistory, addRecent } = useRecentHistory()

// --- Webview ---
const history = loadHistory()
const { control, attachListeners } = useWebview(webviewRef, currentUrl, recentUrls, addRecent, history.lastUrl)

// --- Provide to children ---
provide('webviewControl', control)

// --- Settings trigger (keyboard shortcut → sidebar) ---
const triggerSettings = ref(0)
provide('triggerSettings', triggerSettings)

// --- Keyboard shortcuts (replaces native menu accelerators) ---
function handleKeydown(e: KeyboardEvent): void {
  const ctrl = e.ctrlKey || e.metaKey

  if (ctrl && e.key === 'o') {
    // Ctrl+O → Open local file
    e.preventDefault()
    control.openLocalFile()
  } else if (ctrl && e.key === 'l') {
    // Ctrl+L → Focus URL bar
    e.preventDefault()
    const urlInput = document.querySelector('.url-input') as HTMLInputElement | null
    urlInput?.focus()
    urlInput?.select()
  } else if (ctrl && e.key === ',') {
    // Ctrl+, → Open settings
    e.preventDefault()
    triggerSettings.value++
  }
}

// --- Init ---
onMounted(() => {
  log.info(`[app] start | history=${history.recentUrls.length} urls | lastUrl=${history.lastUrl?.slice(0, 60) || '(none)'}`)

  recentUrls.value = history.recentUrls
  attachListeners()

  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('beforeunload', () => {
    log.info(`[app] closing | ${recentUrls.value.length} recent urls saved`)
  })
})
</script>

<template>
  <div class="app-container">
    <div class="webview-panel">
      <NavToolbar
        @back="control.goBack"
        @forward="control.goForward"
        @reload="control.reload"
        @navigate="control.navigateTo"
      />
      <webview
        ref="webviewRef"
        id="main-webview"
        src="about:blank"
        class="webview"
        :preload="preloadPath"
      ></webview>
    </div>
    <Sidebar class="sidebar-panel" />
  </div>
</template>

<style scoped>
.app-container {
  display: flex;
  width: 100%;
  height: 100vh;
  overflow: hidden;
  background: var(--app-bg);
}

.webview-panel {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: #fff;
}

.webview {
  flex: 1;
  border: none;
}

.sidebar-panel {
  width: 340px;
  min-width: 300px;
  flex-shrink: 0;
}
</style>

