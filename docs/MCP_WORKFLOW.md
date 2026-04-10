# MCP Workflow Guide

This guide covers tool selection, read rules, workflow patterns, and operational caveats for editing `.charx` / `.risum` / `.risup` files through MCP tools.

For tool-family definitions and boundary rules see [`docs/MCP_TOOL_SURFACE.md`](MCP_TOOL_SURFACE.md).
For error/no-op/success response contracts see [`docs/MCP_ERROR_CONTRACT.md`](MCP_ERROR_CONTRACT.md).

---

## 1. Quick Tool Routing Map

| Category                      | Preferred Tools                                                                                                                                                                                                                                                                                                                                                                                       | When to Use                                                                                                                                                             |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fields**                    | `list_fields`, `read_field`, `read_field_batch`, `write_field`, `write_field_batch`                                                                                                                                                                                                                                                                                                                   | Read or write small text fields in their entirety                                                                                                                       |
| **Large-field editing**       | `search_in_field`, `read_field_range`, `replace_in_field`, `replace_in_field_batch`, `replace_block_in_field`, `insert_in_field`                                                                                                                                                                                                                                                                      | Partial edits inside fields that are tens of KB or larger                                                                                                               |
| **Session state**             | `session_status`                                                                                                                                                                                                                                                                                                                                                                                      | Check current document, dirty/autosave, recovery, snapshot state, and compact structured-surface counts before resuming work                                            |
| **External file probe/open**  | `probe_field`, `probe_field_batch`, `probe_lorebook`, `probe_regex`, `probe_lua`, `open_file`                                                                                                                                                                                                                                                                                                         | Read `.charx` / `.risum` / `.risup` files by absolute path without opening them in the editor, or switch the active document                                            |
| **Lua sections**              | `list_lua`, `read_lua`, `write_lua`, `replace_in_lua`, `insert_in_lua`, `add_lua_section`                                                                                                                                                                                                                                                                                                             | Read and edit `lua` on a per-section basis                                                                                                                              |
| **CSS sections**              | `list_css`, `read_css`, `write_css`, `replace_in_css`, `insert_in_css`, `add_css_section`                                                                                                                                                                                                                                                                                                             | Read and edit `css` on a per-section basis                                                                                                                              |
| **Lorebook**                  | `list_lorebook`, `read_lorebook`, `read_lorebook_batch`, `write_lorebook`, `write_lorebook_batch`                                                                                                                                                                                                                                                                                                     | Browse, compare, and bulk-edit lorebook entries                                                                                                                         |
| **Regex**                     | `list_regex`, `read_regex`, `read_regex_batch`, `write_regex`, `replace_in_regex`, `add_regex_batch`, `write_regex_batch`                                                                                                                                                                                                                                                                             | Per-entry regex operations                                                                                                                                              |
| **Greetings / Triggers**      | `list_greetings`, `read_greeting`, `read_greeting_batch`, `batch_write_greeting`, `list_triggers`, `read_trigger`, `read_trigger_batch`, `write_trigger`                                                                                                                                                                                                                                              | Edit `alternateGreetings` / `triggerScripts` without looping single reads                                                                                               |
| **risup prompts**             | `list_risup_prompt_items`, `search_in_risup_prompt_items`, `read_risup_prompt_item_batch`, `read_risup_formating_order`, `diff_risup_prompt`, `export_risup_prompt_to_text`, `list_risup_prompt_snippets`                                                                                                                                                                                             | Start here for structured `.risup` prompts. From there, follow response `next_actions` into narrower write/import/snippet tools instead of memorizing the whole family. |
| **References**                | `list_references`, `search_in_reference_field`, `read_reference_field_range`, `list_reference_lorebook`, `read_reference_lorebook_batch`, `list_reference_regex`, `read_reference_regex_batch`, `list_reference_greetings`, `read_reference_greeting_batch`, `list_reference_triggers`, `read_reference_trigger_batch`, `list_reference_risup_prompt_items`, `read_reference_risup_prompt_item_batch` | Start here for loaded reference files, then switch to the exact `read_reference_*` tool or range reader you actually need.                                              |
| **Assets**                    | `list_charx_assets`, `read_charx_asset`, `add_charx_asset`, `list_risum_assets`, `read_risum_asset`, `compress_assets_webp`                                                                                                                                                                                                                                                                           | Inspect, add, or compress image/audio assets                                                                                                                            |
| **Danbooru / CBS validation** | `validate_danbooru_tags`, `search_danbooru_tags`, `get_popular_danbooru_tags`, `validate_cbs`, `list_cbs_toggles`, `simulate_cbs`, `diff_cbs`                                                                                                                                                                                                                                                         | Clean up image-prompt tags, validate CBS syntax                                                                                                                         |
| **Skill docs**                | `list_skills`, `read_skill`                                                                                                                                                                                                                                                                                                                                                                           | On-demand loading of workflow, file-structure, CBS/Lua/lorebook/regex/Danbooru guides                                                                                   |

---

## 2. Critical Don'ts

- Do **not** use `read_field` / `write_field` on surfaces that already have dedicated section/item tools.
- Do **not** use `replace_in_field` as a search tool; use `search_in_field`.
- Do **not** loop single-item reads when a batch reader already exists.
- Do **not** loop single-item writes when a batch tool exists.
- Prefer response `next_actions` over guessing: high-traffic tools such as `open_file`, `read_field`, `search_in_field`, `read_reference_field`, and batch risup prompt tools may narrow the family defaults.
- When several write tools fit, inspect tool `_meta` from `tools/list` first: `risutoki/supportsDryRun=true` means a preview-first path exists, and `risutoki/requiresConfirmation=true` means the tool will pause on approval.

---

## 3. Read Rules

- **Do not use `read_field` on the following fields.** They dump the entire content and waste context.
  - `lua` → `list_lua` → `read_lua(index)`
  - `css` → `list_css` → `read_css(index)`
  - `alternateGreetings` → `list_greetings("alternate")` → `read_greeting("alternate", index)` / `read_greeting_batch("alternate", indices)`
  - `triggerScripts` → `list_triggers` → `read_trigger(index)` / `read_trigger_batch(indices)`
  - `promptTemplate` / `formatingOrder` → `list_risup_prompt_items` / `search_in_risup_prompt_items` / `read_risup_prompt_item` / `read_risup_prompt_item_batch` / `export_risup_prompt_to_text` / `copy_risup_prompt_items_as_text` / `diff_risup_prompt` / `list_risup_prompt_snippets` / `read_risup_prompt_snippet` / `read_risup_formating_order`
- Read lorebook entries through `list_lorebook(folder?)` → `read_lorebook(index)`.
- Read regex entries through `list_regex` → `read_regex(index)` / `read_regex_batch(indices)`.
- The same applies to references. Prefer the `list_reference_*` / `read_reference_*` combination over a full dump like `read_reference_field("lorebook")` or `read_reference_field("triggerScripts")`, and switch to `read_reference_*_batch` when you need several sibling items.
- In a reference-only session, start with `list_references` or `session_status` to discover which loaded references are available before drilling deeper.
- For large reference text fields, prefer `search_in_reference_field` / `read_reference_field_range` over a full `read_reference_field`.
- Use `read_field_batch([...])` only when you need to inspect several small fields at once.
- **Read files that are not open in the editor with `probe_*` first.** Switch the active document with `open_file` only when you actually need to make edits, then use the existing write/edit tools.
- If the syntax or structure is unclear, read the relevant skill doc before making any changes.

---

## 4. Effective Workflows

### Standard Sequence

1. **Survey the surface** — Use `list_fields`, `list_lorebook`, `list_regex`, `list_lua`, `list_css`, `list_triggers`, etc. to understand the scope first.
2. **Check session state** — Before resuming interrupted work or making risky edits, call `session_status` to review the current document, dirty/autosave, recovery state, and `surfaceSummary`.
3. **Read narrowly** — Read only the entries, sections, or ranges you need.
4. **Targeted edit** — Replace small fields wholesale; search then partially replace in large fields.
5. **Prefer batch** — When modifying multiple adjacent items, prefer batch tools.
6. **Validate** — Confirm results with CBS/tag validation, reference comparison, or preview.

### Quick-Selection by Situation

**When you want to inspect field contents**

- Check current session/document state → `session_status`
- Small field → `read_field`
- File not open, identified by absolute path → `probe_field` / `probe_field_batch` / `probe_lorebook` / `probe_regex` / `probe_lua`
- Find a specific string in a large field → `search_in_field`
- Inspect a specific position in a large field → `read_field_range`
- Export the entire field to a local file → `export_field_to_file`

**When you want to modify field contents**

- File not yet open → switch with `open_file(file_path=...)`, then use existing `write_*` / `replace_*` tools
- Small field → `read_field` → `write_field`
- Single substitution in a large field → `search_in_field` → `replace_in_field`
- Multiple substitutions in a large field → `replace_in_field_batch`
- Anchor-based block replacement → `replace_block_in_field`

**When working with multiple lorebook entries**

- Read → `read_lorebook_batch`
- Write → `write_lorebook_batch`
- Stale-index safety → reuse each entry's current `comment` as `expected_comment` (or `expected_comments` for `batch_delete_lorebook`)
- Bulk name/phrase replacement → `replace_across_all_lorebook`
- Preview multi-entry replacements → `replace_in_lorebook_batch(dry_run=true)`
- Key quality check → `validate_lorebook_keys`

**When comparing against references**

- Most efficient comparison → `diff_lorebook`
- Manual comparison → `list_reference_*` → `read_reference_*`
- Narrow large reference text → `search_in_reference_field` / `read_reference_field_range`
- Reference-only session (no main file) → `session_status` or `list_references` → all `*_reference_*` tools

**When you need a safety net**

- Check dirty/autosave/recovery state before resuming → `session_status`
- Back up before editing → `snapshot_field`
- Roll back → `list_snapshots` → `restore_snapshot`
- Summary statistics → `get_field_stats`

### Never Do This

- Do not use `replace_in_field` as a search tool.
- Do not use `read_field` to dump an entire surface that has dedicated tools.
- Do not repeatedly call a single-item write tool when a batch tool is available. Always prefer the batch variant.

---

## 5. Caveats

### Write Behavior

- `write_field`, `write_lorebook`, `add_*`, and `delete_*` tools trigger a **user confirmation popup**.
- `tools/list` exposes additive mutation metadata in `_meta`; use `risutoki/requiresConfirmation` and `risutoki/supportsDryRun` instead of guessing which write routes can preview first or will block on approval.
- Specialized indexed writes now support family-specific stale-index guards: lorebook/regex/trigger use `expected_comment`, greetings use `expected_preview` / `expected_previews`, and risup prompt items use `expected_type` plus optional `expected_preview`. Carry these values forward from the latest list/read response so a stale index returns `409` instead of overwriting the wrong item.
- Lorebook `comment` values can be used by Lua `getLoreBooks()` searches. When changing a comment, always verify that it still matches the corresponding Lua search pattern.
- References are **read-only**.
- Items with `mode: "folder"` in `list_lorebook` results represent folders, not entries.

### risup Notes

- Complex nested objects in risup files (`ooba`, `NAISettings`, `customFlags`, etc.) are preserved during round-trips but are not exposed as individual form controls.
- `.risup` files are compatible with gzip, zlib, and raw-deflate compression. On save the detected compression mode is preserved whenever possible.
- `promptTemplate` / `formatingOrder` should be edited through the structured UI and the dedicated MCP tools. Fall back to `write_field` only when you need to touch an unsupported raw shape.
- Responses from `list_risup_prompt_items` / `read_risup_prompt_item` / `read_risup_prompt_item_batch` include additive `id` metadata for supported items plus the `type` / `preview` pair needed by stale-index guards on prompt-item write/delete routes. Responses from `read_risup_formating_order` include an advisory `warnings` array. Routing is still index-based by default, but batch add/write tools reduce repeated confirmation prompts when touching several sibling items.
- `export_risup_prompt_to_text` / `copy_risup_prompt_items_as_text` / `import_risup_prompt_from_text` provide a text serializer path for whole-template review and block-level reuse without exposing raw JSON arrays. The format preserves supported-item IDs, supported-item extra JSON fields, and unsupported/raw items; use `dry_run` before applying large imports, and prefer `mode: "append"` when pasting copied blocks into an existing template.
- `list_risup_prompt_snippets` / `read_risup_prompt_snippet` / `save_risup_prompt_snippet` / `insert_risup_prompt_snippet` / `delete_risup_prompt_snippet` add a persistent, sidecar-backed snippet library on top of that serializer. `save_risup_prompt_snippet` can take either existing serializer text or current promptTemplate indices, while `insert_risup_prompt_snippet` reuses append-style insertion with fresh ids and `dry_run`.
- `diff_risup_prompt` compares the active `.risup` preset against a loaded reference `.risup` file using serializer-backed `promptTemplate` line summaries plus `formatingOrder` token/warning diffs. Use it before importing blocks or rewriting order when you need a prompt-specific compare step instead of noisy raw JSON field diffs.
- The risup fallback write surface is not an unrestricted passthrough. `write_field`, `write_field_batch`, and autosave apply the same validation boundary as the UI save path for `promptTemplate`, `formatingOrder`, `presetBias`, and `localStopStrings`. Malformed JSON or unexpected shapes are immediately rejected with a 400 or an autosave failure.

### Autosave / Recovery

- After an abnormal shutdown the app may prompt to restore from an autosave on restart. If the user restores, the file label shows `[Auto-Restored]`, provenance is displayed in the status bar, and a `.toki-recovery.json` sidecar is written alongside the autosave file.
- `session_status` can be called even when no document is open. It reports the current file path/type, renderer dirty/autosave state, pending recovery records, snapshot totals, loaded reference files, and a compact `surfaceSummary` for the active document in a single response. When no main file is loaded but references exist, the summary directs you to `list_references`.

### Preview

- The preview panel displays initialization and runtime diagnostics as inline banners. If the iframe is not ready within 5 seconds a timeout error is shown; runtime errors such as Lua trigger failures appear directly inside the panel. Controller-level Wasmoon preflight (`ensureWasmoon()`) runs outside the preview panel and is not surfaced through these banners.
- Preview is available only for `.charx` files. When a `.risum` or `.risup` file is open, the View menu preview item and the `F5` shortcut are both blocked. Internally, a missing `_fileType` and an explicit `_fileType: 'charx'` are both treated as charx.
- The preview Lua functions `setDescription`, `setPersonality`, `setScenario`, and `setFirstMessage` update preview-local state immediately, so you can verify card-field-changing triggers inside the preview.
- Preview macros keep `{{charpersona}}` and `{{chardesc}}` as distinct fields. `{{charpersona}}` reads from personality; `{{chardesc}}` reads from description.

### MCP Taxonomy

- `src/lib/mcp-tool-taxonomy.ts` is the single source of truth that classifies 120 tools into 19 families. When you add or remove a tool, update this file as well. `mcp-tool-taxonomy.test.ts` enforces bidirectional completeness (no orphans, no phantoms) and behavioral-hint consistency.
- MCP SDK `ToolAnnotations` (readOnlyHint, destructiveHint, idempotentHint, openWorldHint) are automatically patched after registration via `RegisteredTool.update()`.

> For the full error/no-op/success response contract see [`docs/MCP_ERROR_CONTRACT.md`](MCP_ERROR_CONTRACT.md).

---

## 5. Skill Docs

### Start Here

- `read_skill("project-workflow")` — Project onboarding, MCP workflow summary, project rules
- `read_skill("using-mcp-tools")` — Tool selection, large-field editing, batch-first principles
- `read_skill("file-structure-reference")` — `.charx`, `.risum`, `.risup`, lorebook, regex structures
- `read_skill("writing-danbooru-tags")` — Danbooru tag search/validation workflow

### Syntax-Specific Skills

- `read_skill("writing-cbs-syntax")`
- `read_skill("writing-lua-scripts")`
- `read_skill("writing-lorebooks")`
- `read_skill("writing-regex-scripts")`
- `read_skill("writing-html-css")`
- `read_skill("writing-trigger-scripts")`

### Deeper References

- `read_skill("using-mcp-tools", "TOOL_REFERENCE.md")` — Full MCP tool catalog summary
- `read_skill("using-mcp-tools", "FILE_STRUCTURES.md")` — Quick structure pointers

### When the Skills Folder Appears Empty

If `list_skills` returns nothing, the local `skills/` folder may be missing or its symlinks may need repair. Check the following:

1. `npm run sync:skills`
2. The `skills/` directory in the current worktree
3. Symlink state of `.claude/skills`, `.gemini/skills`, `.github/skills`

If it is still empty, fall back to `guides/` and the codebase itself.

`list_skills` returns `name`, `description`, `tags`, `relatedTools`, and `files` metadata for each skill. If you are unsure which guide to read, start with `list_skills` to pick one, then open only the file you need with `read_skill(name, file?)`.
