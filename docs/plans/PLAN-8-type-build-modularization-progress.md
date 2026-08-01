# PLAN-8 type, build, and modularization progress

Updated: 2026-08-02 08:13 Asia/Seoul

## Goal

- Separate the Node/I/O and renderer document models, move generated JavaScript out of source directories, and reduce the largest integration modules without changing public behavior.

## Scope

- In scope: document type boundaries, serializer/IPC typing, Node and Electron build output isolation, focused extraction from `main.ts`, `src/app/controller.ts`, `src/lib/mcp-api-helpers.ts`, and `src/lib/mcp-facade-edit.ts`, tests, module docs, version, and changelog.
- Out of scope: Electron navigation policy, CSP changes, persistent coverage thresholds, new GUI/E2E infrastructure, MCP public contract changes, commits, pushes, packaging, publishing, and releases.

## Current state

- Done: baseline characterization; document type boundaries; build-output isolation; focused MCP helper/state, Electron IPC, renderer MCP-update, and facade operation-family extraction; module/build docs; patch version and changelog.
- Partial: none.
- Not started: none.
- Blocked: none.

## Decisions

- Work in the order type boundaries -> build isolation -> module extraction so later file moves use explicit document contracts and no longer create source-side JavaScript.
- Keep loaded Node/I/O data and serialized renderer data as distinct types; do not force them into a generic conditional model.
- Keep the public root `toki-mcp-server.js` command stable while moving TypeScript compiler output to `.build/`.
- Extract cohesive behavior with focused tests; line-count reduction alone is not an acceptance criterion.
- Keep each slice green and update this document after every completed phase.
- Ship the combined internal change as one patch version unless scope changes into a user-visible or public-contract change.

## Work plan

- [x] 0. Add or confirm characterization coverage for serializer boundaries and runtime build paths.
- [x] 1. Introduce distinct loaded-document and renderer-document types.
- [x] 2. Apply the new types across serializer, IPC, main state, renderer store, and MCP boundaries.
- [x] 3. Emit Node test/support JavaScript under `.build/node` and Electron JavaScript under `.build/electron`.
- [x] 4. Update runtime root resolution, scripts, packaging metadata, ignores, and build documentation.
- [x] 5. Split cohesive MCP API helper groups and make snapshots server-owned.
- [x] 6. Split Electron IPC registration groups from `main.ts`.
- [x] 7. Split renderer MCP-update/document/editor/sidebar orchestration from `controller.ts` where dependencies remain bounded.
- [x] 8. Split facade edit preview/apply operation families without changing envelopes or routes.
- [x] 9. Update `docs/MODULE_MAP.md`, relevant architecture/build guidance, version, and `CHANGELOG.md`.
- [x] 10. Run the full validation matrix and record results.

## Files and areas

- Read: root/project instructions, project workflow rules, prior execution-progress and test-split plans, document types, serializer call sites, build scripts/configuration, runtime `__dirname` assumptions, and large-module ownership sections.
- Changed: document type definitions and boundaries; build tsconfigs/scripts; Electron runtime root resolution; package metadata; direct-execution test roots; server-owned snapshots and section caches; utility IPC, renderer MCP update, and facade edit family modules; build/module docs; characterization fixtures; and this progress document.
- Removed: 122 ignored legacy JavaScript build artifacts beside TypeScript sources and tests. They are reproducible under `.build/` and were not tracked source files.
- Likely next: run the complete validation matrix and record final results.

## Validation

- Passed: `npm run typecheck`.
- Passed: 46 focused serializer tests during characterization.
- Passed: 118 affected renderer/serializer tests during the initial migration.
- Passed: 111 focused autosave, serializer, file-action, and MCP workflow tests after closing the boundary.
- Passed: `npm run build:node-libs`, direct Node tests (`test-rpack`, `test-charx`, `test:references`), and `npm run build:electron` with isolated outputs.
- Passed: 16 architecture/package assertions and the MCP contract baseline (4 profiles, 18 HTTP cases) from `.build/node`.
- Passed: focused structural tests (main utility IPC, renderer MCP update, terminal manager, MCP assets, doc drift) and 49 MCP server tests.
- Passed: full MCP search/edit harness, including facade-first, item/file management, and real-corpus external reads.
- Passed: final `npm run lint` and `npm run typecheck`.
- Passed: final `npm test` — Node regression scripts, 131 Vitest files with 2,116 passed and 2 skipped tests, and the complete MCP harness.
- Passed: workflow replay — 12 scenarios, 35/35 registered replayable tasks, 100% scenario/route/validation/bounded-read coverage, and zero wrong-target incidents.
- Passed: MCP contract baseline — 4 profiles and 18 HTTP cases.
- Passed: final Electron and renderer production builds; Electron output is under `.build/electron`, and Vite transformed 6,599 modules.
- Baseline from the preceding review: lint, typecheck, 2,111 tests, MCP replay, MCP contract baseline, Electron build, and renderer build passed on version 2.2.1.
- Intentionally not run: `electron-builder` packaging, GUI/E2E, publishing, commit, and push; these are outside the agreed scope.
- Known existing failures: none.

## Next steps

1. Review the completed change set and progress record.
2. Commit or publish only after explicit user approval.
