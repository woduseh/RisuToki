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
    'analyze_content',
    'preview_edit',
    'apply_edit',
    'validate_content',
    'manage_items',
    'manage_assets',
    'manage_file',
    'read_skill',
  ]
---

# Using MCP Tools Safely

## Agent Operating Contract

- **Use when:** deciding which RisuToki MCP reader/writer/search/batch/surface tool should touch an active document, reference, or unopened file.
- **Do not use when:** the task is pure creative drafting with no artifact read/write route.
- **Read first:** this `SKILL.md`; it is the tool-choice and task-intent playbook source of truth.
- **Load deeper only if:** the complete catalog is needed (`TOOL_REFERENCE.md`) or exact JSON/file shapes are needed (`FILE_STRUCTURES.md` / `file-structure-reference`).
- **Output/validation contract:** route inspect/read/search/preview/apply workflows through facade tools first when covered, state any granular fallback reason in one line of the final task summary, carry stale-index guards, use preview/dry-run support for risky edits, and avoid generic field dumps for structured surfaces.

This skill is about **tool choice**, not syntax. Read it before making broad edits.
Workflow declarations are guarded by `src/lib/mcp-agent-workflow-eval.test.ts`, while `npm run test:evals:replay` measures canonical routes through MCP stdio. Keep this guide synchronized with both when tool-choice rules change.

## Quick Read Rules

- Facade v1 is the default for covered workflows: use `inspect_document`, `read_content`, `search_document`, `preview_edit` → `apply_edit`, `manage_items`, `manage_assets`, and `manage_file` before legacy/granular inspect/read/search/write routes.
- Use granular tools only as advanced/legacy fallbacks for unsupported facade selectors/operations, exact structured editors, direct external mutations not covered by facade, large exact exports, unsupported batch workflows, or compatibility/debugging.
- RisuToki-protected `.charx` fields `personality`, `scenario`, `systemPrompt`, `nickname`, `source`, `groupOnlyGreetings`, `extensions.risuai.additionalText`, `extensions.risuai.license`, and unsafe `extensions.risuai.virtualscript` are hidden from normal MCP reads/searches/probes/surface reads and removed on save. This is stricter than RisuAI's official compatibility boundary because these fields are treated as practical deprecated/security-sensitive data in RisuToki. Use `hiddenFieldWarnings` in inspect/list/status responses only as a value-safe existence summary; do not try to recover the hidden content through granular routes. `.risup` legacy prompt fields and reserved `.risum` `cjs` follow the same hidden + save-stripped policy. `.risum` `mcpUrl` is preserved but read-only in normal mutation/string-edit routes. `.risum` `lowLevelAccess` remains visible/editable.
- For `.charx` files headed to RisuAI upload, run export compatibility validation with facade `validate_content` using an active or external `.charx` target and a selector such as `family: "asset"` or `field: "exportCompatibility"`. It verifies card/module lorebook and regex mirrors, canonical regex `in` / `out`, protected deprecated fields, unsafe `virtualscript`, card asset references, and 0-byte ZIP assets.
- Do **not** use `read_field("lua")`; use facade `read_content` with `family: "lua"` first, then `list_lua` → `read_lua(index)` when you need exact legacy payloads.
- Do **not** use `read_field("css")`; use facade `read_content` with `family: "css"` first, then `list_css` → `read_css(index)` when you need exact legacy payloads.
- Do **not** dump `alternateGreetings`; use `list_greetings("alternate")`.
- Do **not** dump `triggerScripts`; use facade `read_content` with `family: "trigger"` first, then `list_triggers` → `read_trigger(index)` when you need exact legacy payloads.
- If you need several regex/greeting/trigger items, switch to `read_regex_batch`, `read_greeting_batch`, or `read_trigger_batch` instead of looping single reads.
- Do **not** use `write_field` for `lua` / `css` / greetings / triggers when facade `preview_edit` / `apply_edit` or dedicated write tools already cover the operation.
- For risup prompt editing, prefer facade `read_content` / `search_document` for covered reads, `analyze_content` for prompt comparison/import verification, and `preview_edit` → `apply_edit` for covered writes/deletes. Use `manage_items` for active/external prompt add, reorder, copy-as-text, text import append/replace, and snippet workflows. Use granular prompt tools only for exact legacy shapes, full serializer output, or unsupported prompt-specific operations.
- For active/external `.charx` or `.risum` assets, use `manage_assets` for covered list/read/add/delete/rename/compression workflows. Successful `.risum` conversion updates bytes and extension metadata together; failed or larger conversions preserve the original.
- For unopened files, start with facade `inspect_document` / `read_content` when covered; use `preview_edit` → `apply_edit` for covered external field write/replace/insert, surface patch/replace, lorebook, regex, alternate greeting, trigger, Lua/CSS section, and `.risup` prompt item mutations; use `manage_assets` for covered external asset management and `manage_file` for guarded open/extract/reassemble workflows. Use `inspect_external_file` + the relevant `probe_*` reader for probe-specific summaries, then use `external_search_in_field` / `external_read_field_range` / `external_write_field*` only when you need granular result shapes or direct external mutations.
- When facade selectors and specialized tools cannot reach the required content, use the surface fallback: `list_surfaces` → `read_surface` → `patch_surface` or `replace_in_surface`. Prefer facade `preview_edit` → `apply_edit` for covered patch/replace workflows; otherwise use `dry_run` and carry the document-level `expected_hash` for risky edits. Array `add` inserts at `0..length`, `-` appends, and `replace` / `remove` require an existing index.
- For unopened files with unsupported shapes, use `external_read_surface` / `external_patch_surface`; these still reject the active UI document. For covered JSON Patch operations, prefer facade `preview_edit` → `apply_edit` with a surface selector so the `expected_hash` guard is part of the preview.
- Before risky edits or after interruptions, call `inspect_document` for bounded session/active preflight; its session result contains the full status payload. Use `session_status` only when exact legacy top-level shape compatibility is required.
- Prefer response `next_actions` over guessing; high-traffic tools may return narrower follow-up suggestions than the family default.
- Call `list_tool_profiles` when you need the active profile contract or another profile's catalog. `tools/list` returns 13 tools by default: 11 preferred facades plus `list_skills` and `read_skill`.
- Before a document is open, use `list_skills`, `read_skill`, or `inspect_document` with a guidance target. `load_guidance` remains a legacy compatibility facade in non-default profiles.
- Check tool `_meta` from `tools/list` when choosing a route or when the catalog facade is unavailable: `risutoki/profiles` and `risutoki/defaultProfile=facade-first` define the profile contract, `risutoki/surfaceKind=facade` plus `risutoki/recommendation=preferred` is the default for new covered workflows, `recommendation=advanced` marks granular escape hatches, `risutoki/batchAlternative` points from single-item tools to sibling batch tools, `family` identifies the workflow family, `staleGuards` keeps the legacy flat guard-name list, `staleGuardDetails` gives guard `payloadPath`, list/read source operations, retry guidance, and batch alignment hints, `requiresConfirmation` means an approval gate is expected, and `supportsDryRun` means a preview-first flow exists.
- Use additive `risutoki/workflowStages` metadata for planning order: `discover` means routing/catalog/list/session preflight, `read` bounded content retrieval, `search` query-based retrieval, `validate` validators/diffs/simulators, `preview` dry-run or preview-token generation, and `apply` state-changing mutation. The safe edit order is **discover -> read/search -> validate/preview -> apply -> validate**; after applying, repeat focused reads or validators for final verification.
- Facade v1 is additive and preferred where implemented. **Boundary rule:** pass/fail diagnostics belong to `validate_content`; transformation, statistics, comparison, and simulation belong to `analyze_content`. This includes `field_stats`, explicit-encoding `token_count`, `simulate_lorebook`, `test_regex`, CBS/Danbooru analysis, diffs, and import verification.
- `apply_edit` tokens are one-shot and consumed before mutation starts. A partial batch failure reports applied/failed/remaining operations; inspect the changed state and run a new preview instead of reusing the token.
- After using `manage_items` or granular prompt-text import, call `analyze_content` with `operation.action="verify_risup_prompt_import"` and the same source text. The old `validate_risup_prompt_import` action remains an alias.
- For deleting multiple risup prompt items at once, prefer `batch_delete_risup_prompt_items` over repeated `delete_risup_prompt_item` calls.
- When adding risup prompt items at a specific position, use `manage_items` with `insertAt`; use the granular `insertAt` parameter only when `manage_items` cannot provide the exact legacy path you need.

## Facade-First Migration Guide

Implemented facade tools replace common legacy/granular workflows where they have explicit parity:

| Legacy/granular workflow                                                                                                                                                                                                            | Prefer facade                    | Keep granular when                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Session/external/reference preflight via `session_status`, `inspect_external_file`, or `list_references`                                                                                                                            | `inspect_document`               | Exact legacy top-level response shape or compatibility diagnostics are required. Omit a reference identifier for bounded inventory; provide one for a selected reference.                                          |
| Active/external field and surface reads via `read_field*`, `read_surface`, probes, or external readers                                                                                                                              | `read_content`                   | You need structured item editors, stats/export, raw hashes, unsupported JSON Pointer shapes, or exact batch compatibility.                                                                                         |
| Reference field reads and covered reference lorebook/regex/greeting/trigger/Lua/CSS/risup prompt selectors                                                                                                                          | `read_content`                   | You need precision structured workflows, exact legacy payloads, batch item reads, delete/import/export workflows, or unsupported mutation workflows.                                                               |
| Active/external/reference text search via `search_*` field tools                                                                                                                                                                    | `search_document`                | A specialized family search or legacy result shape is required.                                                                                                                                                    |
| Field/token statistics, lorebook/regex/CBS simulation, Danbooru discovery, lorebook/risup comparison, and risup import verification                                                                                                 | `analyze_content`                | You need exact legacy payloads or unsupported analysis source shapes.                                                                                                                                              |
| Active/external field write/replace/insert, active field block replacement, active/external surface patch/replace, active lorebook block/whole-collection replacement, structured item edits, and covered prompt/script batch edits | `preview_edit` then `apply_edit` | You need external block replacement, unsupported batch semantics, add/reorder, snapshots, cross-surface workflows, or unsupported patch semantics.                                                                 |
| `.risup` prompt add/reorder/import/copy/snippet granular tools, plus lorebook/regex/alternate greeting/trigger/Lua/CSS add/reorder on active or unopened external files                                                             | `manage_items`                   | You need exact legacy response shapes, serializer output beyond facade bounds, unsupported raw prompt debugging, formatting-order-only edits, unsupported structured families, or direct JSON Pointer diagnostics. |
| `.charx` / `.risum` asset list/read/add/delete/rename/compression on active or unopened external files                                                                                                                              | `manage_assets`                  | You need exact legacy response shapes or raw asset/surface diagnostics.                                                                                                                                            |
| File/session/project-folder workflows plus active lorebook import/export                                                                                                                                                            | `manage_file`                    | You need exact legacy file/session payloads, non-artifact filesystem work, or precision file/debug operations.                                                                                                     |

Use granular tools as advanced/legacy routes only when at least one criterion applies: an escape hatch for unsupported facade selectors/operations, an exact structured editor is required, the operation is outside first-wave facade scope, or you are debugging/maintaining legacy client compatibility.

Deprecation is staged and non-breaking today. Known gaps still requiring granular tools include exact legacy/debug payloads, unsupported batch structured item editors, unsupported trigger/Lua/CSS batch mutations, external block replacement, cross-surface replacement, non-artifact filesystem work, and broad validators without enough selector context.

## Task-Intent Playbooks

This is the canonical task-intent playbook set; `project-workflow`'s `MCP_WORKFLOW.md` points here instead of keeping its own copy. Default sequence for every edit intent: discover -> read/search -> validate/preview -> apply -> validate. Start facade-first; when a granular fallback is required, state the reason in one line of the final task summary.

- **Lorebook cleanup:** `inspect_document` → `search_document` / bounded `read_content`; use `list_lorebook` or external `read_content` lorebook lists to collect stable `id` values plus folder metadata. Prefer facade `preview_edit` → `apply_edit` with `{ family: "lorebook", id }`; if ids collide or the operation is unsupported, use by-id granular tools or index tools carrying `expected_comment`. Then run `validate_lorebook_keys` and targeted by-id re-reads. If comments changed, check Lua `getLoreBooks()` searches.
- **Regex / greeting edits:** inspect first, then facade `read_content`, `list_regex`, or `list_greetings`; avoid raw array dumps. Prefer facade `preview_edit` → `apply_edit` with regex/greeting `identity` selectors for active or external targets. Use `manage_items` for covered regex and alternate greeting add/reorder. If identity is ambiguous or the shape is unsupported, fall back to index tools carrying `expected_comment` / `expected_preview`, then re-read changed identities or lists after deletion and preview affected output when relevant.
- **`.risup` prompt edits:** use facade reads/search, `analyze_content` for comparison/import verification, `preview_edit` → `apply_edit` for writes/deletes, and `manage_items` for add/reorder/copy/import/snippets.
- **Asset edits:** use `manage_assets` preview/apply for covered `.charx` and `.risum` operations, including compression.
- **File/session workflows:** use `manage_file`; active lorebook import/export is also preview-token-first and carries collection plus input/output state guards.
- **CBS / Danbooru validation:** use `validate_content` for validators and `analyze_content` for toggle listing, simulation/diff, tag DB status/search, or popular tags.
- **Reference sync / diff:** use `analyze_content` with nested `{ kind: "reference", reference_id | file_path }` targets for lorebook and risup comparisons.

## Validation Rules

- Validate with the same lens that found the issue: facade follow-up read/search, family-specific re-read, diff, validator, or preview.
- For import/diff workflows, preserve the source text or reference identity until validation completes so mismatches can be reproduced.
- Treat stale-index `409` as a successful safety catch, not a failure: re-list, refresh guards, preview/dry-run again if the target shifted, then retry.

## Session-Awareness Workflow

1. Call `inspect_document` first for bounded session/active/reference/external preflight. Session inspection contains the full status payload; use `session_status` only for legacy response-shape compatibility.
2. If no active document is loaded, use facade external/reference targets when covered; switch to `inspect_external_file` / `probe_*` / `external_*` for probe-specific summaries or direct absolute-path edits, or use `manage_file` preview/apply `open_file` before edit routes that require an active document.
3. If `pendingRecovery`, `dirtyFields`, autosave settings, or `surfaceSummary` look unexpected, stabilize the session first instead of guessing from partial field reads.
4. If `session_status.integrity.activeFile.matchesLoadedBaseline` is `false`, the active file on disk has changed since open/last save. Resolve that drift before relying on disk-backed validation or external-file edits.

## Large-Field Workflow

1. Use `search_document` or bounded `read_content` first when the facade can express the target and bounds.
2. Use granular `search_in_field` / `read_field_range` only for unsupported selectors or exact legacy range/search payloads.
3. For covered mutations, use `preview_edit` → `apply_edit` (field, surface, and structured-item writes/deletes/replacements), `manage_items` (add/reorder/import/copy/snippet), `manage_assets` (asset management and `.charx` compression), or `manage_file` (file/session/project-folder operations). The facade preview accepting your selector is the coverage test; use granular routes only for semantics the facades reject.
4. Use `manage_file` snapshot preview/apply before risky granular field edits.

## Lorebook Workflow (granular fallback)

Prefer facade routes first: `read_content` with `{ family: "lorebook", id }` for reads and `preview_edit` → `apply_edit` for covered item writes/deletes/replacements. Use this granular sequence when the facade cannot express the operation:

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

## Regex / Reference Workflow (granular fallback)

Prefer facade routes first: `read_content` / `search_document` for covered reference and regex reads, and `preview_edit` → `apply_edit` with `identity` selectors for covered regex writes. Use these granular sequences when the facade cannot express the task or exact legacy shapes are required:

- Regex: `list_regex` → `read_regex(index)` / `read_regex_batch(indices)` → targeted writes.
- Reference lorebooks/Lua/CSS/regex: use the dedicated `list_reference_*`, `read_reference_*`, and `read_reference_*_batch` routes instead of `read_reference_field`.
- Reference greetings/triggers: use `list_reference_greetings` / `read_reference_greeting` / `read_reference_greeting_batch` and `list_reference_triggers` / `read_reference_trigger` / `read_reference_trigger_batch` instead of dumping `alternateGreetings`, `groupOnlyGreetings`, or `triggerScripts`.
- Large reference fields: use `search_in_reference_field` to locate text, `read_reference_field_range` to read a specific span.
- **No main file required**: reference tools work even when no main document is open. Start with `inspect_document` targeting the session/reference; use `session_status` or `list_references` only when you need the full legacy inventory or runtime diagnostics, then move to the `*_reference_*` routes.

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
- `manage_items` `add_items` for facade-covered `.risup`, lorebook, regex, alternate greeting, trigger, Lua, or CSS batch adds
- `manage_assets` for covered asset add/delete/rename/compression with preview/apply guards before falling back to granular asset routes
- `manage_file` for single covered file/session/project-folder operations with preview/apply guards before falling back to granular file routes

This reduces repeated confirmation prompts and keeps edits coherent.

## Surface Fallback Workflow

1. Prefer dedicated families first: lorebook, regex, greetings, triggers, Lua/CSS, assets, and risup prompt tools.
2. If the content is not reachable through those families, call `list_surfaces` and inspect only the needed JSON Pointer path with `read_surface`.
3. Use facade `preview_edit` → `apply_edit` for covered active or unopened-file JSON Patch and recursive string-replacement operations. Use granular `patch_surface` / `replace_in_surface` / `external_patch_surface` only for exact legacy payloads, unsupported patch workflows, or cross-surface diagnostics.
4. Use `dry_run: true` before broad granular edits and pass `expected_hash` from `list_surfaces`, `read_surface`, or the facade preview guard when retry safety matters.
5. After active-document surface edits that must persist immediately, prefer `manage_file` preview/apply `save_current_file`.

## Import Verification Workflow

After using `import_risup_prompt_from_text`, always verify the result:

1. `analyze_content` with `operation.action="verify_risup_prompt_import"` and the same source text.
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
