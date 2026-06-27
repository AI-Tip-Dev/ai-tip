import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

// ── SDK IIFE bundle path (injected via <script> in webview-preload.ts) ──
// Computed relative to the monorepo sibling: sdk/dist/ai-tip-sdk.iife.js
const sdkIifePath = resolve(__dirname, '..', 'sdk', 'dist', 'ai-tip-sdk.iife.js')

export default defineConfig({
  main: {},
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/preload/index.ts'),
          webview: resolve('src/preload/webview-preload.ts'),
        },
        output: {
          format: 'cjs',
          entryFileNames: '[name].js',
          chunkFileNames: 'chunks/[name].js',
        },
        external: ['electron'],
      },
    },
    define: {
      // NOTE: __SDK_IIFE_URL__ moved to renderer.define — the SDK IIFE
      // is now injected conditionally by the Vue renderer (useWebview.ts)
      // when AI Tip is enabled.
    },
  },
  renderer: {
    define: {
      // Injected at build time — the absolute file:/// path to the webview preload script.
      // Must use file:/// (triple slash) for absolute paths on Windows.
      // electron-vite names the output after the rollup input key: 'webview' → webview.js.
      __WEBVIEW_PRELOAD__: JSON.stringify(
        `file:///${resolve(__dirname, 'out/preload/webview.js').replace(/\\/g, '/')}`,
      ),
      // SDK IIFE file URL — injected into webview pages via wv.executeJavaScript()
      // when the user enables AI Tip in the sidebar settings.
      __SDK_IIFE_URL__: JSON.stringify(
        sdkIifePath ? `file:///${sdkIifePath.replace(/\\/g, '/')}` : '',
      ),
    },
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [
      vue({
        template: {
          compilerOptions: {
            isCustomElement: (tag) => tag === 'webview'
          }
        }
      })
    ]
  }
})
