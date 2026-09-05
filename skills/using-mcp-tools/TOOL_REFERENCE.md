# MCP Tool Reference

For the canonical repo-wide family map and response-contract coverage, see:

- `docs/MCP_TOOL_SURFACE.md`
- `docs/MCP_ERROR_CONTRACT.md`

## Critical Rules

- Prefer default facade v1 tools for profile discovery and covered inspect/read/search/analyze/preview/apply workflows: `list_tool_profiles`, `inspect_document`, `read_content`, `search_document`, `analyze_content`, `preview_edit`, `apply_edit`, and `validate_content`. `load_guidance` is legacy compatibility; use `list_skills`, `read_skill`, or guidance-target inspection by default.
- Treat granular tools as advanced/legacy fallbacks for unsupported facade selectors/operations, exact structured editors, direct external mutations, batch/add/reorder/import/export/asset workflows, or compatibility/debugging.
- Do not use `read_field` or `write_field` for `lua`, `css`, greetings, triggers, or structured `.risup` prompt surfaces when dedicated tools already exist.
- Prefer batch tools over loops of repeated single-item writes, and prefer batch readers when inspecting several sibling items.
- Trust response `next_actions` and `artifacts.byte_size`; facade and high-traffic granular tools may narrow the family defaults to a smaller, safer follow-up set.
- Use `list_tool_profiles` for profile-specific catalogs. The default `tools/list` contains 13 tools: 11 preferred Facade v1 tools plus `list_skills` and `read_skill`.
- Use `workflowStages` to plan the safe sequence: `discover` = routing/catalog/list/session preflight, `read` = bounded content retrieval, `search` = query-based retrieval, `validate` = validators/diffs/simulators, `preview` = dry-run or preview-token generation, and `apply` = state-changing mutation. The default edit order is `discover -> read/search -> validate/preview -> apply -> validate`.
- For indexed mutations, reuse the latest family identity fields as stale-index guards: lorebook/regex/trigger use `expected_comment`, greetings use `expected_preview` / `expected_previews`, and risup prompt items use `expected_type` plus optional `expected_preview`. Lorebook `replace_in_lorebook_batch` also supports `dry_run` preview.

## Stage-1 Soft-Legacy Status

Stage 1 entered soft legacy on 2026-07-03 after measured replay passed 12/12 scenarios and 35/35 replayable tasks. The canonical 51-entry inventory is marker-delimited in `docs/MCP_TOOL_SURFACE.md` and guarded against taxonomy drift.

- `load_guidance` is the one pre-existing compatibility-facade exception; use `list_skills`, `read_skill`, or guidance-target inspection by default.
- Soft-legacy granular groups are `session_status`, all `probe_*` readers, `list_references`, the documented `list_reference_*` / `read_reference_*` readers, and facade-covered indexed lorebook/regex/greeting/risup mutation variants.
- `legacy` does not mean removed. These tools remain compatibility routes in their existing non-default profiles for exact payloads, diagnostics, and documented facade gaps.
- Stable by-id/by-identity/by-hash routes and unsupported batch/debug workflows remain `advanced`, not legacy.

## Categories

- **Facade v1 (preferred/default)** — `list_tool_profiles`, `inspect_document`, `read_content`, `search_document`, `analyze_content`, `preview_edit`, `apply_edit`, `validate_content`, `manage_items`, `manage_assets`, `manage_file`; legacy facade: `load_guidance`
- **Fields (granular/advanced)** — `list_fields`, `read_field`, `read_field_batch`, `write_field`, `write_field_batch`
- **Field search/edit (granular/advanced)** — `search_in_field`, `read_field_range`, `replace_in_field`, `replace_in_field_batch`, `replace_block_in_field`, `insert_in_field`
- **Session state (soft-legacy compatibility)** — `session_status`; prefer `inspect_document` with `target.kind="session"`
- **External probes (soft-legacy compatibility)** — `probe_field`, `probe_field_batch`, `probe_lorebook`, `probe_regex`, `probe_lua`, `probe_css`, `probe_greetings`, `probe_triggers`, `probe_risup_prompt_items`, `probe_risup_formating_order`; prefer bounded `inspect_document` / `read_content`
- **Field safety** — `snapshot_field`, `list_snapshots`, `restore_snapshot`, `get_field_stats`, `search_all_fields`
- **Lua** — facade `preview_edit` / `apply_edit` covers write/replace/insert/delete; granular `list_lua`, `read_lua`, `read_lua_batch`, `write_lua`, `replace_in_lua`, `insert_in_lua`, `add_lua_section`
- **CSS** — facade `preview_edit` / `apply_edit` covers write/replace/insert/delete; granular `list_css`, `read_css`, `read_css_batch`, `write_css`, `replace_in_css`, `insert_in_css`, `add_css_section`
- **Lorebook** — `list_lorebook`, `read_lorebook`, `read_lorebook_batch`, `add_lorebook`, `add_lorebook_batch`, `clone_lorebook`; soft-legacy indexed mutations `write_lorebook`, `write_lorebook_batch`, `delete_lorebook`, `batch_delete_lorebook`
- **Lorebook targeting** — `replace_in_lorebook`, `replace_block_in_lorebook`, `insert_in_lorebook`, `replace_in_lorebook_batch`, `insert_in_lorebook_batch`, `replace_across_all_lorebook`, `diff_lorebook`, `validate_lorebook_keys`
- **Lorebook import/export** — `export_lorebook_to_files`, `import_lorebook_from_files`, `export_field_to_file`
- **Regex** — `list_regex`, `read_regex`, `read_regex_batch`, `add_regex`, `replace_in_regex`, `insert_in_regex`, `add_regex_batch`, `write_regex_batch`; soft-legacy indexed mutations `write_regex`, `delete_regex`
- **Greetings** — `list_greetings`, `read_greeting`, `read_greeting_batch`, `add_greeting`, `batch_delete_greeting`, `batch_write_greeting`, `reorder_greetings`; soft-legacy indexed mutations `write_greeting`, `delete_greeting`
- **Triggers** — `list_triggers`, `read_trigger`, `read_trigger_batch`, `write_trigger`, `add_trigger`, `delete_trigger`
- **Risup prompt tools** — `list_risup_prompt_items`, `search_in_risup_prompt_items`, `read_risup_prompt_item`, `read_risup_prompt_item_batch`, `add_risup_prompt_item`, `add_risup_prompt_item_batch`, `read_risup_formating_order`, `write_risup_formating_order`, `diff_risup_prompt`, `export_risup_prompt_to_text`, `copy_risup_prompt_items_as_text`, `import_risup_prompt_from_text`, `list_risup_prompt_snippets`, `read_risup_prompt_snippet`, `save_risup_prompt_snippet`, `insert_risup_prompt_snippet`, `delete_risup_prompt_snippet`; soft-legacy indexed mutations `write_risup_prompt_item`, `write_risup_prompt_item_batch`, `delete_risup_prompt_item`, `batch_delete_risup_prompt_items`, `reorder_risup_prompt_items`
- **References (soft-legacy readers)** — `list_references` and the documented `list_reference_*` / `read_reference_*` readers are compatibility routes for exact payloads; prefer `inspect_document` / `read_content`. `search_in_reference_field` remains an advanced specialized search fallback.
- **Assets** — `manage_assets` preferred for `.charx`/`.risum` including compression; granular `list_charx_assets`, `read_charx_asset`, `add_charx_asset`, `delete_charx_asset`, `rename_charx_asset`, `list_risum_assets`, `read_risum_asset`, `add_risum_asset`, `delete_risum_asset`, `compress_assets_webp`
- **Danbooru** — `tag_db_status`, `validate_danbooru_tags`, `search_danbooru_tags`, `get_popular_danbooru_tags`
- **CBS validation** — `validate_cbs`, `list_cbs_toggles`, `simulate_cbs`, `diff_cbs`
- **Skills** — `list_skills`, `read_skill`
- **Prompts** — danbooru_tag_guide (prompt)

## Structured Response Contracts

Repo-wide MCP routes use three additive response helpers:

1. `mcpSuccess()` — structured success envelope for most successful reads and mutations
2. `mcpError()` — structured hard-failure envelope for validation, range, auth, conflict, and global guard failures
3. `mcpNoOp()` — structured HTTP-200 no-op envelope for valid-but-unapplied mutation requests

Additive recovery fields on hard failures and no-ops:

| Field        | Description                                       |
| ------------ | ------------------------------------------------- |
| `action`     | The operation that failed or no-op'd              |
| `target`     | The resource target (e.g. `regex`, `lua`)         |
| `status`     | HTTP-style status code (e.g. `404`, `400`, `200`) |
| `suggestion` | Actionable hint for recovery                      |
| `details`    | (sometimes) Additional context object             |
| `message`    | No-op message payload (for `mcpNoOp()`)           |

Success-envelope observation fields:

| Field                 | Description                                                                                           |
| --------------------- | ----------------------------------------------------------------------------------------------------- |
| `summary`             | Human-readable one-line outcome summary                                                               |
| `next_actions`        | Deterministic follow-up tool suggestions from the MCP family taxonomy                                 |
| `artifacts`           | Small machine-readable outcome details                                                                |
| `artifacts.byte_size` | Approximate UTF-8 JSON size of the success response, excluding the `artifacts.byte_size` field itself |

Tool-list metadata:

- `list_tool_profiles` returns the compact on-demand profile catalog. It includes `runtime` metadata (`serverVersion`, `appVersion`, `packageVersion`, `buildTime`, `commit`, `runtimeMode`, and `skew`) plus `health` metadata (`facadeTools`, `readonlyTools`, `advancedTools`, `allTools`, `missingWorkflowStages`, `unknownRecommendation`, and `unknownSurfaceKind`). Treat `runtime.skew.detected` or non-empty catalog health arrays as a signal to verify the running MCP process before trusting a workflow.
- `tools/list` contains the active registered profile and includes `_meta['risutoki/profiles']`, `_meta['risutoki/defaultProfile']`, `_meta['risutoki/surfaceKind']`, `_meta['risutoki/recommendation']`, and `_meta['risutoki/workflowStages']`; choose facade/preferred tools first for covered workflows, and restart with `advanced-full` for granular escape hatches.
- `tools/list` may include `_meta['risutoki/requiresConfirmation']` and `_meta['risutoki/supportsDryRun']` on mutation-capable tools.
- Prefer `preview_edit` → `apply_edit` for covered edits, including active/external field writes, replacements, and insertions; active surface patches; active lorebook text replacement; and active indexed regex/greeting/risup prompt item writes/deletes. Otherwise prefer granular tools with `supportsDryRun=true` when you want a preview-first workflow before committing a mutation.
- Indexed write/delete guard support is broader than the current `_meta` surface: pass the latest `comment`, `preview`, or `type` values from the family list/read route when you want stale-index protection on lorebook, regex, greeting, trigger, or risup prompt-item mutations.

Current coverage summary:

- **`mcpError()`** covers regex, greetings, lua/css sections, field/lorebook, reference, charx/risum asset, risup reorder/formating-order, skills file-read validation, unopened-file probe/open/direct-path external editing, and the global `Unauthorized` / `No file open` guards.
- **`mcpNoOp()`** covers recoverable no-match / anchor-miss / batch-partial cases in field, lorebook, regex, lua, and css mutation paths.
- **`mcpSuccess()`** covers most success paths and provides deterministic `next_actions`; `validate_cbs` remains the intentional exception because it preserves its existing structured `summary` object.

Context-budget rule:

- Read `artifacts.byte_size` before requesting adjacent content. If the success response is already large, prefer narrower facade follow-ups (`search_document`, bounded `read_content`) or granular tools (`list_*`, `search_in_field`, `read_field_range`, item/section reads, or `probe_*`) instead of broader dumps.
- Use `inspect_document` before risky writes or after interruptions. Session inspection returns the full status payload in a bounded envelope; reference inspection without an identifier returns bounded inventory, while a supplied identifier returns only that reference. Use `session_status` / `list_references` for exact legacy top-level shapes.
- When several write tools could solve the task, inspect tool `_meta` first so you know which route is facade/preferred, which supports `dry_run`, and which will pause for confirmation.
- Prefer `list_reference_greetings` / `read_reference_greeting` / `read_reference_greeting_batch` and `list_reference_triggers` / `read_reference_trigger` / `read_reference_trigger_batch` over `read_reference_field("alternateGreetings")`, `read_reference_field("groupOnlyGreetings")`, or `read_reference_field("triggerScripts")`.
- For repository implementation, skill-routing, or evaluation changes, follow `docs/PROJECT_RULES.md` to select `npm run test:evals` and, when MCP runtime behavior is affected, `npm run test:evals:replay`. For artifact-only edits, use the relevant artifact read, diff, or validator.

The top-level `error` field remains present for MCP bridge compatibility.

## Important Anti-Patterns

- Never use `replace_in_field` as a search tool. A missing replacement can become deletion.
- Never bypass a covered facade route without an unsupported-selector, structured-editor, or compatibility reason.
- Never dump large structured fields when section/item tools exist.
- Prefer batch writes when touching multiple neighbors.
