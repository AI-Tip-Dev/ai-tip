/**
 * Build the IIFE bundle of @ai-tip/sdk for Desktop webview injection.
 *
 * Output: dist/ai-tip-sdk.iife.js
 *
 * This bundle is a self-contained, zero-dependency script that:
 * 1. Detects `window.__bridge__` (exposed by Electron preload)
 * 2. Auto-creates BridgeAPI
 * 3. Scans DOM for form fields and injects AI Tip buttons
 * 4. Listens for fill commands from the sidebar
 *
 * Usage: pnpm build:iife
 */

import * as esbuild from 'esbuild'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

async function build() {
  await esbuild.build({
    entryPoints: [resolve(root, 'src', 'auto.ts')],
    bundle: true,
    format: 'iife',
    globalName: 'AITipSDK',
    outfile: resolve(root, 'dist', 'ai-tip-sdk.iife.js'),
    target: ['es2020'],
    platform: 'browser',
    minify: false, // Keep readable for debugging; minify in production
    sourcemap: true,
    treeShaking: true,
    legalComments: 'inline',
    banner: {
      js: `// @ai-tip/sdk IIFE bundle — auto-init for Desktop webview injection
// Generated: ${new Date().toISOString()}
// This file is injected by Electron Desktop into webview pages.
// Do not include in SaaS bundles — use the ESM entry point instead.
`,
    },
  })

  console.log('✅ IIFE bundle built: dist/ai-tip-sdk.iife.js')
}

build().catch((e) => {
  console.error('❌ IIFE build failed:', e)
  process.exit(1)
})
