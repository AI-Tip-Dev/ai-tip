# Copilot Instructions for Electron AI Sidebar

## Project Context

You are working on **Electron AI Sidebar** — a desktop AI form-filling assistant built with:
- **Electron** (main process + WebView for embedded browser)
- **Vue 3** (Composition API with `<script setup lang="ts">`)
- **TypeScript** (strict mode)
- **electron-vite** (build tool)
- **pnpm** (package manager)

The app loads arbitrary web pages in an Electron `<webview>` tag on the left,
and shows an AI-powered sidebar on the right. The sidebar can detect form
fields in the web page, search the user's local knowledge base, and
suggest/auto-fill form values.

## Code Style

- Use **Composition API** with `<script setup lang="ts">` for Vue components
- Prefer `const` over `let`, use arrow functions
- Use `provide/inject` for same-renderer communication, **IPC for cross-process**
- All IPC channel names must be typed constants defined in `src/shared/`
- Use `electron-log` for logging — never `console.log` in production code
- Follow the **three-process model**:
  - **Main**: `src/main/` — full Node.js, manages windows/IPC
  - **Preload**: `src/preload/` — bridges main and renderer via `contextBridge`
  - **Renderer**: `src/renderer/` — Vue app, no Node.js access
- WebView has its own preload (`src/preload/webview-preload.ts`) — use `sendToHost()`

## Key Conventions

### IPC Flow
```
Renderer → window.api.xxx() → ipcRenderer.invoke → ipcMain.handle → return
```

### WebView Communication
```
Renderer → wv.send('channel', data) → WebView preload ipcRenderer.on
WebView preload → ipcRenderer.sendToHost('channel', data) → Renderer ipc-message event
```

### File Organization
- Components: `src/renderer/src/components/` (use PascalCase)
- Composables: `src/renderer/src/composables/` (use `useXxx` naming)
- Shared types: `src/shared/` (importable by all three processes)

## Testing

- **Unit tests**: Vitest with `@vue/test-utils`
- **E2E tests**: Playwright (when applicable)
- Test files: co-located in `__tests__/` subdirectories or `*.test.ts`

## Git

- Use **Conventional Commits**: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`
- PR titles must use conventional commit format
- Never commit secrets, API keys, or `.env` files

## Architecture Principles

See [`.agents/ARCHITECTURE_PRINCIPLES.md`](./.agents/ARCHITECTURE_PRINCIPLES.md)

1. **Local-First** — All data stored on user's machine
2. **Human-in-the-Loop** — AI suggests, user confirms
3. **Graceful Degradation** — Local LLM → Cloud LLM → Rule-based
4. **Security Isolation** — WebView is untrusted context
5. **Type Safety** — All cross-process communication must be typed
6. **Simplicity First** — No unnecessary abstractions
