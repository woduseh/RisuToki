# MCP Tool Reference

For the canonical repo-wide family map and response-contract coverage, see:

- `docs/MCP_TOOL_SURFACE.md`
- `docs/MCP_ERROR_CONTRACT.md`

## Categories

- **Fields** — `list_fields`, `read_field`, `read_field_batch`, `write_field`, `write_field_batch`
- **Field search/edit** — `search_in_field`, `read_field_range`, `replace_in_field`, `replace_in_field_batch`, `replace_block_in_field`, `insert_in_field`
- **Session state** — `session_status`
- **Field safety** — `snapshot_field`, `list_snapshots`, `restore_snapshot`, `get_field_stats`, `search_all_fields`
- **Lua** — `list_lua`, `read_lua`, `read_lua_batch`, `write_lua`, `replace_in_lua`, `insert_in_lua`, `add_lua_section`
- **CSS** — `list_css`, `read_css`, `read_css_batch`, `write_css`, `replace_in_css`, `insert_in_css`, `add_css_section`
- **Lorebook** — `list_lorebook`, `read_lorebook`, `read_lorebook_batch`, `write_lorebook`, `write_lorebook_batch`, `add_lorebook`, `add_lorebook_batch`, `clone_lorebook`, `delete_lorebook`, `batch_delete_lorebook`
- **Lorebook targeting** — `replace_in_lorebook`, `replace_block_in_lorebook`, `insert_in_lorebook`, `replace_in_lorebook_batch`, `insert_in_lorebook_batch`, `replace_across_all_lorebook`, `diff_lorebook`, `validate_lorebook_keys`
- **Lorebook import/export** — `export_lorebook_to_files`, `import_lorebook_from_files`, `export_field_to_file`
- **Regex** — `list_regex`, `read_regex`, `write_regex`, `add_regex`, `replace_in_regex`, `insert_in_regex`, `delete_regex`, `add_regex_batch`, `write_regex_batch`
- **Greetings** — `list_greetings`, `read_greeting`, `write_greeting`, `add_greeting`, `delete_greeting`, `batch_delete_greeting`, `batch_write_greeting`, `reorder_greetings`
- **Triggers** — `list_triggers`, `read_trigger`, `write_trigger`, `add_trigger`, `delete_trigger`
- **Risup prompt tools** — `list_risup_prompt_items`, `read_risup_prompt_item`, `write_risup_prompt_item`, `add_risup_prompt_item`, `delete_risup_prompt_item`, `reorder_risup_prompt_items`, `read_risup_formating_order`, `write_risup_formating_order`
- **References** — `list_references`, `read_reference_field`, `list_reference_lorebook`, `read_reference_lorebook`, `read_reference_lorebook_batch`, `list_reference_lua`, `read_reference_lua`, `read_reference_lua_batch`, `list_reference_css`, `read_reference_css`, `read_reference_css_batch`, `list_reference_regex`, `read_reference_regex`
- **Assets** — `list_charx_assets`, `read_charx_asset`, `add_charx_asset`, `delete_charx_asset`, `rename_charx_asset`, `list_risum_assets`, `read_risum_asset`, `add_risum_asset`, `delete_risum_asset`, `compress_assets_webp`
- **Danbooru** — `tag_db_status`, `validate_danbooru_tags`, `search_danbooru_tags`, `get_popular_danbooru_tags`, `danbooru_tag_guide`
- **CBS validation** — `validate_cbs`, `list_cbs_toggles`, `simulate_cbs`, `diff_cbs`
- **Skills** — `list_skills`, `read_skill`

## Structured Response Contracts (v0.39.0)

Repo-wide MCP routes now use three additive response helpers:

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

Current coverage summary:

- **`mcpError()`** covers regex, greetings, lua/css sections, field/lorebook, reference, charx/risum asset, risup reorder/formating-order, skills file-read validation, unopened-file probe/open, and the global `Unauthorized` / `No file open` guards.
- **`mcpNoOp()`** covers recoverable no-match / anchor-miss / batch-partial cases in field, lorebook, regex, lua, and css mutation paths.
- **`mcpSuccess()`** covers most success paths and provides deterministic `next_actions`; `validate_cbs` remains the intentional exception because it preserves its existing structured `summary` object.

Context-budget rule:

- Read `artifacts.byte_size` before requesting adjacent content. If the success response is already large, prefer narrower follow-up tools (`list_*`, `search_in_field`, `read_field_range`, item/section reads, or `probe_*`) instead of broader dumps.
- Use `session_status` before risky writes or after interruptions; it is the read-only exception that still works without an open document.
- Run `npm run test:evals` when changing MCP contracts or workflow routing and you want the deterministic harness scenarios only.

The top-level `error` field remains present for MCP bridge compatibility.

## Important Anti-Patterns

- Never use `replace_in_field` as a search tool. A missing replacement can become deletion.
- Never dump large structured fields when section/item tools exist.
- Prefer batch writes when touching multiple neighbors.
