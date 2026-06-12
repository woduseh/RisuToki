# TypeScript Runtime Architecture

> The canonical architecture guide for RisuToki's TypeScript runtime structure, process boundaries, ownership rules, and large-module hotspots.
> For source-level module navigation see [`docs/MODULE_MAP.md`](../MODULE_MAP.md).

---

## 1. Process Layer Overview

RisuToki is an Electron desktop application composed of one **main process** and two **renderer entry points** (main window + pop-out window). A separate **MCP stdio server** runs as a child process for AI CLI integration.

```
┌─────────────────────────────────────────────────────────────────┐
│  Electron Main Process                                          │
│  main.ts (~1,340 lines)                                         │
│  · Window management, IPC routing, file I/O                     │
│  · Terminal (PTY) lifecycle, session recovery, autosave          │
│  · Reference manifests, guide/persona management                │
│  · Asset CRUD, MCP config generation                            │
├─────────────────────────────────────────────────────────────────┤
│  Preload Bridges                                                │
│  preload.ts → window.tokiAPI    (main window)                   │
│  popout-preload.ts → window.popoutAPI  (pop-out window)         │
├──────────────────────┬──────────────────────────────────────────┤
│  Main Renderer       │  Popout Renderer                         │
│  src/main.ts         │  src/popout.ts                           │
│  Vue 3 + Pinia       │  Imperative TS/DOM                       │
│  app/controller.ts   │  popout/controller.ts                    │
│  (~2,930 lines)      │  5 panel types                           │
├──────────────────────┴──────────────────────────────────────────┤
│  MCP HTTP API (embedded in the main process)                    │
│  src/lib/mcp-api-server.ts — main.ts calls startApiServer()     │
│  Accesses in-memory document state via deps.getCurrentData()    │
├─────────────────────────────────────────────────────────────────┤
│  MCP Stdio Server (separate child process)                      │
│  toki-mcp-server.ts (~16,880 lines)                             │
│  Connects to the above API over HTTP 127.0.0.1:${TOKI_PORT}    │
└─────────────────────────────────────────────────────────────────┘
```

### 1.1 Main Process (`main.ts`)

The desktop OS integration layer built on Electron's `app`, `BrowserWindow`, and `ipcMain`.

**Owns:**

- `.charx` / `.risum` / `.risup` file I/O (`src/charx-io.ts`)
- Reference manifests (`src/lib/reference-store.ts`)
- Pop-out window lifecycle (`src/lib/popout-manager.ts`)
- Terminal/PTY lifecycle (`src/lib/terminal-manager.ts`)
- MCP HTTP server startup (`src/lib/mcp-api-server.ts`)
- Autosave scheduling (`src/lib/autosave-manager.ts`)
- Session recovery record tracking (`src/lib/session-recovery-main.ts`)
- Guide/persona/asset management
- MCP/agent config generation (`src/lib/mcp-config.ts`, `src/lib/agents-md-manager.ts`)

**IPC channels (major groups):**

| Group             | Example Channels                                                                    |
| ----------------- | ----------------------------------------------------------------------------------- |
| File I/O          | `new-file`, `open-file`, `save-file`, `get-file-path`                               |
| References        | `open-reference`, `list-references`, `remove-reference`                             |
| Terminal          | `terminal-start`, `terminal-input`, `terminal-resize`, `terminal-stop`              |
| Assets            | `get-asset-list`, `add-asset`, `delete-asset`, `compress-assets-webp`               |
| MCP/Agent         | `get-mcp-info`, `write-mcp-config`, `write-agents-md`                               |
| Autosave/Recovery | `autosave-file`, `get-pending-session-recovery`, `resolve-pending-session-recovery` |
| UI support        | `pick-bg-image`, `pick-bgm`, `open-folder`                                          |

### 1.2 Preload Bridges

Under Electron's `contextIsolation` these are the only path for renderers to communicate with the main process.

| File                | Exposed Object     | Role                                                                                                        |
| ------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------- |
| `preload.ts`        | `window.tokiAPI`   | Main window only. Built by `createTokiApi(ipcRenderer)` in `src/lib/preload-api.ts`                         |
| `popout-preload.ts` | `window.popoutAPI` | Pop-out only. Per-panel IPC methods for terminal/sidebar/editor/preview/refs + `getType()`/`getRequestId()` |

Type definitions: the `TokiAPI` and `PopoutAPI` interfaces are declared in `src/electron-api.d.ts` (~256 lines).

### 1.3 Renderers

**Main window** (`src/main.ts` → `src/app/controller.ts`):

- Vue 3 + Pinia architecture
- Manages file state, UI layout, tabs, editor, sidebar, preview, terminal/chat, and the assistant as a unified orchestrator
- Pinia store: `src/stores/app-store.ts` — the hub of main-renderer UI state. The authoritative document state used by save/autosave/MCP mutations lives separately in the main process at `mainState.currentData`

**Pop-out window** (`src/popout.ts` → `src/popout/controller.ts`):

- **Imperative TS/DOM** — direct DOM manipulation via `document.createElement`, without Vue or Pinia
- 5 panel types: `terminal`, `sidebar`, `editor`, `preview`, `refs`
- Reuses the same shared modules as the main renderer (chat-session, preview, etc.)

### 1.4 MCP Server

```
main.ts (Electron main process)
  └─ startApiServer(deps) → src/lib/mcp-api-server.ts (HTTP API, ~15,230 lines)
        ├─ Reads/writes main-process in-memory document state via deps.getCurrentData()
        ├─ src/lib/mcp-cbs-routes.ts (CBS route-family dispatcher)
        ├─ src/lib/mcp-surface-routes.ts (active-document surface route dispatcher, ~340 lines)
        ├─ src/lib/mcp-asset-routes.ts (charx/risum asset route dispatcher, ~725 lines)
        ├─ src/lib/mcp-field-access.ts (field name / document type access policy)
        ├─ src/lib/mcp-tool-taxonomy.ts (19 families, ~960 lines)
        ├─ src/lib/mcp-response-envelope.ts (response formatting, ~265 lines)
       └─ src/lib/mcp-search.ts (full-text search, ~360 lines)

toki-mcp-server.ts (separate child process, stdio transport, ~16,880 lines)
  └─ Connects to the above API over HTTP 127.0.0.1:${TOKI_PORT}
```

**`mcp-api-server.ts`** is an HTTP API server that runs inside the Electron main process. `main.ts` launches it by calling `startApiServer(deps)`. It reads and mutates the main process's in-memory document state through `deps.getCurrentData()`.

**`toki-mcp-server.ts`** is a stdio MCP server spawned as a separate child process. It communicates with AI CLIs (Claude, Copilot, etc.) over stdio and relays tool calls to the above API server over `127.0.0.1:${TOKI_PORT}` HTTP.

Tool counts and family classifications are managed by `mcp-tool-taxonomy.ts` as the single source of truth (SSOT). `ToolAnnotations` (readOnlyHint, destructiveHint, etc.) are also auto-patched from there.

---

## 2. Process Boundaries and Import Direction Rules

### 2.1 Prohibited Cross-Layer Imports

```
main.ts (Node/Electron)  ←✗→  src/app/controller.ts (Renderer/Vue)
```

- The **main process** never directly imports renderer code. All communication goes through IPC.
- **Renderers** never access Node.js APIs directly. They reach main-process functionality only through `window.tokiAPI` / `window.popoutAPI`.
- The **MCP HTTP API** (`mcp-api-server.ts`) runs inside the main process and reads/writes the main process's in-memory document state via `deps.getCurrentData()` (not the renderer state). The **MCP stdio server** (`toki-mcp-server.ts`) is a separate child process that connects to the API over HTTP.

### 2.2 Shared Module Boundaries

Modules under `src/lib/` can theoretically be used by either side, but in practice there is a clear ownership split:

| Owner Layer       | Example Modules                                                                                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Main process only | `terminal-manager.ts`, `session-recovery-main.ts`, `main-state-store.ts`, `mcp-config.ts`, `charx-io.ts`, `data-serializer.ts`, `document-validation.ts`                             |
| Renderer only     | `layout-manager.ts`, `tab-manager.ts`, `sidebar-builder.ts`, `form-editor.ts`, `monaco-loader.ts`                                                                                    |
| Shared            | `shared-utils.ts`, `section-parser.ts`, `risup-prompt-model.ts`, `risup-json-fields.ts`, `cbs-parser.ts`, `cbs-evaluator.ts`                                                        |
| MCP server only   | `mcp-api-server.ts`, `mcp-cbs-routes.ts`, `mcp-surface-routes.ts`, `mcp-asset-routes.ts`, `mcp-field-access.ts`, `mcp-tool-taxonomy.ts`, `mcp-response-envelope.ts`, `mcp-search.ts` |
| Preview + MCP shared | `content-simulation.ts` (pure regex execution and lorebook activation) |

`src/lib/section-parser.ts` is the canonical Lua/CSS section grammar for renderer, Electron main-process MCP dependencies, and standalone MCP. `src/lib/mcp-section-parser.ts` is a compatibility re-export only.

### 2.3 Compilation Targets

| tsconfig                  | Target | Module           | Files                                                                       |
| ------------------------- | ------ | ---------------- | --------------------------------------------------------------------------- |
| `tsconfig.electron.json`  | ES2022 | CommonJS         | `main.ts`, `preload.ts`, `popout-preload.ts`, type declarations             |
| `tsconfig.json`           | ES2022 | ESNext (Bundler) | `src/**/*.ts`, `vite.config.ts`, `vitest.setup.ts`                          |
| `tsconfig.node-libs.json` | ES2022 | Node16           | Selected `src/lib/` files, `src/charx-io.ts`, etc. (side-by-side JS output) |

Vite builds the renderer bundle, `tsc` compiles main-process entry points and shared libraries, and esbuild bundles the preload scripts and the MCP stdio server. The reason `.ts` and `.js` files sit side by side under `src/lib/` is the `build:node-libs` (`tsc`) output.

---

## 3. Key Domains

### 3.1 File Formats and Serialization

| Module                           | Lines  | Purpose                                                                                                                             |
| -------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `src/charx-io.ts`                | ~1,030 | Read/write `.charx`, `.risum`, `.risup`. Handles ZIP/gzip/deflate                                                                   |
| `src/lib/data-serializer.ts`     | ~300   | Normalized JSON/binary serialization                                                                                                |
| `src/lib/document-validation.ts` | ~90    | Document shape validation                                                                                                           |
| `src/lib/risup-prompt-model.ts`  | ~1,240 | `.risup` promptTemplate parsing and model                                                                                           |
| `src/lib/section-parser.ts`      | ~210   | Shared Lua/CSS section parsing (`===section===` syntax) for renderer, main-process MCP, and standalone MCP                            |

### 3.2 Preview System (`.charx` Only)

The preview is a port of the RisuAI rendering pipeline that simulates CBS, regex, lorebook, and Lua inside an iframe.

| Module                         | Lines  | Purpose                                                     |
| ------------------------------ | ------ | ----------------------------------------------------------- |
| `src/lib/preview-engine.ts`    | ~2,340 | CBS rendering orchestration and Lua (Wasmoon) execution     |
| `src/lib/content-simulation.ts` | ~380 | Shared pure regex execution and lorebook activation         |
| `src/lib/preview-session.ts`   | ~460   | Session lifecycle and state management                      |
| `src/lib/preview-panel.ts`     | ~380   | Preview panel UI                                            |
| `src/lib/preview-runtime.ts`   | ~320   | Runtime feedback (error/timeout banners)                    |
| `src/lib/preview-format.ts`    | ~430   | Preview markdown/HTML formatting and document shell styling |
| `src/lib/preview-debug.ts`     | ~230   | Debug trace view                                            |
| `src/lib/preview-sanitizer.ts` | ~140   | HTML/XSS sanitization                                       |

Preview works only with `.charx` files. When a `.risum` or `.risup` file is open, the F5 shortcut and the menu entry are blocked.

Operational preview details:

- Initialization and runtime errors appear as inline banners. If the iframe is not ready within 5 seconds, the panel reports a timeout.
- Controller-level Wasmoon preflight (`ensureWasmoon()`) runs outside the preview panel and is not surfaced through those banners.
- Preview messages support the renderer's safe markdown and structural-HTML allowlist inside the existing sandbox/CSP boundary; inline styles remain restricted.
- Preview-local Lua field setters update preview state immediately, and `{{charpersona}}` remains distinct from `{{chardesc}}`.

### 3.3 Session Recovery and Autosave

| Module                           | Location              | Purpose                                                                                      |
| -------------------------------- | --------------------- | -------------------------------------------------------------------------------------------- |
| `autosave-manager.ts`            | Main                  | IPC autosave handler; writes `.toki-recovery.json` sidecar                                   |
| `settings-handlers.ts`           | Renderer (`src/app/`) | Autosave timer polling (renderer-side `setInterval`)                                         |
| `session-recovery.ts`            | Shared                | Recovery data model and serialization                                                        |
| `session-recovery-main.ts`       | Main                  | Main-process recovery hooks (tracks pending recovery records)                                |
| `session-recovery-manager.ts`    | Main                  | Evaluates recovery candidates and drives restore/ignore decisions (initialized by `main.ts`) |
| `session-recovery-controller.ts` | Renderer (`src/app/`) | Recovery UI orchestration                                                                    |
| `backup-store.ts`                | Renderer              | In-memory serialized state cache (per-tab undo)                                              |

Recovery flow: on startup, `get-pending-session-recovery` IPC → if a recovery candidate is found, the user is offered `Restore from autosave` / `Open original` / `Ignore` → on restore, an `[Auto-Restored]` badge is shown.

### 3.4 Assistant Integration

| Module                 | Lines | Purpose                                                   |
| ---------------------- | ----- | --------------------------------------------------------- |
| `assistant-prompt.ts`  | ~280  | Bootstrap prompt assembly for Claude/Copilot/Codex/Gemini |
| `assistant-launch.ts`  | ~70   | Assistant process launcher                                |
| `agents-md-manager.ts` | ~150  | Runtime `AGENTS.md` dynamic generation                    |

### 3.5 Terminal and Chat

| Module                        | Lines | Purpose                                        |
| ----------------------------- | ----- | ---------------------------------------------- |
| `terminal-manager.ts`         | ~170  | PTY/shell subprocess management (main process) |
| `terminal-shell.ts`           | ~80   | Shell detection (cmd/PowerShell/bash)          |
| `terminal-ui.ts`              | ~380  | xterm.js renderer UI                           |
| `terminal-session-context.ts` | ~240  | Terminal CWD and session state                 |
| `terminal-chat.ts`            | ~280  | TUI output cleanup, numbered-choice parsing    |
| `chat-session.ts`             | ~330  | Chat message history state machine             |

### 3.6 Theme System

| Module              | Lines | Purpose                                                                 |
| ------------------- | ----- | ----------------------------------------------------------------------- |
| `theme-registry.ts` | ~500  | App theme presets, custom palette validation, and Monaco/terminal specs |
| `dark-mode.ts`      | ~110  | Applies theme CSS variables and Monaco theme selection                  |
| `settings-popup.ts` | ~390  | User-facing theme and custom palette controls                           |
| `app-settings.ts`   | ~200  | Theme ID and custom palette persistence                                 |

### 3.7 Editor, Layout, and Sidebar

| Module               | Lines  | Purpose                                  |
| -------------------- | ------ | ---------------------------------------- |
| `form-editor.ts`     | ~1,440 | Shared form UI for CharX/Risum/RISUP     |
| `layout-manager.ts`  | ~410   | Slot-based panel layout                  |
| `tab-manager.ts`     | ~240   | Tab lifecycle (create/close/dirty state) |
| `sidebar-builder.ts` | ~310   | Sidebar tree construction                |
| `sidebar-actions.ts` | ~570   | Sidebar item operations                  |
| `sidebar-refs.ts`    | ~820   | Reference panel                          |

### 3.8 Assets and Media

| Module                | Lines | Purpose                  |
| --------------------- | ----- | ------------------------ |
| `asset-manager.ts`    | ~460  | Asset catalog CRUD       |
| `asset-runtime.ts`    | ~40   | Asset URL resolution     |
| `image-compressor.ts` | ~270  | WebP compression         |
| `avatar-ui.ts`        | ~300  | Avatar display/animation |

---

## 4. Large-Module Hotspots

The following are the largest files in the project and the top candidates for future decomposition or refactoring.

| Module                              | Lines       | Why It Is a Hotspot                                                                                                                                                              |
| ----------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`src/lib/mcp-api-server.ts`**     | **~15,230** | Houses most MCP HTTP tool routing, with surface and asset routes split into dedicated route-family dispatchers; tool membership is maintained by the `mcp-tool-taxonomy.ts` SSOT |
| **`toki-mcp-server.ts`**            | **~16,880** | stdio MCP server, facade/granular tool registration, bounded envelopes, analysis routing, and Danbooru tag validation                                                            |
| **`src/app/controller.ts`**         | **~2,820**  | Single orchestrator managing all main-window state, UI, and integrations                                                                                                         |
| **`src/lib/preview-engine.ts`**     | **~2,340**  | Preview document orchestration, CBS rendering, and Lua execution; regex/lorebook logic is shared through `content-simulation.ts`                                                |
| `src/lib/content-simulation.ts`     | ~380        | Pure regex/lorebook execution shared by preview and MCP analysis                                                                                                                |
| **`main.ts`**                       | **~1,570**  | IPC channel registration, file I/O, and window management concentrated here                                                                                                      |
| **`src/lib/form-editor.ts`**        | **~1,440**  | Shared form editor for all three file types                                                                                                                                      |
| **`src/lib/risup-prompt-model.ts`** | **~1,240**  | RISUP promptTemplate parsing                                                                                                                                                     |
| **`src/charx-io.ts`**               | **~1,170**  | Serialization/deserialization for all three file formats                                                                                                                         |
| `src/lib/risup-prompt-editor.ts`    | ~1,050      | RISUP prompt editor                                                                                                                                                              |
| `src/lib/sidebar-refs.ts`           | ~820        | Reference panel builder                                                                                                                                                          |
| `src/lib/lorebook-io.ts`            | ~660        | Lorebook import/export                                                                                                                                                           |
| `src/lib/help-popup.ts`             | ~620        | Help/syntax reference overlay                                                                                                                                                    |
| `src/lib/sidebar-actions.ts`        | ~570        | Sidebar item operations                                                                                                                                                          |
| `src/lib/trigger-script-model.ts`   | ~540        | Trigger script parsing                                                                                                                                                           |

### Hotspot Handling Principles

This document records the current state as-is. Decomposition and refactoring are handled as separate tasks, guided by the following principles:

1. **Extract to `src/lib/` first**: Before adding new business logic to a controller, extract reusable behavior into small modules under `src/lib/`.
2. **Split along tool-family boundaries**: When decomposing `mcp-api-server.ts`, use the 19 families defined in `mcp-tool-taxonomy.ts` as natural split points. Pure policy/helper modules like `mcp-field-access.ts` may be split out ahead of time.
3. **Tests first**: When a `.test.ts` file sits next to a module, that test is the executable behavior spec. Decomposition must not break existing tests.

---

## 5. Data Flow

### 5.1 File Editing

```
Renderer                            Main Process
────────                            ────────────
window.tokiAPI.openFile()  ──►  ipcMain('open-file')
                                  ├─ dialog.showOpenDialog()
                                  ├─ charx-io.openCharx/openRisum/openRisup()
                                  └─ Returns normalized CharxData ──►  controller.ts
                                                                        ├─ Sets up tab/sidebar/editor state
                                                                        └─ Updates Pinia store
```

### 5.2 MCP Tool Calls

```
AI CLI (Claude/Copilot/...)
  └─ stdio ──► toki-mcp-server.ts (separate child process, MCP protocol parsing)
                └─ HTTP 127.0.0.1:${TOKI_PORT} ──► mcp-api-server.ts (tool routing inside the main process)
                              ├─ Read tools: reads main-process in-memory state via deps.getCurrentData()
                              ├─ Write tools: renderer IPC confirmation popup → direct main-process mutation → data-updated broadcast
                              └─ Response: mcpSuccess/mcpError/mcpNoOp envelope
```

### 5.3 Terminal Chat

```
Renderer terminal input
  └─ window.tokiAPI.terminalInput() ──► ipcMain → PTY stdin
PTY stdout
  └─ onTerminalData callback ──► Renderer
                              ├─ chat-session.ts (message history)
                              ├─ terminal-chat.ts (TUI cleanup)
                              └─ chat-ui.ts (bubble rendering)
```

### 5.4 Preview

```
F5 or menu click in the renderer (.charx only)
  └─ preview-session.ts: session initialization
       └─ preview-engine.ts: iframe document generation
            ├─ CBS parsing/evaluation (cbs-parser.ts, cbs-evaluator.ts)
            ├─ Regex application (content-simulation.ts)
            ├─ Lorebook decorator matching (content-simulation.ts)
            └─ Lua trigger execution (Wasmoon)
       └─ preview-runtime.ts: error/timeout inline banners
       └─ preview-debug.ts: debug trace view
```

---

## 6. Build Structure

```
vite.config.ts
  ├─ Main entry: index.html → src/main.ts (Vue app)
  ├─ Pop-out entry: popout.html → src/popout.ts
  ├─ Static asset copy: Monaco, xterm, wasmoon, app images
  └─ Dev server: 127.0.0.1:5173

tsconfig.electron.json (tsc)
  └─ main.ts → root main.js (CommonJS)

esbuild (build:preload)
  ├─ preload.ts → root preload.js
  └─ popout-preload.ts → root popout-preload.js

esbuild (build:mcp)
  └─ toki-mcp-server.ts → root toki-mcp-server.js (CJS bundle)

tsconfig.node-libs.json (tsc, module: Node16)
  └─ Selected src/lib/ files, src/charx-io.ts, etc. → .js side-by-side
```

`npm run build` runs `lint + typecheck + test + Electron compile + Vite bundle` in sequence.

---

## 7. Guardrails for Future Changes

1. **Extract to `src/lib/` first**: Before growing a controller (`controller.ts`, `main.ts`), extract reusable logic into small modules under `src/lib/`.
2. **Unified settings path**: Persistent settings go through `app-settings.ts`. Do not create ad-hoc renderer globals.
3. **Use runtime feedback**: Surface user-visible runtime failures through `runtime-feedback.ts`. Avoid silent fallbacks.
4. **Recognize integration layers**: `main.ts`, `src/app/controller.ts`, and `src/popout/controller.ts` are integration layers. Place new business logic in small modules first.
5. **IPC type safety**: Declare types in `src/electron-api.d.ts` before adding a new IPC channel.
6. **Keep MCP taxonomy in sync**: When adding or removing tools, update `mcp-tool-taxonomy.ts` and verify bidirectional completeness with `mcp-tool-taxonomy.test.ts`.
