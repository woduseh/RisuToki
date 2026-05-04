# MCP Workflow Guide

This guide covers tool selection, read rules, workflow patterns, and operational caveats for editing `.charx` / `.risum` / `.risup` files through MCP tools.

For tool-family definitions and boundary rules see [`docs/MCP_TOOL_SURFACE.md`](MCP_TOOL_SURFACE.md).
For error/no-op/success response contracts see [`docs/MCP_ERROR_CONTRACT.md`](MCP_ERROR_CONTRACT.md).

RisuToki MCP has two runtime modes:

- **App-backed mode**: the desktop app starts the local API, auto-writes CLI MCP configs, and tools operate on the active editor document plus loaded references.
- **Standalone mode**: run `node toki-mcp-server.js --standalone [--file <path>] [--ref <path>] [--allow-writes]` to start a file-backed MCP server without Electron. Without `--allow-writes`, mutation tools reject at the confirmation gate while read/probe/search tools remain available.

**Facade-first rule:** for new agent workflows, start with `list_tool_profiles` for compact profile discovery, then `inspect_document`, `read_content`, `search_document`, and `preview_edit` → `apply_edit` when the first-wave selectors cover the task. Use granular families as advanced/legacy escape hatches for unsupported selectors, exact structured editors, external mutations, batch operations, deletes, imports/exports, or compatibility/debugging.

---

## 1. Quick Tool Routing Map

| Category                      | Preferred Tools                                                                                                                                                                                                                                                                                                                                                                                                                                                | When to Use                                                                                                                                                                |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Facade v1**                 | `list_tool_profiles`, `inspect_document`, `read_content`, `search_document`, `preview_edit`, `apply_edit`                                                                                                                                                                                                                                                                                                                                                      | Preferred profile discovery plus bounded first-wave workflows for routed inspect/read/search and preview-token-first active field/surface edits                            |
| **Fields**                    | `list_fields`, `read_field`, `read_field_batch`, `write_field`, `write_field_batch`                                                                                                                                                                                                                                                                                                                                                                            | Advanced granular fallback for exact field payloads, unsupported facade selectors, or compatibility work                                                                   |
| **Large-field editing**       | `search_in_field`, `read_field_range`, `replace_in_field`, `replace_in_field_batch`, `replace_block_in_field`, `insert_in_field`                                                                                                                                                                                                                                                                                                                               | Advanced granular fallback for ranges, inserts, block replacements, batch replacements, or legacy result shapes                                                            |
| **Session state**             | `session_status`, `save_current_file`                                                                                                                                                                                                                                                                                                                                                                                                                          | Advanced runtime diagnostics or explicit saves when `inspect_document` session summaries are not detailed enough                                                           |
| **Surface fallback**          | `list_surfaces`, `read_surface`, `patch_surface`, `replace_in_surface`                                                                                                                                                                                                                                                                                                                                                                                         | Advanced JSON Pointer fallback when `read_content` / `preview_edit` cannot reach the required active-document shape                                                        |
| **External file read/write**  | `inspect_external_file`, `probe_field`, `probe_field_batch`, `probe_lorebook`, `probe_regex`, `probe_lua`, `probe_css`, `probe_greetings`, `probe_triggers`, `probe_risup_prompt_items`, `probe_risup_formating_order`, `external_search_in_field`, `external_read_field_range`, `external_write_field`, `external_write_field_batch`, `external_replace_in_field`, `external_insert_in_field`, `external_read_surface`, `external_patch_surface`, `open_file` | Advanced fallback for unopened-file diagnostics, direct external mutations, probe-specific summaries, or switching the active document when facade routes are insufficient |
| **Lua sections**              | `list_lua`, `read_lua`, `write_lua`, `replace_in_lua`, `insert_in_lua`, `add_lua_section`                                                                                                                                                                                                                                                                                                                                                                      | Read and edit `lua` on a per-section basis                                                                                                                                 |
| **CSS sections**              | `list_css`, `read_css`, `write_css`, `replace_in_css`, `insert_in_css`, `add_css_section`                                                                                                                                                                                                                                                                                                                                                                      | Read and edit `css` on a per-section basis                                                                                                                                 |
| **Lorebook**                  | `list_lorebook`, `read_lorebook`, `read_lorebook_batch`, `write_lorebook`, `write_lorebook_batch`                                                                                                                                                                                                                                                                                                                                                              | Browse, compare, and bulk-edit lorebook entries                                                                                                                            |
| **Regex**                     | `list_regex`, `read_regex`, `read_regex_batch`, `write_regex`, `replace_in_regex`, `add_regex_batch`, `write_regex_batch`                                                                                                                                                                                                                                                                                                                                      | Per-entry regex operations                                                                                                                                                 |
| **Greetings / Triggers**      | `list_greetings`, `read_greeting`, `read_greeting_batch`, `batch_write_greeting`, `list_triggers`, `read_trigger`, `read_trigger_batch`, `write_trigger`                                                                                                                                                                                                                                                                                                       | Edit `alternateGreetings` / `triggerScripts` without looping single reads                                                                                                  |
| **risup prompts**             | `list_risup_prompt_items`, `search_in_risup_prompt_items`, `read_risup_prompt_item_batch`, `read_risup_formating_order`, `diff_risup_prompt`, `export_risup_prompt_to_text`, `list_risup_prompt_snippets`                                                                                                                                                                                                                                                      | Start here for structured `.risup` prompts. From there, follow response `next_actions` into narrower write/import/snippet tools instead of memorizing the whole family.    |
| **References**                | `list_references`, `search_in_reference_field`, `read_reference_field_range`, `list_reference_lorebook`, `read_reference_lorebook_batch`, `list_reference_regex`, `read_reference_regex_batch`, `list_reference_greetings`, `read_reference_greeting_batch`, `list_reference_triggers`, `read_reference_trigger_batch`, `list_reference_risup_prompt_items`, `read_reference_risup_prompt_item_batch`                                                          | Advanced structured/reference fallback after facade reference inspection, reads, or search are insufficient.                                                               |
| **Assets**                    | `list_charx_assets`, `read_charx_asset`, `add_charx_asset`, `list_risum_assets`, `read_risum_asset`, `compress_assets_webp`                                                                                                                                                                                                                                                                                                                                    | Inspect, add, or compress image/audio assets                                                                                                                               |
| **Danbooru / CBS validation** | `validate_danbooru_tags`, `search_danbooru_tags`, `get_popular_danbooru_tags`, `validate_cbs`, `list_cbs_toggles`, `simulate_cbs`, `diff_cbs`                                                                                                                                                                                                                                                                                                                  | Clean up image-prompt tags, validate CBS syntax                                                                                                                            |
| **Skill docs**                | `list_skills`, `read_skill`                                                                                                                                                                                                                                                                                                                                                                                                                                    | On-demand loading of workflow, file-structure, CBS/Lua/lorebook/regex/Danbooru guides                                                                                      |

---

## 2. Critical Don'ts

- Do **not** default to granular tools when a first-wave facade route covers the inspect/read/search/preview/apply workflow.
- Do **not** call `apply_edit` without a matching `preview_edit` token and `operation_digest`.
- Do **not** use `read_field` / `write_field` on surfaces that already have dedicated section/item tools.
- Do **not** use `replace_in_field` as a search tool; use `search_in_field`.
- Do **not** loop single-item reads when a batch reader already exists.
- Do **not** loop single-item writes when a batch tool exists.
- Prefer response `next_actions` over guessing: high-traffic tools such as `open_file`, `read_field`, `search_in_field`, `read_reference_field`, and batch risup prompt tools may narrow the family defaults.
- When several tools fit, call `list_tool_profiles` for a compact profile catalog (default `facade-first`, escape hatch `advanced-full`) or inspect tool `_meta` from `tools/list`: `risutoki/profiles` and `risutoki/defaultProfile=facade-first` define the profile/catalog contract, `risutoki/supportsDryRun=true` means a preview-first path exists, and `risutoki/requiresConfirmation=true` means the tool will pause on approval.

---

## 3. Read Rules

- **Start facade-first for bounded reads/searches.** Use `inspect_document` for session/external/reference preflight, `read_content` for bounded active/external/reference field or surface content, and `search_document` for active/external/reference text search.
- **Use granular readers only when the facade cannot express the task or when exact structured/editor payloads matter.**
- **Do not use `read_field` on the following fields.** They dump the entire content and waste context.
  - `lua` → `list_lua` → `read_lua(index)`
  - `css` → `list_css` → `read_css(index)`
  - `alternateGreetings` → `list_greetings("alternate")` → `read_greeting("alternate", index)` / `read_greeting_batch("alternate", indices)`
  - `triggerScripts` → `list_triggers` → `read_trigger(index)` / `read_trigger_batch(indices)`
  - `promptTemplate` / `formatingOrder` → `list_risup_prompt_items` / `search_in_risup_prompt_items` / `read_risup_prompt_item` / `read_risup_prompt_item_batch` / `export_risup_prompt_to_text` / `copy_risup_prompt_items_as_text` / `diff_risup_prompt` / `list_risup_prompt_snippets` / `read_risup_prompt_snippet` / `read_risup_formating_order`
- Read lorebook entries through `list_lorebook(folder?)` → `read_lorebook(index)` when you need the structured lorebook editor; otherwise prefer bounded `read_content` selectors for covered flat field reads.
- Read regex entries through `list_regex` → `read_regex(index)` / `read_regex_batch(indices)` when you need structured regex entries.
- The same applies to references. Prefer facade `inspect_document` / `read_content` / `search_document` for covered reference preflight, field reads, and text search; switch to `list_reference_*` / `read_reference_*_batch` for structured reference entries or exact legacy result shapes.
- In a reference-only session, start with `inspect_document` targeting the session/reference when available; use `list_references` or `session_status` only for full legacy inventories or runtime diagnostics.
- For large reference text fields, prefer `search_document` or `read_content` bounds first; use `search_in_reference_field` / `read_reference_field_range` when you need the granular result shape.
- Use `read_field_batch([...])` only when you need exact legacy batch payloads for several small fields at once.
- **Read unopened files with `inspect_document` / `read_content` first when covered.** Use `inspect_external_file` + `probe_*` for probe-specific summaries and `external_*` for direct path-based edits. Switch the active document with `open_file` only when you specifically need the live session-coupled edit families.
- If the syntax or structure is unclear, read the relevant skill doc before making any changes.

---

## 4. Effective Workflows

### Standard Sequence

1. **Inspect/routability first** — Use `inspect_document` for active/session, external, reference, or guidance preflight when the target fits the facade contract.
2. **Read/search through the facade** — Use `read_content` and `search_document` with bounded selectors before reaching for legacy field/search/probe routes.
3. **Choose a fallback only with a reason** — Switch to granular list/read/search tools for structured item editors, unsupported selectors, exact legacy response shapes, or broad batch workflows.
4. **Preview before apply** — For covered active field/surface edits, call `preview_edit`, carry returned guards/tokens, then call `apply_edit`.
5. **Use granular mutation families for gaps** — Inserts, block replacements, external mutations, deletes, imports/exports, assets, and structured item edits remain granular.
6. **Validate** — Confirm results with facade follow-up reads, structured validators, reference comparison, or preview.

### Quick-Selection by Situation

**When you want to inspect field contents**

- Current session/document state → `inspect_document` (`target.kind="session"` or `active`); use `session_status` for full runtime diagnostics.
- Bounded active/external/reference field or surface content → `read_content`.
- File not open, identified by absolute path → `inspect_document` / `read_content` with `target.kind="external"`; use `inspect_external_file` / `probe_*` for probe-specific summaries.
- Find a specific string → `search_document`; use granular `search_in_field` / `external_search_in_field` / `search_in_reference_field` only for exact legacy result shapes.
- Inspect a specific position in a large field → `read_content` bounds first; use `read_field_range` when granular range semantics are required.
- Export the entire field to a local file → `export_field_to_file` (granular/open-world fallback).

**When you want to modify field contents**

- Covered active field write/replace or active surface patch → `preview_edit` → `apply_edit` with the returned `preview_token`, `operation_digest`, and guard values.
- File not yet open but current UI document must stay unchanged → granular `external_write_field` / `external_write_field_batch` / `external_replace_in_field` / `external_insert_in_field` / `external_read_surface` / `external_patch_surface`.
- Specialized active-document tool cannot reach the required content and facade selectors do not cover it → `list_surfaces` → `read_surface` → `patch_surface` or `replace_in_surface` with `dry_run` first when practical.
- File not yet open and you want the full active-document editing surface → switch with `open_file(file_path=...)`, then use facade or granular active-document tools.
- Small field legacy compatibility → `read_field` → `write_field`.
- Single substitution in a large field outside facade scope → `search_in_field` → `replace_in_field`.
- Multiple substitutions in a large field → `replace_in_field_batch`.
- Anchor-based block replacement → `replace_block_in_field`.

**When working with multiple lorebook entries**

- Read → `read_lorebook_batch`
- Write → `write_lorebook_batch`
- Stale-index safety → reuse each entry's current `comment` as `expected_comment` (or `expected_comments` for `batch_delete_lorebook`)
- Bulk name/phrase replacement → `replace_across_all_lorebook`
- Preview multi-entry replacements → `replace_in_lorebook_batch(dry_run=true)`
- Key quality check → `validate_lorebook_keys`

**When comparing against references**

- Covered reference preflight/read/search → `inspect_document` / `read_content` / `search_document`.
- Most efficient lorebook comparison → `diff_lorebook`.
- Structured manual comparison → `list_reference_*` → `read_reference_*`.
- Narrow large reference text with legacy result shape → `search_in_reference_field` / `read_reference_field_range`.
- Reference-only session (no main file) → `inspect_document` first; use `session_status` or `list_references` for full legacy inventories → all `*_reference_*` tools.

**When you need a safety net**

- Check dirty/autosave/recovery state before resuming → `inspect_document` for facade summary; `session_status` for full diagnostics.
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
- `external_write_field`, `external_write_field_batch`, `external_replace_in_field`, `external_insert_in_field`, and `external_patch_surface` also trigger confirmation and reject targets that are already the active UI document.
- `patch_surface` and `external_patch_surface` accept JSON Patch `add` / `replace` / `remove` operations. Prefer dedicated structured tools first; use these only for unsupported shapes or broad cross-surface fixes, and carry the document-level `expected_hash` when retrying after `list_surfaces` or a root surface read.
- `list_tool_profiles` exposes the on-demand compact profile catalog; use it to apply the `facade-first` default, `authoring`, `advanced-full` / aliases `advanced` and `full`, or `readonly` without asking the MCP server to hide tools from `tools/list`. `tools/list` remains unfiltered for compatibility and still exposes additive `_meta`; use `risutoki/profiles`, `risutoki/surfaceKind`, `risutoki/recommendation`, `risutoki/requiresConfirmation`, and `risutoki/supportsDryRun` when a client cannot call the catalog facade or needs exact legacy discovery.
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
- `validate_risup_prompt_import` verifies that an import text matches the current `promptTemplate` content by comparing serialized item blocks with ID normalization. Call it immediately after `import_risup_prompt_from_text` with the same source text to catch silent mismatches from ID renormalization, content truncation, or unsupported item coercion.
- `batch_delete_risup_prompt_items` deletes multiple prompt items in one confirmed operation. It accepts `indices`, optional `expected_types` / `expected_previews` arrays (aligned with `indices` order), and uses `Set`-based filtering for deletion. Prefer it over repeated `delete_risup_prompt_item` calls.
- `add_risup_prompt_item` and `add_risup_prompt_item_batch` accept an optional `insertAt` parameter for positional insertion (0-based, `0 <= insertAt <= items.length`), matching the pattern from `insert_risup_prompt_snippet`.
- The risup fallback write surface is not an unrestricted passthrough. `write_field`, `write_field_batch`, and autosave apply the same validation boundary as the UI save path for `promptTemplate`, `formatingOrder`, `presetBias`, and `localStopStrings`. Malformed JSON or unexpected shapes are immediately rejected with a 400 or an autosave failure.

### Autosave / Recovery

- After an abnormal shutdown the app may prompt to restore from an autosave on restart. If the user restores, the file label shows `[Auto-Restored]`, provenance is displayed in the status bar, and a `.toki-recovery.json` sidecar is written alongside the autosave file.
- `session_status` can be called even when no document is open. It reports the current file path/type, renderer dirty/autosave state, pending recovery records, snapshot totals, loaded reference files, lightweight stat-based integrity metadata (`mtimeMs`/`size` plus unavailable reasons), reference-manifest status when available, and a compact `surfaceSummary` for the active document in a single response. When no main file is loaded but references exist, the summary directs you to `list_references`.

### Preview

- The preview panel displays initialization and runtime diagnostics as inline banners. If the iframe is not ready within 5 seconds a timeout error is shown; runtime errors such as Lua trigger failures appear directly inside the panel. Controller-level Wasmoon preflight (`ensureWasmoon()`) runs outside the preview panel and is not surfaced through these banners.
- Preview is available only for `.charx` files. When a `.risum` or `.risup` file is open, the View menu preview item and the `F5` shortcut are both blocked. Internally, a missing `_fileType` and an explicit `_fileType: 'charx'` are both treated as charx.
- Preview message rendering now supports richer markdown (`#` headings, ordered/unordered lists, links, strikethrough, horizontal rules) plus a wider safe structural-HTML allowlist (`h1-h6`, `ul/ol/li`, `details/summary`, `figure`, `section/article`, `u`, `sub`, `sup`, etc.). Messages still render inside the existing sandbox/CSP boundary, and inline styles remain narrowly restricted.
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

### Skill Discovery Scope

RisuToki's generated unified skill catalog is **repo-root scoped**. Copilot CLI, Claude Code, and Gemini CLI resolve project skills from the repository-root `.github/skills`, `.claude/skills`, and `.gemini/skills` discovery paths. Codex resolves project skills through `.agents/skills`; Codex itself can scan that directory from the current working directory up to the repository root, but this repo provisions only a generated repository-root `.agents/skills` path after `npm run sync:skills` (or `npm install`, via `prepare`). Nested skill directories placed inside subdirectories do not create subtree-specific catalogs in this repo — `list_skills` always returns the same repo-wide set regardless of the agent's working directory. Subtree scoping is handled by `AGENTS.md` routing: the nearest `risu/{scope}/AGENTS.md` decides which skills from the global catalog are relevant.

### When the Skills Folder Appears Empty

If `list_skills` returns nothing, the generated CLI catalog may need repair. Check the following:

1. `npm run sync:skills`
2. The source skill roots that feed the catalog: `skills/`, `risu/common/skills/`, `risu/{bot,prompts,modules,plugins}/skills/`
3. The generated `.copilot-skill-catalog/`
4. Symlink/junction or managed-directory state of `.agents/skills`, `.claude/skills`, `.gemini/skills`, `.github/skills`

If it is still empty, fall back to `docs/`, the local `risu/{artifact}/README.md` / `AGENTS.md`, and the codebase itself.

`list_skills` returns `name`, `description`, `tags`, `relatedTools`, and `files` metadata for each skill. If you are unsure which guide to read, start with `list_skills` to pick one, then open only the file you need with `read_skill(name, file?)`.
