# Changelog

이 파일은 [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/) 형식을 따르며,
[시멘틱 버저닝](https://semver.org/lang/ko/)을 사용합니다.

- **MAJOR (x.0.0)**: 호환성을 깨는 변경
- **MINOR (0.x.0)**: 새 기능 추가 (하위 호환)
- **PATCH (0.0.x)**: 버그 수정 (하위 호환)

---

## [0.68.1] - 2026-05-04

### Fixed

- Fixed Codex startup failures caused by invalid non-boolean values left under `.codex/config.toml` `[features]`, including stale local MCP URL entries such as `url = "http://localhost:.../mcp"`.
- Hardened Codex MCP config block replacement and cleanup so RisuToki-managed TOML sections do not glue adjacent tables together.

## [0.68.0] - 2026-05-04

### Added

- Added dogfood MCP eval coverage for facade workflows, compact profile catalogs, external edit support, and guidance-loading behavior.
- Added `list_tool_profiles`, `validate_content`, and `load_guidance` facade tooling for profile-scoped discovery, content validation, and workflow guidance loading.
- Added external-file edit support to the facade preview/apply path.

### Changed

- Extracted unopened-file probe handling into dedicated MCP route helpers and updated module routing docs, lint, and TypeScript build coverage.
- Synced MCP facade/profile guidance across AGENTS, docs, and generated skill copies.

### Fixed

- Polished status-bar dismissal styling and interaction coverage so transient UI status messages can be cleared cleanly.

## [0.67.0] - 2026-05-04

### Added

- Added facade-first MCP public workflow tooling and docs for migration from legacy route names.
- Added session integrity metadata to MCP responses so agents can verify active-document state and stale-guard context.

### Changed

- Routed MCP documentation and skills around the public facade surface while preserving legacy migration guidance.
- Extracted internal MCP session-status route handling into dedicated helpers for clearer API-server boundaries.

### Fixed

- Improved keyboard focus and resizer accessibility behavior across the UI.

## [0.66.0] - 2026-05-04

### Added

- Added structured MCP stale-guard metadata via `risutoki/staleGuardDetails`, including guard names, payload paths, source-operation hints, retry guidance, and batch alignment details while preserving the existing `risutoki/staleGuards` array.
- Added MCP safety contracts for Lua/CSS section `expected_hash` and `expected_preview` writes, asset `expected_path` mutations, and `compress_assets_webp` dry-run previews.
- Added real MCP SDK smoke/eval coverage for `tools/list` metadata visibility, stale-guard refresh/retry behavior, destructive previews, and external-file safety boundaries.
- Added keyboard-accessible menu-bar semantics and focused UI accessibility coverage for ARIA-labelled icon controls, sidebar expand behavior, focus-visible affordances, and reduced-motion preferences.

### Changed

- Reference manifest restore now preserves temporarily missing or failed reference paths instead of immediately pruning and persisting a shortened manifest.
- Autosave cleanup now checks recovery sidecar provenance before deleting sidecar-backed autosaves in shared custom autosave directories.

### Fixed

- Dialog-based open-file failures now surface as user-visible errors instead of looking like user cancellation.
- Hardened recovery/autosave failure-mode handling for malformed records, invalid provenance, untitled autosave policy, sidecar write failures, and bounded renderer session-status waits.

## [0.65.4] - 2026-05-04

### Changed

- `.charx`, `.risum`, and `.risup` saves now write through same-directory temp files before renaming into place, reducing the risk of corrupting the existing document on write failure.

### Fixed

- Fixed Save As and first-save flows so the active document path and window title are updated only after the target file is written successfully.

## [0.65.3] - 2026-05-04

### Changed

- Ignored repo-local LLM agent work directories such as `.codex/`, `.codex-work/`, `output/`, and `tmp/` so transient agent artifacts no longer appear as untracked workspace noise.

## [0.65.2] - 2026-05-04

### Added

- Added a shared atomic-write helper and tests for same-directory temp-file writes followed by rename.
- Added MCP `tools/list` metadata for `risutoki/family` and `risutoki/staleGuards` so agents can discover workflow families and optional stale-guard parameters without reading docs first.

### Changed

- Reference manifest persistence, autosave recovery sidecars, and session recovery records now use atomic-write paths where available.
- Updated MCP tool-surface docs and MCP workflow skill guidance for the expanded `tools/list` metadata.

### Fixed

- Fixed MCP skill frontmatter parsing for indented YAML flow arrays, restoring built-in skill metadata such as `file-structure-reference` related tools.

## [0.65.1] - 2026-05-04

### Fixed

- Updated Skill routing docs to use model-neutral agent operating contracts, reduce unnecessary preload guidance, and keep detailed MCP tool choice centralized in `using-mcp-tools`.
- Updated RisuAI-dependent authoring skill references to match upstream Lua lifecycle/access semantics, CBS `runVar` behavior, lorebook folder references, regex special actions, HTML/CSS class scoping, and related Lua/CBS reference details.

## [0.65.0] - 2026-05-01

### Added

- Added standalone RisuToki MCP mode via `toki-mcp-server.js --standalone`, allowing Codex and other MCP clients to use file-backed `.charx` / `.risum` / `.risup` tools without launching the Electron app.
- Added headless MCP runtime support for `--file`, repeated `--ref`, `--allow-writes`, and `--user-data-dir` options.

### Changed

- Documented app-backed versus standalone MCP operation in README, MCP workflow docs, and agent routing guidance.

### Fixed

- Fixed `npm run sync:skills` so Windows CI and release installs no longer fail when `.claude/skills`, `.gemini/skills`, or `.github/skills` already exist as checked-out managed directories instead of repairable links.
- Managed skill discovery directories now refresh in place when they are safe catalog copies, while still refusing unexpected real directories.

## [0.64.0] - 2026-04-26

### Added

- Added MCP surface tools for JSON Pointer based document inspection and edits: `list_surfaces`, `read_surface`, `patch_surface`, and `replace_in_surface`.
- Added unopened-file surface tools `external_read_surface` and `external_patch_surface`, with the same active-file rejection policy as other `external_*` mutation routes.
- Added `save_current_file` so agents can explicitly persist the active document after MCP edits.

### Changed

- Updated MCP taxonomy, response next-actions, workflow docs, and skill guidance to include the new surface-editing fallback layer for `.charx`, `.risum`, and `.risup` files.

## [0.63.0] - 2026-04-22

### Added

- Added native Codex repo-skill discovery support to `npm run sync:skills` by repairing a repo-local `.agents/skills` link alongside the existing Claude, Gemini, and Copilot CLI paths.

### Changed

- Expanded `skill-link-sync` coverage so placeholder repair, stable re-sync, blocked-`realpath` handling, junction fallback, and unexpected-directory protection all cover the Codex path too.
- Updated `README.md`, `AGENTS.md`, `docs/`, and `skills/` workflow docs to document the Codex `.agents/skills` discovery path while keeping the existing `AGENTS.md` + MCP fallback guidance.

## [0.62.1] - 2026-04-20

### Fixed

- MCP error envelope preservation: `apiRequest()` now resolves (never rejects) with the full structured error body from `mcp-api-server.ts`, so agents receive `suggestion`, `retryable`, `next_actions`, and `details` instead of a flattened string.
- Infrastructure error differentiation: `ECONNREFUSED` (editor not running, 503), request timeouts (504), and network failures (502) now return distinct `isError: true` responses with actionable `suggestion` and `retryable: true`.
- Server version sync: `McpServer` version is now injected at build time via esbuild `--define` instead of being hardcoded, eliminating version drift.

### Changed

- MCP tool responses now use compact JSON (`JSON.stringify(data)` instead of `JSON.stringify(data, null, 2)`), saving ~30% tokens on all 166 tool responses.
- Added MCP standard logging via `server.sendLoggingMessage()` for startup, tag DB loading, and API infrastructure errors.
- `build:mcp` script now uses `build/build-mcp.js` wrapper for cross-platform esbuild invocation with `__APP_VERSION__` injection.
- Updated `docs/MCP_ERROR_CONTRACT.md` to document error envelope preservation and infrastructure error differentiation.

## [0.62.0] - 2026-04-18

### Added

- New MCP tool `validate_risup_prompt_import` — verifies that imported prompt text matches current `promptTemplate` content by comparing serialized item blocks with ID normalization. Catches silent import mismatches.
- New MCP tool `batch_delete_risup_prompt_items` — deletes multiple prompt items in one confirmed operation with `expected_types`/`expected_previews` stale-index guards.
- `add_risup_prompt_item` and `add_risup_prompt_item_batch` now accept optional `insertAt` parameter for positional insertion instead of always appending.
- `validate_cbs` now accepts optional `file_path` parameter to validate CBS in external files without switching the active document.

### Fixed

- `rangeEnd` in chat prompt items now accepts negative integers (e.g., `-2`) during text-format import/parse, matching the upstream `number | 'end'` type contract.
- `customPromptTemplateToggle` is now included in `STRING_MUTATION_FIELD_NAMES`, enabling `replace_in_field`, `insert_in_field`, and `search_in_field` on this field.

### Changed

- Enhanced `writing-risup-presets` skill with MD-to-risup migration workflow, prefill patterns, multi-preset verification checklist, chat range rules, and toggle migration guide.
- Enhanced `using-mcp-tools` skill with import verification workflow, batch delete guidance, and insertAt usage.
- Updated MCP docs (`MCP_TOOL_SURFACE.md`, `MCP_WORKFLOW.md`) to reflect new tools and parameter additions.

## [0.61.5] - 2026-04-17

### Added

- Added unopened-file MCP inspection and direct path-based editing routes so `.charx`, `.risum`, and `.risup` files can now be queried and edited by absolute path without switching the active UI document.
- Added missing unopened-file probe readers for CSS, greetings, triggers, and risup prompt/formating-order surfaces, plus a lightweight `inspect_external_file` summary route.

### Changed

- Updated MCP taxonomy, workflow docs, and skill guidance so unopened-file work now distinguishes read-only `probe_*` tools from direct path-based `external_*` mutation/search routes, including the rule that external writes reject the currently active UI document.

## [0.61.4] - 2026-04-12

### Changed

- Moved `writing-arca-html` from `risu/bot/skills/` to `risu/common/skills/` so it is routed as a shared formatting/presentation skill instead of a bot-local composition skill.
- Updated bot/common/root routing and discovery docs so Arca/WYSIWYG HTML is now documented alongside the shared skill set.

## [0.61.3] - 2026-04-12

### Changed

- Tightened the bot-skill routing docs after a multi-agent review: reduced duplicated opener taxonomy between the character and lorebook skills, softened lorebook-skill wording that overstated its boundary against single-character authoring, and clarified that the self-introduction skill is adapted from its reference docs rather than subordinate to them.
- Reorganized bot-skill discovery docs so `writing-arca-html` is clearly presented as an on-demand presentation skill, and clarified in its skill guide that RisuAI surface HTML/CSS work should use `writing-html-css` instead.

## [0.61.2] - 2026-04-12

### Changed

- Renamed the self-introduction skill companion file from `GENERATION_PROMPTS.md` to `GENERATION_GUIDANCE.md` so the filename matches its guidance-oriented content, and updated all in-repo references accordingly.

## [0.61.1] - 2026-04-12

### Changed

- Clarified in the shared `writing-lua-scripts` and `writing-trigger-scripts` skills that current RisuAI authoring/tooling treats Lua mode and structured trigger-script mode as separate workflows, even though Lua is persisted as a `triggerlua` wrapper in the first trigger slot.

## [0.61.0] - 2026-04-12

### Added

- Added a new `authoring-self-introduction-sheets` bot skill with companion structure and generation guidance for inference-first self-introduction character-sheet authoring.
- Added polished English reference docs for the self-introduction character-sheet methodology alongside the existing Korean originals under `risu/bot/docs/자기소개형 캐릭터 시트/`.

### Changed

- Updated bot-authoring routing and skill boundaries so `authoring-characters`, `authoring-self-introduction-sheets`, and `authoring-lorebook-bots` now form an explicit three-way split between scaffolded character sheets, self-introduction monologue sheets, and lorebook-driven architecture.
- Updated README and bot-skill discovery docs to expose the new skill and cross-link the source/reference material.

## [0.60.5] - 2026-04-11

### Added

- Added `risu/common/AGENTS.md` so the shared authoring subtree now has its own local router instead of borrowing product-first root guidance.

### Changed

- Switched Copilot CLI authoring routing from repo-wide `.github/instructions` files to a product-first root `AGENTS.md` plus nearest-subtree `risu/{common,bot,prompts,modules,plugins}/AGENTS.md` routers after validating that the current CLI loads all `.github/instructions/*.instructions.md` files together.
- Narrowed the root `AGENTS.md` mandatory rules to repo-wide/product behavior and moved authoring-only MCP guidance back into subtree-local routers so `risu/bot`, `risu/prompts`, and `risu/modules` no longer inherit unrelated artifact instructions from the repo root.
- Updated README, contributing docs, project rules, and skill readmes to document that the skill catalog remains repo-global while active authoring guidance is selected by the nearest local `AGENTS.md`.

## [0.60.4] - 2026-04-11

### Fixed

- Treated Windows symlinks with a matching stored target as already-correct even when `realpath` is blocked during `npm ci`, preventing `sync:skills` from failing on GitHub Actions checkouts.

## [0.60.3] - 2026-04-11

### Fixed

- Switched `sync:skills` link detection from `existsSync` to `lstatSync`, so Windows installs no longer try to recreate already-present `.copilot-skill-catalog` links during `npm ci`.

## [0.60.2] - 2026-04-11

### Fixed

- Updated the tracked `.claude/skills`, `.gemini/skills`, and `.github/skills` symlink targets to point at `.copilot-skill-catalog`, so fresh clones expose the unified multi-root authoring catalog before running any local repair step.

## [0.60.1] - 2026-04-11

### Fixed

- Fixed the Windows `skill-link-sync` symlink-target expectation so the tag-triggered release workflow follows the generated `.copilot-skill-catalog` link target instead of the old root `skills/` path.

## [0.60.0] - 2026-04-11

### Added

- Added a selectively tracked `risu/` authoring knowledge tree with new router/readme surfaces plus dedicated `.risup`, `.risum`, and plugin v3 skill bundles under `risu/prompts/`, `risu/modules/`, and `risu/plugins/`.
- Added new authoring references for the split surfaces: `.risup` preset field docs, `.risum` module field docs, plugin API v3 quick reference, and plugin migration guidance.

### Changed

- Split product/editor skills from authoring skills so root `skills/` stays product-focused while shared/artifact-specific authoring docs live under `risu/common/` and `risu/{bot,prompts,modules,plugins}/`.
- Updated skill/doc discovery, routing docs, and packaging metadata so the generated `.copilot-skill-catalog` and packaged app include the tracked multi-root authoring surfaces without bundling ignored local work products.

## [0.59.1] - 2026-04-11

### Changed

- Removed unused imports, helpers, exports, and unused callback parameters across the controller, preview, avatar, asset runtime, BGM, popout, agents-md-manager, and risup field modules to shrink dead surface area without changing behavior.
- Dropped dead `sync-server` references from the lint/typecheck metadata and pruned the module map so project docs match the remaining source tree.

### Removed

- Deleted fully unused modules and artifacts: `src/lib/logger.ts`, `src/lib/sync-server.ts`, stale `src/lib/sync-server.js`, `src/lib/copilot-agent-profile-manager.js`, and `src/lib/pluni-persona.js`.

## [0.59.0] - 2026-04-11

### Added

- Added richer preview markdown rendering for headings, ordered/unordered lists, links, strikethrough, and horizontal rules.
- Added safe structural HTML support in preview messages for common content tags such as headings, lists, details/summary, figure/figcaption, section/article, description lists, underline, subscript, and superscript.

### Changed

- Switched preview message content wrappers from inline `span` containers to block-safe `div` containers so structural HTML is no longer reparented or flattened by invalid markup.
- Expanded preview styling/tests so richer HTML blocks render consistently in both inline and pop-out preview flows while keeping the existing sandbox/CSP protections.

## [0.58.0] - 2026-04-11

### Added

- Added optional stale-index guards to the remaining high-traffic indexed MCP mutation families: regex and trigger writes now accept `expected_comment`, greeting writes/deletes accept `expected_preview` / `expected_previews`, and risup prompt-item writes accept `expected_type` plus optional `expected_preview`. Mismatches now return `409 Conflict` instead of silently applying to shifted indices.

### Changed

- Normalized additional batch mutation success payloads so `write_regex_batch`, `batch_write_greeting`, `batch_delete_greeting`, and `add_risup_prompt_item_batch` include per-item `results[]` alongside their legacy fields.
- Updated MCP workflow/docs/skills/README guidance so indexed-write guard routing now covers lorebook, regex, greeting, trigger, and risup prompt-item families instead of only the lorebook-first slice.

## [0.57.0] - 2026-04-11

### Added

- Added optional `expected_comment` identity guards to the lorebook indexed mutation routes: `write_lorebook`, `write_lorebook_batch`, `clone_lorebook`, `delete_lorebook`, `batch_delete_lorebook`, `replace_in_lorebook`, `replace_block_in_lorebook`, `insert_in_lorebook`, `replace_in_lorebook_batch`, and `insert_in_lorebook_batch`. Supplying a mismatched comment now returns `409 Conflict` instead of silently applying a stale-index mutation.
- Added `dry_run` preview support to `replace_in_lorebook_batch` so agents can inspect multi-entry replacement matches before a confirmed write.

### Changed

- Normalized lorebook batch mutation success payloads to include per-entry `results[]` alongside legacy summary fields so agents can verify outcomes without an immediate follow-up read.
- Updated MCP workflow/docs/skills/README guidance so lorebook index-based edits now explicitly recommend carrying `list_lorebook` comments into `expected_comment` / `expected_comments` for stale-index safety.

### Note

- Identity guards and batch-result normalization remain lorebook-first in this release. Regex, greeting, trigger, and `.risup` indexed mutation families still need parity in a follow-up roadmap slice.

## [0.56.0] - 2026-04-11

### Added

- Added machine-readable MCP mutation metadata through tool `_meta`, exposing `risutoki/requiresConfirmation` and `risutoki/supportsDryRun` so clients can prefer preview-first routes and anticipate approval pauses without guessing from descriptions alone.

### Changed

- Updated MCP taxonomy/tests and the MCP integration smoke test so mutation metadata stays aligned with registered tool descriptions and survives `tools/list` serialization.
- Updated MCP workflow/docs/skills/README guidance to teach agents to inspect tool `_meta` before choosing between sibling write routes.

## [0.55.1] - 2026-04-11

### Fixed

- Synced the MCP server self-reported version and the README release badge with the package version so tool metadata and documentation no longer lag behind the shipped build.

## [0.55.0] - 2026-04-11

### Added

- Added `surfaceSummary` to `session_status`, exposing compact structured-surface counts for lorebook, regex, greetings, triggers, Lua sections, CSS sections, and `.risup` prompt items so agents can skip unnecessary discovery loops.

### Changed

- Updated MCP workflow/docs/skills/README guidance so `session_status` is now documented as the first discovery step for both editor state and structured-surface availability.

## [0.54.0] - 2026-04-11

### Added

- Added batch-read MCP routes for active structured families that previously forced repeated single reads: `read_regex_batch`, `read_greeting_batch`, and `read_trigger_batch`.
- Added matching read-only reference batch readers for sibling comparison flows: `read_reference_greeting_batch`, `read_reference_trigger_batch`, `read_reference_regex_batch`, and `read_reference_risup_prompt_item_batch`.

### Changed

- Updated MCP workflow/docs/skills/README guidance so multi-item inspection paths now point agents toward batch readers instead of repeated single-item loops.

## [0.53.0] - 2026-04-11

### Fixed

- Fixed `compress_assets_webp` taxonomy hint from `WRITE` to `DESTRUCTIVE` — lossy compression is irreversible and agents should treat it accordingly.
- Added `dry_run`/`dryRun` conflict guard to `replaceBodySchema`, `blockReplaceBodySchema`, and `batchReplaceBodySchema` — payloads supplying both keys with conflicting boolean values are now rejected with a clear error. `dry_run` is the canonical key; `dryRun` remains as a deprecated alias.
- Replaced private `_registeredTools` access for taxonomy annotation patching with a public-API interceptor that collects `RegisteredTool` handles and calls `.update()` — eliminates fragile dependency on MCP SDK internals.

## [0.52.0] - 2026-04-10

### Added

- Added deterministic per-tool `next_actions` overrides for high-traffic MCP flows such as `open_file`, generic field reads/writes, reference reads, and batch risup prompt edits so agents are steered toward narrower follow-up tools.
- Added workflow mirror drift coverage so `docs/MCP_WORKFLOW.md` and `skills/project-workflow/MCP_WORKFLOW.md` cannot silently diverge.

### Changed

- Tightened MCP tool descriptions for generic `field`, `probe`, `search`, and reference reads so they front-load dedicated-tool warnings instead of burying routing guidance in long field catalogs.
- Compactified MCP workflow/reference docs around critical anti-patterns, start-here routing, per-tool `next_actions`, and prompt-vs-tool distinctions such as `danbooru_tag_guide`.
- Corrected `insert_in_lua` and `insert_in_css` so `position` is constrained to the documented enum values instead of accepting arbitrary strings.

## [0.51.0] - 2026-04-10

### Added

- Added `diff_risup_prompt`, an MCP compare precursor that diffs the current `.risup` preset against a loaded reference `.risup` using serializer-backed `promptTemplate` line summaries plus `formatingOrder` token/warning comparisons.

### Changed

- Updated the risup MCP workflow/docs/skills/README/module map so agents can use a prompt-specific compare step before importing blocks or aligning prompt order against a reference preset.

## [0.50.0] - 2026-04-10

### Added

- Added a persistent, sidecar-backed `.risup` prompt snippet library with MCP tools for listing, reading, saving, inserting, and deleting reusable serializer-based prompt blocks across sessions.

### Changed

- `save_risup_prompt_snippet` can now persist either existing serializer text or selected `promptTemplate` indices, and `insert_risup_prompt_snippet` reuses append-style insertion with fresh prompt item ids plus `dry_run` previews.
- Updated the risup MCP workflow/docs/skills/README/module map so agents can route reusable block workflows through the new prompt snippet library instead of only ad-hoc copy/import chains.

## [0.49.0] - 2026-04-10

### Changed

- Existing `formatingOrder` consistency diagnostics are now surfaced directly on `.risup` prompt mutation responses, so add/write/delete/reorder/import flows can return `orderWarnings` without requiring a separate `read_risup_formating_order` step.
- `write_risup_formating_order` now also returns its advisory `warnings` array immediately after a successful write, using the same duplicate/dangling-token checks as the read route.

## [0.48.0] - 2026-04-10

### Changed

- Added a promptTemplate toolbar search/filter so larger `.risup` prompt lists can be narrowed by prompt text, type, and other visible item metadata without dropping back to raw JSON.
- Search mode now shows live match counts, supports one-click clear or `Escape`, shows an empty-result hint, and temporarily disables reorder controls while the filtered view is active.

## [0.47.0] - 2026-04-10

### Changed

- Improved the structured `.risup` `promptTemplate` add flow with a grouped type-aware add menu instead of always inserting a temporary `plain` item first.
- Added per-item **insert below** actions so new prompt blocks can be placed directly after the current item without adding at the bottom and dragging them back into position.

## [0.46.0] - 2026-04-10

### Added

- Added block-level `.risup` prompt text reuse on top of the existing serializer:
  - `copy_risup_prompt_items_as_text`
  - `import_risup_prompt_from_text` now supports `mode: "append"` with optional `insertAt`

### Changed

- Prompt text import `dry_run` can now preview append-mode flows as well as full-template replacement.
- Updated MCP workflow/docs/skills so agents prefer selected-item text copy plus append import before reaching for a speculative persistent snippet library.

## [0.45.0] - 2026-04-10

### Added

- Added a structured `.risup` prompt text serializer with MCP whole-template export/import tools:
  - `export_risup_prompt_to_text`
  - `import_risup_prompt_from_text`

### Changed

- The serializer format now preserves supported-item IDs, supported-item extra JSON fields, and unsupported/raw prompt items while still being human-editable.
- Added `dry_run` support for prompt text imports so agents can preview parsed prompt items before replacing `promptTemplate`.
- Updated risup MCP workflow docs, skills, AGENTS guidance, and README references for the new whole-template text path.

## [0.44.0] - 2026-04-10

### Changed

- Added drag-and-drop reorder to the structured `.risup` `promptTemplate`, `formatingOrder`, and `customPromptTemplateToggle` editors using the existing SortableJS interaction pattern while keeping the button-based controls as a fallback.
- Introduced a shared flat-list reorder helper so prompt/order/toggle editors all apply the same stable index move semantics.

## [0.43.0] - 2026-04-10

### Added

- Added a structured **visual/raw editor** for `.risup` `customPromptTemplateToggle`, covering toggle, text, textarea, select, divider, caption, group, and group-end rows without changing the stored line syntax.

### Changed

- Improved the `.risup` `promptTemplate` editor with item summaries, per-item collapse/expand, collapse-all/expand-all controls, and one-click duplication for faster large-preset editing.
- Documented the new toggle editor modules in `docs/MODULE_MAP.md` and updated the README to reflect the richer preset-editing surface.

## [0.42.0] - 2026-04-10

### Added

- Expanded the risup prompt MCP family with agent-efficient structured tools:
  - `search_in_risup_prompt_items`
  - `read_risup_prompt_item_batch`
  - `write_risup_prompt_item_batch`
  - `add_risup_prompt_item_batch`

### Changed

- Improved `.risup` prompt MCP stability and ergonomics:
  - Single and batch prompt-item writes now preserve existing stable item IDs when replacement payloads omit an explicit `id`.
  - Batch risup prompt operations now reduce repeated confirmation prompts when editing several sibling items.
  - Updated `AGENTS.md`, MCP workflow docs, and skill references so agents prefer the new risup batch/search surfaces over repeated single-item calls.

## [0.41.3] - 2026-04-10

### Changed

- Improved reference-system discoverability for AI agents:
  - `session_status` tool description now mentions references and works-without-main-file behavior.
  - `list_references` tool description now mentions no-main-file support and steers agents toward `search_in_reference_field` / `read_reference_field_range`.
  - "No file open" error now suggests `list_references` as an alternative recovery path alongside `open_file`.
  - `session_status` summary for no-document sessions with references explicitly directs agents to `list_references`.
  - `FAMILY_NEXT_ACTIONS['reference']` expanded with greeting, trigger, field, Lua, CSS, regex, lorebook, and `.risup` follow-up readers.
  - `FAMILY_NEXT_ACTIONS['session']` now includes `list_references`.
  - `SPECIAL_TARGET_NEXT_ACTIONS['document:current']` expanded to include `list_references` and `session_status`.
  - Assistant prompt read-rules now explicitly forbid `read_reference_field("lorebook/lua/css/alternateGreetings/groupOnlyGreetings/triggerScripts/regex")` full dumps.
- Expanded reference read parity:
  - Added `list_reference_greetings` / `read_reference_greeting` and `list_reference_triggers` / `read_reference_trigger` so agents can inspect reference greetings and trigger scripts without dumping raw arrays or JSON blobs.
  - Introduced a shared reference item registry so the sidebar and reference popout can render more of the same read-only items across `.charx`, `.risum`, and `.risup` references, including charx metadata, greeting folders, trigger forms, and visible risup groups.
- Updated skills docs (`using-mcp-tools/SKILL.md`, `TOOL_REFERENCE.md`, `MCP_WORKFLOW.md`), workflow docs, and `README.md` to list the newer reference search/range, greeting/trigger, and reference-only session flows.

## [0.41.2] - 2026-04-10

### Changed

- Allowed MCP reference routes to work in reference-only sessions with no active main document, and exposed loaded reference summaries through `session_status`.
- Added `.risup` support across reference loading surfaces, including the open-reference dialog, manifest restore, and drag-and-drop reference import.
- Unified reference scalar-field discovery across the sidebar, popout, and MCP responses so `alternateGreetings`, `groupOnlyGreetings`, and `defaultVariables` stay in sync.
- Added context-efficient reference MCP readers for batch field reads, text search/range access, and structured `.risup` prompt/formating-order inspection.

### Fixed

- Added additive `id` / `fileType` metadata to `list_references` so agents can distinguish loaded reference files more reliably.

---

## [0.41.1] - 2026-04-10

### Changed

- Rewrote the tracked project documentation into natural English across `README.md`, `AGENTS.md`, `CLAUDE.md`, `docs/`, and the mirrored `skills/project-workflow/` guides so agents and contributors can navigate the repository without mixed-language drift.
- Refreshed documentation references to match the current project shape, including the post-Pluni rules/docs wording and the current `agents-md-manager.ts` size in `docs/analysis/ARCHITECTURE.md`.

### Removed

- Deleted the obsolete `docs/superpowers/` artifact set and removed its index/coverage dependency from `src/lib/doc-drift.test.ts` and `docs/README.md`.

---

## [0.41.0] - 2025-07-17

### 삭제

- **플루니 연구소(Pluni laboratory) RP 모드 제거**: `rpMode === "pluni"` 전체 기능 삭제 — 3인 자문 패널(Pluni/Kotone/Sophia), `.github/agents/*.agent.md` 프로필 생성, 챗봇 카테고리(solo/world-sim/multi-char) 선택, 터미널 수동 `copilot` 탐지, IPC 핸들러(`sync-copilot-agent-profiles`)를 모두 제거했습니다.
- 관련 모듈/테스트/런타임 agent profile 파일 삭제: `pluni-persona.ts`, `copilot-agent-profile-manager.ts`, 각 테스트 파일, `.github/agents/*.agent.md`
- 관련 설정 필드 제거: `pluniCategory`, `writePluniCategory`, `normalizePluniCategory`, `setPluniCategory`
- UI에서 플루니 연구소 드롭다운 옵션 및 챗봇 카테고리 셀렉터 제거

### 변경

- `RpMode` 타입에서 `'pluni'` 리터럴 제거 (`'off' | 'toki' | 'aris' | 'custom'`)
- `normalizeRpMode`이 `'pluni'`를 `'off'`로 폴백 (기존 저장값 안전 처리)
- 설정 팝업, 어시스턴트 프롬프트, 컨트롤러, 팝아웃 컨트롤러에서 플루니 관련 분기 및 dead code 정리
- `agents-md-manager.ts`에서 `syncCopilotProfiles`, `setActiveAgentProfileState`, `isUnderProjectRoot` 제거
- `preload-api.ts` / `electron-api.d.ts` / `preload.js`에서 `syncCopilotAgentProfiles` IPC 제거
- README, PROJECT_RULES, skills/PROJECT_RULES, MODULE_MAP, ARCHITECTURE에서 플루니 관련 문서 업데이트

---

## [0.40.1] - 2026-04-10

### 새 기능

- **다단계 harness eval 확장** (`src/lib/mcp-api-server.test.ts`, `src/lib/mcp-response-envelope.test.ts`): `session_status → write_field → session_status`, `probe_field → open_file → read_field`, lorebook read/write round-trip 같은 실제 에이전트 orchestration 흐름과 deterministic recovery-guidance 경로를 고정하는 eval 시나리오를 추가했습니다.

### 변경

- **MCP decomposition slice 완료** (`src/lib/mcp-field-access.ts`, `src/lib/mcp-cbs-routes.ts`, `src/lib/mcp-api-server.ts`, `docs/MODULE_MAP.md`, `docs/analysis/ARCHITECTURE.md`): 필드 접근/문자열 변형 정책을 공유 경계로 추출하고 CBS route family를 별도 모듈로 분리해 `mcp-api-server.ts`의 책임을 더 명시적인 경계로 나눴습니다.
- **필드 텍스트 변형 정책 중앙화** (`src/lib/mcp-field-access.ts`, `src/lib/mcp-field-access.test.ts`, `src/lib/mcp-api-server.ts`): replace / block-replace / insert / batch-replace 경로가 더 이상 각자 허용 필드 목록을 복제하지 않고, 공통 allowlist와 read-only 판정 헬퍼를 공유하도록 정리했습니다.

### 수정

- **`FieldAccessRules` 경계 불일치 수정** (`src/lib/mcp-field-access.ts`, `src/lib/mcp-field-access.test.ts`, `src/lib/mcp-api-server.ts`): deprecated field와 read-only field를 분리해 `readOnlyFields ⊆ allowedFields` 불변 조건을 명시적으로 고정하고, charx/risum/risup 전부에서 동일한 계약을 검증하도록 보강했습니다.
- **`test-charx` worktree/clean-clone 회귀 수정** (`test/test-charx.ts`): Git에 없는 로컬 `risu/bot/Fujimiya Hinano` 카드에 의존하던 회귀 검사를 self-contained `.charx` fixture로 교체해, clean clone과 git worktree에서도 같은 async cheat-handler / array-aware scenario-injection 불변 조건을 안정적으로 검증하도록 바꿨습니다.
- **autosave/doc-drift Linux CI 안정화** (`src/lib/autosave-manager.test.ts`, `src/lib/doc-drift.test.ts`, `docs/superpowers/INDEX.md`): autosave 테스트가 OS-native path를 사용하도록 바꾸고, superpowers 인덱스 coverage가 raw disk가 아니라 Git 추적 파일 기준으로 판단하도록 조정해 Windows 로컬과 Ubuntu CI가 같은 계약을 검증하게 맞췄습니다.

## [0.40.0] - 2026-04-10

### 새 기능

- **`session_status` 세션 관찰 surface 추가** (`src/lib/mcp-api-server.ts`, `toki-mcp-server.ts`, `main.ts`, `src/app/controller.ts`, `src/lib/preload-api.ts`): MCP가 현재 파일 경로/타입, renderer dirty/autosave 상태, 복구 메타데이터, 필드 스냅샷 합계를 한 번에 조회할 수 있는 read-only 세션 상태 도구를 추가했습니다. 이 surface는 활성 문서가 없어도 `loaded: false`로 정상 응답해, 중단된 세션을 재개하거나 위험한 쓰기 전에 상태를 먼저 확인할 수 있습니다.

### 변경

- **세션 상태 라우팅 문서화** (`AGENTS.md`, `docs/MCP_TOOL_SURFACE.md`, `docs/MCP_WORKFLOW.md`, `skills/using-mcp-tools/*`): 에이전트가 위험한 MCP 쓰기 전이나 비정상 종료 뒤 작업 재개 시 `session_status`를 먼저 호출하도록 도구 라우팅과 안전 워크플로를 갱신했습니다.

### 수정

- **`session_status` no-file-open 예외 고정** (`src/lib/mcp-api-server.ts`, `src/lib/mcp-api-server.test.ts`): 전역 `No file open` guard가 세션 상태 조회까지 막지 않도록 조정하고, 문서가 열려 있지 않은 상태에서도 200 응답과 `loaded: false` 계약을 검증하는 테스트를 추가했습니다.
- **MCP API 서버 테스트 세션 격리 보강** (`src/lib/mcp-api-server.test.ts`): 새 테스트 서버를 시작할 때 섹션/스냅샷 캐시를 비워, 이전 테스트의 스냅샷이 다음 세션 상태 계약 검증에 섞이지 않도록 정리했습니다.

## [0.39.5] - 2026-04-10

### 새 기능

- **구조 아키텍처 가드 테스트 추가** (`src/lib/architecture.test.ts`): `src/lib/` 프로덕션 모듈이 `src/app/` / `src/popout/`를 런타임 import하지 못하도록, 런타임 store import가 허용된 bridge 파일만 통과하도록, 그리고 `JSON.parse(JSON.stringify(...))` clone 패턴이 `shared-utils.ts` 밖으로 새지 않도록 기계적으로 고정하는 구조 테스트를 추가했습니다.

### 변경

- **`npm run lint` coverage gate 확장** (`package.json`): 새 `src/lib/architecture.test.ts`를 lint whitelist에 포함시켜, guard test 자체도 CI lint gate 밖으로 빠지지 않도록 맞췄습니다.

## [0.39.4] - 2026-04-10

### 수정

- **MCP 검색 요청 숫자 옵션 호환성 복구** (`src/lib/mcp-request-schemas.ts`): `search_in_field` / `search_all_fields` 요청 본문에서 `context_chars`, `max_matches`, `max_matches_per_field`가 숫자 문자열(`"120"`)로 들어와도 기존처럼 허용되도록 복원했습니다. 숫자로 해석할 수 없는 값은 `undefined`로 정규화되어 기존 handler 기본값 경로를 유지합니다.
- **아키텍처 문서 상태 소유권/섹션 파서 경계 명확화** (`docs/analysis/ARCHITECTURE.md`): `app-store.ts`를 메인 렌더러 UI 상태의 중심으로 낮추고, 저장·자동 저장·MCP 수정의 권한 상태는 메인 프로세스 `mainState.currentData`가 소유한다는 점을 명시했습니다. 또한 `section-parser.ts`는 렌더러 전용이지만 MCP 경로는 `main.ts`의 병행 Lua/CSS 파서를 사용한다는 hidden coupling도 드러냈습니다.
- **하네스 lint gate와 lockfile 메타데이터 동기화** (`package.json`, `package-lock.json`): 새 하네스 테스트/스키마 파일들이 `npm run lint` 범위 밖으로 빠지지 않도록 lint whitelist를 보강하고, lockfile 버전을 `0.39.4`로 맞췄습니다.

## [0.39.3] - 2026-04-10

### 변경

- **MCP 요청 본문에 Zod 스키마 도입** (`src/lib/mcp-request-schemas.ts`): MCP HTTP API의 공통 요청 본문 형태(replace, block-replace, insert, batch-replace, search, search-all, field-batch-read, field-batch-write, external-document)에 Zod 기반 typed 스키마와 `validateBody` 헬퍼를 추가했습니다.
  - `mcp-api-server.ts`의 필드 편집 핸들러 8곳에서 ad-hoc `typeof` 체인과 수동 probing을 `parseBody` + 스키마 검증으로 교체
  - `resolveExternalDocumentRequest`와 `readProbeDocumentRequest`의 제네릭 `Record<string, any>` 타입 매개변수를 `ExternalDocumentBody` 타입으로 대체
  - `flags`(non-string → undefined 변환), `position`(non-enum → undefined 변환) 필드에 lenient coercion 적용하여 기존 동작 유지
  - 44개 단위 테스트 추가 (`src/lib/mcp-request-schemas.test.ts`)

## [0.39.2] - 2026-04-10

### 새 기능

- **문서 드리프트 가드 테스트 추가** (`src/lib/doc-drift.test.ts`): 문서, 스킬, 분류 체계 참조, MODULE_MAP이 실제 코드베이스와 정렬되어 있는지 기계적으로 검증하는 18개 테스트를 추가했습니다.
  - 스킬 `related_tools`가 `TOOL_TAXONOMY`에 존재하는 도구만 참조하는지 확인
  - `MODULE_MAP.md`가 `src/lib/*.ts` 모듈을 빠짐없이 커버하는지 확인
  - `MCP_TOOL_SURFACE.md` 도구 참조가 분류 체계와 일치하는지 확인
  - `FAMILY_NEXT_ACTIONS` 참조 도구가 분류 체계에 존재하는지 확인
  - `docs/superpowers/INDEX.md`가 모든 plan/spec 파일을 커버하고 유효한 상태값을 갖는지 확인
- **Superpowers 아티팩트 인덱스** (`docs/superpowers/INDEX.md`): plan/spec 파일의 경량 인덱스를 추가하여 active/superseded/research/partial 상태를 구분할 수 있게 했습니다.

### 변경

- **`MODULE_MAP.md` 커버리지 확장**: 누락되었던 6개 모듈(`shared-utils`, `cbs-parser`, `cbs-evaluator`, `cbs-extractor`, `trigger-form-editor`, `trigger-scripts-runtime`)을 추가했습니다.

## [0.39.1] - 2026-04-10

### 변경

- **아키텍처 가이드 전면 교체**: `docs/analysis/ARCHITECTURE.md`를 현재 TypeScript 런타임 기준으로 전면 재작성했습니다. 메인/프리로드/렌더러/MCP 프로세스 소유권, import 방향 규칙, 컴파일 타겟, 주요 도메인(프리뷰·세션 복구·어시스턴트·터미널), 데이터 흐름, 그리고 대형 모듈 핫스팟(mcp-api-server.ts ~9,200줄, controller.ts ~2,930줄 등)을 기록합니다. 구조와 레이어링의 정식(canonical) 참조 문서가 됩니다.
- **`AGENTS.md` TOC 전환**: `AGENTS.md`를 컴팩트한 라우팅 목차로 슬림화하고, 기존 MCP 워크플로 상세(도구 맵, 읽기 규칙, 워크플로 패턴, 주의사항)를 `docs/MCP_WORKFLOW.md`로, 프로젝트 규칙(버전 관리, CI, 페르소나)을 `docs/PROJECT_RULES.md`로 분리했습니다. 세션 시작 시 에이전트가 읽는 컨텍스트가 ~230줄에서 ~50줄로 줄어듭니다.
- **`skills/project-workflow` 스킬 추가**: 추출된 MCP 워크플로 및 프로젝트 규칙 가이드를 `list_skills` / `read_skill`로 검색할 수 있는 스킬로 래핑했습니다. `SKILL.md`(요약) + `MCP_WORKFLOW.md`(전체 도구 맵·읽기 규칙·워크플로 패턴·주의사항) + `PROJECT_RULES.md`(버전 관리·CI·페르소나 워크플로)로 구성되어 세션 복사만으로도 완전한 가이드를 제공합니다.
- **`docs/README.md` 라우팅 갱신**: 새 canonical docs(`MCP_WORKFLOW.md`, `PROJECT_RULES.md`)를 routing table과 core documents 목록에 추가했습니다.
- **엔트리포인트 라우팅 일관성 수정**: `README.md`, `docs/README.md`, `skills/project-workflow/SKILL.md`에서 `project-workflow`를 세션 온보딩 시작점으로, `using-mcp-tools`를 MCP 도구 선택 상세 스킬로 일관되게 안내하도록 수정했습니다.

## [0.39.0] - 2026-04-10

### 새 기능

- **MCP hard-failure recovery metadata 확장**: `src/lib/mcp-api-server.ts`와 `src/lib/mcp-response-envelope.ts`가 `mcpError()` / `mcpNoOp()` 응답에 `retryable`과 deterministic `next_actions`를 공통으로 추가합니다. 이제 400/401/403, 409, 5xx, 그리고 compatibility no-op 경로를 에이전트가 같은 방식으로 분기할 수 있습니다.
- **성공 응답 context-budget 메타데이터 추가**: `mcpSuccess()`가 `artifacts.byte_size`를 자동으로 채워 성공 응답의 대략적인 UTF-8 JSON 크기를 노출합니다. 에이전트는 이 값을 보고 broad read 대신 `search_in_field`, `read_field_range`, item/section read, `probe_*` 같은 좁은 surface로 전환할 수 있습니다.
- **결정적 agent eval 스위트 도입**: `npm run test:evals`를 추가하고, response contract / taxonomy / Lua section workflow / MCP recovery flow를 고정하는 `agent eval` 시나리오를 기존 Vitest 스위트에 배치했습니다.

### 변경

- **Harness docs/skills rollout 완료**: `docs/MCP_ERROR_CONTRACT.md`, `docs/MCP_TOOL_SURFACE.md`, `docs/MODULE_MAP.md`, `docs/README.md`, `AGENTS.md`, `README.md`, `CONTRIBUTING.md`, `skills/using-mcp-tools/*`를 갱신해 recovery metadata, `artifacts.byte_size`, 그리고 `npm run test:evals` 경로가 같은 설명을 가리키도록 정리했습니다.

## [0.38.9] - 2026-04-10

### 변경

- **Harness knowledge base 확장**: `docs/README.md`, `docs/MODULE_MAP.md`, `docs/MCP_TOOL_SURFACE.md`를 추가해 에이전트가 `docs/` 안에서 현재 지식 베이스를 탐색하고, TypeScript 소스 구조와 MCP 도구 경계를 예측 가능한 형태로 따라갈 수 있도록 정리했습니다.
- **개발자/에이전트 문서 라우팅 통일**: `README.md`, `CONTRIBUTING.md`, `AGENTS.md`가 같은 knowledge-base entrypoint와 source-navigation 규칙을 가리키도록 맞췄습니다.

### 수정

- **`using-mcp-tools` 참조 문서 최신화**: `skills/using-mcp-tools/TOOL_REFERENCE.md`의 오래된 `v0.34.0` 범위 설명을 현재의 repo-wide success/error/no-op 계약에 맞게 갱신하고, canonical docs 포인터를 추가했습니다.

## [0.38.8] - 2026-04-10

### 수정

- **MCP no-op recovery envelope 도입**: `src/lib/mcp-api-server.ts`에 `mcpNoOp()` 헬퍼를 추가하고 field/lorebook/regex/lua/css의 남은 18개 `HTTP 200 + success: false` 경로를 구조화된 recovery contract로 통일했습니다. 이제 no-op 응답도 `action`, `target`, `status`, `suggestion`, `error`를 제공하면서 `message`, `matchCount`, `results`, `errors`, `startAnchorFoundAt`, `dryRun` 같은 기존 필드를 그대로 유지합니다.
- **No-op 회귀 테스트 추가**: `src/lib/mcp-api-server.test.ts`에 field/lorebook/regex/lua/css 대표 no-op 경로 7개에 대한 회귀 테스트를 추가해 bare `success: false` 응답이 다시 섞이지 않도록 고정했습니다.
- **MCP 계약 문서화 보강**: `docs/MCP_ERROR_CONTRACT.md`를 추가하고 `AGENTS.md`, `README.md`에 연결해 success/error/no-op 엔벨로프와 에이전트 복구 규칙을 repo-local knowledge base로 고정했습니다.

## [0.38.7] - 2026-04-10

### 수정

- **MCP 성공 응답 엔벨로프 — 잔여 경로 마이그레이션**: `replace_in_field` dry-run, `replace_block_in_field` (dry-run/성공), `insert_in_field` 성공, `replace_in_field_batch` (dry-run/성공), `replace_across_all_lorebook` dry-run, 로어북 block-replace dry-run, `import_lorebook_from_files` (빈 결과/dry-run), `export_field_to_file` 성공, `list_skills` 폴백 — 총 12개 안전 경로를 `jsonRes` → `jsonResSuccess`로 전환
- **`validate_cbs` 호환성 예외 유지**: `validate_cbs`는 기존 `summary: { total, passed, failed }` 구조를 유지해야 하므로 성공 엔벨로프 대상에서 제외하고 bare JSON 응답으로 되돌렸습니다
- **로어북 import UI 동기화 수정**: `import_lorebook_from_files` 성공 후 renderer broadcast를 표준 `('data-updated', 'lorebook', data)` 시그니처로 통일해 즉시 UI가 갱신되도록 수정했습니다
- **`read_skill` 경로 검증 강화**: file name뿐 아니라 skill name에도 path traversal 방지를 적용해 `%2F..` 형태의 우회 요청을 400 구조화 에러로 차단합니다
- **MCP 요청 본문 camelCase 수용**: `dry_run` (snake_case) 전용이던 6개 파싱 위치를 `body.dry_run ?? body.dryRun` 로 변경하여 camelCase `dryRun` 도 동등하게 허용

## [0.38.6] - 2026-04-10

### 새 기능

- **MCP 성공 응답 엔벨로프 (Success Response Envelope)**: MCP 도구의 성공 응답에 구조화된 관찰 필드를 추가하는 additive-only 계약을 도입했습니다
  - 새 모듈 `src/lib/mcp-response-envelope.ts`: `mcpSuccess()` 헬퍼와 패밀리별 `FAMILY_NEXT_ACTIONS` 맵
  - 엔벨로프 필드: `status` (항상 200), `summary` (작업 요약 문자열), `next_actions` (분류 체계 기반 후속 도구 제안), `artifacts` (작업 핵심 지표)
  - 기존 응답의 최상위 필드를 제거하거나 `data` 객체로 감싸지 않는 additive-only 설계
  - 1차 마이그레이션 범위: field (list/read/write/batch), search (search_in_field, search_all_fields), snapshot (create/list/restore), lorebook (list/read), field stats/range — 총 15개 성공 경로
  - 21개 단위 테스트 + 10개 통합 테스트로 계약 보장 (기존 164개 API 테스트 전부 통과)
  - 분류 체계(taxonomy)와 연동하여 `next_actions`를 패밀리 단위로 결정적으로 생성
  - 에러 응답에는 엔벨로프가 적용되지 않아 기존 `mcpError()` 계약 유지

## [0.38.5] - 2026-04-09

### 새 기능

- **MCP 도구 분류 체계 (Tool Taxonomy)**: 120개 MCP 도구를 19개 패밀리로 분류하는 단일 소스 오브 트루스 모듈 `src/lib/mcp-tool-taxonomy.ts`를 추가했습니다
  - 패밀리: field, probe, lorebook, regex, greeting, trigger, lua, css, reference, charx-asset, risum-asset, asset-compression, risup-prompt, skill, danbooru, cbs, snapshot, search, lorebook-io
  - MCP SDK `ToolAnnotations` (readOnlyHint, destructiveHint, idempotentHint, openWorldHint)를 등록 후 자동으로 패치합니다
  - 도구 추가/삭제 시 분류 체계 동기화를 기계적으로 검증하는 22개 테스트를 포함합니다

## [0.38.4] - 2026-04-09

### 수정

- **MCP 글로벌 guard 구조화 에러 응답 완성**: 전역 `Unauthorized` / `No file open` guard도 `mcpError()` 엔벨로프로 통일해 `action`, `target`, `status`, `suggestion` 필드를 같은 방식으로 제공하도록 정리했습니다
- **전역 guard 회귀 테스트 추가**: `src/lib/mcp-api-server.test.ts`에 unauthorized / no-file-open 경로 회귀 테스트를 추가해 bare `{ error }` 응답이 다시 섞이지 않도록 고정했습니다

## [0.38.3] - 2026-04-07

### 수정

- **카드 회귀 테스트 추가**: 번들 `.charx`가 async 치트 핸들러와 array-aware `editRequest` scenario injection을 유지하도록 `test-charx` 회귀 검사를 추가했습니다

## [0.38.2] - 2026-04-06

### 수정

- **프리뷰 `getState`/`setState` 실제 RisuAI 동작 일치**: 프리뷰 엔진의 `getState`/`setState`가 `__`-prefix JSON-backed state contract를 사용하도록 수정하여, 실제 RisuAI 런타임과 동일한 상태 관리 동작을 보장합니다

## [0.38.1] - 2026-04-04

### 변경

- **번들 캐릭터 작성 스킬 문서 개선**: `authoring-characters`와 `authoring-lorebook-bots` 스킬 문서를 대폭 갱신했습니다. 솔로·소규모 앙상블·대규모 월드캐스트 봇에 대한 규모별 가이드를 강화하고, 실제 참고 봇 3종의 description/lorebook 패턴 분석 결과를 반영하여 권장 사항을 보강했습니다
- **안티도그마·선택적 고급 프레이밍 개선**: 스킬 문서 전반에서 "반드시 ~해야 한다" 식 절대 규범 표현을 줄이고, 고급 기법을 명시적으로 선택사항(optional-advanced)으로 구분해 AI가 상황에 맞게 권장 수준을 조절할 수 있도록 개선했습니다

## [0.38.0] - 2026-04-03

### 새 기능

- **열리지 않은 파일용 MCP probe/open workflow**: 절대 경로의 `.charx` / `.risum` / `.risup` 파일을 에디터에 열지 않은 상태에서도 `probe_field`, `probe_field_batch`, `probe_lorebook`, `probe_regex`, `probe_lua`로 읽을 수 있고, `open_file`로 현재 활성 문서로 전환해 기존 read/write/edit 도구를 그대로 이어서 사용할 수 있습니다

### 변경

- **`open_file`의 renderer-mediated 전환 경로**: unopened file 편집은 백그라운드 직접 쓰기 대신 기존 dirty-state, 저장, 탭 초기화, sidebar 재구성 파이프라인을 재사용하는 active-document 전환 경로로 통일했습니다

### 수정

- **document switch 중 autosave 경합 완화**: `open_file` 전환에서는 실제 파일 load 구간에만 autosave를 잠시 막아, 저장 확인 대기 동안 autosave가 불필요하게 비활성화되지 않도록 조정했습니다
- **MCP unopened-file 회귀 테스트 보강**: probe route/tool smoke test와 `open_file` 단위 테스트, concurrent request `409` 회귀를 추가해 unopened-file access contract를 고정했습니다

## [0.37.0] - 2026-04-01

### 변경

- **MCP 구조화 에러 응답 route-local 범위 완성**: reference, charx/risum asset, risup reorder/formating-order, skills file-read validation 라우트의 남은 route-local `4xx/409` 에러를 `mcpError()` 엔벨로프로 통일했습니다. 이제 regex, greetings, lua/css section, field/lorebook, reference, asset, risup, skills의 route-local validation surface가 같은 `action`, `target`, `status`, `suggestion` contract를 공유합니다

### 수정

- **중복 asset conflict 가이드 보강**: `add_charx_asset`의 duplicate-path `409` 응답에 후속 행동을 안내하는 `suggestion` 필드를 추가해 AI CLI가 자동 복구 힌트를 더 안정적으로 받을 수 있게 했습니다
- **워크트리 renderer build 경로 정합성**: `vite-plugin-static-copy` vendor asset 복사를 설치된 패키지 경로 기반으로 정리해, Windows git worktree에서도 `npm run build:renderer`와 전체 릴리즈 검증이 같은 방식으로 통과하도록 수정했습니다

## [0.36.0] - 2026-04-01

### 변경

- **MCP 구조화 에러 응답 범위 확장**: field와 lorebook validation guard의 4xx 에러를 `mcpError()` 엔벨로프로 통일해 `action`, `target`, `status`, `suggestion` 같은 additive 필드를 일관되게 제공합니다. field batch read/write/insert/replace와 lorebook read/diff/clone/batch mutation 경로를 포함합니다

### 수정

- **field validation 정합성 복구**: field batch-write가 single-field write와 같은 file-surface/read-only 제약을 적용하고, malformed batch-read payload(`fields` 비문자 멤버)도 structured 400으로 즉시 거부하도록 수정
- **lorebook malformed batch payload crash 방지**: lorebook batch-write가 `data` 객체가 없는 malformed entry를 generic 500으로 흘리지 않고 structured 400으로 거부하도록 보강

## [0.35.1] - 2026-04-01

### 수정

- **charx 프리뷰 게이트 회귀 수정**: 직렬화 뒤 `_fileType: 'charx'`가 명시된 실제 `.charx` 문서가 보기 메뉴와 `F5` 경로에서 잘못 차단되던 문제를 수정
- **preview macro 정합성 수정**: `{{charpersona}}`가 description 대신 personality를 읽도록 수정해 `{{chardesc}}`와 역할이 다시 분리되도록 정리

## [0.35.0] - 2026-04-01

### 새 기능

- **프리뷰 로컬 필드 setter 활성화**: Lua `setDescription`, `setPersonality`, `setScenario`, `setFirstMessage` 호출 결과가 프리뷰 세션과 팝아웃 경로에 즉시 반영되어, 카드 필드 변경 트리거를 실제 프리뷰에서 검증할 수 있습니다

### 변경

- **charx 전용 프리뷰 게이트**: 프리뷰는 이제 `.charx` 파일에서만 열립니다. `.risum` / `.risup`가 활성일 때는 보기 메뉴 항목이 비활성화되고 `F5` 경로도 상태 메시지와 함께 차단됩니다

### 수정

- **프리뷰 필드 hydration 정합성**: `personality` / `scenario` 값이 초기화, 리셋, 패널, 팝아웃 경로에서 일관되게 전달되도록 정리해 preview-local setter와 카드 기본값이 서로 어긋나지 않도록 수정

## [0.34.0] - 2026-04-01

### 변경

- **MCP 구조화 에러 응답 (bounded contract)**: regex, greetings, lua 섹션, css 섹션 라우트의 4xx 에러를 `mcpError()` 엔벨로프로 통일. `action`, `target`, `status`, `suggestion` 등 additive 필드가 포함되어 AI CLI가 에러 원인을 구조적으로 파악 가능. 최상위 `error` 필드는 MCP 브릿지 호환을 위해 유지

### 수정

- **regex insert 액션 라벨 정합성**: `insert-regex-field` 등 regex 라우트의 action label을 canonical string으로 통일
- **lua/css read 액션 동사 정합성**: lua/css 단일 항목 에러 엔벨로프의 action verb를 `read`로 통일

## [0.33.0] - 2026-04-01

### 새 기능

- **프리뷰 iframe 준비 타임아웃**: 프리뷰 iframe이 5 초 안에 ready 핸드셰이크를 완료하지 않으면 `PreviewRuntimeTimeoutError`를 발생시켜, 초기화 실패가 무한 로딩으로 이어지지 않도록 방지
- **프리뷰 세션 진단 상태**: 초기화 상태(`idle` → `loading` → `ready` / `error`)와 런타임 에러를 `PreviewSnapshot`에 추적해, 패널이 실시간으로 상태를 반영할 수 있도록 개선
- **프리뷰 인라인 진단 배너**: 초기화 중 "프리뷰 초기화 중..." 상태 배너와 에러 발생 시 에러 메시지 배너를 패널 안에 표시 — 초기화 중에는 입력·전송·리셋 버튼 비활성화

### 변경

- **프리뷰 초기화 흐름**: `initialize()` / `reset()` 전체를 try/catch로 감싸 어느 단계에서든 실패 시 `initState = 'error'`로 전환하고, 런타임 에러는 별도 `runtimeError`로 분리 보존

### 수정

- **프리뷰 시작 실패 무음 방지**: iframe 로드 실패가 조용히 멈추던 문제를 타임아웃 + 인라인 에러 배너로 해결

## [0.32.0] - 2026-04-01

### 새 기능

- **안정적 prompt-item ID**: `.risup` `promptTemplate`의 지원 항목에 결정론적 `id`를 부여해, 같은 파일을 다시 열거나 항목을 재정렬해도 안정적으로 추적할 수 있도록 개선
- **레거시 prompt ID 정규화**: 기존 `.risup` 파일을 열 때 `id`가 없는 prompt item에 콘텐츠 기반 결정론적 ID를 자동 생성해, 저장·자동저장·재열기 경로에서도 같은 항목 정체성을 유지
- **prompt editor ID 보존**: 프롬프트 항목 타입 변경·순서 변경 시 기존 `id`를 유지하고, 새 항목 추가 시에만 fresh `id`를 발급
- **warning-only formatingOrder 진단**: 중복 토큰과 대응 없는 토큰을 advisory warning으로 표시하고, 저장 차단 오류와 분리해 surface하도록 보강
- **MCP additive prompt metadata**: `list_risup_prompt_items`, `read_risup_prompt_item`에 additive `id`를, `read_risup_formating_order`에 `warnings` 배열을 추가
- **raw promptTemplate ID round-trip**: raw `write_field("promptTemplate")`로 전달한 명시적 `id`를 그대로 보존해 unsupported/raw shape fallback과 구조화 surface가 충돌하지 않도록 정리

## [0.31.0] - 2026-04-01

### 새 기능

- **세션 복구 시작 플로우**: 비정상 종료 뒤 재시작 시 최근 자동 저장을 감지해 `자동 저장 복원` / `원본 열기` / `무시` 중 하나를 고를 수 있는 recovery 대화상자를 추가
- **파일 타입별 autosave + provenance sidecar**: `.charx`, `.risum`, `.risup` 문서를 각자 원래 형식으로 자동 저장하고, `.toki-recovery.json` sidecar에 원본 경로, 파일 타입, 저장 시각, dirty 필드, 앱 버전을 함께 기록
- **복원 provenance UI**: 자동 저장에서 복원한 문서에 `[자동복원]` 파일 라벨과 고정 status를 표시하고, 저장 / 다른 이름 저장 / 열기 / 새 파일 성공 시 자동으로 해제

### 수정

- **recovery save lifecycle 정합성 보강**: 첫 저장과 다른 이름 저장 뒤에도 recovery record가 새 경로와 파일 타입을 다시 시드하도록 고쳐, interrupted-session record와 provenance sidecar가 서로 어긋나 복구 후보가 무효화되던 문제를 수정
- **session recovery 회귀 테스트 보강**: startup recovery와 file-action 경로에 restore / open-original / ignore / cancel / save failure 회귀 테스트를 추가해 복원 provenance 상태가 성공 경로에서만 바뀌도록 고정

## [0.30.0] - 2026-04-01

### 변경

- **risup mutation boundary 강화**: generic MCP `write_field` / `write_field_batch`와 autosave가 이제 `promptTemplate`, `formatingOrder`, `presetBias`, `localStopStrings`를 같은 validation boundary로 검사해, malformed JSON이나 잘못된 shape를 메모리/자동저장 파일에 조용히 남기지 않고 즉시 거부

### 수정

- **`applyUpdates()` partial-mutation 방지**: `.risup` 업데이트에서 구조화/JSON-backed 필드를 먼저 검증한 뒤에만 mutation을 적용하도록 바꿔, invalid preset write가 다른 필드를 반쯤 바꾼 상태로 남지 않도록 보강
- **risup integrity regression 테스트 추가**: generic field write, batch-write, serializer, autosave 경로에 대한 회귀 테스트를 추가해 invalid `promptTemplate` / `formatingOrder` / `presetBias` / `localStopStrings`가 다시 통과하지 않도록 고정

## [0.29.1] - 2026-04-01

### 수정

- **스킬 메타데이터 YAML flow-array 파싱 복구**: `prettier`가 frontmatter 배열을 `['a', 'b']` 형태로 정리해도 MCP `list_skills`가 `tags` / `relatedTools`를 계속 올바르게 읽도록 보강
- **스킬 인덱스 회귀 테스트 추가**: 임시 skill fixture와 실제 번들 skill 디렉터리를 함께 검증해, `list_skills` 메타데이터 노출과 새 reference skill 발견이 다시 깨지지 않도록 고정

## [0.29.0] - 2026-04-01

### 새 기능

- **스킬 메타데이터 노출 확장**: MCP `list_skills`가 이제 `tags`와 `relatedTools`를 함께 반환해, AI가 필요한 가이드를 더 짧고 정확하게 고를 수 있도록 개선
- **워크플로/구조 참조 스킬 추가**: `using-mcp-tools`, `file-structure-reference`, `writing-danbooru-tags`를 추가해 MCP 도구 선택, 파일 구조, Danbooru 태그 워크플로를 on-demand 문서로 분리

### 변경

- **`AGENTS.md` 대폭 슬림화**: 항상 필요한 읽기 규칙·워크플로·프로젝트 규칙만 남기고, 무거운 레퍼런스는 `skills/`로 이동해 세션 시작 컨텍스트를 줄임
- **기존 스킬 frontmatter 보강**: 주요 스킬에 `tags` / `related_tools`를 추가해 `list_skills` 인덱스 품질을 개선
- **skills 인덱스 문서 갱신**: `skills/README.md`에 새 스킬 구조와 frontmatter schema를 반영

## [0.28.3] - 2026-04-01

### 수정

- **프리뷰 창 표시 회귀 수정**: `v0.28.1` 스타일 정리 중 빠졌던 `.preview-overlay` / `.preview-panel` shell 레이아웃을 복원해 `F5`와 보기 메뉴의 `프리뷰` 동작이 다시 화면 위에 정상 표시되도록 수정
- **메인 프리뷰 헤더 공용 스타일 복구**: 도킹 프리뷰도 팝아웃과 같은 공용 헤더/액션 버튼 클래스를 사용하도록 맞춰, 닫기/디버그/팝아웃 버튼의 시각 상태와 hover·active 피드백이 다시 일관되게 보이도록 정리
- **프리뷰 CSS 회귀 테스트 추가**: 프리뷰 overlay/panel 레이아웃과 도킹 프리뷰 헤더의 공용 스타일 훅을 테스트로 고정해 같은 스타일 삭제 회귀를 다시 바로 잡을 수 있도록 보강

## [0.28.2] - 2026-04-01

### 수정

- **터미널 팝아웃 초기화 실패 복구 추가**: xterm 초기화에 실패해도 빈 창으로 멈추지 않고, 사용자에게 안내 메시지를 표시하면서 런타임 오류를 함께 보고하도록 보강
- **터미널 팝아웃 종료 정리 강화**: 창을 닫을 때 terminal UI dispose와 설정 구독 해제가 함께 실행되도록 정리해, 팝아웃 재오픈 시 정리되지 않은 리스너가 누적되지 않도록 수정
- **터미널/참고자료 팝아웃 공용 스타일 정합성 개선**: 터미널 팝아웃이 메인과 같은 `#bottom-area` / `#terminal-area` / 아바타 패널 레이아웃 스타일을 재사용하도록 맞추고, 참고자료/사이드바 팝아웃도 공용 섹션 헤더와 empty-state 스타일을 사용하도록 정리

## [0.28.1] - 2026-03-31

### 수정

- **팝아웃 버튼/표면 테마 일관성 개선**: sidebar·editor·preview·terminal 팝아웃의 헤더 액션 버튼을 공용 스타일로 통합해, 다크 모드에서도 버튼이 과하게 밝거나 따로 뜨지 않고 라이트/다크 팔레트에 맞는 hover·active·닫기 상태를 유지하도록 정리
- **팝아웃 다크 모드 렌더링 정합성 보강**: terminal 팝아웃은 다크 터미널 테마를, editor 팝아웃은 `blue-archive-dark` Monaco 테마를 사용하도록 맞추고, chat/preview/debug 표면도 고정 밝은색 대신 테마 변수 기반으로 렌더링되도록 정리

## [0.28.0] - 2026-03-31

### 새 기능

- **프리뷰 로어북 데코레이터 코어 지원**: 프리뷰가 `@@depth` / `@@position` / `@@role` / `@@scan_depth` / `@@probability` / `@@activate` / `@@dont_activate` / `@@match_full_word` / `@@additional_keys` / `@@exclude_keys`를 해석해 로어북 활성화에 반영하고, authoring 검증에 더 가까운 결과를 제공
- **프리뷰 로어북 디버그 확장**: 디버그 패널과 클립보드 출력에 매칭 키, 제외 키, 데코레이터 태그, scan depth, 확률 판정, parser 경고를 표시해 왜 특정 로어북이 활성화되었는지 바로 추적 가능

### 변경

- **프리뷰 확률 시뮬레이션을 결정적으로 정리**: `activationPercent`와 `@@probability`의 1~99 구간을 annotation-only가 아니라 재현 가능한 deterministic roll 기반 gate로 처리해 테스트/디버그/재렌더 결과가 일관되도록 조정

## [0.27.7] - 2026-03-31

### 수정

- **도킹 프리뷰 입력/디버그 상태 정합성 보강**: 메인 프리뷰 입력창도 팝아웃과 동일하게 IME 조합 중 Enter 전송을 막고, 리셋 시 textarea 높이를 다시 접어 주며, 디버그 패널 버튼의 활성 상태가 실제 시각 효과로 보이도록 정리
- **터미널 팝아웃 채팅 IME 오작동 방지**: 터미널 팝아웃의 채팅 입력도 한글/IME 조합 중 Enter가 즉시 전송되지 않도록 막아, 일반 프리뷰/팝아웃과 같은 입력 안전성을 유지
- **읽기 전용 팝아웃/폼 상태 피드백 통일**: form editor들의 중복 inline 배지 스타일을 공용 `.readonly-badge`로 통합하고, 읽기 전용 editor 팝아웃은 `Ctrl+S` 저장을 무시하며 메인 창 placeholder도 `열람중`으로 정확하게 안내하도록 보강

## [0.27.6] - 2026-03-31

### 변경

- **팝아웃 UX 1차 정리**: editor·preview·sidebar·refs 팝아웃의 핵심 버튼에 접근성 라벨을 추가하고, 탭 팝아웃 버튼을 키보드 포커스 가능한 실제 버튼으로 바꿔 아이콘-only 조작의 의미를 더 분명하게 정리

### 수정

- **에디터 팝아웃 상태 피드백 개선**: 메인 창 placeholder를 더 구체적인 안내 문구로 바꾸고, 읽기전용 팝아웃에서는 `읽기전용` 배지와 비활성 저장 버튼을 표시해 저장 가능 여부를 즉시 알 수 있도록 수정
- **프리뷰 팝아웃 입력/디버그 UX 개선**: 프리뷰 팝아웃 버튼에 접근성 라벨과 debug 활성 상태를 추가하고, IME 조합 중 Enter가 잘못 전송되는 문제를 막아 한글 입력 중 오작동을 줄임
- **사이드바/참고자료 팝아웃 일관성 보강**: 팝아웃 헤더가 메인 사이드바 헤더 스타일을 재사용하도록 맞추고, 데이터 새로고침 뒤에도 선택 상태가 유지되도록 조정
- **팝아웃 버튼 의미 보강**: dock/popout 버튼이 상태에 맞는 `aria-label`을 함께 갱신하고, close 버튼 hover/focus 색과 탭 팝아웃 focus ring을 추가해 도킹/닫기/팝아웃 동작을 더 쉽게 구분하도록 개선

## [0.27.5] - 2026-03-31

### 수정

- **새로 만들기/열기 문서 교체 보호 추가**: 현재 문서에 저장되지 않은 변경이 있을 때 `새 파일`·`파일 열기` 전에 저장/미저장 진행/취소를 먼저 확인하도록 조정
- **dirty 탭 닫기와 자동저장 추적 보강**: 수정한 탭을 저장하지 않고 닫아도 문서 dirty 상태와 autosave 대상 필드가 유지되도록 바꿔, direct text 필드·추가 첫 메시지·triggerScripts 변경이 저장 집계에서 사라지지 않도록 수정
- **프리뷰 CBS/Lua 회귀 수정**: `{{cbr}}`가 실제 줄바꿈을 출력하도록 고치고, 프리뷰 세션의 `chatID` off-by-one과 `editOutput` 경로의 중복 `onOutput` 호출을 정리해 CBS/Lua 버튼/출력 검증 정확도를 개선

## [0.27.4] - 2026-03-31

### 변경

- **설정/도움말 접근성 개선**: 설정과 도움말 팝업을 `role="dialog"` + `aria-modal`을 갖는 모달로 정리하고, 열릴 때 닫기 버튼에 포커스를 주며 `Escape`로 닫을 수 있도록 통일
- **UI 용어와 단축키 정리**: 보기 메뉴의 `항목 토글`을 `사이드바 토글`로, `프리뷰 테스트`를 `프리뷰`로 정리하고 설정 단축키 `Ctrl+,`를 추가

### 수정

- **상태바 오류 피드백 개선**: 런타임 오류를 자동으로 사라지는 일반 토스트 대신 고정형 오류 상태로 표시해 중요한 실패 메시지가 곧바로 사라지지 않도록 수정
- **아이콘 버튼 접근성 보강**: 사이드바/터미널/프리뷰 헤더의 아이콘 버튼에 `aria-label`을 추가하고, 도움말 진입점을 실제 `<button>`으로 바꿔 키보드 접근성을 개선
- **팝업 상태 간섭 수정**: 도움말을 열 때 설정 팝업이 함께 닫히던 overlay 충돌을 분리해 두 팝업이 서로의 상태를 잘못 제거하지 않도록 수정

## [0.27.3] - 2026-03-31

### 수정

- **개발 모드 프리뷰 cross-origin 크래시 핫픽스**: `npm run dev` 환경에서 샌드박스 iframe의 `contentWindow.document`에 접근하다 `SecurityError`로 프리뷰 전체가 열리지 않던 문제 수정
- **프리뷰 bridge lifecycle 안전성 강화**: 메인/팝아웃 프리뷰가 same-origin 문서가 없을 때 부모 쪽 직접 DOM 접근을 시도하지 않도록 정리해 초기화·리셋·종료 경로가 모두 안전하게 동작하도록 보강

## [0.27.2] - 2026-03-31

### 수정

- **프리뷰 버튼 상호작용 복구**: document runtime에도 로컬 click bridge를 추가하고, 메인/팝아웃 프리뷰가 `triggerScripts`를 함께 전달·초기화하도록 조정해 `risu-btn` / `risu-trigger` 버튼이 다시 동작하도록 수정
- **프리뷰 Lua 초기화 경로 보강**: 독립 `lua` 필드가 비어 있어도 `triggerScripts` 안의 `triggerlua` 코드로 프리뷰 Lua VM을 초기화하도록 변경해 버튼 핸들러 누락을 방지
- **프리뷰 초기 스크롤 UX 개선**: 첫 메시지를 렌더링할 때 강제 bottom scroll을 하지 않도록 바꾸고, iframe 내부 하단 여백을 줄여 미리보기 창이 불필요한 빈 공간 아래에서 시작하던 문제 수정

## [0.27.1] - 2026-03-29

### 수정

- **프리뷰 빈 화면 핫픽스**: 샌드박스 srcdoc iframe에서 `blob:file:///…` URL로 스크립트를 로드하면 로컬 리소스 차단으로 빈 화면이 표시되던 문제 수정. 런타임 스크립트를 Blob URL 대신 인라인 `<script>` 태그로 직접 삽입하도록 변경

## [0.27.0] - 2026-03-29

### 새 기능

- **CBS 프리뷰 엔진 대폭 확장 — RisuAI 상위 호환 태그 추가**
  - `{{random}}` 완전 재작성: JSON 배열 입력, 이스케이프 쉼표(`\,`), 단일 인자 구분자(`,`/`:`/`|`) 지원
  - `{{roll}}` NdM 주사위 표기법 지원 (예: `2d6`), `{{dice}}` 태그 추가
  - `{{#func}}`/`{{call::name::args}}` 사용자 정의 함수 블록 + 호출 (콜 스택 제한 포함)
  - `{{#each}}` 대폭 개선: `keep` 모드, JSON 배열 반복, 중첩 블록 지원, `replaceAll` 슬롯 치환
  - `{{#when}}` 스택 기반 평가기로 완전 재작성 — `keep`/`legacy` 모드, 우측→좌측 역폴란드 평가
  - `{{#code}}` (normalize) 블록, `{{#escape::keep}}` keep 모드 추가
  - `{{bkspc}}`/`{{erase}}` 출력 조작 태그 (마지막 단어/문장 제거)
  - `{{isodate}}` 태그, `{{split}}` JSON 배열 반환으로 변경
  - `{{declare}}` 실제 변수 설정 동작 구현
  - 유니코드 인코드/디코드 (`unicodeencode`, `unicodedecode`, `u`, `ue`), 16진수 변환 (`fromhex`, `tohex`)
  - 암호화 태그 (`crypt`/`caesar`/`encrypt`, `xor`/`xordecrypt`)
  - Pure-mode 블록 처리 (each/escape/code/pure/func 내부 중첩 안전)
  - `#if`/`#when` 블록의 `keep`/`legacy` 모드별 트리밍 분기
- **프리뷰 디버그 패널 대폭 확장**
  - 로어북 요약 배너: 활성/전체 항목 수 + 확률 활성화 수 표시
  - 로어북 테이블에 삽입순서(insertorder) 컬럼 추가
  - 로어북 selective/secondkey 배지 표시
  - 로어북 `activationPercent` 확률(%) 상태 표시
  - 정규식 테이블에 플래그(flag) 컬럼 추가
  - 비활성 정규식 별도 섹션으로 분리 표시
  - 클립보드 텍스트에 변수 덤프, 로어북 매치 상세, 비활성 정규식 카운트 포함
- **로어북 `activationPercent` 필드 전체 스택 지원**
  - 프리뷰 매칭에서 `activationPercent: 0`이면 활성화 차단 (alwaysActive 포함)
  - 1~99% 항목에 확률 배지 표시
  - 로어북 I/O (내보내기/가져오기) frontmatter 및 쓰기 필드에 `activationPercent` 추가
  - MCP API의 로어북 허용 필드에 `activationPercent` 추가

### 변경

- **에셋 MIME 타입 확장**: 오디오(mp3/ogg/wav/flac/m4a/aac), 비디오(mp4/webm/mov), 폰트(woff/woff2/ttf/otf), CSS 지원. 미인식 확장자 기본값을 `image/jpeg` → `application/octet-stream`으로 변경
- **risum 에셋 추가 시 `ext` 필드를 전체 경로 대신 확장자만 저장**하도록 수정
- **charx 에셋 추가 시 `type`을 `'module'` → `'x-risu-asset'`**로 수정 (RisuAI 호환)
- MCP API 서버의 charx 에셋 읽기에서 인라인 MIME 분기를 공용 `extToMime()` 맵으로 교체

## [0.26.3] - 2026-03-28

### 수정

- **실수로 제거된 번들 `skills/` 문서를 복원**
  - `skills/` 아래 프로젝트 스킬 문서와 참조 파일을 마지막 정상 커밋 기준으로 되살림
  - `README.md`와 `AGENTS.md`의 프로젝트 스킬 안내를 실제 저장소 상태에 맞게 갱신
  - Windows 체크아웃 이후 `skills/`가 비어 보일 때 `npm run sync:skills`로 점검해야 한다는 안내를 보강

## [0.26.2] - 2026-03-28

### 수정

- **플루니 부트스트랩이 터미널의 현재 작업 디렉터리(cwd)를 따르도록 수정**
  - `AGENTS.md` 및 `.github/agents/` 자문 에이전트 파일이 내장 터미널의 cwd 기준으로 생성됨
  - 터미널에서 프로젝트 루트를 결정할 때 절대 경로 검증을 추가하여 잘못된 경로 사용을 방지
- **내장 터미널에서 수동 `copilot` 명령 실행 지원**
  - 메뉴 액션뿐 아니라 터미널에 직접 `copilot`을 입력해도 플루니 모드 부트스트랩이 적용됨
- **Copilot custom agent 파일명을 `.agent.md`로 변경하고 YAML frontmatter 적용**
  - `pluni.md` → `pluni.agent.md`, `kotone.md` → `kotone.agent.md`, `sophia.md` → `sophia.agent.md`
  - 파일 상단에 YAML frontmatter(`---\nname: ...\n---`) 추가
- **레거시 `.md` 런타임 산출물의 정리/복원 분리**
  - canonical `.agent.md` 정리와 레거시 `.md` 복원을 별도 try/catch로 분리하여 한쪽 실패가 다른 쪽에 영향을 주지 않음
- **입력 디스패처의 queueDepth 감소를 try/finally로 보호**
  - 핸들러 예외 시에도 큐 카운터가 정확히 감소하도록 수정
- **자문 에이전트 프로필 강화 및 compact 요약 예산 조정**
  - 자문 패널의 strengths 요약이 일관되게 표시되도록 수정
- **비어 있거나 누락된 `skills/` 디렉터리를 허용하도록 프로젝트 스킬 동기화 경로 보강**
  - `npm run sync:skills`와 `npm install`의 `prepare` 단계가 루트 `skills/` 폴더가 없을 때 실패하지 않고 건너뜀
  - 번들 프로젝트 스킬 문서를 제거한 브랜치에서도 CI와 릴리즈 패키징이 계속 동작하도록 정리

## [0.26.1] - 2026-03-28

### 수정

- **로어북 폴더 key를 canonical `folder:UUID` 형식으로 일관화**
  - 사이드바/폼/가져오기/MCP 수정 경로가 새 폴더를 bare UUID 대신 `folder:UUID`로 저장하도록 정리
  - MCP 읽기 응답도 폴더 엔트리 key를 `folder:UUID`로 반환해 에디터 표면과 일치하도록 수정
  - 레거시 bare UUID / `id` 기반 폴더 데이터는 계속 읽되, 정규화 시 canonical key로 승격

## [0.26.0] - 2026-03-28

### 새 기능

- **GitHub Copilot CLI용 `플루니 연구소` RP 모드 추가**
  - `Pluni`, `Kotone`, `Sophia`의 3인 자문 패널을 기반으로 챗봇 설계를 논의
  - `1:1 챗봇`, `월드 시뮬레이터`, `멀티 캐릭터 월드 시뮬레이터` 3개 카테고리를 설정에서 선택 가능

### 변경

- **Copilot 시작 시 플루니 자문 에이전트 프로필 자동 준비**
  - `rpMode=pluni` + GitHub Copilot CLI 시작 시 세션 `AGENTS.md`와 함께 임시 `.github/agents/pluni.md`, `kotone.md`, `sophia.md`를 생성
  - Claude Code / Codex / Gemini CLI에서는 같은 자문 구조를 단일 세션 합성 프롬프트로 폴백

### 수정

- **Copilot 전용 임시 에이전트 파일 정리 경로 보강**
  - 플루니 Copilot 모드가 아닌 다음 실행 경로에서도 기존 `.github/agents/*.md` 파일을 안전하게 복원하거나 삭제

## [0.25.0] - 2026-03-28

### 새 기능

- **`.risup` 프롬프트 편집을 template-first surface로 승격**
  - visible `프롬프트` 그룹이 `mainPrompt` / `jailbreak` 중심이 아니라 구조화 `promptTemplate` / `formatingOrder` / `customPromptTemplateToggle` / 템플릿 변수 중심으로 동작
  - `.risup`의 top-level `description`도 다시 별도 항목으로 편집 가능

### 변경

- **실제 RisuAI 흐름에 맞게 legacy 프롬프트를 호환성 데이터로 격하**
  - `mainPrompt`, `jailbreak`, `globalNote`, `useInstructPrompt`, `instructChatTemplate`, `JinjaTemplate`는 파일에 보존되지만 주요 프롬프트 UI에서는 내려감
  - `customPromptTemplateToggle`를 멀티라인 textarea로 바꾸고, structured prompt editor를 앱 기본 폼 스타일과 어울리는 카드/셀렉트/버튼 UI로 재정렬

### 수정

- **`.risup` 백업 복원 / 자동 저장 경로 보강**
  - 다른 risup 폼 탭이 활성화된 상태에서 백업을 복원해도 현재 보이는 form UI가 함께 refresh되도록 수정
  - hidden legacy `risup_prompts` 백업을 visible `프롬프트` 메뉴에서 다시 불러올 수 있도록 복원 경로 추가
  - risup 복원 후 autosave payload가 구조화 프롬프트 필드와 top-level `description`까지 함께 반영되도록 보강

## [0.24.0] - 2026-03-28

### 새 기능

- **실제 RisuAI `.risup` 편집 호환성 추가**
  - gzip / zlib / raw-deflate 변형으로 내보낸 실제 `.risup` 프리셋을 열고 저장할 수 있도록 복구
  - 열 때 감지한 압축 모드를 저장 시 최대한 보존하고, 새 프리셋은 RisuAI 호환성이 높은 모드로 저장

- **구조화된 risup 프롬프트 템플릿 편집기 추가**
  - `promptTemplate`를 raw JSON textarea 대신 항목 목록 + 상세 편집기로 노출
  - `type`, `type2`, `role`, `text`, `rangeStart` / `rangeEnd`, `chatAsOriginalOnSystem`, `innerFormat`, `defaultText`, cache `depth` / `role`를 직접 편집 가능
  - `formatingOrder`를 재정렬 가능한 토큰 목록으로 노출해 known / unknown token을 함께 유지

- **risup promptTemplate / formatingOrder 전용 MCP 도구 추가**
  - `list_risup_prompt_items`, `read_risup_prompt_item`, `write_risup_prompt_item`, `add_risup_prompt_item`, `delete_risup_prompt_item`, `reorder_risup_prompt_items`
  - `read_risup_formating_order`, `write_risup_formating_order`

### 변경

- **`.risup` 저장 검증 강화**
  - `presetBias`, `localStopStrings`뿐 아니라 구조화 프롬프트 필드의 invalid 상태도 저장 전에 차단
  - 손상된 `promptTemplate` / `formatingOrder`는 UI에서 복구용 raw editor를 표시하고, MCP에서는 명시적 parse error를 반환

### 수정

- **지원하지 않는 risup 프롬프트 item 처리 보강**
  - 구조화 UI와 MCP list/read에서는 unsupported item metadata를 숨기지 않고 노출
  - item-level write/add 경로는 unsupported shape를 명시적으로 거부하고 raw `write_field("promptTemplate")` fallback을 안내

## [0.23.0] - 2026-03-27

### 새 기능

- **구조화된 트리거 스크립트 편집기 추가**
  - `.charx` / `.risum`의 `triggerScripts`가 더 이상 raw JSON 탭으로 열리지 않고, 트리거 목록·조건·효과를 직접 편집하는 전용 폼 에디터로 열림
  - 지원하지 않는 trigger/effect/condition은 조용히 유실하지 않고 저장을 차단해 데이터 손실을 방지

- **charx 메타데이터 필드 UI 노출**
  - 기존 `캐릭터 정보` 흐름 안에서 `creatorcomment`와 `characterVersion`을 직접 편집 가능

### 수정

- **charx / risum Lua-트리거 모드 판정 정리**
  - 빈 `triggerScripts`, invalid JSON, 단독 `triggerlua` wrapper를 모두 Lua 모드로 취급하고, 독립 트리거 목록이 있을 때만 트리거 모드로 전환
  - `.risum`도 `.charx`와 동일하게 Lua 모드일 때 트리거 항목이 비활성처럼 보이고, 트리거 모드일 때 Lua 폴더가 비활성처럼 보이도록 정렬

- **트리거 스크립트 백업 복원 경로 보강**
  - `_triggerform` 탭 백업이 draft object를 저장하더라도 restore 시 안전하게 trigger text로 되돌리고, 활성 탭 UI까지 함께 refresh되도록 보강

## [0.22.11] - 2026-03-27

### 수정

- **`.risup` 편집 사이드바 복구**
  - `.risup` 파일을 열면 더 이상 빈 공용 항목만 보이지 않고, 프리셋 전용 그룹 탭(기본, 프롬프트, 모델/API, 기본 파라미터, 샘플링, 추론, 템플릿, JSON 스키마, 기타)이 좌측 사이드바에 표시됨
  - `regex[]`는 기존 전용 폼 에디터를 그대로 유지하고, `.risup`에서 의미 없는 Lua / 로어북 / 에셋 / 설명 항목은 숨김
  - `name` 편집이 다시 가능하며 file label도 함께 갱신됨
- **`.risup` 저장 전 JSON 검증 추가**
  - `promptTemplate`, `presetBias`, `formatingOrder`, `localStopStrings`에 잘못된 JSON이 남아 있으면 저장/다른 이름으로 저장을 차단하고 문제 필드를 상태바에 표시
- **`.risup` 탭 갱신 경로 보강**
  - AI/MCP가 risup 필드를 수정했을 때 열려 있는 risup 그룹 탭이 함께 새 값으로 refresh되도록 보강

## [0.22.10] - 2026-03-26

### 수정

- **프로젝트 skills 링크 자동 복구**
  - Windows에서 git이 `.claude/skills`, `.gemini/skills`, `.github/skills` 심볼릭 링크를 `../skills` 일반 파일로 체크아웃해 각 LLM CLI가 스킬 디렉터리를 읽지 못하던 문제 수정
  - `src/lib/skill-link-sync.ts`와 `npm run sync:skills`를 추가해 세 경로를 루트 `skills/`로 다시 연결하도록 보강
  - Windows에서는 실제 symlink를 우선 생성해 `git status`가 불필요하게 더럽혀지지 않도록 하고, symlink 권한이 없을 때만 junction으로 폴백
  - `npm install`의 `prepare` 단계에서 자동 복구되며, 필요하면 수동으로 `npm run sync:skills`를 실행할 수 있음

## [0.22.9] - 2026-03-26

### 수정

- **charx 아이콘 에셋 이름 호환성 수정**
  - RisuAI는 `type='icon'` + `name='main'`인 에셋을 메인 아이콘으로 인식하지만, RisuToki가 새 아이콘 에셋 엔트리를 생성할 때 파일명 기반 이름을 사용하여 RisuAI에서 메인 아이콘을 찾지 못하는 문제 수정
  - 첫 번째 icon 타입 에셋에 `name='main'`을 자동 부여

### 조사 완료 (RisuToki 외부 이슈)

- **RisuRealm 공유 실패 원인 조사**
  - "corrupted" 에러는 RisuAI→RisuRealm 공유 단계에서 발생 (RisuAI가 캐릭터를 PNG로 재수출할 때)
  - RisuToki의 charx 포맷은 완전히 호환됨을 확인: ZIP 호환성(adm-zip↔fflate) ✅, RPack 바이트맵 동일 ✅, card.json 구조 ✅, module.risum 바이너리 ✅
  - 근본 원인은 RisuAI 내부의 `exportCharacterCard()` 또는 RisuRealm 서버측 검증에 있으며, RisuToki 수정 범위 밖

## [0.22.8] - 2026-03-26

### 수정

- **npm 프로그레스 스피너로 인한 PTY 무한 대기 해결**
  - npm의 브라유 문자 스피너(⠙⠹⠸…)가 ANSI 이스케이프 코드와 함께 PTY 버퍼를 간섭하여 LLM CLI 도구(Claude Code, Copilot CLI 등)에서 프로세스 완료를 감지하지 못하는 문제 수정
  - `.npmrc`에 `progress=false` 설정 추가로 스피너 비활성화
  - 전체 빌드(`npm run build`) 소요 시간: 무한 대기 → ~26초

## [0.22.7] - 2026-03-26

### 수정

- **skills 폴더 SSOT (Single Source of Truth) 통합**
  - `.claude/skills`, `.gemini/skills`, `.github/skills`를 프로젝트 루트 `skills/` 폴더를 가리키는 심볼릭 링크로 변환
  - 기존 중복 복사본을 제거하여 루트 `skills/` 하나만 수정하면 모든 LLM CLI에 반영
  - `.gitignore` 업데이트: 심볼릭 링크 경로는 추적 허용

- **Vite/Rollup 빌드 실패 수정**
  - git에 tracked된 stale CJS `.js` 파일들이 `.ts` 소스를 가려서 발생한 빌드 오류 해결
  - `vite.config.ts`에 `resolve.extensions` 추가하여 `.ts`를 `.js`보다 우선 resolve
  - `lorebook-folders.ts`를 `tsconfig.node-libs.json`에 추가하여 CJS 출력 자동 생성

## [0.22.6] - 2026-03-26

### 수정

- **로어북 폴더 식별자 정규화**
  - UI, MCP, 가져오기/내보내기 경로가 폴더 항목의 `key` UUID를 canonical identity로 공통 사용하도록 정리
  - 자식 로어북 항목의 `folder` 참조를 항상 `folder:UUID` 형태로 정규화하고, 기존 `id` 전용 폴더는 legacy fallback으로 계속 읽도록 보강

## [0.22.5] - 2026-03-24

### 수정

- **preload 스크립트 로드 실패 수정**
  - v0.22.3에서 `preload.ts`를 `./src/lib/preload-api` 모듈로 리팩토링한 후 Electron sandbox preload의 `require` 제한으로 모듈 resolve 실패
  - esbuild로 preload 스크립트를 단일 파일로 번들링하여 외부 `require` 의존성 제거
  - `popout-preload.ts`도 일관성을 위해 동일하게 번들링 적용

## [0.22.4] - 2026-03-24

### 수정

- **`search_all_fields` MCP 검색 계약 복구**
  - stdio MCP 서버가 호출하는 `/search-all` backend route를 구현해 `MCP server 'risutoki': Not found` 오탐을 제거
  - 문자열 필드, `alternateGreetings`, `groupOnlyGreetings`, 로어북 content를 한 번에 검색하는 공통 search helper 추가
  - API route / MCP smoke test 회귀 검증을 추가해 도구 선언과 backend surface가 다시 어긋나지 않도록 고정

## [0.22.3] - 2026-03-24

### 변경

- **문서화되지 않은 로컬 sync 노출면 제거**
  - preload/main process에 남아 있던 retired sync server 제어 surface 삭제
  - 앱이 숨은 localhost HTTP 서버를 열지 않도록 정리
- **CI 경로 강화**
  - PR/push CI를 Ubuntu 검증 + Windows Electron/Renderer 빌드로 분리
  - Dependabot으로 npm / GitHub Actions 의존성 점검 자동화 추가

### 수정

- **프리뷰 격리 강화**
  - 프리뷰를 sandbox iframe + 인증된 bridge 메시지 경계로 전환
  - parent-side `document.write` / `innerHTML` 주입 제거
  - 스크립트/인라인 이벤트 속성 제거 sanitizer 적용
- **저장 실패 데이터 유실 방지**
  - 저장 실패 시 창이 닫히지 않도록 close policy 수정
  - 사용자에게 명시적인 저장 실패 오류 표시 추가
- **설정/파일 입력 검증 강화**
  - 손상된 layout/avatar localStorage JSON을 안전하게 fallback 처리
  - `.charx`, `.risum`, `.risup` 구조 검증과 payload 경계 체크 추가

## [0.22.2] - 2026-03-23

### 변경

- **writing-arca-html 스킬 보강** — 사용자 가이드라인에서 누락된 콘텐츠 병합
  - 테마 테이블에 "Social Media / Platform" 행 추가 (Discord, Twitter, Instagram 스타일)
  - "Creative Thinking Examples" 섹션 추가 — 캐릭터 유형별 디자인 영감 (히키코모리, 판타지 기사, AI 캐릭터, 역사 인물, 소셜미디어 페르소나 등)
  - "Background Patterns with Repeating Divs" 기법 섹션 추가 (줄무늬/체커보드 패턴)
  - 창작 독려 마무리 문구 추가 ("Don't default to templates")

## [0.22.1] - 2026-03-23

### 수정

- **CBS 스킬 문서 정확도 개선** — RisuAI 소스 코드(cbs.ts, parser.svelte.ts)와 교차 검증하여 다수 오류 수정
  - `makedict`: 누락된 별칭 `makeobject` 추가
  - `rollp`: 누락된 별칭 `rollpick` 추가
  - `moduleassetlist`: 누락된 별칭 `module_assetlist` 추가
  - `crypt`: 누락된 별칭 `decrypt` 추가
  - `image`/`img`: `img`가 `image`의 별칭으로 잘못 문서화된 것을 별도 태그로 분리 (styled vs unstyled)
  - Escape Characters: `bo`/`bc` 전체 별칭, `()`/`<>`/`:`/`;` 전체 별칭 보완
  - Metadata Keys: `majorver`/`major`/`lang`/`browserlocale`/`browserlang` 등 대체 키 문서화
  - `u`/`ue` 태그: 미문서화된 hex 유니코드 디코딩 단축 태그 추가
  - `#when` Advanced Operators: `toggle`/`tis`/`tisnot`에 문법 예시 추가
  - `#each`: `::keep` 모드 문서화
  - 태그 총 수를 130+에서 170+로 갱신

## [0.22.0] - 2026-03-23

### 새 기능

- **멀티라인 블록 치환** — `replace_block_in_field` / `replace_block_in_lorebook` 신규 MCP 도구
  - 두 앵커 사이의 여러 줄에 걸친 텍스트 블록을 안전하게 교체
  - `include_anchors: false`로 앵커는 유지하고 사이 내용만 교체 가능
  - `dry_run` 지원으로 미리보기 가능
- **필드 일괄 쓰기** — `write_field_batch` 신규 MCP 도구
  - 여러 소형 필드를 한 번의 확인으로 동시 업데이트
  - characterVersion + defaultVariables 같은 조합에 유용
- **필드 스냅샷/복원** — `snapshot_field` / `list_snapshots` / `restore_snapshot` 신규 MCP 도구
  - 대형 필드 편집 전 안전망으로 활용
  - 필드당 최대 10개 스냅샷 보관 (파일 전환 시 초기화)
- **필드 통계** — `get_field_stats` 신규 MCP 도구
  - 문자 수, 행 수, 단어 수, CBS/HTML 태그 수, 빈 행 수 등 요약 정보

### 수정

- **CRLF 정규화** — 모든 replace/insert/search MCP 도구에서 CRLF(`\r\n`)→LF(`\n`) 자동 변환
  - 멀티라인 매칭 실패의 근본 원인 해결
  - 필드, 로어북, 정규식, Lua, CSS 모든 핸들러에 적용
- **확인 타임아웃 증가** — MCP 작업 확인 대기시간 30초 → 10분으로 변경
  - 대형 파일 작업 시 타임아웃으로 인한 작업 실패 방지

---

## [0.21.0] - 2026-03-23

### 새 기능

- **사이드바 카테고리 그룹핑** — 항목 패널을 5개 섹션으로 시각 구분 (캐릭터 정보 / 메시지 / 스크립트 / 데이터 / 에셋)
  - `createSectionHeader()` — 새 사이드바 섹션 헤더 컴포넌트 추가
  - 항목 순서 재배치: 설명 → 글로벌노트 → 기본변수 → 첫메시지
- **Lua/트리거 상호 배타 표시** — charx 파일에서 현재 비활성 모드의 항목을 회색 처리 + 툴팁으로 안내
- **인라인 이름 편집** — 상단 메뉴바의 파일명을 더블클릭하여 봇 이름 수정 (Enter 확정, ESC 취소)

### 변경

- 사이드바에서 "이름" 항목 제거 (인라인 편집으로 이전)

---

## [0.20.0] - 2026-03-23

### 변경

- **비권장/미사용 charx 필드 편집 기능 제거** — RisuAI 최신 코드 분석 결과 비권장되거나 실질적으로 사용되지 않는 8개 필드의 쓰기 기능을 제거
  - **완전 제거 (읽기+쓰기)**: `groupOnlyGreetings` — RisuAI에서 참조 코드 없음, 사이드바 UI 및 MCP 인사말 엔드포인트 전체 제거
  - **쓰기만 제거 (읽기 유지)**: `personality`, `scenario`, `nickname`, `additionalText`, `source`, `tags`, `license`
  - 기존 charx 파일에 저장된 데이터는 읽기/저장 시 그대로 보존 (I/O 패스스루)
  - MCP `list_fields`에서 비권장 필드는 `(read-only)` 표시로 구분
  - AI 어시스턴트 프롬프트에서 관련 설명 업데이트

### 유지되는 charx 전용 편집 필드

- `systemPrompt`, `exampleMessage`, `creatorcomment`, `creator`, `characterVersion`

---

## [0.19.3] - 2026-03-23

### 수정

- **정규식 Type 저장 오류 수정** — charx/risum/risup 파일에 정규식 항목을 저장할 때 `type` 값이 RisuAI와 호환되지 않는 형식(camelCase)으로 기록되던 버그 수정
  - **근본 원인**: Risutoki는 `editInput`, `editOutput`, `editRequest`, `editDisplay` 등 camelCase를 사용했으나, RisuAI는 `editinput`, `editoutput`, `editprocess`, `editdisplay` 등 lowercase로 대소문자 구분 비교
  - **추가 불일치**: `editRequest`→`editprocess`, `editTranslation`→`edittrans` 이름 자체가 다른 문제도 함께 수정
  - 파일 저장 시 (`saveCharx`, `saveRisum`, `saveRisup`) type 자동 정규화 추가
  - 파일 로드 시 (`openCharx`, `openRisum`, `openRisup`) 기존 camelCase 파일 자동 정규화
  - 폼 에디터, 사이드바, 드래그앤드롭, MCP API 등 모든 정규식 생성 경로에 RisuAI 호환 값 적용

## [0.19.2] - 2026-03-23

### 수정

- **greeting batch 라우트 충돌 수정** — `batch_delete_greeting`, `batch_write_greeting`, `reorder_greetings` 호출 시 "Index batch-delete out of range" 에러가 발생하던 버그 수정. 단일 인사말 수정 라우트(`POST /greeting/:type/:idx`)가 `batch-write`, `batch-delete`, `reorder` 경로를 인덱스로 잘못 파싱하던 문제

## [0.19.1] - 2026-03-23

### 수정

- **MCP 문서 정확성 개선** — AGENTS.md와 README.md의 MCP 도구 문서가 실제 코드와 정확히 일치하도록 수정
  - AGENTS.md에 누락된 risum 에셋 관리 도구 4종 (`list_risum_assets`, `read_risum_asset`, `add_risum_asset`, `delete_risum_asset`) 문서 추가
  - README.md MCP 도구 수를 55+종에서 실제 등록 수인 99종으로 수정
  - README.md 에셋 도구 목록에서 risum 에셋 도구 전체 나열 (기존 `등` 표기 제거)

## [0.19.0] - 2026-03-23

### 새 기능

- **CBS 검증 MCP 도구 4종 추가** — CBS(Conditional Block Syntax) `{{#when}}` 블록의 구조 검증, 토글 목록 조회, 시뮬레이션, 기준선 비교를 AI CLI에서 직접 수행 가능
  - `validate_cbs` — 열기/닫기 균형 검증 + 전체 토글 조합 오류 검사 (최대 1024 조합)
  - `list_cbs_toggles` — 파일에 사용된 모든 CBS 토글 이름, 조건, 참조 위치 나열
  - `simulate_cbs` — 지정 토글 값으로 CBS 블록을 resolve하여 결과 텍스트 미리보기 (전체 조합 모드 지원, 최대 256)
  - `diff_cbs` — 기준선(모든 토글=0) 대비 지정 토글 값의 변경 줄 비교
- **CBS 파서/평가기/추출기 TypeScript 라이브러리** — risucbs CLI의 핵심 로직을 TypeScript로 포팅하여 94개 테스트와 함께 내장

## [0.18.3] - 2026-03-22

### 수정

- **charx 에셋 RisuAI Import 시 미표시** — MCP `add_charx_asset`/`delete_charx_asset`/`rename_charx_asset`가 ZIP 파일만 조작하고 `card.json data.assets` (cardAssets) 배열을 갱신하지 않아 RisuAI에서 에셋을 인식하지 못하던 문제 수정. 에셋 추가/삭제/이름변경 시 cardAssets 자동 동기화 추가. `saveCharx()`에서도 ZIP assets와 cardAssets를 대조하여 누락 엔트리를 자동 보정
- **정규식 Type이 RisuAI에서 미인식** — MCP가 정규식 type을 camelCase(`editDisplay`, `editOutput`)로 저장했으나 RisuAI는 소문자(`editdisplay`, `editoutput`)만 인식. 정규식 쓰기 시 type을 자동으로 소문자 정규화하는 `normalizeRegexType()` 추가

## [0.18.2] - 2026-03-22

### 수정

- **Backspace 2칸 삭제 버그** — CJK IME 조합 중 `renderTabs()` DOM 리빌드가 composition 상태를 깨뜨려 backspace가 조합 해제 + 문자 삭제 두 번 처리되던 문제 수정. 메인 Monaco와 미니 Monaco 모두 composition 가드 + 지연 렌더링 적용
- **로어북/정규식 이름 저장 안 됨** — 데이터는 정상 저장되지만 탭 레이블과 사이드바가 갱신되지 않아 저장 실패로 보이던 문제 수정. 이름 변경 시 탭 레이블 즉시 갱신 + 저장 후 사이드바 리빌드 추가. `buildMarkDirty`가 부모 필드(`regex`/`lorebook`)도 dirty로 표시하도록 개선
- **정규식 Type 편집 미반영** — RisuAI 원본 데이터(`editinput`)와 드롭다운 값(`editInput`)의 대소문자 불일치로 기존 type이 올바르게 선택되지 않던 문제 수정. 대소문자 무시 비교 적용
- **정규식 find/replace 필드 동기화** — 폼 에디터가 `in`/`out`만 설정하고 `find`/`replace`를 동기화하지 않아, `find`가 우선인 preview-engine에서 편집 내용이 반영되지 않던 문제 수정. 양쪽 필드를 함께 갱신하고 초기값도 `find`/`replace` 우선으로 로드

## [0.18.1] - 2026-03-22

### 새 기능

- **`add_lua_section` / `add_css_section` MCP 도구** — 새 Lua/CSS 섹션을 이름과 함께 추가. `insert_in_lua`/`insert_in_css`는 구분자(`-- ===== name =====`, `/* ===== name ===== */`)를 이스케이프하여 새 섹션 생성이 불가능했던 문제 해결. 올바른 구분자와 함께 마지막 섹션 뒤에 생성
- **`list_reference_regex` / `read_reference_regex` MCP 도구** — 참고 자료의 정규식을 개별 접근. `read_reference_field("regex")`가 전체를 한꺼번에 반환하여 컨텍스트를 낭비하던 문제 해결. 로어북/Lua/CSS와 동일한 `list → read` 패턴
- **`add_regex_batch` / `write_regex_batch` MCP 도구** — 여러 정규식 항목을 한 번에 추가/수정 (최대 50개). 단일 확인으로 처리. 로어북의 `add_lorebook_batch`/`write_lorebook_batch`와 동일한 패턴

## [0.18.0] - 2026-03-22

### 새 기능

- **`search_all_fields` MCP 도구** — 모든 텍스트 필드(firstMessage, description, globalNote, alternateGreetings, groupOnlyGreetings, lorebook content 등)에서 한 번에 검색. 잔류 태그 확인 등 전체 스캔에 유용. 필드별 매치 수와 주변 컨텍스트 반환. `include_lorebook`, `include_greetings` 옵션으로 범위 조절 가능
- **`replace_across_all_lorebook` MCP 도구** — 모든 로어북 항목에서 특정 문자열을 한 번에 치환. `list_lorebook` → `replace_in_lorebook` 반복 호출 3단계를 1회로 축소. `field` 옵션으로 content/comment/key/secondkey 대상 선택 가능. `dry_run`으로 미리보기 지원
- **`replace_in_field_batch` MCP 도구** — 하나의 필드에 여러 치환을 순차적으로 적용하고 한 번의 확인으로 처리. 128KB firstMessage에서 10명 캐릭터 태그를 각각 바꿀 때 확인 10회→1회. `dry_run` 지원
- **Charx 에셋 MCP 도구 등록** — 백엔드에 이미 구현된 charx 에셋 관리 엔드포인트를 MCP 도구로 등록: `list_charx_assets`, `read_charx_asset`, `add_charx_asset`, `delete_charx_asset`, `rename_charx_asset`. Node.js 스크립트 우회 불필요
- **`replace_in_field` dry-run 미리보기** — `dry_run: true` 파라미터 추가. 실제 변경 없이 매치 수, 각 매치의 전후 컨텍스트(60자), 위치를 반환. 대형 필드 regex 작업에서 substring 충돌 등 실수 사전 방지

### 변경

- **`replace_in_lorebook` — comment/key 필드 지원 확장** — 기존 content만 지원하던 치환을 comment, key, secondkey 필드까지 확장. `field` 파라미터로 대상 선택 (기본: "content")
- **`replace_in_field` / `insert_in_field` — 필드별 뮤텍스 도입** — 동일 필드에 여러 replace/insert가 병렬 호출될 때 마지막 쓰기만 살아남던 데이터 유실 버그 수정. Promise 체인 기반 필드별 뮤텍스로 순차 실행 보장

### 수정

- **`read_regex` find/replace 필드 누락 수정** — 레거시 데이터에서 `in`/`out` 필드만 있고 `find`/`replace`가 없는 경우, GET /regex/:idx가 두 필드를 모두 삭제하여 빈 응답을 반환하던 버그 수정. 삭제 전 `find = find || in`, `replace = replace || out` 정규화 추가

## [0.17.1] - 2026-03-22

### 수정

- **로어북 라우트 섀도잉 버그 수정** — `POST /lorebook/:idx` catch-all 핸들러가 `batch-replace`, `batch-insert`, `export`, `import` 등의 명명된 라우트를 가로채서 `parseInt('batch-replace')` → NaN 에러 발생. `lorebookReservedPaths` 배열로 GET/POST catch-all에서 예약된 경로를 제외하도록 수정
- **`add_lorebook_batch` 라우트 핸들러 누락 수정** — `toki-mcp-server.ts`에서 `/lorebook/batch-add`로 요청하지만 API 서버에 핸들러가 없어 항상 실패하던 문제 해결. 일괄 추가 핸들러 신규 구현
- **`batch_delete_lorebook` 라우트 핸들러 누락 수정** — `/lorebook/batch-delete` 핸들러가 없어 항상 실패하던 문제 해결. 인덱스 내림차순 삭제로 시프트 문제 방지
- **URL 파라미터 parseInt NaN 취약점 일괄 수정** — regex/lua/css/reference/asset 등 29개 라우트 핸들러에서 `parseInt(parts[N])` 결과에 `isNaN()` 체크 누락. NaN이 range 체크를 우회하여 "Index NaN out of range" 에러 발생 가능. 모든 인스턴스에 `isNaN(idx) ||` 가드 추가

## [0.17.0] - 2026-03-22

### 새 기능

- **`search_in_field` MCP 도구** — 필드 내용에서 문자열/정규식을 검색하고 주변 컨텍스트(전후 N자)와 함께 반환하는 읽기 전용 도구. 대형 필드(127KB+ firstMessage 등)를 전체 읽지 않고 특정 텍스트 위치를 파악 가능. 파라미터: `query`, `context_chars`(기본 100), `regex`, `flags`, `max_matches`(기본 20)
- **`read_field_range` MCP 도구** — 대형 필드의 특정 구간만 반환하는 읽기 전용 도구. 문자 오프셋과 길이로 원하는 부분만 읽기 가능 (최대 10000자). `search_in_field`의 `position` 결과와 연계하여 사용

### 수정

- **`export_field_to_file` 라우트 충돌 버그 수정** — `/field/export` 요청이 제네릭 필드 핸들러(`/field/:name`)에 의해 가로채져 "export"라는 필드를 찾으려 하던 버그 수정. 예약어 배열 방식으로 라우트 조건 개선

---

## [0.16.0] - 2026-03-22

### 수정

- **🔴 Lua 데이터 소실 버그 수정** — `write_lua`, `replace_in_lua`, `insert_in_lua`로 Lua 섹션을 수정한 후 트리거 스크립트 작업(추가/삭제/수정)을 하면 Lua 변경사항이 소실되던 치명적 버그 수정. 근본 원인: Lua 섹션 핸들러가 `triggerScripts`에 변경을 동기화하지 않아서, 이후 `extractPrimaryLua()`가 옛날 데이터로 덮어씀. 3개 핸들러에 `mergePrimaryLua` + `triggerScripts` broadcast 추가

### 새 기능

- **charx 에셋 관리 도구** — `.charx` 파일의 내장 에셋(이미지 등)을 MCP 도구로 관리
  - `list_charx_assets` — 에셋 목록 (경로, 크기)
  - `read_charx_asset` — 에셋을 base64로 읽기
  - `add_charx_asset` — 에셋 추가 (icon/other 폴더)
  - `delete_charx_asset` — 에셋 삭제
- **로어북 일괄 추가** (`add_lorebook_batch` MCP 도구) — 최대 50개 로어북 항목을 한 번에 추가. 단일 확인으로 전부 추가
- **로어북 일괄 삭제** (`batch_delete_lorebook` MCP 도구) — 최대 50개 로어북 항목을 한 번에 삭제. 인덱스 내림차순 처리로 시프트 문제 방지
- **인사말 일괄 삭제** (`batch_delete_greeting` MCP 도구) — 최대 50개 인사말을 한 번에 삭제. 인덱스 내림차순 처리로 시프트 문제 방지

---

## [0.15.1] - 2026-03-21

### 새 기능

- **정규식 필드 치환** (`replace_in_regex` MCP 도구) — 정규식 항목의 find/replace 필드에서 부분 문자열 치환. 대형 HTML이 포함된 regex OUT을 전체 읽지 않고 편집 가능. 정규식 모드 지원
- **정규식 필드 삽입** (`insert_in_regex` MCP 도구) — 정규식 항목의 find/replace 필드에 텍스트 삽입 (end/start/after/before). 대형 regex 필드의 부분 편집 가능

### 수정

- **CSS 섹션 구분자 오인식 수정** — `/* ============================ Title ============================ */` 같은 장식 주석이 섹션 구분자로 잘못 인식되던 문제 수정. `=` 그룹 길이 상한(15자) 및 총 `=` 개수 상한(30) 추가로 일반 CSS 주석과 구분

---

## [0.15.0] - 2026-03-22

### 새 기능

- **필드 일괄 읽기** (`read_field_batch` MCP 도구) — 여러 필드를 한번에 읽기 (최대 20개). 개별 `read_field` 반복 호출 불필요
- **필드 내 문자열 치환** (`replace_in_field` MCP 도구) — 대형 필드를 전체 읽지 않고 서버에서 직접 치환. 정규식 지원
- **필드 내 텍스트 삽입** (`insert_in_field` MCP 도구) — 대형 필드를 전체 읽지 않고 특정 위치에 삽입 (end/start/after/before)
- **인사말 필터 검색** (`list_greetings` filter/content_filter 파라미터) — 특정 키워드가 포함된 인사말만 검색 가능

### 수정

- **`replace_in_lorebook_batch` 크래시 수정** — 로어북 배열에 null/undefined 엔트리가 있을 때 `Cannot read properties of undefined (reading 'comment')` 에러 발생하던 버그 수정
- 로어북 접근하는 모든 엔드포인트(batch-write, batch-replace, batch-insert, replace, insert, delete)에 엔트리 null 체크 추가

---

## [0.14.0] - 2026-03-22

### 새 기능

- **로어북 파일 시스템 내보내기/가져오기** — MCP 도구 + UI IPC로 로어북 데이터를 로컬 파일로 내보내고 다시 가져오기
  - `export_lorebook_to_files` — MD(항목당 1파일 + 폴더 구조) 또는 JSON(단일 파일) 포맷 지원
  - `import_lorebook_from_files` — MD/JSON 파일에서 로어북 항목 가져오기, dry_run 모드 + 충돌 해결(skip/overwrite/rename)
  - `export_field_to_file` — 임의 필드(description, globalNote 등)를 로컬 파일로 직접 저장
  - YAML frontmatter로 메타데이터(key, mode, insertorder 등) 보존
  - 폴더 구조를 디렉토리로 매핑/복원 (`_unfiled/` 디렉토리로 미분류 항목)
  - 경로 순회 차단 + 사용자 확인 팝업으로 보안 확보

### 추가

- `src/lib/lorebook-io.ts` — 로어북 내보내기/가져오기 코어 모듈
- `src/lib/lorebook-io.test.ts` — 37개 단위 테스트

---

## [0.13.0] - 2026-03-21

### 새 기능

- **WebP 에셋 압축** (`compress_assets_webp` MCP 도구 + UI IPC) — sharp 라이브러리를 사용하여 charx 파일의 모든 이미지 에셋을 WebP 손실 압축으로 변환
  - PNG, JPEG, GIF, BMP, TIFF, AVIF → WebP 변환 (SVG 건너뜀)
  - 애니메이션 GIF → animated WebP 자동 처리
  - WebP가 원본보다 크면 원본 유지 (데이터 안전)
  - 품질 조절 가능 (기본: 80, 0-100)
  - cardAssets, x_meta 경로 참조 자동 업데이트
  - 사용자 확인 팝업 + 상세 통계 반환

### 추가

- `sharp` 의존성 (v0.34.5) — Node.js 이미지 처리 라이브러리
- `src/lib/image-compressor.ts` — 이미지 압축 코어 모듈
- `src/lib/image-compressor.test.ts` — 12개 단위 테스트

---

## [0.12.0] - 2026-03-21

### 새 기능

- **로어북 일괄 치환** (`replace_in_lorebook_batch`) — 여러 항목의 content를 한 번에 치환. 각 항목별 매치 수 계산 → 전체 요약 → 단일 확인
- **로어북 일괄 삽입** (`insert_in_lorebook_batch`) — 여러 항목의 content에 한 번에 삽입. 단일 확인
- **부정 본문 검색** (`list_lorebook` `content_filter_not`) — content에 특정 키워드가 **없는** 항목만 필터. 참조 파일에도 동일 적용
- **배치 읽기 필드 프로젝션** (`read_lorebook_batch` `fields`) — `fields: ["content"]`로 필요한 필드만 반환하여 출력 크기 절감. 참조 파일에도 동일 적용

## [0.11.0] - 2026-03-21

### 새 기능

- **로어북 부분 치환** (`replace_in_lorebook`) — content에서 문자열/정규식 치환. 대용량 항목도 전체를 읽지 않고 서버에서 직접 처리
- **로어북 내용 삽입** (`insert_in_lorebook`) — content의 특정 위치(end/start/after/before)에 텍스트 삽입
- **로어북 일괄 쓰기** (`write_lorebook_batch`) — 여러 항목을 한 번에 수정, 변경 요약 후 단일 확인
- **인사말 일괄 쓰기** (`batch_write_greeting`) — 여러 인사말을 한 번에 수정, 단일 확인
- **로어북 비교** (`diff_lorebook`) — 현재 파일↔참고 자료 로어북 항목의 필드별 + 라인 단위 diff
- **로어북 키 검증** (`validate_lorebook_keys`) — 후행 쉼표, 불필요한 공백, 빈 세그먼트, 중복 키 자동 탐지
- **로어북 복제** (`clone_lorebook`) — 기존 항목 복제 + 필드 오버라이드
- **인사말 순서 변경** (`reorder_greetings`) — 인사말 배열 순서를 인덱스 배열로 재배치

## [0.10.0] - 2026-03-21

### 새 기능

- **로어북 배치 읽기** (`read_lorebook_batch`) — 인덱스 배열로 최대 50개 로어북 항목을 한 번에 읽기. 참조 파일용 `read_reference_lorebook_batch`도 추가
- **로어북 본문 검색** (`list_lorebook` `content_filter`) — 로어북 content 텍스트에서 키워드 검색 (대소문자 무시). 매칭 컨텍스트 ±50자 미리보기 포함. 참조 파일에도 동일 적용
- **로어북 목록 미리보기** (`list_lorebook` `preview_length`) — 응답에 content 미리보기 포함 (기본 150자, 0~500 조절 가능)
- **Lua/CSS 배치 읽기** (`read_lua_batch`, `read_css_batch`) — 최대 20개 섹션을 한 번에 읽기. 참조 파일용 `read_reference_lua_batch`, `read_reference_css_batch`도 추가
- **태그 DB 상태 확인** (`tag_db_status`) — Danbooru 태그 DB 로딩 상태, 태그 수, 파일 경로 진단

## [0.9.10] - 2026-03-21

### 수정

- **Danbooru 태그 DB 로딩 실패 수정** — `resources/Danbooru Tag.txt`가 electron-builder의 `files` 및 `asarUnpack` 설정에 누락되어 패키징된 앱에서 MCP 서버가 태그 DB를 찾지 못하던 문제 수정

## [0.9.9] - 2026-03-21

### 수정

- **터미널 붙여넣기 2중 입력 수정** — 커스텀 키 핸들러(Ctrl+C/V)와 xterm.js 네이티브 paste 이벤트가 동시에 발생하던 버그 수정. 커스텀 입력 핸들러를 제거하고 xterm.js 네이티브 클립보드/IME 처리로 전환
- **터미널 한글(IME) 입력 개선** — xterm.js v6 내장 IME 처리를 방해하던 커스텀 키 이벤트 핸들러 제거

## [0.9.8] - 2026-03-21

### 수정

- **탭 닫기 시 메모리 해제** — 닫힌 탭의 클로저(getValue/setValue)와 캐시(\_lastValue)를 즉시 null 처리하여 GC 허용 (탭당 5-10MB 절감)
- **백업 데이터 정리** — 닫힌 탭의 backup-store 데이터와 문자열 캐시 자동 삭제 (`clearBackups`), 파일 변경 시 전체 백업 초기화 (`clearAllBackups`)
- **프리뷰 엔진 assetMap 정리** — `resetVars()` 호출 시 base64 에셋 맵도 함께 초기화하여 이미지 데이터 누적 방지
- **터미널 리소스 정리** — `TerminalUiHandle.dispose()` 추가 (ResizeObserver disconnect, 이벤트 리스너 제거, 터미널 dispose)
- **터미널 scrollback 축소** — 5,000줄 → 3,000줄 (메모리 ~300KB 절감, 실사용 충분)

## [0.9.7] - 2026-03-21

### 수정

- **MCP Server 성능 최적화** — LLM CLI 사용 시 CPU 스파이크 대폭 감소
  - `suggestSimilar()` Levenshtein 알고리즘을 2D 매트릭스 → 2행 DP로 개선 (메모리 O(m×n) → O(n)), 결과 캐싱 추가 (최대 500건)
  - `getPopularGrouped()` 결과를 태그 로딩 시 1회 계산 후 캐싱 (호출당 ~590K 정규식 매칭 제거)
  - `apiCache`에 LRU 크기 제한 추가 (최대 5,000건, 무한 메모리 누적 방지)
  - HTTP 응답 처리 시 문자열 연결(`data += chunk`) → `chunks[]` 배열 + `join()` 패턴으로 변경 (GC 압박 감소)
- **Backup Store 직렬화 개선** — 편집 시 불필요한 CPU/메모리 사용 감소
  - `JSON.parse(JSON.stringify())` 딥클론 → 네이티브 `structuredClone()` 전환
  - 중복 검사용 `JSON.stringify()` 이중 호출 → 마지막 항목 문자열 캐시로 1회로 감소
  - `while + shift()` 배열 정리 → `slice()` 패턴으로 변경
- **Main Process 동기 I/O → 비동기 전환** — UI 프리징 감소
  - `persistReferenceFiles`, `import-json`, `read-persona`, `write-persona`, `list-personas`, `write-system-prompt` 핸들러의 `writeFileSync`/`readFileSync` → `fs.promises` 비동기 전환
  - `broadcastToAll()` 이중 루프 제거 (팝아웃 윈도우에 2회 메시지 → 1회로 통합)
- **Monaco 에디터 성능 제한 추가** — 대형 파일 편집 시 안정성 향상
  - `maxTokenizationLineLength: 20000` 설정으로 극단적 긴 줄 토큰화 방지
  - 100KB 초과 파일에서 미니맵 자동 비활성화

## [0.9.6] - 2026-03-21

### 변경

- **SKILL 가이드 "신호 밀도(Signal Density)" 철학 도입** — 토큰 수 제약 중심에서 신호 밀도 중심으로 패러다임 전환
  - `skills/README.md` — Philosophy에 "Signal Density over Token Count" 서브섹션 추가: 토큰 수치는 참고 하한선이며 핵심 기준은 "모든 문장이 LLM 출력을 바꾸는가"
  - `skills/authoring-lorebook-bots/LOREBOOK_ARCHITECTURE.md` — Signal Density 섹션 신설 (Rich Detail vs Signal Noise 구분 + good/bad 예시 + Usefulness Test), AlwaysActive Budget 섹션 신설 (주목 경쟁 관점의 alwaysActive 관리 가이드), Common Entry Mistakes에 low signal density/redundancy/alwaysActive 남발 추가
  - `skills/authoring-lorebook-bots/SKILL.md` — What Goes Where 테이블에 유연성 주석 추가 (대형 컨텍스트에서 description/lorebook 경계는 유동적), Extended speech registers를 description 유지 가능으로 변경
  - `skills/writing-lorebooks/SKILL.md` — Best Practice #5를 "100-300 tokens" → 신호 밀도 기준으로 재작성, #8 "alwaysActive budget" 추가
  - `skills/authoring-characters/SKILL.md` — Lorebook Suggestions 출력 형식의 "토큰 이유로 잘라낸" 표현 제거

## [0.9.5] - 2026-03-21

### 변경

- **Léman Chronicles 주연 캐릭터 로어북 디스크립션 압축** — 전체 10명의 주연 프로필(39-48)과 스토리 엔트리(69-78)에서 중복 제거
  - 프로필: Code-switching 단독 문단 제거 → Voice DNA에 핵심 1문장으로 통합, 중복 Trivia 항목 1-2개 제거, 레지스터 헤더 축약
  - 스토리: 프로필과 항상 동시 트리거되므로 프로필에 이미 있는 정보 제거 (Clotilde 74: 설정 문단 축약, Han Byeol 75: Inner Voice 제거, Lidia 76: 에스페란토 중복 문장 제거 + Inner Voice 축약, Eun-sil 77: "The Part She Doesn't Show" 섹션 전체 제거 + Inner Voice 제거)
  - 조연 캐릭터(16-37): 스팟체크 완료 — 이미 간결하여 압축 불필요

## [0.9.4] - 2026-03-21

### 변경

- **SKILL 문서에 유연성 면책 조항 추가** — 가이드를 교조적으로 따르지 않고, 봇/캐릭터 상황에 맞게 취사선택하도록 권장하는 문구 삽입
  - `skills/README.md` — "Philosophy" 섹션 신설: 가이드는 룰북이 아닌 툴킷, 결과물이 더 매력적이면 어떤 규칙이든 무시 가능
  - `authoring-characters/SKILL.md` — 도입부에 유연성 노트 추가
  - `authoring-lorebook-bots/SKILL.md` — 도입부에 유연성 노트 추가
  - `authoring-characters/VALIDATION.md` — 체크리스트는 진단 도구이지 합불 기준이 아님을 명시

## [0.9.3] - 2026-03-21

### 변경

- **캐릭터 작성 SKILL 문서 대규모 갱신** — Project Vela, 송하리, 하퍼 가이드의 우수 기법을 반영하여 5개 SKILL 문서 갱신
  - `authoring-characters/SKILL.md` — Token Budget → Investment Guide (1M+ 컨텍스트 시대 대응), Surface vs Subversion 패턴, Psychological Deep Dive, Gap Moe/Hidden Depth 구조, Layered Dreams, Named Internal Conflicts, 복장 카테고리 확장
  - `authoring-characters/SPEECH_SYSTEM.md` — 레지스터 4-6개로 확장, Romantic/Flustered 레지스터 추가, 예시 대사 3-5개 권장, 무대 지시(parenthetical) 추가, Consistency Anchors → Character DNA 명칭 변경, 심리적 레지스터 명명 가이드
  - `authoring-characters/VALIDATION.md` — DNA Anchors/Psychological Depth/Hidden Depths/Layered Desires 체크 추가, Wikipedia Syndrome/Appearance Bloat 제거(토큰 제약 완화), Surface-Only/Register Without Examples 안티패턴 추가
  - `authoring-lorebook-bots/SKILL.md` — 토큰 예산 제약 완화, DNA 마커 가이드 추가, 유연한 디스크립션 길이 가이드
  - `authoring-lorebook-bots/LOREBOOK_ARCHITECTURE.md` — 엔트리 사이즈 제약 완화(100-300 → 유연), 멀티캐릭터 봇 대규모 엔트리 가이드 추가

## [0.9.2] - 2026-03-21

### 새 기능

- **자동 릴리즈 빌드** — `v*` 태그 push 시 GitHub Actions에서 자동으로 Windows 빌드(NSIS 설치 프로그램 + 포터블 exe) 후 릴리즈에 업로드
  - `.github/workflows/release.yml` 워크플로우 추가
  - 빌드 전 lint/typecheck/test 검증 포함

## [0.9.1] - 2026-03-21

### 수정

- **MCP 설정 자동 등록** — 앱 시작 시 `~/.mcp.json`만 생성하던 것을 4개 CLI 설정 파일 모두 자동 생성하도록 수정
  - `~/.mcp.json` (Claude Code)
  - `~/.copilot/mcp-config.json` (GitHub Copilot CLI)
  - `~/.codex/config.toml` (Codex)
  - `~/.gemini/settings.json` (Gemini CLI)
  - 앱 종료 시 정리 후 재시작해도 모든 CLI에서 MCP 사용 가능

## [0.9.0] - 2026-03-22

### 새 기능

- **MCP 공식 SDK 전환** — `@modelcontextprotocol/sdk` (v1.27.1) + `StdioServerTransport`로 프로토콜 처리 자동화
  - 수동 JSON-RPC 파싱/직렬화/에러 처리 → SDK 자동 처리
  - `McpServer` + `server.tool()` 패턴으로 도구 정의·검증·디스패치 1곳 통합
  - `server.prompt()` 기반 프롬프트 등록 (danbooru_tag_guide)
- **Zod 입력 검증** — 모든 MCP 도구의 파라미터를 Zod 스키마로 타입 검증
  - 잘못된 파라미터 타입 전달 시 SDK가 자동으로 명확한 에러 반환
  - `z.union()` 등으로 `write_field`의 복합 타입(string|array|boolean|number) 검증

### 변경

- **toki-mcp-server.ts 리팩터링** — 1512줄 → 1129줄 (25% 감소)
  - TOOLS 배열 (~600줄) + switch-case 디스패치 (~250줄) + handleMessage (~130줄) 삭제
  - `server.tool()` 콜백으로 통합 (정의·검증·디스패치 1곳)
- **tsconfig.node-libs.json** — `moduleResolution: "Node16"`으로 변경 (SDK exports 맵 지원)
- 기존 모든 도구 동작은 변경 없음 (stdio transport, Bearer token 인증, HTTP 프록시 유지)

### 기술 정보

- 새 의존성: `@modelcontextprotocol/sdk` ^1.27.1, `zod` ^4.3.6
- stdio transport 유지 — CLI 설정 파일(~/.mcp.json 등) 변경 불필요
- mcp-api-server.ts (HTTP 백엔드) 변경 없음

## [0.8.1] - 2026-03-21

### 새 기능

- **로어북 폴더 필터** — `list_lorebook(folder?)` 및 `list_reference_lorebook(folder?)` 에 폴더 UUID 필터 추가
  - 응답에 폴더 요약(`folders` 배열: UUID, name, entryCount) 포함
  - 각 항목에 `folder` 필드 포함하여 폴더 소속 확인 가능
  - 120+ 항목이 있는 대형 파일에서 폴더별 탐색으로 컨텍스트 절약

### 변경

- **list_regex** — `findSize`, `replaceSize` 필드 추가 (대형 HTML 치환 식별 용이)
- **list_triggers** — `conditionCount` 필드 추가 (트리거 복잡도 사전 파악)
- **list_lorebook** — 각 항목에 `folder` 필드 추가, 응답에 폴더 요약 포함

### 수정

- **list_fields 성능 개선** — `stringifyTriggerScripts()` 이중 호출 제거 (캐시 변수 사용)

---

## [0.8.0] - 2026-03-21

### 새 기능

- **인사말 세분화 MCP 도구 5종** — alternateGreetings/groupOnlyGreetings를 개별 인덱스로 접근
  - `list_greetings(type)`: 인사말 목록 (index, 크기, 미리보기 100자)
  - `read_greeting(type, index)`: 인사말 하나 읽기
  - `write_greeting(type, index, content)`: 인사말 수정
  - `add_greeting(type, content)`: 인사말 추가
  - `delete_greeting(type, index)`: 인사말 삭제
- **트리거 스크립트 세분화 MCP 도구 5종** — triggerScripts 배열을 개별 트리거로 접근
  - `list_triggers`: 트리거 목록 (index, comment, type, effect 수)
  - `read_trigger(index)`: 트리거 하나 읽기
  - `write_trigger(index, ...)`: 트리거 수정 (부분 수정 가능)
  - `add_trigger(...)`: 트리거 추가
  - `delete_trigger(index)`: 트리거 삭제

### 변경

- `read_field` 도구 설명에 alternateGreetings/groupOnlyGreetings/triggerScripts/lua/css 사용 시 세부 도구 안내 경고 추가
- assistant-prompt에 인사말/트리거/참고 자료 세부 도구 + 스킬 도구 전체 반영, 읽기 규칙 강화
- AGENTS.md에 인사말·트리거 도구 레퍼런스 및 읽기 규칙 업데이트

---

## [0.7.1] - 2026-03-21

### 새 기능

- **참고 자료 세부 읽기 MCP 도구 6종** — 참고 파일의 로어북/Lua/CSS를 개별 항목·섹션 단위로 읽기
  - `list_reference_lorebook(index, filter?)`: 참고 파일 로어북 목록 (compact, filter 지원)
  - `read_reference_lorebook(index, entryIndex)`: 참고 파일 로어북 항목 하나 읽기
  - `list_reference_lua(index)`: 참고 파일 Lua 섹션 목록
  - `read_reference_lua(index, sectionIndex)`: 참고 파일 Lua 섹션 하나 읽기
  - `list_reference_css(index)`: 참고 파일 CSS 섹션 목록
  - `read_reference_css(index, sectionIndex)`: 참고 파일 CSS 섹션 하나 읽기

### 변경

- `read_reference_field` 도구 설명에 lorebook/lua/css 사용 시 세부 도구 안내 경고 추가
- `list_lorebook` 도구 설명에 filter 파라미터 사용 권장 안내 추가
- AGENTS.md에 참고 자료 읽기 규칙 및 로어북 비교 워크플로우 추가

---

## [0.7.0] - 2026-03-20

### 새 기능

- **Danbooru 태그 검증 MCP 도구** — 캐릭터 이미지 프롬프트 작성 시 유효한 Danbooru 태그 검증·검색·참조
  - `validate_danbooru_tags`: 태그 유효성 검증 + Levenshtein 기반 유사 태그 추천
  - `search_danbooru_tags`: 키워드/와일드카드 태그 검색 (인기순 정렬)
  - `get_popular_danbooru_tags`: 인기 태그 조회 (의미별 그룹: hair, eyes, clothing, pose 등)
  - `danbooru_tag_guide` 프롬프트 템플릿: 태그 규칙 + 카테고리별 인기 태그 예시 자동 제공
  - 로컬 태그 DB (6,549개) 우선 + Danbooru REST API 온라인 폴백
  - MCP 프롬프트 기능 추가 (`prompts/list`, `prompts/get`)

---

## [0.6.1] - 2026-03-20

### 새 기능

- **봇 이름 변경** — 사이드바 상단 `🏷 이름: ...` 항목 클릭으로 봇 이름 변경
  - 프롬프트 대화상자에서 이름 입력 → 즉시 반영 (타이틀바 + 사이드바)
  - 우클릭 시 MCP 경로 복사 메뉴

---

## [0.6.0] - 2026-03-20

### 새 기능

- **추가 첫 메시지 / 그룹 첫 메시지 개별 편집** — 기존 읽기 전용 JSON 배열 표시에서 사이드바 폴더 + 개별 탭 편집으로 전환
  - 각 인사말을 독립된 Monaco 탭(HTML/CBS 지원)으로 열어 편집
  - 사이드바 폴더 우클릭으로 새 인사말 추가, 항목 우클릭으로 삭제
  - 드래그 앤 드롭으로 인사말 순서 변경
  - 인덱스 탭 자동 시프트 (삭제 시 열린 탭 번호 자동 조정)
  - `sidebar-dnd.test.ts` — 인사말 CRUD 단위 테스트 4건 추가 (총 218 테스트)

---

## [0.5.0] - 2026-03-20

### 새 기능

- **사이드바 드래그 앤 드롭 재정렬** — SortableJS 기반으로 사이드바 항목 순서를 마우스 드래그로 자유롭게 변경
  - **로어북**: 같은 폴더 내 재정렬 + 폴더 간 이동 (루트↔폴더) 지원
  - **정규식**: 플랫 리스트 재정렬
  - **Lua/CSS 섹션**: 섹션 순서 변경 → 소스 코드 자동 재조합
  - **에셋**: 같은 그룹 내 재정렬
  - 드래그 시각 피드백 (고스트/선택/드래그 상태 CSS)
  - `sidebar-dnd.test.ts` — 재정렬 로직 단위 테스트 7건 추가

---

## [0.4.1] - 2026-03-20

### 버그 수정

- **참고자료 사이드바 항목 중복 버그 수정** — `buildRefsSidebar()`가 async 함수인데 fire-and-forget으로 호출되어, 빠르게 연속 호출 시 비동기 빌드가 인터리빙되면서 가이드/참고 파일이 여러 번 렌더링되던 문제 해결
  - 빌드 버전 카운터 도입: 새 빌드가 시작되면 이전 비동기 빌드는 자동 취소
  - `sidebar-refs.test.ts`에 동시 빌드 경합 조건 테스트 3건 추가

---

## [0.4.0] - 2026-03-20

### 새 기능

- **Gemini CLI 연동** — 터미널 메뉴에서 "Gemini 시작"으로 Gemini CLI + MCP 연동
  - `~/.gemini/settings.json`에 MCP 설정 자동 생성/정리
  - `AGENTS.md` 자동 생성으로 시스템 프롬프트 전달
  - 기존 MCP 도구(필드/로어북/정규식/Lua/CSS 섹션) 그대로 사용 가능

### 변경

- **README.md 개선** — 프로젝트 소개, 배지, 주요 기능 테이블 추가
- **CHANGELOG.md 형식 변경** — Keep a Changelog + 시멘틱 버저닝 형식 적용
- **AGENTS.md 문서 규칙 추가** — 매 작업마다 자동 문서/버전 관리 규칙 명시

---

## [0.3.0] - 2026-03-18

### 새 기능

- **Skills MCP 도구** — `list_skills` / `read_skill` MCP 도구 추가로 CBS, Lua, 로어북, 정규식 등 상세 가이드를 on-demand 로딩
- **스킬 문서 패키징** — `skills/` 폴더를 extraResources로 포함하여 빌드 배포판에서도 스킬 접근 가능

### 변경

- **AGENTS.md 경량화** — 인라인 CBS/Lua 섹션을 skills 참조로 대체하여 토큰 절감
- **CLAUDE.md 중복 제거** — AGENTS.md로 리다이렉트하여 시스템 프롬프트 토큰 2배 낭비 해소

---

## [0.2.2] - 2026-02-28

### 새 기능

- **OpenAI Codex CLI 연동** — 터미널 메뉴에서 "Codex 시작"으로 Codex CLI + MCP 연동
  - `~/.codex/config.toml`에 MCP 설정 자동 생성/정리
  - `AGENTS.md` 자동 생성으로 시스템 프롬프트 전달
  - 기존 MCP 도구(필드/로어북/정규식/Lua/CSS 섹션) 그대로 사용 가능
- **참고 파일 다중 선택** — 참고 파일 추가 시 여러 파일 한번에 선택 가능
- **가이드 세션 전용 불러오기** — 불러온 가이드는 세션 동안만 유지, 앱 종료 시 자동 제거 (내장 가이드 오염 방지)
- **가이드 삭제** — 가이드 항목 우클릭 메뉴에 삭제/제거 추가
- **로어북 폴더 관리** — 폴더 우클릭 메뉴 추가 (이름 변경, 항목 추가, 내용 일괄 삭제, 폴더 삭제, 폴더+내용 전체 삭제)
- **일괄 삭제** — 로어북/정규식 폴더 헤더 우클릭에 전체 삭제 옵션 추가

### 변경

- **MCP 설정 경로 변경** — `.mcp.json`을 `~/.mcp.json`(홈 디렉토리)에 기록하여 프로젝트 루트 없이도 Claude Code MCP 연결 가능
- **시스템 프롬프트 강화** — 섹션 단위 읽기 규칙 명시 (read_field 대신 read_lua/read_css 사용 유도)

### 수정

- 터미널 Ctrl+V 두 번 붙여넣기 버그 수정
- 터미널 재시작 시 입력 안 되는 버그 수정

---

## [0.2.0-beta] - 2026-02-26

### 새 기능

- **참고자료 팝아웃** — 참고자료 패널을 별도 외부 창으로 분리 (`↗` 버튼)
- **프리뷰 엔진** — CBS/Lua 렌더링, 채팅 시뮬레이션 (F5)
- **CSS 섹션 MCP API** — `list_css`, `read_css`, `write_css`, `replace_in_css`, `insert_in_css`
- **슬롯 기반 레이아웃** — 패널 드래그 앤 드롭으로 좌/우/상/하/좌끝/우끝 자유 배치
- **MCP 경로 복사** — 사이드바 모든 항목 우클릭 시 MCP 경로 복사 메뉴

### 변경

- 버튼 아이콘 구분: `↗` = 외부 창 팝아웃, `⧉` = 슬롯 분리
- 설정에서 RisuAI 동기화 UI 제거

### 수정

- 아바타 GIF 표시 오류 수정
- 페르소나 프롬프트 전달 수정
- 저장 시 데이터 누락 버그 수정

---

## [0.1.0-beta] - 2026-02-24

### 초기 릴리즈

- .charx 파일 열기/편집/저장
- Monaco 에디터 (구문 강조, 자동완성)
- TokiTalk 내장 터미널 (node-pty + xterm.js)
- Claude Code 연동 (MCP 자동 설정)
- MCP 도구: 필드/로어북/정규식/Lua 섹션/참고자료 읽기·쓰기
- 로어북/정규식 전용 폼 에디터
- Lua 섹션 시스템 (`-- ===== 섹션명 =====` 구분자)
- 사이드바 항목 트리 + 참고자료 탭
- 토키/아리스 GIF 아바타
- RP 모드 (토키/아리스/커스텀 페르소나)
- 자동저장, 백업 시스템
- 다크 모드 (토키 ↔ 아리스)
- BGM 재생
- 모모톡 스타일 확인 팝업
- MomoTalk 테마 NSIS 인스톨러
- 드래그 앤 드롭 (charx/json/이미지)
