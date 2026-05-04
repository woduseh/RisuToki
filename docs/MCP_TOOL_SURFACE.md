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
- High-traffic tools may return narrower per-tool `next_actions` than the family default; trust the response metadata first, then fall back to the family map when no override is present.
- `tools/list` exposes additive per-tool `_meta` for agent planning: every tool includes `risutoki/family`, legacy `risutoki/staleGuards`, and structured `risutoki/staleGuardDetails`; mutation-capable tools also include `risutoki/requiresConfirmation` and `risutoki/supportsDryRun`. Use these to choose family-specific workflows, carry stale guards, prefer preview-first routes when available, and anticipate approval pauses before mutating.
- `tools/list` also exposes additive taxonomy preference/profile metadata: granular tools use `risutoki/surfaceKind=granular` and `risutoki/recommendation=advanced`; implemented facade/catalog tools use `surfaceKind=facade` and `recommendation=preferred`; every tool reports `risutoki/profiles` plus `risutoki/defaultProfile=facade-first`. No existing granular tool is removed or renamed by facade v1.
- `risutoki/staleGuardDetails` describes each guard with `name`, `payloadPath`, `sourceOperations`, `sourceResultPath`, retry guidance, and (for aligned batch arrays or nested batch payloads) `alignedWithPath`. Prefer this structured metadata over guessing from the flat guard-name list; keep using `risutoki/staleGuards` only for backward-compatible clients.
- Indexed mutation tools now accept additive stale-index guards across the structured families: carry the latest `comment` into `expected_comment` for lorebook/regex/trigger writes, the latest `preview` into `expected_preview` or `expected_previews` for greeting writes/deletes, and the latest `type` / `preview` into `expected_type` / `expected_preview` for risup prompt-item writes. Mismatches fail with `409` plus family-specific `details.expected_*` / `details.actual_*` fields instead of silently touching the wrong entry.
- The same tool surface can run app-backed or standalone. In standalone mode (`toki-mcp-server.js --standalone`), the active document is file-backed via `--file`/`open_file`, references come from repeated `--ref`, and mutation routes require `--allow-writes`.

## Tool surface profile contract

The executable profile contract lives in `src/lib/mcp-tool-taxonomy.ts`. RisuToki uses an on-demand catalog facade instead of MCP `tools/list` filtering because not all clients can safely request alternate lists or recover from a filtered catalog. Call `list_tool_profiles` for a compact profile-specific catalog, and keep `tools/list` unfiltered so fallback/legacy tools remain reachable.

| Profile         | Default | Included categories                                                                                                                                                              | Excluded / restricted categories                                                                                       | Escape hatch / discovery                                                                                                                   |
| --------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `facade-first`  | Yes     | Implemented facade/catalog tools: `inspect_document`, `list_tool_profiles`, `read_content`, `search_document`, `preview_edit`, `apply_edit`, `validate_content`, `load_guidance` | `tools/list` remains unfiltered; the compact catalog omits granular routes unless the client requests `advanced-full`. | Use `advanced-full` when the facade cannot express the target, selector, operation, bounds, response detail, or compatibility requirement. |
| `authoring`     | No      | Facade tools plus field/surface/search, structured authoring families, reference/skill/CBS/Danbooru guidance                                                                     | Direct external mutation, session/file-open controls, snapshots, imports/exports, and broad administrative workflows.  | Use `advanced-full` for direct file/session administration or unsupported authoring shapes.                                                |
| `advanced-full` | No      | All registered tools, all granular fallback tools, and legacy compatibility routes                                                                                               | None.                                                                                                                  | Canonical legacy escape hatch; aliases `advanced` and `full` resolve here.                                                                 |
| `readonly`      | No      | Only tools with `readOnlyHint=true`, including the read-only first-wave facade tools                                                                                             | `preview_edit`, `apply_edit`, every mutating/destructive tool, and session/file-open mutations.                        | Request `advanced-full` only after leaving read-only mode intentionally.                                                                   |

Client request/discovery rules:

1. Profile names are stable strings: `facade-first`, `authoring`, `advanced-full`, and `readonly`; `advanced` / `full` are aliases for `advanced-full`.
2. The default is `facade-first` for planning and prompt guidance, but `tools/list` still returns the full tool catalog for compatibility.
3. Profile membership is discoverable per tool through `_meta['risutoki/profiles']`; `_meta['risutoki/defaultProfile']` tells clients the default planning profile.
4. Preferred low-context path: call `list_tool_profiles` with `profile="facade-first"` (or `authoring`/`readonly`) and use the returned names for planning. Request `profile="advanced-full"` or alias `advanced`/`full` when a granular escape hatch is needed.
5. If a client cannot call `list_tool_profiles`, it can still use the metadata fallback: keep the full `tools/list`, sort/prefer tools in the requested profile from `_meta`, and use `advanced-full` as the documented escape hatch.
6. Any future server-side filtering must preserve the `readonly` restriction (`readOnlyHint=true` only) and must make `advanced-full` available before hiding granular tools from `facade-first`.

## Facade implementation status

Facade v1 now has a focused implementation for `inspect_document`, `list_tool_profiles`, `read_content`, `search_document`, `preview_edit`, `apply_edit`, `validate_content`, and `load_guidance`. These tools compose existing HTTP routes (except `list_tool_profiles`, which is taxonomy-only) and report routed_legacy, touched_targets, guard values/previews where applicable, and facade `next_actions`. Granular tools remain available as advanced routes for precise/manual workflows and unsupported facade cases.

### First-wave facade replacement matrix

Use this table when migrating prompts, agent recipes, or eval fixtures away from legacy/granular routing. The replacement is intentionally facade-first, not facade-only: if a row names a gap or precision case, keep the granular route until facade parity is explicit.

| Legacy/granular family or workflow                                                 | Preferred first-wave facade route                                    | Parity status                                                   | Keep granular route when                                                                                                 |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `session_status` before reads/writes                                               | `inspect_document` with `target.kind="session"`                      | Implemented for session overview and no-file-open routing.      | You need exact dirty-field, autosave, recovery, or runtime fields not surfaced by the facade summary.                    |
| `inspect_external_file` preflight                                                  | `inspect_document` with `target.kind="external"`                     | Implemented for unopened file inspection.                       | You need the original external-file response shape for debugging or compatibility.                                       |
| `list_references` discovery                                                        | `inspect_document` with `target.kind="reference"`                    | Implemented for bounded reference inspection.                   | You need the full legacy reference list or exact reference identifiers before a specialized reference read.              |
| `list_fields`, `read_field`, `read_field_batch`, `read_field_range`                | `read_content` selectors against active fields                       | Implemented for bounded active field reads.                     | You need field stats/export, exact batch payload compatibility, or a structured family should be used instead.           |
| `list_surfaces`, `read_surface`                                                    | `read_content` selectors against active surfaces                     | Implemented for bounded active surface reads.                   | You need unsupported JSON Pointer shapes, root hashes, or surface-debug payloads beyond facade bounds.                   |
| `probe_field`, `probe_field_batch`, `external_read_field_range`                    | `read_content` selectors against external fields                     | Implemented for bounded unopened-file field reads.              | You need probe-specific summaries, external writes, or unsupported external content shapes.                              |
| `external_read_surface`                                                            | `read_content` selectors against external surfaces                   | Implemented for bounded unopened-file surface reads.            | You need hash-level surface debugging or unsupported external JSON Pointer operations.                                   |
| `read_reference_field`, `read_reference_field_batch`, `read_reference_field_range` | `read_content` selectors against reference fields                    | Implemented for first-wave reference field reads.               | You need reference lorebook/regex/Lua/CSS/greeting/trigger/risup item structure; use dedicated `read_reference_*` tools. |
| `search_all_fields`, `search_in_field`                                             | `search_document` with `target.kind="active"`                        | Implemented for active-document search.                         | You need legacy result shape compatibility or a narrow structured-family search that the facade does not expose.         |
| `external_search_in_field`                                                         | `search_document` with `target.kind="external"` and field selector   | Implemented for external field search.                          | You need external-family diagnostics or unsupported file/search scopes.                                                  |
| `search_in_reference_field`                                                        | `search_document` with `target.kind="reference"` and field selector  | Implemented for reference field search.                         | You need specialized reference item searches rather than flat field text.                                                |
| `replace_in_field`, `write_field` on active fields                                 | `preview_edit` then `apply_edit` for active field operations         | Implemented for preview-token-first active field write/replace. | You need insert/block replace, batch field writes, snapshots, or exact legacy write semantics.                           |
| `patch_surface` on active surfaces                                                 | `preview_edit` then `apply_edit` for active surface patch operations | Implemented for preview-token-first active surface patch.       | You need `replace_in_surface`, cross-surface workflows, root-hash diagnostics, or unsupported patch shapes.              |

### Legacy and advanced use criteria

Agents should still choose granular tools when one of these criteria is true:

1. **Escape hatch:** the facade cannot express the target, selector, operation, bounds, or response detail needed for the task.
2. **Exact structured editor:** lorebook, regex, greetings, triggers, Lua/CSS sections, risup prompt items, assets, CBS, snippets, imports/exports, and reference item readers still require their dedicated families unless the facade row above explicitly covers the case.
3. **Unsupported facade operation:** facade edits cover active field write/replace, active surface patch, and unopened external field write/replace. Inserts, block replacements, batch item writes, deletes, asset compression, external surface patches, and item/file management stay granular.
4. **Debugging and compatibility:** use granular tools to reproduce legacy client behavior, inspect raw stale guards/hashes, compare payloads during parity work, or keep older automation stable during the compatibility window.

### Deprecation stages and compatibility window

| Stage                               | Metadata/profile signal                                                                                                                                                       | Agent behavior                                                                                          | Removal readiness                                                                                                              |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Stage 0 — additive facade (current) | Facade tools advertise `risutoki/surfaceKind=facade` and `risutoki/recommendation=preferred`; granular tools default to `surfaceKind=granular` and `recommendation=advanced`. | Prefer first-wave facade rows for new workflows; keep granular routes for criteria above.               | Not removable. Granular tools are required for unsupported operations and backward compatibility.                              |
| Stage 1 — soft legacy               | Covered granular routes may move from `recommendation=advanced` to `recommendation=legacy` after parity evidence exists.                                                      | New prompts should avoid legacy-covered routes unless a legacy-use criterion is documented in the task. | Only routes with facade parity, eval coverage, and migration docs can be marked soft legacy.                                   |
| Stage 2 — warning window            | Tool descriptions or metadata may emit deprecation hints while tools still function.                                                                                          | Clients should log/update workflows and keep fallback tests until replacements are verified.            | Requires at least one release cycle with warnings and no uncovered first-party usage.                                          |
| Stage 3 — removal candidate         | Covered routes are no longer required by first-party docs, skills, evals, or smoke tests.                                                                                     | Use facade only, except for explicitly retained advanced tools outside the covered matrix.              | Removal requires coordinator approval, changelog/release notes, migration notes, and passing full MCP/doc-drift/eval coverage. |

No first-wave granular tool is currently scheduled for removal. Treat this as a migration guide and future fade-out checklist, not as a breaking-change announcement.

### Parity status, known gaps, and coverage references

- **Implemented parity:** first-wave read/search/preview/apply routes compose existing HTTP routes and report routed_legacy, touched_targets, guard values/previews, facade bounds/truncation metadata, and facade `next_actions`.
- **Known gaps:** `validate_content` is intentionally limited to active lorebook key validation, `load_guidance` covers skill catalog/document reads only, and item management (`manage_items`), asset management (`manage_assets`), file management (`manage_file`), structured item editors, deletes, imports/exports, external surface patches, and broad batch operations remain outside facade scope.
- **Test/eval references:** request-shape contract coverage lives in `src/lib/mcp-request-schemas.test.ts`; taxonomy/profile metadata and agent eval fixture coverage live in `src/lib/mcp-tool-taxonomy.test.ts`; doc/tool drift guards live in `src/lib/doc-drift.test.ts`; runtime MCP facade smoke coverage lives in `test/test-mcp-search-all.ts`.
- **Safe fade-out tracking:** before marking a granular route legacy or removal-candidate, add or update parity tests that compare facade output with the legacy route, keep stale-guard/dry-run coverage, update this matrix, update `skills/using-mcp-tools/SKILL.md`, regenerate skill copies, and run targeted doc-drift/taxonomy/MCP smoke tests.

Agent eval coverage still keeps comparison fixtures for the earlier proposed compact names `mcp_session`, `mcp_read`, and `mcp_edit`; those names remain fixtures only and are not registered MCP tools:

| Scenario                          | Current granular baseline                                                                                       | Proposed future facade target                                     | Metrics captured                                                               |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Active/external/reference routing | `session_status`, active reads, `inspect_external_file` / `external_*`, `list_references` / `read_reference_*`  | `mcp_read` with explicit active/external/reference target routing | Tool-list byte cost, call count, wrong-tool avoidance, final artifact equality |
| Batch vs single edit choice       | `list_lorebook` → `replace_in_lorebook_batch` → `read_lorebook_batch`                                           | `mcp_edit` batch plan/apply/verify                                | Call count, wrong-tool avoidance, final artifact equality                      |
| Stale-guard refresh/retry         | Guarded write returns `409`, refreshes through `staleGuardDetails.sourceOperations`, retries with current guard | `mcp_edit` guarded write with facade-managed refresh/retry        | Call count, stale recovery, final artifact equality                            |
| Dry-run-first destructive edit    | `compress_assets_webp` with `dry_run: true`, then apply, then verify assets                                     | `mcp_edit` preview-required apply flow                            | Call count, dry-run compliance, final artifact equality                        |
| No-file-open workflow             | `session_status` / `list_references` before `open_file`, then active reads                                      | `mcp_session` no-file-open recovery plus routed read              | Call count, wrong-tool avoidance, final artifact equality                      |

The executable fixture lives in `src/lib/mcp-tool-taxonomy.test.ts` under `agent eval: facade-first baseline fixtures`; real MCP client smoke coverage for facade visibility, read-only routing, and preview/apply lives in `test/test-mcp-search-all.ts`.

## Additive facade v1 public contract

Facade v1 is a **new preferred layer** over the existing granular surface. It is additive: existing tools stay available as advanced granular routes for precise/manual workflows and backward-compatible clients.

The executable contract lives in `src/lib/mcp-request-schemas.ts` and `src/lib/mcp-request-schemas.test.ts`.

### Implemented facade tools

| Tool               | Mutability | Purpose                                                                                                                                                         |
| ------------------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `inspect_document` | read-only  | **Implemented.** Summarize active/session, external, reference, or guidance targets before choosing a route.                                                    |
| `read_content`     | read-only  | **Implemented.** Read bounded field/surface content through explicit selectors (active/external field+surface, reference fields in first wave).                 |
| `search_document`  | read-only  | **Implemented.** Search active documents, or a specified external/reference field.                                                                              |
| `preview_edit`     | preview    | **Implemented.** Produce a dry-run/read-only preview token for active/external field replace/write and active surface patch operations.                         |
| `apply_edit`       | mutating   | **Implemented.** Apply a prior `preview_edit` by `preview_token` + `operation_digest`, carrying guard values forward.                                           |
| `validate_content` | read-only  | **Implemented (focused second wave).** Validates active-document lorebook key hygiene by routing to `validate_lorebook_keys`; other validators remain granular. |
| `load_guidance`    | read-only  | **Implemented (focused second wave).** Loads the skill catalog or a specific skill document by routing to `list_skills` / `read_skill`.                         |

Future facade candidates are documented but not part of first-wave v1: `manage_items`, `manage_assets`, and `manage_file`.

### Target discriminators

Every facade request uses an explicit `target.kind` discriminator:

- `active` — the current editor document.
- `external` — an unopened file by `file_path`.
- `reference` — a loaded reference by `reference_id` or `file_path`; read-only.
- `guidance` — skill/docs material by `skill` or `document`; read-only.
- `session` — current MCP/editor session state.

### Preview and guard flow

Mutations are preview-token-first:

1. `preview_edit` accepts bounded `operations[]`, returns a `facade-preview-v1.*` `preview_token`, an `operation_digest`, and `required_guards`.
2. `apply_edit` requires the preview token, operation digest, target, and current guard values.
3. Guard metadata must be propagated from granular `risutoki/staleGuardDetails` into preview/apply plans. Stale apply attempts should fail with the existing structured `409` recovery pattern and refresh from `sourceOperations`.

### Envelope and bounds

Facade success responses use the additive envelope shape: `status: 200`, `summary`, `next_actions`, `artifacts.byte_size`, and a `facade` object containing `contract: "risutoki.facade.v1"`, `version: "v1"`, `tool`, `mutability`, target metadata, and truncation/bounds metadata. Responses preserve existing top-level payload compatibility and add facade metadata rather than wrapping everything under `data`.

First-wave requests are bounded by contract: at most 50 selectors/operations/guard entries, at most 100 search matches, and `max_bytes <= 65536`. Truncated responses must say so in facade metadata and guide agents to narrower follow-up reads.

## Family map

The family sections below describe the underlying granular tool surface. For first-wave inspect/read/search/preview/apply cases, route through the facade replacement matrix above first; use these families when a granular advanced/legacy criterion applies.

### `field`

- **Use when:** advanced/legacy fallback for reading or editing scalar/live document fields on the active file when `read_content` or `preview_edit` / `apply_edit` are not sufficient
- **Tools:** `list_fields`, `read_field`, `read_field_batch`, `write_field`, `write_field_batch`, `replace_in_field`, `replace_in_field_batch`, `replace_block_in_field`, `insert_in_field`, `read_field_range`, `get_field_stats`, `export_field_to_file`
- **Hints:** RO/idempotent reads; write mutations for write/replace/insert; `export_field_to_file` is open-world
- **Next actions:** `list_fields`, `read_field`, `search_in_field`, `write_field`
- **Boundary:** use `search` to discover where text lives, `probe` for unopened files, and the specialized `lua`, `css`, `greeting`, `trigger`, and `risup-prompt` families instead of dumping those surfaces through `read_field`
- **No-op coverage:** no-match, anchor-miss, and zero-match batch replace paths use `mcpNoOp()`

### `search`

- **Use when:** advanced/legacy fallback for locating text before deciding what to read or edit when `search_document` cannot provide the needed selector or result shape
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

- **Use when:** advanced runtime diagnostics for the current document, dirty/autosave state, recovery status, lightweight stat-based integrity metadata, snapshot totals, and compact structured-surface counts when `inspect_document` is not detailed enough
- **Tools:** `session_status`, `save_current_file`
- **Hints:** `session_status` is RO/idempotent; `save_current_file` writes the current document to disk
- **Next actions:** `session_status`, `open_file`, `list_snapshots`
- **Boundary:** this family reports editor/runtime state rather than document content and remains available even when no file is open; use `integrity.activeFile` / `integrity.references` `mtimeMs`, `size`, and unavailable reasons to detect outside file changes before retrying, and use the returned `surfaceSummary` to decide whether follow-up `list_*` reads are needed

### `surface`

- **Use when:** advanced JSON Pointer fallback when facade selectors and specialized families cannot reach the needed `.charx`, `.risum`, or `.risup` content on the active document
- **Tools:** `list_surfaces`, `read_surface`, `patch_surface`, `replace_in_surface`
- **Hints:** list/read are RO/idempotent; patch/replace mutate with confirmation and support `dry_run`
- **Next actions:** `list_surfaces`, `read_surface`, `patch_surface`, `replace_in_surface`
- **Boundary:** prefer specialized tools for lorebook, regex, greetings, triggers, Lua/CSS, assets, and risup prompt items. Use `patch_surface` for unsupported shapes or cross-surface edits, carrying the document-level `expected_hash` from `list_surfaces` or root `read_surface` when stale-write protection matters.

### `probe`

- **Use when:** advanced read-only probes or active-document switching for unopened `.charx`, `.risum`, or `.risup` files by absolute path when facade external targets are insufficient
- **Tools:** `probe_field`, `probe_field_batch`, `probe_lorebook`, `probe_regex`, `probe_lua`, `probe_css`, `probe_greetings`, `probe_triggers`, `probe_risup_prompt_items`, `probe_risup_formating_order`, `open_file`
- **Hints:** probes are RO/idempotent; `open_file` mutates the active document state
- **Next actions:** `open_file`, `probe_field`, `probe_lorebook`
- **Boundary:** prefer this family when the file is not already open and you only need read-only access; once opened, switch back to the live document families

### `external`

- **Use when:** advanced direct-path inspection or mutation of unopened `.charx`, `.risum`, or `.risup` files **without** switching the active UI document, especially for external writes not covered by facade v1
- **Tools:** `inspect_external_file`, `external_search_in_field`, `external_read_field_range`, `external_write_field`, `external_write_field_batch`, `external_replace_in_field`, `external_insert_in_field`, `external_read_surface`, `external_patch_surface`
- **Hints:** inspect/search/range/surface-read are RO/open-world; write/replace/insert/surface-patch routes are open-world writes with confirmation, and replace/surface-patch routes support `dry_run`
- **Next actions:** `inspect_external_file`, `probe_field`, `external_search_in_field`, `external_write_field`
- **Boundary:** this family intentionally bypasses the active editor session. If the target file is already the active UI document, these routes reject and you must use the existing active-document tools instead

### `lorebook`

- **Use when:** reading, editing, validating, cloning, or diffing lorebook entries in the active document
- **Tools:** `list_lorebook`, `read_lorebook`, `read_lorebook_batch`, `write_lorebook`, `write_lorebook_batch`, `add_lorebook`, `add_lorebook_batch`, `delete_lorebook`, `batch_delete_lorebook`, `clone_lorebook`, `replace_in_lorebook`, `replace_in_lorebook_batch`, `replace_block_in_lorebook`, `insert_in_lorebook`, `insert_in_lorebook_batch`, `replace_across_all_lorebook`, `diff_lorebook`, `validate_lorebook_keys`
- **Hints:** reads are RO/idempotent; adds/writes/clones mutate; deletes are destructive
- **Next actions:** `list_lorebook`, `read_lorebook`, `write_lorebook`, `validate_lorebook_keys`
- **Boundary:** use `reference` for read-only comparison against reference files and `lorebook-io` for filesystem import/export
- **No-op coverage:** no-match, anchor-miss, zero-active batch replace, and batch-insert item error paths use `mcpNoOp()`
- **Guard coverage:** lorebook indexed mutation tools support optional `expected_comment` stale-index protection; `batch_delete_lorebook` uses aligned `expected_comments`, and `replace_in_lorebook_batch` also supports `dry_run`
- **Batch result shape:** lorebook batch mutation success routes include per-item `results[]` alongside legacy fields such as `entries` and `count` so agents can verify outcomes without an immediate re-read

### `lorebook-io`

- **Use when:** importing lorebook entries from files or exporting them to files
- **Tools:** `export_lorebook_to_files`, `import_lorebook_from_files`
- **Hints:** open-world write
- **Next actions:** `list_lorebook`, `export_lorebook_to_files`, `import_lorebook_from_files`
- **Boundary:** use `lorebook` for in-editor entry edits; this family is for filesystem exchange

### `regex`

- **Use when:** reading or editing regex entries on the active document
- **Tools:** `list_regex`, `read_regex`, `read_regex_batch`, `write_regex`, `write_regex_batch`, `add_regex`, `add_regex_batch`, `delete_regex`, `replace_in_regex`, `insert_in_regex`
- **Hints:** reads are RO/idempotent; writes/adds mutate; deletes are destructive
- **Next actions:** `list_regex`, `read_regex`, `write_regex`
- **Boundary:** use `reference` for read-only comparison against reference files; use `field` only for generic top-level card fields
- **No-op coverage:** no-match replace and anchor-miss insert paths use `mcpNoOp()`
- **Guard coverage:** regex indexed mutation tools support optional `expected_comment` stale-index protection
- **Batch result shape:** `write_regex_batch` success payloads include per-item `results[]` alongside legacy `entries`

### `greeting`

- **Use when:** managing alternate or grouped greeting arrays
- **Tools:** `list_greetings`, `read_greeting`, `read_greeting_batch`, `write_greeting`, `add_greeting`, `delete_greeting`, `batch_delete_greeting`, `batch_write_greeting`, `reorder_greetings`
- **Hints:** reads are RO/idempotent; writes/adds/reorders mutate; deletes are destructive
- **Next actions:** `list_greetings`, `read_greeting`, `write_greeting`
- **Boundary:** do not treat greeting arrays as generic fields; this family exists to avoid dumping and rewriting raw arrays
- **Guard coverage:** greeting indexed mutation tools support preview-based guards via `expected_preview`; `batch_delete_greeting` uses aligned `expected_previews`
- **Batch result shape:** `batch_write_greeting` and `batch_delete_greeting` success payloads include per-item `results[]`

### `trigger`

- **Use when:** reading or editing trigger scripts individually or in small batches
- **Tools:** `list_triggers`, `read_trigger`, `read_trigger_batch`, `write_trigger`, `add_trigger`, `delete_trigger`
- **Hints:** reads are RO/idempotent; writes/adds mutate; deletes are destructive
- **Next actions:** `list_triggers`, `read_trigger`, `write_trigger`
- **Boundary:** use this family instead of raw `triggerScripts` field reads
- **Guard coverage:** trigger indexed mutation tools support optional `expected_comment` stale-index protection

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

- **Use when:** advanced structured reads of loaded reference files without mutating them, including reference-only sessions with no active main document, when facade reference reads/searches are not sufficient
- **Tools:** `list_references`, `read_reference_field`, `read_reference_field_batch`, `search_in_reference_field`, `read_reference_field_range`, `list_reference_greetings`, `read_reference_greeting`, `read_reference_greeting_batch`, `list_reference_triggers`, `read_reference_trigger`, `read_reference_trigger_batch`, `list_reference_lorebook`, `read_reference_lorebook`, `read_reference_lorebook_batch`, `list_reference_regex`, `read_reference_regex`, `read_reference_regex_batch`, `list_reference_lua`, `read_reference_lua`, `read_reference_lua_batch`, `list_reference_css`, `read_reference_css`, `read_reference_css_batch`, `list_reference_risup_prompt_items`, `read_reference_risup_prompt_item`, `read_reference_risup_prompt_item_batch`, `read_reference_risup_formating_order`
- **Hints:** RO, idempotent
- **Next actions:** `list_references`, `search_in_reference_field`, `read_reference_field_range`, `list_reference_greetings`, `list_reference_triggers`, `list_reference_lorebook`, `list_reference_risup_prompt_items`
- **Boundary:** this family is read-only by design; start with facade `inspect_document` / `read_content` / `search_document` for covered reference discovery, reads, and search. Use `list_references` for the full legacy inventory, search/range readers for exact legacy result shapes, and `read_reference_*_batch` instead of looping single reads when comparing several sibling structured items

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

- **Use when:** reading or editing structured `.risup` prompt items, formatting order, prompt-vs-reference comparison, and persistent reusable prompt snippets
- **Tools:** `list_risup_prompt_items`, `search_in_risup_prompt_items`, `read_risup_prompt_item`, `read_risup_prompt_item_batch`, `write_risup_prompt_item`, `write_risup_prompt_item_batch`, `add_risup_prompt_item`, `add_risup_prompt_item_batch`, `delete_risup_prompt_item`, `batch_delete_risup_prompt_items`, `reorder_risup_prompt_items`, `read_risup_formating_order`, `write_risup_formating_order`, `diff_risup_prompt`, `export_risup_prompt_to_text`, `copy_risup_prompt_items_as_text`, `import_risup_prompt_from_text`, `validate_risup_prompt_import`, `list_risup_prompt_snippets`, `read_risup_prompt_snippet`, `save_risup_prompt_snippet`, `insert_risup_prompt_snippet`, `delete_risup_prompt_snippet`
- **Hints:** list/search/read/diff/export/validate are RO/idempotent; persistent snippet list/read are open-world reads; writes/adds/reorders/import/save/insert mutate; prompt-item delete, batch-delete, and snippet delete are destructive
- **Next actions:** `list_risup_prompt_items`, `search_in_risup_prompt_items`, `read_risup_formating_order`, `diff_risup_prompt`, `export_risup_prompt_to_text`, `import_risup_prompt_from_text`, `validate_risup_prompt_import`, `list_risup_prompt_snippets`, `read_risup_prompt_snippet`, `save_risup_prompt_snippet`, `insert_risup_prompt_snippet`
- **Boundary:** prefer this structured surface over raw `promptTemplate` / `formatingOrder` field writes whenever possible
- **Guard coverage:** indexed prompt-item writes support optional `expected_type` / `expected_preview` stale-index guards; `batch_delete_risup_prompt_items` supports `expected_types` / `expected_previews` aligned with its `indices` array
- **Batch result shape:** prompt-item batch add/write success payloads include per-item `results[]`
- **insertAt:** `add_risup_prompt_item` and `add_risup_prompt_item_batch` accept an optional `insertAt` parameter for positional insertion instead of appending

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
