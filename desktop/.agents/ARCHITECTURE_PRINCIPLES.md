# Architecture Principles

Guiding architectural principles for the Electron AI Sidebar project.

## 1. Local-First

All user data (knowledge bases, conversation history, model configurations, preferences) are stored locally on the user's machine. No telemetry, no cloud sync by default, and no data leaves the machine without explicit user action.

- **Knowledge base**: Local vector store (e.g., LanceDB or SQLite + embeddings)
- **Model configs**: JSON files in the app's user data directory
- **Chat history**: Local SQLite or JSON log
- **Preferences**: electron-store or similar

## 2. Human-in-the-Loop

AI suggests form fill values, but the user always confirms before any data is written into the web page. There is no fully automated form submission.

- AI suggestions appear in the sidebar with a "Fill" button
- User must explicitly click to fill each field or batch of fields
- The system never auto-submits forms
- All AI actions are auditable and reversible

## 3. Graceful Degradation

The system adapts based on available resources:

1. **Local LLM (Ollama)** — First choice, fully offline, zero latency cost
2. **Cloud LLM (OpenAI / Anthropic / DeepSeek / etc.)** — Fallback when local is unavailable or inadequate
3. **Rule-based** — Final fallback using simple heuristics (field name matching, regex patterns)

The user can configure the fallback chain and set per-provider preferences.

## 4. Security Isolation

The `<webview>` tag loads arbitrary, untrusted web content. The webview context must never have access to:

- Node.js APIs
- The file system
- The main process IPC directly
- User's knowledge base or model configurations

Communication with the webview is strictly limited to:
- `webview-preload.ts` exposes a minimal `__aiBridge` API via `contextBridge`
- Whitelist of allowed `sendToHost` channels
- CDP (Chrome DevTools Protocol) for read-only accessibility tree inspection

## 5. Type Safety

All cross-process communication must be fully typed:

- IPC channel names are typed constants in `src/shared/ipc-channels.ts`
- Shared types live in `src/shared/` and are importable by main, preload, and renderer
- `contextBridge` exposed APIs are declared in `src/preload/index.d.ts`
- `electron-vite` ensures correct bundling per process target

## 6. Simplicity First

Avoid unnecessary abstractions. Prefer:

- Plain functions over classes when state is not needed
- Vue composables over Vuex/Pinia for state management
- Direct IPC calls over abstraction layers
- Simple JSON files over complex databases unless scale demands it
- Inline styles or scoped CSS over CSS-in-JS libraries

Only introduce a new dependency or abstraction when the current approach demonstrably fails to meet requirements.
