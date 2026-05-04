---
name: using-mcp-tools
description: 'Workflow guide for choosing RisuToki MCP tools safely. Use when deciding which read or write surface fits a task, especially for session state, large fields, lorebooks, regex, references, or batch edits.'
tags: ['workflow', 'mcp', 'editing']
related_tools:
  [
    'inspect_document',
    'list_tool_profiles',
    'read_content',
    'search_document',
    'preview_edit',
    'apply_edit',
    'read_skill',
  ]
---

# Using MCP Tools Safely

## Agent Operating Contract

- **Use when:** deciding which RisuToki MCP reader/writer/search/batch/surface tool should touch an active document, reference, or unopened file.
- **Do not use when:** the task is pure creative drafting with no artifact read/write route.
- **Read first:** this `SKILL.md`; it is the detailed MCP tool-choice source of truth.
- **Load deeper only if:** the complete catalog is needed (`TOOL_REFERENCE.md`) or exact JSON/file shapes are needed (`FILE_STRUCTURES.md` / `file-structure-reference`).
- **Output/validation contract:** route inspect/read/search/preview/apply workflows through facade tools first when covered, document any granular fallback reason, carry stale-index guards, use preview/dry-run support for risky edits, and avoid generic field dumps for structured surfaces.

This skill is about **tool choice**, not syntax. Read it before making broad edits.

## Quick Read Rules

- Facade v1 is the default for covered workflows: use `inspect_document`, `read_content`, `search_document`, and `preview_edit` → `apply_edit` before legacy/granular inspect/read/search/write routes.
- Use granular tools only as advanced/legacy fallbacks for unsupported facade selectors/operations, exact structured editors, direct external mutations, batch/deletes/imports/exports/assets, or compatibility/debugging.
- Do **not** use `read_field("lua")`; use `list_lua` → `read_lua(index)`.
- Do **not** use `read_field("css")`; use `list_css` → `read_css(index)`.
- Do **not** dump `alternateGreetings`; use `list_greetings("alternate")`.
- Do **not** dump `triggerScripts`; use `list_triggers` → `read_trigger(index)`.
- If you need several regex/greeting/trigger items, switch to `read_regex_batch`, `read_greeting_batch`, or `read_trigger_batch` instead of looping single reads.
- Do **not** use `write_field` for `lua` / `css` / greetings / triggers when dedicated write tools already exist.
- For risup prompt editing, prefer `list_risup_prompt_items`, `search_in_risup_prompt_items`, `read_risup_prompt_item_batch`, `export_risup_prompt_to_text`, `copy_risup_prompt_items_as_text`, `diff_risup_prompt`, and `read_risup_formating_order`. For reuse across sessions, switch to `list_risup_prompt_snippets`, `read_risup_prompt_snippet`, `save_risup_prompt_snippet`, and `insert_risup_prompt_snippet`.
- For unopened files, start with facade `inspect_document` / `read_content` when covered; use `inspect_external_file` + the relevant `probe_*` reader for probe-specific summaries, then use `external_search_in_field` / `external_read_field_range` / `external_write_field*` only when you need granular result shapes or direct external mutations.
- When facade selectors and specialized tools cannot reach the required content, use the surface fallback: `list_surfaces` → `read_surface` → `patch_surface` or `replace_in_surface`. Prefer `dry_run` and carry the document-level `expected_hash` for risky edits.
- For unopened files with unsupported shapes, use `external_read_surface` / `external_patch_surface`; these still reject the active UI document.
- Before risky edits or after interruptions, call `inspect_document` for facade-covered session/active preflight; use `session_status` when you need exact dirty/autosave/recovery metadata, snapshot totals, or compact structured-surface counts.
- Prefer response `next_actions` over guessing; high-traffic tools may return narrower follow-up suggestions than the family default.
- Call `list_tool_profiles` when you need a compact profile catalog: default `facade-first`, `authoring`, `readonly`, or `advanced-full` (aliases `advanced` / `full`) for the complete granular escape hatch. `tools/list` stays unfiltered for MCP compatibility, so legacy fallback tools remain accessible.
- Check tool `_meta` from `tools/list` when choosing a route or when the catalog facade is unavailable: `risutoki/profiles` and `risutoki/defaultProfile=facade-first` define the profile contract, `risutoki/surfaceKind=facade` plus `risutoki/recommendation=preferred` is the default for new covered workflows, `recommendation=advanced` marks granular escape hatches, `family` identifies the workflow family, `staleGuards` keeps the legacy flat guard-name list, `staleGuardDetails` gives guard `payloadPath`, list/read source operations, retry guidance, and batch alignment hints, `requiresConfirmation` means an approval gate is expected, and `supportsDryRun` means a preview-first flow exists.
- Facade v1 is additive and preferred where implemented: use `inspect_document`, `list_tool_profiles`, `read_content`, `search_document`, `preview_edit`, `apply_edit`, `validate_content`, and `load_guidance` for bounded facade/catalog workflows; keep granular tools as advanced/legacy routes for precision or unsupported cases. `validate_content` is currently focused on active lorebook key validation, `load_guidance` covers skill catalog/document reads, and item/asset/file management remain future facade work. Facade mutating flows are preview-token-first (`preview_edit` before `apply_edit`) and must propagate stale guards from granular `risutoki/staleGuardDetails`.
- After using `import_risup_prompt_from_text`, call `validate_risup_prompt_import` with the same source text to verify all items were imported correctly. This catches silent mismatches from ID renormalization and content truncation.
- For deleting multiple risup prompt items at once, prefer `batch_delete_risup_prompt_items` over repeated `delete_risup_prompt_item` calls.
- When adding risup prompt items at a specific position (not at the end), use the `insertAt` parameter on `add_risup_prompt_item` or `add_risup_prompt_item_batch` instead of add + reorder.

## Facade-First Migration Guide

Implemented facade tools replace common legacy/granular workflows where they have explicit parity:

| Legacy/granular workflow                                                                                 | Prefer facade                    | Keep granular when                                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session/external/reference preflight via `session_status`, `inspect_external_file`, or `list_references` | `inspect_document`               | Exact legacy response fields, recovery/debug detail, or full reference inventory are required.                                                                       |
| Active/external field and surface reads via `read_field*`, `read_surface`, probes, or external readers   | `read_content`                   | You need structured item editors, stats/export, raw hashes, unsupported JSON Pointer shapes, or exact batch compatibility.                                           |
| Reference field reads via `read_reference_field*`                                                        | `read_content`                   | You need dedicated reference lorebook/regex/Lua/CSS/greeting/trigger/risup item structure.                                                                           |
| Active/external/reference text search via `search_*` field tools                                         | `search_document`                | A specialized family search or legacy result shape is required.                                                                                                      |
| Active/external field write/replace or active surface patch                                              | `preview_edit` then `apply_edit` | You need inserts, block replacements, batch writes, deletes, snapshots, external surface patches, asset operations, item management, or unsupported patch semantics. |

Use granular tools as advanced/legacy routes only when at least one criterion applies: an escape hatch for unsupported facade selectors/operations, an exact structured editor is required, the operation is outside first-wave facade scope, or you are debugging/maintaining legacy client compatibility.

Deprecation is staged and non-breaking today: current facade tools advertise `risutoki/surfaceKind=facade` and `risutoki/recommendation=preferred`; granular tools remain `surfaceKind=granular` with `recommendation=advanced` unless a future parity review marks a covered route `legacy`. Do not assume removal until a later warning window documents deprecation hints, first-party docs/evals no longer depend on the granular route, and release notes announce the change. Known gaps still requiring granular tools include validators outside active lorebook keys, item/asset/file management, structured item editors, deletes, imports/exports, external surface patches, and broad batch operations. Track parity with `src/lib/mcp-request-schemas.test.ts`, `src/lib/mcp-tool-taxonomy.test.ts`, `src/lib/doc-drift.test.ts`, `test/test-mcp-search-all.ts`, and the matrix in `docs/MCP_TOOL_SURFACE.md`.

## Task-Intent Playbooks

Default sequence for every edit intent: readonly analysis → preview or dry-run → apply → validation. Start facade-first, then record why any granular fallback is needed.

- **Lorebook cleanup:** `inspect_document` → `search_document` / bounded `read_content`; use `list_lorebook` → `read_lorebook_batch` for entry metadata or stale-index guards. Preview with `replace_in_lorebook_batch(dry_run=true)` or `preview_edit`, apply with batch lorebook tools carrying `expected_comment`, then run `validate_lorebook_keys` and targeted re-reads. If comments changed, check Lua `getLoreBooks()` searches.
- **Regex / greeting edits:** inspect first, then `list_regex` / `read_regex_batch` or `list_greetings` / `read_greeting_batch`; avoid raw array dumps. Apply through indexed regex/greeting tools or batch tools with `expected_comment` / `expected_preview`, then re-read changed indices and preview affected output when relevant.
- **`.risup` prompt edits:** use `list_risup_prompt_items`, `search_in_risup_prompt_items`, `read_risup_prompt_item_batch`, `read_risup_formating_order`, and `diff_risup_prompt` before edits. Prefer serializer/snippet dry-runs for large changes, apply with risup batch/import/snippet tools carrying `expected_type` / `expected_preview`, then run `validate_risup_prompt_import` after imports and targeted prompt/order re-reads.
- **CBS / Danbooru validation:** load the matching syntax skill first, locate text with facade search/read, and validate before changing it with `validate_cbs`, `simulate_cbs`, `diff_cbs`, `validate_danbooru_tags`, or `search_danbooru_tags`. Re-run the same validators and preview/render if visible output can change.
- **Reference sync / diff:** use `inspect_document` for loaded reference state, facade reference read/search for covered text, and `diff_lorebook` / `diff_risup_prompt` for purpose-built comparisons. References are read-only: preview/dry-run and apply changes only to the active or explicit external target, then re-run the diff or focused reference comparison.

## Validation Rules

- Validate with the same lens that found the issue: facade follow-up read/search, family-specific re-read, diff, validator, or preview.
- For import/diff workflows, preserve the source text or reference identity until validation completes so mismatches can be reproduced.
- Treat stale-index `409` as a successful safety catch, not a failure: re-list, refresh guards, preview/dry-run again if the target shifted, then retry.

## Session-Awareness Workflow

1. Call `inspect_document` first for covered session/active/reference/external preflight. Use `session_status` when you need exact dirty/autosave/recovery fields, full reference inventory, or legacy runtime diagnostics.
2. If no active document is loaded, use facade external/reference targets when covered; switch to `inspect_external_file` / `probe_*` / `external_*` for probe-specific summaries or direct absolute-path edits, or `open_file` before using edit routes that require an active document.
3. If `pendingRecovery`, `dirtyFields`, autosave settings, or `surfaceSummary` look unexpected, stabilize the session first instead of guessing from partial field reads.

## Large-Field Workflow

1. Use `search_document` or bounded `read_content` first when the facade can express the target and bounds.
2. Use granular `search_in_field` / `read_field_range` only for unsupported selectors or exact legacy range/search payloads.
3. For covered active field write/replace operations, use `preview_edit` → `apply_edit`; use `replace_in_field`, `replace_in_field_batch`, `insert_in_field`, or `replace_block_in_field` for unsupported insert/batch/block semantics.
4. Use `snapshot_field` before risky granular field edits.

## Lorebook Workflow

1. Start with `list_lorebook(folder?)`.
2. Use `read_lorebook(index)` or `read_lorebook_batch(indices)`.
3. Prefer batch tools for multi-entry updates:
   - `write_lorebook_batch`
   - `replace_in_lorebook_batch`
   - `insert_in_lorebook_batch`
   - `batch_delete_lorebook`
4. When mutating lorebook entries by index, carry the current `comment` into `expected_comment` (or `expected_comments` for `batch_delete_lorebook`) so stale indices fail with `409` instead of touching the wrong entry.
5. For large multi-entry replacements, start with `replace_in_lorebook_batch(dry_run=true)` before the confirmed apply.

## Indexed Write Guard Workflow

- Lorebook / regex / trigger writes: carry the latest list/read `comment` into `expected_comment`.
- Greeting writes/deletes: carry the latest `list_greetings` preview into `expected_preview` (or `expected_previews` for `batch_delete_greeting`).
- Risup prompt-item writes/deletes: carry the latest `list_risup_prompt_items` `type` and, when available, `preview` into `expected_type` / `expected_preview`.
- For batch tools, prefer `risutoki/staleGuardDetails` from `tools/list` to find nested paths such as `/entries/*/expected_comment` or aligned arrays such as `/expected_types/*` with `/indices/*`.
- Treat `409` stale-index responses as a refresh signal: re-list the family, then retry with fresh identity values.
- Batch delete of risup prompt items: carry `list_risup_prompt_items` types into `expected_types` and previews into `expected_previews`, aligned with the `indices` array order.

## Regex / Reference Workflow

- Regex: `list_regex` → `read_regex(index)` / `read_regex_batch(indices)` → targeted writes.
- Reference lorebooks/Lua/CSS/regex: use the dedicated `list_reference_*`, `read_reference_*`, and `read_reference_*_batch` routes instead of `read_reference_field`.
- Reference greetings/triggers: use `list_reference_greetings` / `read_reference_greeting` / `read_reference_greeting_batch` and `list_reference_triggers` / `read_reference_trigger` / `read_reference_trigger_batch` instead of dumping `alternateGreetings`, `groupOnlyGreetings`, or `triggerScripts`.
- Large reference fields: use `search_in_reference_field` to locate text, `read_reference_field_range` to read a specific span.
- **No main file required**: `list_references`, `session_status`, and all `*_reference_*` tools work even when no main document is open. Start with `session_status` or `list_references` to discover loaded references.

## Batch-First Rule

If the task touches multiple sibling items, prefer:

- `read_regex_batch`
- `read_greeting_batch`
- `read_trigger_batch`
- `write_field_batch`
- `replace_in_field_batch`
- `write_lorebook_batch`
- `batch_write_greeting`
- `read_reference_greeting_batch`
- `read_reference_trigger_batch`
- `read_reference_regex_batch`
- `read_reference_risup_prompt_item_batch`
- `write_risup_prompt_item_batch`
- `batch_delete_risup_prompt_items`
- `add_risup_prompt_item_batch` (with `insertAt`)

This reduces repeated confirmation prompts and keeps edits coherent.

## Surface Fallback Workflow

1. Prefer dedicated families first: lorebook, regex, greetings, triggers, Lua/CSS, assets, and risup prompt tools.
2. If the content is not reachable through those families, call `list_surfaces` and inspect only the needed JSON Pointer path with `read_surface`.
3. Use `patch_surface` for structural `add` / `replace` / `remove`, or `replace_in_surface` for recursive string replacement under a path.
4. Use `dry_run: true` before broad edits and pass `expected_hash` from `list_surfaces` or a root `read_surface` response when retry safety matters.
5. After active-document surface edits that must persist immediately, call `save_current_file`.

## Import Verification Workflow

After using `import_risup_prompt_from_text`, always verify the result:

1. `validate_risup_prompt_import` with the same source text — confirms each item matches by content (IDs are normalized before comparison).
2. If mismatches are found, inspect the reported indices with `read_risup_prompt_item_batch`.
3. Use `export_risup_prompt_to_text` to get a clean export for manual comparison.

This catches silent failures like:

- Content truncation during parsing
- Unsupported item types that get stored as raw JSON
- Item ordering changes from parse/serialize round-trips

## Context Budget Cues

- Check `artifacts.byte_size` on successful MCP responses before asking for more content.
- If the response is already large, narrow the next read with `search_in_field`, `read_field_range`, per-item reads, or `probe_*` instead of broad dumps.
- Prefer progressive disclosure: list/search first, then read the smallest section or item that can answer the question.

## Full Reference Files

- `read_skill("using-mcp-tools", "TOOL_REFERENCE.md")` — complete MCP tool catalog
- `read_skill("using-mcp-tools", "FILE_STRUCTURES.md")` — exact schemas and shapes
- `docs/MCP_TOOL_SURFACE.md` — canonical MCP family map, tool boundaries, and deterministic follow-up actions
- `docs/MCP_ERROR_CONTRACT.md` — repo-wide success / error / no-op response contract

## Smoke Tests

| Prompt                                                                                     | Expected routing                                                                        | Expected output                                                                                                        | Forbidden behavior                                           |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| "I need to edit a 3000-character lorebook content field; which MCP tool should I use?"     | Primary: `using-mcp-tools`; pair with `writing-lorebooks` only for entry content rules. | Prefer facade `read_content` / `preview_edit` when covered; otherwise batch lorebook workflow with stale-index guards. | Using broad `read_field`/`write_field` for lorebook entries. |
| "List the correct tool sequence for reading an external `.charx` file's lorebook entries." | Primary: `using-mcp-tools`.                                                             | `inspect_document` / `read_content` if covered; otherwise `inspect_external_file` then relevant `probe_*` route.       | Opening or mutating the active UI document unnecessarily.    |
