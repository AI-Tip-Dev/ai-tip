import { defineConfig } from 'wxt';
import { resolve } from 'path';

// See https://wxt.dev/api/config.html
export default defineConfig({
  // Put all source code under src/ for clean separation
  srcDir: 'src',

  // Vue module for .vue SFC support
  modules: ['@wxt-dev/module-vue'],

  // ── Microsoft Edge priority ──
  // Edge uses Chromium MV3, same APIs as Chrome.
  // WXT handles browser-specific manifest differences automatically.
  manifest: {
    name: 'AI Tip',
    description: 'AI-powered intelligent form-filling assistant',
    version: '0.1.0',
    default_locale: 'en',

    permissions: [
      'storage',
      'downloads',
      'notifications',
      'alarms',
      'sidePanel',
    ],

    host_permissions: [
      'https://*/*',
      'http://localhost/*',
    ],
  },

  // ── Dev browser runner ──
  // Opens browser with extension loaded. Use o+Enter in terminal to reopen.
  // keepProfileChanges ensures chrome.storage.local persists across restarts.
  // See: https://wxt.dev/guide/essentials/config/browser-startup.html#persist-data
  webExt: {
    openConsole: true,
    openDevtools: true,
    chromiumProfile: resolve('.wxt/chrome-data'),
    keepProfileChanges: true,
  },

  // ── Auto-imports ──
  // Exclude workspace packages (packages/*) from unimport scanning.
  imports: {
    exclude: [/node_modules/, /\/packages\//],
  },

  // Force options page to open as full standalone tab (like Sider),
  // not embedded in chrome://extensions.
  hooks: {
    'build:manifestGenerated': (_ctx, manifest) => {
      if (manifest.options_ui) {
        manifest.options_ui.open_in_tab = true
      }
    },
  },
});
