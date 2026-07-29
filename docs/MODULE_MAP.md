# Module Map

This map is for source navigation. It is not a full API reference.

## Reading rules

- Prefer `.ts` over generated `.js` siblings in `src/lib/`.
- Use nearby `.test.ts` files as executable behavior specs.
- Treat `main.ts` and `src/app/controller.ts` as integration layers; shared logic usually lives in `src/lib/`.

## Runtime entrypoints

- `main.ts` — Electron main-process entrypoint
- `preload.ts` — typed renderer bridge
- `src/main.ts` — main-window renderer entrypoint
- `toki-mcp-server.ts` — MCP tool-registration orchestration and stdio transport entrypoint

## Integration layers

- `src/app/controller.ts` — main-window integration and UI orchestration
- `src/app/project-workspace-controller.ts` — project-folder raw file tabs, validation, debounced writes, reloads, and sidebar rendering
- `src/app/terminal-sessions-controller.ts` — renderer terminal session lifecycle, active-session routing, tabs, CWD tracking, and xterm handles
- `src/components/` — Vue UI components
- `src/stores/` — shared renderer stores
- `src/styles/` — renderer styling and style tests

## MCP and agent harness

- `src/lib/mcp-api-server.ts` — MCP HTTP route handling and response contracts
- `src/lib/mcp-api-helpers.ts` — shared HTTP parsing, response, identity, surface, list, external-field, and section-cache helpers
- `src/lib/mcp-lorebook-routes.ts` — lorebook CRUD, stable-id, batch, diff, validation, text-edit, and charx compatibility routes
- `src/lib/mcp-risup-prompt-routes.ts` — RISUP prompt-item, formatting-order, diff, text import/export, and snippet routes
- `src/lib/mcp-structured-item-routes.ts` — regex, greeting, and trigger CRUD, identity, batch, and text-edit routes
- `src/lib/mcp-section-routes.ts` — active-document Lua and CSS section list, CRUD, batch, and text-edit routes
- `src/lib/mcp-reference-routes.ts` — loaded-reference inventory, field, lorebook, regex, greeting, trigger, section, and RISUP read routes
- `src/lib/mcp-external-routes.ts` — unopened-document inspection, field read/write/search, surface patch, and UI open-file routes
- `src/lib/mcp-field-routes.ts` — active-document field CRUD, batch, search, range, snapshot, statistics, and session-status routes
- `src/lib/mcp-headless-server.ts` — standalone/file-backed MCP session bootstrap and lifecycle
- `src/lib/mcp-cbs-routes.ts` — extracted CBS route-family helpers and dispatcher
- `src/lib/mcp-probe-routes.ts` — extracted unopened-file probe route helpers and dispatcher
- `src/lib/mcp-session-routes.ts` — extracted session-status route helpers and dispatcher
- `src/lib/mcp-surface-routes.ts` — extracted active-document JSON surface route dispatcher
- `src/lib/mcp-asset-routes.ts` — extracted charx/risum asset route dispatcher and WebP compression route
- `src/lib/mcp-field-access.ts` — MCP field name sets, document-type access rules, and field-read payload builders
- `src/lib/mcp-section-parser.ts` — compatibility re-export of the shared Lua/CSS section parser
- `src/lib/mcp-tool-taxonomy.ts` — tool-family single source of truth
- `src/lib/mcp-tool-descriptions.ts` — byte-stable MCP tool description catalog used by `tools/list`
- `src/lib/mcp-compact-input.ts` — compact public schemas, detailed handler validation, and static `tools/list` byte budgets for the 13 default tools
- `src/lib/mcp-facade-runtime.ts` — shared facade preview stores, digests, target labels, and API-error helpers
- `src/lib/mcp-facade-content.ts` — facade reads, validation, analysis, reference routing, and response envelopes
- `src/lib/mcp-facade-edit.ts` — guarded preview/apply planning for active and external facade edits
- `src/lib/mcp-facade-script-style.ts` — external structured reads/patch plans and active/external trigger, Lua, and CSS facade operations
- `src/lib/mcp-facade-items.ts` — structured collections, script/style items, RISUP prompts, and prompt-snippet facade operations
- `src/lib/mcp-facade-assets.ts` — active/external asset reads, mutation plans, compression, and guarded apply operations
- `src/lib/mcp-facade-files.ts` — guarded file, snapshot, lorebook import/export, and project-folder facade operations
- `src/lib/mcp-danbooru-engine.ts` — local Danbooru tag database, search/validation caches, online fallback, and prompt-guide generation
- `src/lib/mcp-tool-register-facade.ts` — ordered registration for Facade v1, manage-items, manage-assets, and manage-file tools
- `src/lib/mcp-tool-register-fields.ts` — ordered field, external-document, surface, search, and session tool registration
- `src/lib/mcp-tool-register-authoring.ts` — ordered lorebook, regex, greeting, trigger, Lua, and CSS tool registration
- `src/lib/mcp-tool-register-reference.ts` — ordered reference, asset, project-folder, and skill tool registration
- `src/lib/mcp-tool-register-validation.ts` — ordered Danbooru and CBS validation tool registration
- `src/lib/mcp-tool-register-risup.ts` — ordered `.risup` prompt and snippet tool registration
- `src/lib/mcp-tool-registration.ts` — shared registration dependency and handler result types
- `src/lib/mcp-proxy-client.ts` — injected localhost HTTP proxy client with structured errors and runtime diagnostics
- `src/lib/toki-standalone-bootstrap.ts` — standalone argv/env parsing, tool-profile resolution, and headless API startup
- `src/lib/mcp-response-envelope.ts` — additive success envelope, deterministic `next_actions`, and success-response size metadata
- `src/lib/mcp-search.ts` — search behavior for MCP search tools
- `src/lib/mcp-data-update.ts` — shared MCP-side data update helpers
- `src/lib/mcp-config.ts` — MCP configuration
- `src/lib/mcp-runtime-contract.ts` — MCP build/runtime metadata and tool-catalog health summaries
- `src/lib/mcp-request-schemas.ts` — MCP request parameter validation schemas
- `src/lib/mcp-api-test-harness.ts` — shared MCP HTTP test server harness for route-family tests
- `src/lib/mcp-api-vitest-helpers.ts` — Vitest-only lifecycle and assertion helpers kept out of the Node contract harness
- `src/lib/assistant-launch.ts` — assistant process launch flow
- `src/lib/assistant-prompt.ts` — assistant bootstrap prompt assembly
- `src/lib/agents-md-manager.ts` — runtime `AGENTS.md` generation

## File formats and RisuAI document modeling

- `src/charx-io.ts` — `.charx`, `.risum`, `.risup` serialization and loading
- `src/lib/character-card-import.ts` — PNG/JSON Character Card import into normalized `.charx` document data
- `src/lib/folder-workspace.ts` — `.charx` / `.risum` / `.risup` project-folder extraction, loading, saving, tree reads, watching support, and type-aware export
- `src/lib/deprecated-save-policy.ts` — save-time stripping policy for deprecated/unrecommended `.charx`, `.risum`, and `.risup` fields
- `src/lib/charx-export-compatibility.ts` — `.charx` RisuAI upload compatibility checks for card/module lorebook/regex mirrors and assets
- `src/lib/data-serializer.ts` — normalized document serialization helpers
- `src/lib/document-validation.ts` — document-shape validation
- `src/lorebook-convert.ts` — lorebook conversion helpers
- `src/lib/lorebook-io.ts` — lorebook import/export helpers
- `src/lib/sillytavern-world-info.ts` — SillyTavern `world_info` JSON detection and lorebook-entry conversion
- `src/lib/lorebook-folders.ts` — lorebook folder identity and hierarchy handling
- `src/lib/lorebook-decorators.ts` — lorebook decorator parsing and rendering helpers
- `src/lib/section-parser.ts` — canonical Lua/CSS section parsing shared by renderer, Electron main, and standalone MCP
- `src/lib/risup-json-fields.ts` — shared validation/parsing contract for JSON-backed `.risup` text fields
- `src/lib/asset-utils.ts` — shared asset file-name and `cardAssets`/`xMeta` reference synchronization
- `src/lib/persona-store.ts` — bundled-default plus user-override RP persona persistence
- `src/lib/trigger-script-model.ts` — trigger-script data model
- `src/lib/trigger-form-editor.ts` — trigger-script form editing helpers
- `src/lib/trigger-scripts-runtime.ts` — trigger-script runtime execution
- `src/lib/risup-fields.ts` — structured risup field definitions
- `src/lib/risup-form-editor.ts` — risup form editing
- `src/lib/risup-prompt-editor.ts` — risup prompt-item editing and focused single-block editor rendering
- `src/lib/risup-prompt-manager-panel.ts` — movable RisuMari-style `.risup` prompt manager panel for search/filter/open/add/duplicate/delete/reorder workflows
- `src/lib/risup-prompt-model.ts` — risup prompt-item parsing/model helpers, including whole-template text import/export
- `src/lib/risup-prompt-compare.ts` — serializer-backed risup prompt/reference compare helpers for MCP diffs
- `src/lib/risup-prompt-snippet-store.ts` — sidecar-backed persistent risup prompt snippet library
- `src/lib/risup-toggle-editor.ts` — customPromptTemplateToggle visual/raw editor
- `src/lib/risup-toggle-model.ts` — customPromptTemplateToggle syntax parsing/model helpers

## CBS (Custom Bracket Syntax)

- `src/lib/cbs-parser.ts` — CBS expression parser
- `src/lib/cbs-evaluator.ts` — CBS expression evaluator

## Preview runtime

- `src/lib/preview-session.ts` — preview session lifecycle
- `src/lib/preview-engine.ts` — preview rendering engine
- `src/lib/preview-assets.ts` — CCv2/CCv3/module/ZIP preview asset normalization, typed manifests, MIME preservation, and primary-icon aliases
- `src/lib/preview-renderer.ts` — RisuAI-compatible Markdown, KaTeX, syntax highlighting, class prefixing, and scoped CSS rendering
- `src/lib/preview-workbench.ts` — shared greeting, viewport, role-injection, and typed asset-gallery controls for the central preview tab
- `src/lib/content-simulation.ts` — shared pure regex execution and lorebook activation logic used by preview and MCP analysis
- `src/lib/preview-runtime.ts` — runtime execution inside preview
- `src/lib/preview-format.ts` — preview formatting helpers
- `src/lib/preview-debug.ts` — preview debug views
- `src/lib/preview-panel.ts` — central editor preview-tab UI state
- `src/lib/preview-sanitizer.ts` — preview HTML sanitization

## Editor, layout, and sidebar UI

- `src/lib/workspace-model.ts` — file-type workspace definitions plus navigator and contextual inspector selection contracts
- `src/lib/workspace-layout-state.ts` — normalized/persisted V2 navigator, inspector, reference-drawer, and terminal-shelf layout state, including one-way legacy-state migration
- `src/lib/tab-manager.ts` — tab lifecycle management
- `src/lib/indexed-tabs.ts` — indexed tab helpers
- `src/lib/list-reorder.ts` — shared flat-list reorder helper for structured editors
- `src/lib/form-editor.ts` — generic form-editing helpers
- `src/lib/charx-sidebar-fields.ts` — charx sidebar field model
- `src/lib/sidebar-builder.ts` — sidebar tree construction
- `src/lib/sidebar-actions.ts` — sidebar mutations/actions
- `src/lib/sidebar-dnd.ts` — document-item drag-and-drop behavior for lorebook, regex, Lua/CSS, greetings, and assets; independent from workspace panel placement
- `src/lib/right-manager-panel.ts` — contextual lorebook, asset-tree, and thumbnail navigator rendering inside the unified shell
- `src/lib/sidebar-refs.ts` — sidebar reference integration
- `src/lib/editor-activation.ts` — editor focus/activation state
- `src/lib/editor-dirty-fields.ts` — dirty-field tracking
- `src/lib/document-stats.ts` — status-bar document summary counts and active-tab character statistics
- `src/lib/context-menu.ts` — renderer context menus
- `src/lib/menu-bar.ts` — menu commands and wiring
- `src/lib/dialog.ts` — shared dialog helpers
- `src/lib/help-popup.ts` / `src/lib/settings-popup.ts` — popup UIs
- `src/lib/switch-control.ts` — shared accessible boolean switch control
- `src/lib/markdown-preview.ts` — sanitized rendered preview for Markdown guide and project tabs
- `src/lib/status-bar.ts` — status-bar rendering/state
- `src/lib/image-viewer.ts` — image preview helpers
- `src/lib/monaco-loader.ts` — Monaco bootstrap
- `src/lib/dark-mode.ts` — dark-mode state
- `src/lib/theme-registry.ts` — app theme presets, custom palettes, and Monaco/terminal theme specs

## Terminal and chat

- `src/lib/terminal-manager.ts` — multi-session PTY lifecycle and legacy default-session terminal IPC
- `src/lib/terminal-shell.ts` — PTY shell wrapper
- `src/lib/terminal-ui.ts` — terminal renderer UI helpers
- `src/lib/terminal-chat.ts` — TUI cleanup and numbered-choice parsing
- `src/lib/terminal-session-context.ts` — terminal session context
- `src/lib/chat-session.ts` — shared chat state machine
- `src/lib/chat-ui.ts` — chat rendering helpers
- `src/lib/runtime-feedback.ts` — user-visible runtime feedback banners

## Persistence, autosave, and recovery

- `src/lib/app-settings.ts` — normalized app settings and recent-item persistence
- `src/lib/stored-state-validation.ts` — persisted-state validation
- `src/lib/backup-store.ts` — backup persistence
- `src/lib/autosave-manager.ts` — autosave policy and scheduling
- `src/lib/session-recovery.ts` — recovery data model/helpers
- `src/lib/session-recovery-main.ts` — main-process recovery hooks
- `src/lib/session-recovery-manager.ts` — recovery orchestration
- `src/lib/main-state-store.ts` — main-process state store
- `src/lib/file-actions.ts` — file open/save actions
- `src/lib/close-window-policy.ts` — close-window guards

## References, external tabs, and guide material

- `src/lib/external-text-tab.ts` — external text tab handling
- `src/lib/reference-item-registry.ts` — shared read-only reference item descriptors and visibility rules
- `src/lib/reference-explorer-model.ts` — compact CHARX/RISUM/RISUP workspace groups for the reference sidebar
- `src/lib/reference-shared.ts` — browser-safe reference manifest helpers shared by reference UI and persistence code
- `src/lib/reference-store.ts` — reference-file persistence
- `src/lib/guides-manager.ts` — in-app guide loading
- `src/lib/content-roots.ts` — tracked skill/doc root definitions and generated catalog paths
- `src/lib/guide-catalog.ts` — multi-root built-in guide enumeration and resolution
- `src/lib/skill-catalog.ts` — multi-root skill enumeration and resolution

## Assets and media

- `src/lib/asset-output-wizard.ts` — pure asset-filename analysis, exact-key output plan generation, and marked lorebook/globalNote block application
- `src/lib/asset-manager.ts` — asset CRUD helpers, including batch delete and batch rename IPC for manager-panel multi-select workflows
- `src/lib/asset-batch-rename.ts` — pure asset batch rename preview and conflict-planning helper
- `src/lib/asset-runtime.ts` — asset runtime resolution
- `src/lib/image-compressor.ts` — asset compression helpers
- `src/lib/avatar.ts` / `src/lib/avatar-dialogue.ts` / `src/lib/avatar-ui.ts` — avatar assets, character dialogue, rendering/state
- `src/lib/bgm.ts` — background music helpers

## Shared infrastructure

- `src/lib/shared-utils.ts` — clone, MIME, and normalizeLF shared utilities
- `src/lib/atomic-write.ts` — same-directory temp-file + rename helpers for crash-safer state and document writes
- `src/lib/preload-api.ts` — typed renderer API surface
- `src/lib/ipc-confirm.ts` — confirmation IPC helpers
- `src/lib/action-registry.ts` — command registry
- `src/lib/skill-link-sync.ts` — local skill-link synchronization
- `src/lib/drag-drop-import.ts` — drag/drop import helpers
- `src/lib/script-loader.ts` — script loading helpers
