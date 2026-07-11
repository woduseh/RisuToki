---
name: writing-plugins-v3
description: 'Use when creating, editing, reviewing, or debugging RisuAI Plugin API v3 JavaScript or TypeScript. Primary skill for plugin sandbox, async API, storage, UI, and permissions; hand emitted CBS/HTML syntax to common skills. Do not use when authoring .charx, .risum, .risup, Lua, or regex without plugin code.'
tags: ['plugin', 'v3', 'sandbox', 'api', 'javascript']
related_tools: ['read_content', 'preview_edit', 'apply_edit']
artifact_types: ['plugin-v3']
canonical_sources:
  ['Risuai/plugins.md', 'Risuai/src/ts/plugins/apiV3/risuai.d.ts', 'Risuai/src/ts/plugins/migrationGuide.md']
---

# Writing RisuAI Plugins — API v3

## Runtime contract

Plugins run in a sandboxed iframe and communicate with the host across an async message boundary. Await every `risuai.*`, `SafeDocument`, and `SafeElement` call. Keep `//@api 3.0`; treat `//@name` as stable identity after release. Both plugins need matching `//@allowed-ipc` declarations for IPC.

## Minimal workflow

1. Inspect the metadata header, declared permissions, and existing entry/cleanup lifecycle.
2. Use an async IIFE or explicit async entry point with visible error handling.
3. Build plugin-owned UI with the iframe's normal `document`. Call `getRootDocument()` only for necessary host-DOM access and use its async safe wrappers.
4. Keep boundary data structured-clone-safe. Use safe setters/listeners; do not assume raw DOM nodes or functions cross the boundary.
5. Choose storage deliberately: syncable/save-owned plugin storage, device-local string/JSON storage, arguments, or permission-gated database access.
6. Register settings/buttons/providers/MCP/hooks with stable IDs where update/reload should replace prior registration. MCP identifiers begin with `plugin:`.
7. Track listener/registration handles and clean them up on unload or replacement when the API supports it.

Safe host DOM access may sanitize HTML, restrict attributes/tags/links, filter events, and require permissions. Respect CSP, AST safety checks, guarded globals, structured cloning, and user consent; do not design an escape. TypeScript uses the supported transform only—do not assume JSX or a full bundler.

Load `risu/plugins/docs/API_QUICKREF.md` for exact API signatures and `MIGRATION.md` only for legacy migration. Preserve upstream spelling where an API name intentionally contains a typo.

## Validation

Check metadata stability, awaited calls, rejected-promise paths, permissions, iframe versus host DOM choice, structured-clone compatibility, reload idempotence, cleanup, storage scope, and failure behavior when a capability is denied. Hand generated RisuAI HTML/CSS or CBS to its syntax Skill.
