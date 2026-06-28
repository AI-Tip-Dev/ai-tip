/**
 * Background Service Worker — WXT Entrypoint
 *
 * Extension equivalent of Desktop's Main Process.
 * - chrome.runtime.onMessage for request/response
 * - chrome.runtime.onConnect for streaming channels
 * - chrome.storage.local for persistence
 * - LLM provider dispatch (reuses @ai-tip/llm-providers)
 *
 * The SW is non-persistent — all state is in chrome.storage.
 */

import { handleMessage, handleConnect } from '@/lib/background/router'
import { initStorage } from '@/lib/background/storage'

export default defineBackground(() => {
  // ── Lifecycle ──
  chrome.runtime.onInstalled.addListener(async (details) => {
    console.log('[bg] Extension installed:', details.reason)
    initStorage()

    // Set side panel to open on action click
    await chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true }).catch(() => {})

    // Dev mode: auto-open sidepanel on the active tab after install
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (tab?.id) {
      chrome.sidePanel?.open?.({ tabId: tab.id }).catch(() => {})
    }
  })

  chrome.runtime.onStartup.addListener(() => {
    console.log('[bg] Browser startup — Service Worker activated')
  })

  // ── Message Routing (request/response) ──
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && message.type === 'BRIDGE_CALL') {
      handleMessage(message, sender)
        .then((result) => sendResponse({ success: true, data: result }))
        .catch((error: Error) => sendResponse({ success: false, error: error.message }))
      return true // Keep channel open for async response
    }
    return false
  })

  // ── Connection Routing (streaming) ──
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name === 'llm-stream' || port.name === 'batch-fill') {
      handleConnect(port)
    }
  })

  // ── Keep-alive heartbeat ──
  chrome.alarms?.create?.('keep-alive', { periodInMinutes: 1 })
  chrome.alarms?.onAlarm?.addListener?.((alarm) => {
    if (alarm.name === 'keep-alive') { /* no-op — keeps SW alive */ }
  })

  console.log('[bg] Service Worker initialized')
})
