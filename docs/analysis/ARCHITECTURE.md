# TypeScript Runtime Architecture

> Canonical guide to RisuToki's runtime processes, ownership boundaries, major data flows, and architectural guardrails.
> For file-by-file source navigation, use [`docs/MODULE_MAP.md`](../MODULE_MAP.md).

---

## 1. Runtime Overview

RisuToki is an Electron desktop application with one main process, one Vue renderer, one preload bridge, and an optional MCP stdio child process. The application has no secondary or pop-out renderer.

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Electron main process                                               │
│ main.ts                                                             │
│ • BrowserWindow and IPC lifecycle                                   │
│ • authoritative document and reference state                        │
│ • file/project-folder I/O, terminal PTYs, recovery, configuration   │
│ • localhost MCP HTTP API                                            │
├──────────────────────────────────────────────────────────────────────┤
│ Context-isolated preload bridge                                     │
│ preload.ts → src/lib/preload-api.ts → window.tokiAPI                │
├──────────────────────────────────────────────────────────────────────┤
│ Main renderer                                                       │
│ index.html → src/main.ts → App.vue → src/app/controller.ts          │
│ Vue 3 + Pinia + components/stores + browser-safe src/lib modules    │
├──────────────────────────────────────────────────────────────────────┤
│ Optional MCP stdio child process                                    │
│ toki-mcp-server.ts                                                   │
│ • MCP SDK transport, profile-aware tool registration, facade logic │
│ • app-backed HTTP proxy or standalone file-backed HTTP API          │
└──────────────────────────────────────────────────────────────────────┘
```

### 1.1 Electron main process

`main.ts` is the OS and privileged-runtime integration layer. It owns:

- the main `BrowserWindow` and application lifecycle;
- authoritative in-memory document, project-folder, and reference state through `main-state-store.ts`;
- `.charx`, `.risum`, and `.risup` loading, saving, importing, and project-folder conversion;
- IPC registration for files, assets, references, terminal sessions, settings, guides, recovery, and assistant integration;
- PTY lifecycle through `terminal-manager.ts`;
- autosave and abnormal-exit recovery coordination;
- MCP/assistant configuration generation;
- startup and dependency injection for the localhost MCP HTTP API.

`main.ts` is an integration layer. Reusable file, state, policy, and runtime behavior belongs in focused `src/lib/` modules.

### 1.2 Preload bridge

`preload.ts` exposes the typed `window.tokiAPI` bridge created by `src/lib/preload-api.ts`. The renderer uses this bridge for privileged operations instead of importing Electron or Node APIs.

The public renderer bridge is declared by `TokiAPI` in `src/electron-api.d.ts`. New IPC capabilities should update the main handler, preload implementation, and type declaration together.

### 1.3 Main renderer

The only renderer entrypoint is `src/main.ts`. It mounts the Vue application and initializes `src/app/controller.ts`.

- `App.vue` and `src/components/` own the persistent workspace shell.
- `src/app/controller.ts` coordinates document tabs, editors, inspectors, previews, references, terminals, settings, and assistant actions.
- `src/app/*-controller.ts` modules own bounded integration areas such as project workspaces, terminal sessions, recovery, RISUP tabs, and trigger scripts.
- `src/stores/app-store.ts` owns renderer UI state. It is not the authoritative persistence store for the open artifact.
- Browser-safe behavior shared across UI features lives under `src/lib/`.

Preview, terminal, guide, and reference experiences are contained in the main workspace rather than separate windows.

### 1.4 MCP runtimes

`toki-mcp-server.ts` is the MCP stdio transport and tool-registration orchestrator. It supports two runtime modes:

- **App-backed:** the Electron main process starts `src/lib/mcp-api-server.ts`; the stdio child proxies tool calls to it over authenticated localhost HTTP.
- **Standalone:** `toki-standalone-bootstrap.ts` parses argv/environment settings and starts a file-backed API with `mcp-headless-server.ts`.

Both modes use the same MCP tool registration, facade engines, request schemas, taxonomy, and response contracts. Runtime-mode details and startup profiles are documented in [`docs/MCP_WORKFLOW.md`](../MCP_WORKFLOW.md).

---

## 2. Ownership and Import Boundaries

### 2.1 Process boundaries

```text
Renderer ── window.tokiAPI / IPC ──► Electron main
AI CLI   ── MCP stdio ──► MCP child ── localhost HTTP ──► MCP API
```

- Renderer production code does not access Node or Electron APIs directly.
- Main-process code does not import renderer integration code from `src/app/`, `src/components/`, or `src/stores/`.
- Production `src/lib/` modules do not runtime-import `src/app/`.
- Runtime imports from `src/lib/` into `src/stores/` are limited to reviewed bridge modules; most cross-layer use is type-only or dependency-injected.
- The MCP HTTP API reads and mutates the main-process document state supplied through `McpApiDeps`, not Pinia state.
- Loaded references are read-only to MCP and renderer editing surfaces.

`src/lib/architecture.test.ts` mechanically enforces the production `src/lib/` import boundaries and lint coverage.

### 2.2 Main-process modules

Representative privileged modules include:

- `charx-io.ts`, `folder-workspace.ts`, and `character-card-import.ts` for artifact I/O;
- `main-state-store.ts`, `reference-store.ts`, and recovery modules for durable session state;
- `terminal-manager.ts`, `mcp-config.ts`, and `agents-md-manager.ts` for external-process integration;
- `mcp-api-server.ts` and its route modules for the app-backed MCP API.

These modules may use Node APIs and are compiled for the Electron/Node runtime.

### 2.3 Renderer modules

Representative renderer-owned modules include:

- `src/app/controller.ts` and the focused controllers under `src/app/`;
- Vue components and Pinia stores;
- editor, layout, sidebar, preview-panel, terminal-UI, and form modules under `src/lib/`.

Renderer modules should call injected callbacks or `window.tokiAPI` when privileged work is required.

### 2.4 Shared pure modules

Modules such as `shared-utils.ts`, `section-parser.ts`, `cbs-parser.ts`, `cbs-evaluator.ts`, `content-simulation.ts`, and document-model helpers are designed to be reusable across renderer, main-process, test, or MCP contexts.

`section-parser.ts` is the canonical Lua/CSS section grammar. `mcp-section-parser.ts` is a compatibility re-export.

---

## 3. MCP Architecture

The MCP implementation is split into transport, registration, facade, HTTP routing, and contract layers.

### 3.1 Transport and runtime bootstrap

- `toki-mcp-server.ts` owns the MCP SDK server, stdio transport, request context, runtime diagnostics, and top-level composition.
- `mcp-proxy-client.ts` performs authenticated app-backed HTTP calls and normalizes transport failures.
- `toki-standalone-bootstrap.ts` selects the tool profile and standalone options.
- `mcp-headless-server.ts` owns standalone document state and starts the same HTTP API used by app-backed sessions.

### 3.2 Tool registration

Tool registration order and family-specific handlers are split across:

- `mcp-tool-register-facade.ts`;
- `mcp-tool-register-fields.ts`;
- `mcp-tool-register-authoring.ts`;
- `mcp-tool-register-reference.ts`;
- `mcp-tool-register-validation.ts`;
- `mcp-tool-register-risup.ts`.

`mcp-tool-registration.ts` supplies shared registration types and structured-content wrapping. `mcp-compact-input.ts` supplies compact public schemas and detailed handler validation.

### 3.3 Facade engines

The preferred low-context surface is implemented by:

- `mcp-facade-content.ts` for inspection, bounded reads, search, analysis, and validation;
- `mcp-facade-edit.ts` for preview/apply plans and stale guards;
- `mcp-facade-items.ts` for structured collections and RISUP prompts;
- `mcp-facade-script-style.ts` for regex, trigger, Lua, and CSS operations;
- `mcp-facade-assets.ts` for asset reads and guarded mutations;
- `mcp-facade-files.ts` for file, snapshot, import/export, and project-folder workflows;
- `mcp-facade-runtime.ts` for shared preview stores, digests, and API-error helpers.

Facade engines call the same localhost HTTP routes used by granular compatibility tools.

### 3.4 HTTP API and route families

`mcp-api-server.ts` owns server startup, authentication/global guards, shared dependencies, and top-level dispatch. Route-family behavior is delegated to:

- `mcp-field-routes.ts`;
- `mcp-lorebook-routes.ts`;
- `mcp-risup-prompt-routes.ts`;
- `mcp-structured-item-routes.ts`;
- `mcp-section-routes.ts`;
- `mcp-reference-routes.ts`;
- `mcp-external-routes.ts`;
- `mcp-asset-routes.ts`;
- `mcp-surface-routes.ts`;
- `mcp-cbs-routes.ts`;
- `mcp-probe-routes.ts`;
- `mcp-session-routes.ts`.

`mcp-api-helpers.ts` contains shared HTTP, identity, surface, list, section-cache, and response helpers. New route behavior belongs in the narrowest existing family instead of expanding the server dispatcher.

### 3.5 Contract sources

- `mcp-tool-taxonomy.ts` is the tool-family, profile, recommendation, annotation, mutation-metadata, and workflow-stage source of truth.
- `mcp-request-schemas.ts` owns detailed request validation.
- `mcp-tool-descriptions.ts` owns byte-stable registered descriptions.
- `mcp-response-envelope.ts` owns additive success/error/no-op response behavior and next actions.
- `mcp-runtime-contract.ts` owns build/runtime version metadata and catalog-health summaries.

The executable contracts are guarded by taxonomy tests, doc-drift tests, workflow evals, replay scenarios, and the MCP contract baseline.

---

## 4. Major Product Domains

### 4.1 Artifact and project-folder I/O

`charx-io.ts` serializes and loads all three supported artifact types. `folder-workspace.ts` maps those artifacts to editable project folders and back. Format-specific model and editor modules preserve document-specific structure while the main state store keeps the active normalized document.

Protected compatibility fields and deprecated save-time data are handled by explicit field-access and save policies rather than by renderer visibility alone.

### 4.2 Preview

The `.charx` preview is a central editor tab. Its main layers are:

- `preview-session.ts` for lifecycle and state;
- `preview-engine.ts` for CBS/Lua/regex/lorebook orchestration;
- `content-simulation.ts` for pure regex and lorebook behavior shared with MCP analysis;
- `preview-renderer.ts`, `preview-format.ts`, and `preview-sanitizer.ts` for safe rendering;
- `preview-workbench.ts` and `preview-panel.ts` for workspace controls;
- `preview-runtime.ts` and `preview-debug.ts` for execution feedback and traces.

Heavy Markdown, syntax-highlighting, math, CSS, and sanitization dependencies are loaded only when preview functionality is opened.

### 4.3 Editor and structured surfaces

The renderer combines Monaco text editing with structured managers and contextual inspectors. Shared form and manager modules handle lorebooks, regex scripts, triggers, greetings, RISUP prompts, assets, and document-specific metadata. Controllers coordinate these modules but do not own their parsing or persistence rules.

### 4.4 Terminal and assistants

`terminal-manager.ts` owns PTY processes in the main process. Renderer terminal controllers and `terminal-ui.ts` own xterm presentation and session selection. Assistant launch/configuration modules prepare Claude Code, GitHub Copilot CLI, Codex, and Antigravity CLI sessions and point them at the local MCP server.

### 4.5 Recovery and backups

Autosave, provenance sidecars, abnormal-exit recovery, and in-memory tab backups are separate concerns:

- main-process modules write autosaves and track recoverable sessions;
- renderer controllers present recovery choices and dirty-state status;
- `backup-store.ts` keeps bounded in-memory per-tab versions for editing recovery.

---

## 5. Core Data Flows

### 5.1 Open, edit, and save

```text
Renderer action
  └─ window.tokiAPI
       └─ main-process IPC
            ├─ charx-io / character-card-import / folder-workspace
            ├─ main-state-store becomes authoritative
            └─ normalized data returned or broadcast to renderer
                 └─ controller updates tabs, editors, inspectors, and Pinia UI state
```

Renderer drafts synchronize through save/autosave; they can temporarily differ from main state. Renderer-only document IDs reject snapshots belonging to a replaced document. MCP confirmation compares the current renderer draft with main state, while file and project saves check their existing content baselines. See [the data integrity audit](DATA_INTEGRITY_AUDIT.md) for conflict, checkpoint recovery, and normalization policies.

### 5.2 MCP tool call

```text
AI CLI
  └─ MCP stdio request
       └─ profile-registered handler / facade engine
            └─ authenticated localhost HTTP request
                 └─ mcp-api-server route family
                      ├─ read current/reference/external state
                      ├─ request confirmation when required
                      ├─ mutate authoritative state
                      └─ broadcast updates to the renderer
            └─ structured MCP response envelope
```

Standalone mode replaces the Electron-owned state and confirmation dependencies with `mcp-headless-server.ts` while retaining the same transport and route contracts.

### 5.3 Preview

```text
Central preview tab
  └─ preview-session
       └─ preview-engine
            ├─ CBS parser/evaluator
            ├─ shared regex/lorebook simulation
            ├─ Wasmoon Lua execution
            └─ safe Markdown/HTML/CSS rendering
       └─ runtime feedback and debug trace
```

### 5.4 Terminal

```text
Renderer xterm input ── IPC ──► main-process PTY
main-process PTY output ── IPC ──► terminal session/controller/UI
```

---

## 6. Build and Generated Outputs

| Command or config         | Responsibility                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `vite.config.ts`          | Builds the single `index.html` renderer entry and copies browser runtime assets                                    |
| `tsconfig.electron.json`  | Type-checks/compiles `main.ts`, `preload.ts`, and Electron bridge declarations as CommonJS under `.build/electron` |
| `build:preload`           | Bundles `preload.ts` to `.build/electron/preload.js` with esbuild                                                  |
| `tsconfig.node-libs.json` | Compiles selected Node-compatible TypeScript modules and test harnesses under `.build/node`                        |
| `build/build-mcp.js`      | Bundles `toki-mcp-server.ts`, embeds runtime version metadata, and copies required WASM files                      |

TypeScript sources no longer receive generated JavaScript siblings. Node and Electron compiler outputs are cleaned and rebuilt in their respective `.build/` subdirectories; the public standalone `toki-mcp-server.js` bundle and its WASM assets remain at the repository/application root. Electron packaging includes `.build/electron`, the renderer and MCP bundles, resources, and skill/document roots declared in `package.json`.

---

## 7. Current Hotspots

The largest or most integration-heavy areas are:

- `src/app/controller.ts`, which remains the top-level renderer orchestrator;
- facade and route-family modules for guarded MCP edits, structured items, RISUP prompts, lorebooks, and external/reference access;
- `preview-engine.ts`, which coordinates several compatibility-sensitive rendering stages;
- `main.ts`, which composes privileged services and IPC;
- shared structured editors such as `form-editor.ts` and RISUP prompt editors.

`toki-mcp-server.ts` and `mcp-api-server.ts` are orchestration/dispatch layers after the MCP module split; new family behavior should normally go into registration, facade, route, or helper modules rather than growing those entrypoints.

---

## 8. Guardrails for Future Changes

1. Keep `main.ts`, `src/app/controller.ts`, `toki-mcp-server.ts`, and `mcp-api-server.ts` as composition layers.
2. Put reusable behavior in the narrowest existing `src/lib/` module; extract a new module only when it reduces current complexity.
3. Add persistent renderer settings through `app-settings.ts`, not ad hoc storage keys.
4. Update `src/electron-api.d.ts`, preload wiring, and IPC handlers together.
5. Update taxonomy, registration, schemas, descriptions, docs, and eval/contract fixtures together when the MCP surface changes.
6. Preserve preview/apply/stale-guard semantics for mutations and validate the final target state.
7. Treat nearby tests as executable behavior specifications and run the checks required by `docs/PROJECT_RULES.md`.
