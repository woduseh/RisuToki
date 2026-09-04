---
name: writing-plugins-v3
description: 'Use for RisuAI Plugin API v3 JavaScript/TypeScript, sandbox, storage, UI, permissions, and hooks.'
tags: ['plugin', 'v3', 'sandbox', 'api', 'javascript']
related_tools: ['read_content', 'preview_edit', 'apply_edit']
artifact_types: ['plugin-v3']
canonical_sources:
  ['Risuai/plugins.md', 'Risuai/src/ts/plugins/apiV3/risuai.d.ts', 'Risuai/src/ts/plugins/migrationGuide.md']
---

# Writing RisuAI Plugins — API v3

## Runtime contract

Plugins run in a sandboxed iframe and communicate with the host across an async message boundary. Both `risuai` and its runtime alias `Risuai` are valid; prefer one spelling consistently within a plugin. Await API and safe-wrapper method calls, while reading cached properties such as `apiVersion` directly. Keep `//@api 3.0`; treat `//@name` as stable identity after release. Both plugins need matching `//@allowed-ipc` declarations for IPC.

Use the iframe's normal `document` for plugin-owned UI. `getRootDocument()` provides async safe wrappers for host-DOM access. Data crossing this boundary must be structured-clone-safe; raw DOM nodes and functions do not cross it.

Storage choices differ in scope: syncable/save-owned plugin storage, device-local string/JSON storage, arguments, and permission-gated database access. Registrations use stable IDs for replacement on reload; MCP identifiers begin with `plugin:`. Keep handles for supported cleanup, including chat listeners and `SafeMutationObserver.disconnect()`.

Keep metadata directives copyable: place only the directive and its value on each `//@...` line, with explanations outside the code block. Permission denial is a normal failure path; handle `null`, `false`, or rejected operations without assuming host access.

Safe host DOM access may sanitize HTML, restrict attributes/tags/links, filter events, and require permissions. Respect CSP, AST safety checks, guarded globals, structured cloning, and user consent; do not design an escape. TypeScript uses the supported transform only—do not assume JSX or a full bundler.

Output chat listeners run after output triggers and inlay processing. They receive a snapshot, are awaited sequentially, and mutations to that snapshot are not persisted; use an explicit setter for durable changes. TTS pre/postprocessors also form sequential pipelines. `readInlay` requires the periodically confirmed `inlay` permission.

Load `risu/plugins/docs/API_QUICKREF.md` for exact API signatures and `MIGRATION.md` only for legacy migration. Preserve upstream spelling where an API name intentionally contains a typo.

If plugin hooks must be ordered against CBS, Lua, triggers, or regex, read `RUNTIME_INTEROP.md` from `writing-trigger-scripts` through the Skill reader rather than treating this Skill as the owner of those layers.
