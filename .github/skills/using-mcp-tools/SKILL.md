---
name: using-mcp-tools
description: 'Workflow guide for choosing RisuToki MCP tools safely. Use when deciding which read or write surface fits a task, especially for session state, large fields, lorebooks, regex, references, or batch edits.'
tags: ['workflow', 'mcp', 'editing']
related_tools: ['session_status', 'search_all_fields', 'write_field_batch', 'read_lorebook_batch', 'read_skill']
---

# Using MCP Tools Safely

This skill is about **tool choice**, not syntax. Read it before making broad edits.

## Quick Read Rules

- Do **not** use `read_field("lua")`; use `list_lua` → `read_lua(index)`.
- Do **not** use `read_field("css")`; use `list_css` → `read_css(index)`.
- Do **not** dump `alternateGreetings`; use `list_greetings("alternate")`.
- Do **not** dump `triggerScripts`; use `list_triggers` → `read_trigger(index)`.
- If you need several regex/greeting/trigger items, switch to `read_regex_batch`, `read_greeting_batch`, or `read_trigger_batch` instead of looping single reads.
- Do **not** use `write_field` for `lua` / `css` / greetings / triggers when dedicated write tools already exist.
- For risup prompt editing, prefer `list_risup_prompt_items`, `search_in_risup_prompt_items`, `read_risup_prompt_item_batch`, `export_risup_prompt_to_text`, `copy_risup_prompt_items_as_text`, `diff_risup_prompt`, and `read_risup_formating_order`. For reuse across sessions, switch to `list_risup_prompt_snippets`, `read_risup_prompt_snippet`, `save_risup_prompt_snippet`, and `insert_risup_prompt_snippet`.
- For unopened files, start with `inspect_external_file` + the relevant `probe_*` reader, then use `external_search_in_field` / `external_read_field_range` / `external_write_field*` only when you must keep the current UI document untouched.
- When a specialized tool cannot reach the required content, use the surface fallback: `list_surfaces` → `read_surface` → `patch_surface` or `replace_in_surface`. Prefer `dry_run` and carry the document-level `expected_hash` for risky edits.
- For unopened files with unsupported shapes, use `external_read_surface` / `external_patch_surface`; these still reject the active UI document.
- Before risky edits or after interruptions, call `session_status` to inspect the active document, dirty/autosave state, recovery metadata, snapshot totals, and compact structured-surface counts.
- Prefer response `next_actions` over guessing; high-traffic tools may return narrower follow-up suggestions than the family default.
- Check tool `_meta` from `tools/list` when choosing a write route: `risutoki/requiresConfirmation` means an approval gate is expected, and `risutoki/supportsDryRun` means a preview-first flow exists.
- After using `import_risup_prompt_from_text`, call `validate_risup_prompt_import` with the same source text to verify all items were imported correctly. This catches silent mismatches from ID renormalization and content truncation.
- For deleting multiple risup prompt items at once, prefer `batch_delete_risup_prompt_items` over repeated `delete_risup_prompt_item` calls.
- When adding risup prompt items at a specific position (not at the end), use the `insertAt` parameter on `add_risup_prompt_item` or `add_risup_prompt_item_batch` instead of add + reorder.

## Session-Awareness Workflow

1. Call `session_status` when resuming after a crash, taking over an unknown session, or before risky writes.
2. If `loaded` is `false`, switch to `inspect_external_file` / `probe_*` / `external_*` for direct absolute-path work, or `open_file` before using edit routes that require an active document.
3. If `pendingRecovery`, `dirtyFields`, autosave settings, or `surfaceSummary` look unexpected, stabilize the session first instead of guessing from partial field reads.

## Large-Field Workflow

1. Use `search_in_field` to locate the exact area first.
2. Use `read_field_range` only for the span you need.
3. Use `replace_in_field`, `replace_in_field_batch`, or `replace_block_in_field` for targeted edits.
4. Use `snapshot_field` before risky edits.

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
- `add_risup_prompt_item_batch`
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

Use these prompts to verify the skill produces correct guidance:

1. "I need to edit a 3000-character lorebook content field — which MCP tool should I use and why?"
2. "List the correct tool sequence for reading an external `.charx` file's lorebook entries."
