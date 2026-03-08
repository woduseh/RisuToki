# Architecture

## Runtime overview

RisuToki is an Electron desktop app with one main process and two renderer entrypoints.

- `main.js`: Electron main process, IPC handlers, file I/O, terminal process management, popout windows, guide/reference loading.
- `preload.js` / `popout-preload.js`: typed renderer bridges exposed through `window.tokiAPI` and `window.popoutAPI`.
- `src/main.ts`: main renderer entrypoint.
- `src/popout.ts`: popout renderer entrypoint.
- `src/app/controller.js`: main window controller.
- `src/popout/controller.js`: popout window controller.

Legacy `src/renderer/*` files are no longer part of the active runtime and have been removed.

## Renderer structure

### Main window

`src/app/controller.js` is still the primary orchestration layer, but key behavior now lives in shared modules:

- `src/lib/app-settings.ts`: localStorage-backed app settings normalization and persistence helpers
- `src/lib/chat-session.ts`: shared terminal-chat state machines for main/popout renderers
- `src/lib/layout-manager.ts`: slot-based panel layout management for the main window
- `src/lib/preview-session.ts`: preview runtime orchestration
- `src/lib/preview-debug.ts` / `src/lib/preview-format.ts`: preview rendering + debug UI helpers
- `src/lib/terminal-chat.ts`: TUI output cleanup and chat choice parsing

### Popout windows

`src/popout/controller.js` handles five panel types:

- terminal
- sidebar
- editor
- preview
- refs

The terminal and preview popouts reuse the same shared chat/preview helpers as the main renderer.

## Main process responsibilities

`main.js` owns the authoritative desktop-side state and OS integration:

- opening/saving `.charx` and `.risum`
- reference-file persistence
- popout window lifecycle
- terminal/PTy lifecycle
- MCP request handling
- guide/reference material loading

When renderer state needs persistence beyond a single window lifetime, prefer main-process ownership or a dedicated persisted setting helper over ad-hoc renderer globals.

## Data flow

### File editing

1. Renderer requests open/save through `window.tokiAPI`
2. `main.js` performs I/O using `src/charx-io.js` and related helpers
3. Renderer receives normalized character data
4. `src/app/controller.js` builds tabs/sidebar/editor state from that data

### Terminal chat mode

1. Renderer forwards terminal input through preload IPC
2. Main process PTY writes output back to renderer
3. Renderer passes chunks into `chat-session.ts`
4. `terminal-chat.ts` cleans TUI output and choice lists
5. Renderer re-renders the chat bubbles

### Preview

1. Renderer gathers current character data and assets
2. `preview-session.ts` initializes the preview engine and iframe document
3. Lua/CBS/regex processing updates preview state
4. `preview-debug.ts` renders inspection views from the same snapshot

## Guardrails for future changes

- Prefer extracting reusable behavior into `src/lib/*` before growing controller files further.
- Keep persisted settings funneled through `app-settings.ts`.
- Surface user-visible runtime failures with `runtime-feedback.ts` instead of silent fallback.
- Treat `main.js`, `src/app/controller.js`, and `src/popout/controller.js` as integration layers; new business logic should land in smaller modules first.
