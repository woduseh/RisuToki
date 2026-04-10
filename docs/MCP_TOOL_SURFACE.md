# MCP Tool Surface

This document maps the MCP tool surface into stable families so agents can choose tools predictably.

## Source of truth

- Tool membership and behavior hints: `src/lib/mcp-tool-taxonomy.ts`
- Deterministic follow-up actions: `src/lib/mcp-response-envelope.ts`
- Success / error / no-op envelopes: `docs/MCP_ERROR_CONTRACT.md`

If this file and code diverge, the TypeScript source wins.

## Hint legend

- **RO** — read-only
- **Write** — mutates the active document or runtime state
- **Destructive** — may delete or overwrite data
- **Idempotent** — repeated calls with the same input should settle to the same result
- **Open-world** — touches the filesystem or another external system

## Cross-cutting contract

- Successful read and mutation routes generally return `mcpSuccess()` with `summary`, `next_actions`, and `artifacts`.
- `mcpSuccess()` also adds `artifacts.byte_size`, an approximate UTF-8 JSON size of the success response excluding the `artifacts.byte_size` field itself.
- Hard failures return `mcpError()` with `action`, `target`, `error`, `status`, and `suggestion`.
- Recoverable HTTP-200 no-op exits return `mcpNoOp()` with `success: false` plus the same recovery metadata.
- Global `Unauthorized` and `No file open` guards use the same structured `mcpError()` contract.
- `validate_cbs` is the intentional success-envelope exception because it keeps its existing structured `summary` object.
- Agents should treat larger `artifacts.byte_size` values as a cue to keep follow-up reads narrow: search first, then read ranges/items/sections instead of broad dumps.

## Family map

### `field`

- **Use when:** reading or editing scalar/live document fields on the active file
- **Tools:** `list_fields`, `read_field`, `read_field_batch`, `write_field`, `write_field_batch`, `replace_in_field`, `replace_in_field_batch`, `replace_block_in_field`, `insert_in_field`, `read_field_range`, `get_field_stats`, `export_field_to_file`
- **Hints:** RO/idempotent reads; write mutations for write/replace/insert; `export_field_to_file` is open-world
- **Next actions:** `list_fields`, `read_field`, `search_in_field`, `write_field`
- **Boundary:** use `search` to discover where text lives, `probe` for unopened files, and the specialized `lua`, `css`, `greeting`, `trigger`, and `risup-prompt` families instead of dumping those surfaces through `read_field`
- **No-op coverage:** no-match, anchor-miss, and zero-match batch replace paths use `mcpNoOp()`

### `search`

- **Use when:** locating text before deciding what to read or edit
- **Tools:** `search_in_field`, `search_all_fields`
- **Hints:** RO, idempotent
- **Next actions:** `search_in_field`, `search_all_fields`, `read_field`
- **Boundary:** use this family to narrow context first; switch to `field`, `lorebook`, or section families for actual content reads and writes

### `snapshot`

- **Use when:** taking a rollback point before risky field edits
- **Tools:** `snapshot_field`, `list_snapshots`, `restore_snapshot`
- **Hints:** snapshot/restore mutate state; listing is RO/idempotent
- **Next actions:** `list_snapshots`, `snapshot_field`, `restore_snapshot`
- **Boundary:** this is field-level rollback, not a substitute for git history or full-document versioning

### `session`

- **Use when:** inspecting the current document, dirty/autosave state, recovery status, and snapshot totals before resuming work or making risky edits
- **Tools:** `session_status`
- **Hints:** RO, idempotent
- **Next actions:** `session_status`, `open_file`, `list_snapshots`
- **Boundary:** this family reports editor/runtime state rather than document content and remains available even when no file is open

### `probe`

- **Use when:** inspecting or switching to unopened `.charx`, `.risum`, or `.risup` files by absolute path
- **Tools:** `probe_field`, `probe_field_batch`, `probe_lorebook`, `probe_regex`, `probe_lua`, `open_file`
- **Hints:** probes are RO/idempotent; `open_file` mutates the active document state
- **Next actions:** `open_file`, `probe_field`, `probe_lorebook`
- **Boundary:** prefer this family when the file is not already open; once opened, switch back to the live document families

### `lorebook`

- **Use when:** reading, editing, validating, cloning, or diffing lorebook entries in the active document
- **Tools:** `list_lorebook`, `read_lorebook`, `read_lorebook_batch`, `write_lorebook`, `write_lorebook_batch`, `add_lorebook`, `add_lorebook_batch`, `delete_lorebook`, `batch_delete_lorebook`, `clone_lorebook`, `replace_in_lorebook`, `replace_in_lorebook_batch`, `replace_block_in_lorebook`, `insert_in_lorebook`, `insert_in_lorebook_batch`, `replace_across_all_lorebook`, `diff_lorebook`, `validate_lorebook_keys`
- **Hints:** reads are RO/idempotent; adds/writes/clones mutate; deletes are destructive
- **Next actions:** `list_lorebook`, `read_lorebook`, `write_lorebook`, `validate_lorebook_keys`
- **Boundary:** use `reference` for read-only comparison against reference files and `lorebook-io` for filesystem import/export
- **No-op coverage:** no-match, anchor-miss, zero-active batch replace, and batch-insert item error paths use `mcpNoOp()`

### `lorebook-io`

- **Use when:** importing lorebook entries from files or exporting them to files
- **Tools:** `export_lorebook_to_files`, `import_lorebook_from_files`
- **Hints:** open-world write
- **Next actions:** `list_lorebook`, `export_lorebook_to_files`, `import_lorebook_from_files`
- **Boundary:** use `lorebook` for in-editor entry edits; this family is for filesystem exchange

### `regex`

- **Use when:** reading or editing regex entries on the active document
- **Tools:** `list_regex`, `read_regex`, `write_regex`, `write_regex_batch`, `add_regex`, `add_regex_batch`, `delete_regex`, `replace_in_regex`, `insert_in_regex`
- **Hints:** reads are RO/idempotent; writes/adds mutate; deletes are destructive
- **Next actions:** `list_regex`, `read_regex`, `write_regex`
- **Boundary:** use `reference` for read-only comparison against reference files; use `field` only for generic top-level card fields
- **No-op coverage:** no-match replace and anchor-miss insert paths use `mcpNoOp()`

### `greeting`

- **Use when:** managing alternate or grouped greeting arrays
- **Tools:** `list_greetings`, `read_greeting`, `write_greeting`, `add_greeting`, `delete_greeting`, `batch_delete_greeting`, `batch_write_greeting`, `reorder_greetings`
- **Hints:** reads are RO/idempotent; writes/adds/reorders mutate; deletes are destructive
- **Next actions:** `list_greetings`, `read_greeting`, `write_greeting`
- **Boundary:** do not treat greeting arrays as generic fields; this family exists to avoid dumping and rewriting raw arrays

### `trigger`

- **Use when:** reading or editing trigger scripts individually
- **Tools:** `list_triggers`, `read_trigger`, `write_trigger`, `add_trigger`, `delete_trigger`
- **Hints:** reads are RO/idempotent; writes/adds mutate; deletes are destructive
- **Next actions:** `list_triggers`, `read_trigger`, `write_trigger`
- **Boundary:** use this family instead of raw `triggerScripts` field reads

### `lua`

- **Use when:** working with the primary Lua script as sectioned content
- **Tools:** `list_lua`, `read_lua`, `read_lua_batch`, `write_lua`, `replace_in_lua`, `insert_in_lua`, `add_lua_section`
- **Hints:** reads are RO/idempotent; writes/replaces/inserts/adds mutate
- **Next actions:** `list_lua`, `read_lua`, `write_lua`
- **Boundary:** use this family instead of `read_field("lua")`; use `probe_lua` if the file is unopened
- **No-op coverage:** no-match replace and anchor-miss insert paths use `mcpNoOp()`

### `css`

- **Use when:** working with CSS as sectioned content
- **Tools:** `list_css`, `read_css`, `read_css_batch`, `write_css`, `replace_in_css`, `insert_in_css`, `add_css_section`
- **Hints:** reads are RO/idempotent; writes/replaces/inserts/adds mutate
- **Next actions:** `list_css`, `read_css`, `write_css`
- **Boundary:** use this family instead of `read_field("css")`; use dedicated reference/probe readers for unopened or reference files
- **No-op coverage:** no-match replace and anchor-miss insert paths use `mcpNoOp()`

### `reference`

- **Use when:** reading reference files without mutating them
- **Tools:** `list_references`, `read_reference_field`, `list_reference_lorebook`, `read_reference_lorebook`, `read_reference_lorebook_batch`, `list_reference_regex`, `read_reference_regex`, `list_reference_lua`, `read_reference_lua`, `read_reference_lua_batch`, `list_reference_css`, `read_reference_css`, `read_reference_css_batch`
- **Hints:** RO, idempotent
- **Next actions:** `list_references`, `list_reference_lorebook`, `list_reference_regex`
- **Boundary:** this family is read-only by design; switch to live document families only after deciding to copy or adapt content

### `charx-asset`

- **Use when:** reading or mutating assets embedded in a `.charx` document
- **Tools:** `list_charx_assets`, `read_charx_asset`, `add_charx_asset`, `delete_charx_asset`, `rename_charx_asset`
- **Hints:** list/read are RO/idempotent; add/rename mutate; delete is destructive
- **Next actions:** `list_charx_assets`, `read_charx_asset`, `add_charx_asset`
- **Boundary:** use `risum-asset` for `.risum` asset surfaces and `asset-compression` for bulk compression

### `risum-asset`

- **Use when:** reading or mutating assets embedded in a `.risum` document
- **Tools:** `list_risum_assets`, `read_risum_asset`, `add_risum_asset`, `delete_risum_asset`
- **Hints:** list/read are RO/idempotent; add mutates; delete is destructive
- **Next actions:** `list_risum_assets`, `read_risum_asset`, `add_risum_asset`
- **Boundary:** this family is specific to `.risum`; do not mix it with charx asset tools

### `asset-compression`

- **Use when:** bulk-compressing embedded image assets to WebP
- **Tools:** `compress_assets_webp`
- **Hints:** write mutation
- **Next actions:** `compress_assets_webp`, `list_charx_assets`
- **Boundary:** use asset CRUD families for inspection or file-level management; this family is specifically about compression

### `risup-prompt`

- **Use when:** reading or editing structured `.risup` prompt items and formatting order
- **Tools:** `list_risup_prompt_items`, `read_risup_prompt_item`, `write_risup_prompt_item`, `add_risup_prompt_item`, `delete_risup_prompt_item`, `reorder_risup_prompt_items`, `read_risup_formating_order`, `write_risup_formating_order`
- **Hints:** list/read are RO/idempotent; writes/reorders mutate; delete is destructive
- **Next actions:** `list_risup_prompt_items`, `read_risup_prompt_item`, `read_risup_formating_order`
- **Boundary:** prefer this structured surface over raw `promptTemplate` / `formatingOrder` field writes whenever possible

### `skill`

- **Use when:** loading repo-local workflow/reference docs on demand
- **Tools:** `list_skills`, `read_skill`
- **Hints:** `list_skills` is RO/idempotent; `read_skill` is open-world read
- **Next actions:** `list_skills`, `read_skill`
- **Boundary:** use this family for narrow, task-specific guidance; use `docs/` for broader repo-level architecture and harness docs

### `danbooru`

- **Use when:** validating or searching Danbooru tags for prompt authoring
- **Tools:** `tag_db_status`, `validate_danbooru_tags`, `search_danbooru_tags`, `get_popular_danbooru_tags`
- **Hints:** RO/idempotent status and popular-tag reads; validation/search are open-world reads
- **Next actions:** `validate_danbooru_tags`, `search_danbooru_tags`, `get_popular_danbooru_tags`
- **Boundary:** this family validates prompt vocabulary; it does not edit assets or prompt-template structure

### `cbs`

- **Use when:** validating, simulating, or diffing CBS behavior
- **Tools:** `validate_cbs`, `list_cbs_toggles`, `simulate_cbs`, `diff_cbs`
- **Hints:** RO, idempotent
- **Next actions:** `validate_cbs`, `simulate_cbs`, `diff_cbs`
- **Boundary:** this family is for verification and analysis, not for editing the underlying text directly
- **Contract note:** `validate_cbs` intentionally stays outside `mcpSuccess()` so it can preserve its existing structured `summary` object

## Global routing rules

1. Prefer the most specific family over a generic one.
2. Prefer list → narrow read → targeted edit over dump → rewrite.
3. Use `probe` before `open_file` for unopened documents.
4. Use `reference` for read-only comparison and `lorebook-io` for filesystem exchange.
5. When multiple sibling items change together, prefer batch tools inside the family instead of repeated single-item writes.
