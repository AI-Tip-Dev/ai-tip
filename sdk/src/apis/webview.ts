/**
 * WebView API — navigation control for the embedded webview.
 *
 * Usage:
 *   await bridge.webview.navigateTo('https://example.com')
 *   const url = await bridge.webview.getURL()
 */

import type { Transport, WebviewAPI } from '../types'

export function createWebviewAPI(transport: Transport): WebviewAPI {
  return {
    async navigateTo(url: string): Promise<void> {
      return transport.invoke('webview:navigateTo', [url]) as Promise<void>
    },

    async goBack(): Promise<void> {
      return transport.invoke('webview:goBack', []) as Promise<void>
    },

    async goForward(): Promise<void> {
      return transport.invoke('webview:goForward', []) as Promise<void>
    },

    async reload(): Promise<void> {
      return transport.invoke('webview:reload', []) as Promise<void>
    },

    async stop(): Promise<void> {
      return transport.invoke('webview:stop', []) as Promise<void>
    },

    async openLocalFile(): Promise<string | null> {
      return transport.invoke('webview:openLocalFile', []) as Promise<string | null>
    },

    async getURL(): Promise<string> {
      return transport.invoke('webview:getURL', []) as Promise<string>
    },

    async getTitle(): Promise<string> {
      return transport.invoke('webview:getTitle', []) as Promise<string>
    },
  }
}
