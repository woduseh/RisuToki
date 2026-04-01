# MCP Tool Reference

## Categories

- **Fields** — `list_fields`, `read_field`, `read_field_batch`, `write_field`, `write_field_batch`
- **Field search/edit** — `search_in_field`, `read_field_range`, `replace_in_field`, `replace_in_field_batch`, `replace_block_in_field`, `insert_in_field`
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

## Structured Error Response Contract (v0.34.0)

The following route families return structured `mcpError()` envelopes on 4xx errors:

- **Regex** — `read_regex`, `write_regex`, `add_regex`, `replace_in_regex`, `insert_in_regex`, `delete_regex`, `add_regex_batch`, `write_regex_batch`
- **Greetings** — `read_greeting`, `write_greeting`, `add_greeting`, `delete_greeting`, `batch_delete_greeting`, `batch_write_greeting`, `reorder_greetings`
- **Lua sections** — `read_lua`, `write_lua`, `replace_in_lua`, `insert_in_lua`, `add_lua_section`
- **CSS sections** — `read_css`, `write_css`, `replace_in_css`, `insert_in_css`, `add_css_section`

Additive fields on 4xx errors in these routes:

| Field        | Description                                      |
| ------------ | ------------------------------------------------ |
| `action`     | The operation that failed (e.g. `read`, `write`) |
| `target`     | The resource target (e.g. `regex`, `lua`)        |
| `status`     | HTTP-style status code (e.g. `404`, `400`)       |
| `suggestion` | Actionable hint for recovery                     |
| `details`    | (sometimes) Additional context object            |

The top-level `error` field remains present for MCP bridge compatibility.

> **Note**: This contract currently covers only the four route families listed above. Other MCP routes have not yet been standardized.

## Important Anti-Patterns

- Never use `replace_in_field` as a search tool. A missing replacement can become deletion.
- Never dump large structured fields when section/item tools exist.
- Prefer batch writes when touching multiple neighbors.
