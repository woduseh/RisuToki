# MCP Safety and Stable Targeting Design

Date: 2026-03-25

Status: Approved design draft

## Problem

Recent live-card work on CCZ exposed a clear weakness in the current MCP authoring model.

The tools are powerful, but the safety and targeting model is still too brittle for large edits. The biggest problems are:

- rollback is field-centric, not workflow-centric
- lorebook filesystem export is useful for reading, but not authoritative enough for guaranteed restore
- lorebook automation still depends too heavily on shifting indices
- lorebook folder identity is not internally consistent across UI, MCP, and import/export code

That last point is the sharpest issue. The UI currently creates folder entries with a UUID in `key`, while parts of the MCP and lorebook export/import stack treat folder identity as `id`. That means two parts of the app can touch the same lorebook while assuming different contracts. The result is avoidable instability during folder migration, export/import, and post-edit verification.

This design should harden the MCP layer so live `.charx`, `.risum`, and `.risup` editing is safer, easier to recover, and less dependent on fragile positional targeting.

## Goals

- Add a recovery model that matches real editing workflows, not just single-field edits.
- Make lorebook targeting stable even after folder creation, deletion, and reordering.
- Unify the lorebook folder identity contract across UI and MCP.
- Make markdown lorebook export safe enough to use as a real backup surface.
- Preserve backward compatibility for existing index-based MCP tools.

## Non-Goals

- No renderer preview or regex simulation suite in this pass.
- No removal of existing index-based routes or MCP tools.
- No large refactor of unrelated editor systems.
- No redesign of the lorebook form UI beyond what is required to honor the new canonical folder contract.

## Chosen Direction

Use a **safety-first plus stable-targeting** hybrid.

The release should strengthen existing tools first, then add the smallest set of new MCP surfaces needed to avoid brittle workflows. This is better than a preview-heavy release because the highest current cost is not authoring speed. It is the risk of losing structure, mis-targeting entries after index shifts, and being unable to restore a trusted state cleanly.

## Design

### 1. Canonical lorebook identity contract

Lorebook folder identity must be normalized everywhere through one shared rule.

The recommended contract is:

- folder entries use a canonical UUID in `key`
- child entries refer to that folder as `folder:${uuid}`
- `id` is treated as legacy input only, not the canonical field for new folder creation

The MCP layer should add a normalization helper shared by:

- `mcp-api-server.ts`
- `lorebook-io.ts`
- lorebook UI creation and move flows

That helper should:

- read folder identity from `key` first
- fall back to `id` only for legacy data
- always return a normalized `folder:${uuid}` form to callers

This keeps existing files readable while making new edits internally consistent.

### 2. Snapshot bundle layer

The current `snapshot_field` tool is useful, but it does not match the real unit of work. Large edits usually touch several surfaces at once: fields, lorebook entries, regex entries, CSS sections, Lua sections, or greetings.

Add a new bundle-level recovery surface:

- `snapshot_bundle(...)`
- `list_snapshot_bundles()`
- `restore_snapshot_bundle(...)`

Each bundle should capture only explicitly requested targets. The first version should support these granularities:

- whole fields by field name
- lorebook entries by current index or selector result
- regex entries by index
- Lua sections by index
- CSS sections by index
- greetings and triggers by index

Each bundle should record:

- current timestamp
- loaded file name
- file type
- the exact requested targets
- per-target metadata such as current index, comment, or section name

The bundle should support partial restore as well as full restore.

Persistence boundary:

- bundle payloads should be written to an app-managed temp or session backup directory
- bundles should survive normal editing, route calls, and file reload within the same app session
- bundles do not need to be a permanent archival format in this pass
- restore should reject loaded-file or file-type mismatches by default unless the caller explicitly opts into cross-file restore

This does not replace `snapshot_field`. It adds a safer path for multi-surface work.

### 3. Authoritative lorebook export and import

`export_lorebook_to_files` should continue to support human-readable markdown, but markdown alone should not be trusted as the authoritative backup contract.

The export should always emit a manifest alongside the markdown files. That manifest should include:

- export format and source file
- folder identity map
- entry identity map
- original indices
- exported file paths
- folder path for each entry
- enough metadata to reconstruct folder placement without guessing from directory names alone

The current `_export_meta.json` is not enough for this role. The new manifest should be treated as the restore-grade metadata contract.

`import_lorebook_from_files` should prefer the manifest when present. Directory-name inference should remain only as a fallback for older exports or user-authored markdown folders.

Dry-run import should also surface fidelity warnings, such as:

- folder identities that could not be resolved exactly
- comment collisions that would force rename or skip
- entries that are falling back to heuristic folder assignment

This turns lorebook export into a trustworthy backup and migration surface instead of a best-effort convenience feature.

### 4. Stable selector layer for lorebook MCP tools

The current lorebook routes are too index-centric for large-scale editing. Index-based tools should stay, but safer selector-based tools should be added on top.

Add a selector model that can target entries by stable attributes such as:

- `comment`
- `comment_regex`
- `folder_id`
- `folder_path`
- `mode`
- canonical entry identity when available

The minimum new MCP surfaces should be:

- `find_lorebook(...)`
- `read_lorebook_by(...)`
- `write_lorebook_by(...)`
- `move_lorebook_entries(...)`

These tools should return both the matched stable identity and the current live index so agents can inspect or log the result without trusting the index as the primary handle.

Example selector shapes:

- `{ comment: "Border Economy" }`
- `{ comment_regex: "^Bosses? " }`
- `{ folder_id: "folder:uuid-123" }`
- `{ folder_path: "Bosses & Territorial Powers" }`

`move_lorebook_entries(...)` should cover the common structural operations that are currently awkward through raw index writes:

- move entry to folder
- remove entry from folder
- move before or after another target
- optionally normalize `insertorder` in the affected range

`insertorder` normalization should be opt-in, not automatic.

This is the smallest addition that solves the real instability seen during folder rebuilds and follow-up verification.

### 5. Return richer lorebook metadata from existing list surfaces

`list_lorebook` should be extended so existing read-only exploration becomes more stable even before a caller adopts the new selector tools.

It should return, for each entry:

- current `index`
- normalized `entryId` if available
- normalized `folderId`
- `folderName`
- `folderPath`
- `isFolder`
- current `comment`
- current `mode`

In this pass, live lorebook hierarchy remains single-level. `folderPath` means the normalized logical folder label for the current entry. It is not a commitment to add true nested live folders.

This is a compatibility feature. It makes old workflows less error-prone without breaking the existing route contract.

### 6. Testing and regression coverage

This work needs stronger tests than the current happy-path coverage.

Add or extend tests for:

- UI-created folder entries that store the UUID in `key`
- MCP-created folder entries after the contract is normalized
- markdown export and import roundtrip with current single-level folder structure
- manifest-backed import that restores exact folder placement
- selector-based lorebook targeting after insertions and deletions shift indices
- route-level MCP tests for new bundle and selector tools

The most important regression is simple: a folder structure created in the UI must roundtrip through MCP export/import and still be addressable by MCP without special-case repair.

## Surfaces Likely To Change

- `src\lib\mcp-api-server.ts`
- `src\lib\lorebook-io.ts`
- `src\lib\lorebook-io.test.ts`
- `src\lib\sidebar-actions.ts`
- `src\lib\form-editor.ts`
- MCP tool documentation in `AGENTS.md`
- user-facing feature docs in `README.md`
- release notes in `CHANGELOG.md`

## Risks and Mitigations

- **Risk:** Changing folder identity rules could break existing files.
  - **Mitigation:** Read legacy `id`, write canonical `key`, and normalize at the API boundary.

- **Risk:** Bundle snapshots become too broad and hard to review before restore.
  - **Mitigation:** Require explicit surface selection and return clear per-surface restore metadata.

- **Risk:** Selector tools become ambiguous when comments collide.
  - **Mitigation:** Return all matches, fail loudly on ambiguous write targets unless the caller opts in to multi-match behavior.

- **Risk:** Markdown export becomes more complex to understand.
  - **Mitigation:** Keep the markdown human-readable and place machine fidelity in a separate manifest file.

## Verification Plan

Validate in four layers.

1. **Contract normalization**
   - folder identity is normalized consistently across UI, MCP, and lorebook IO
   - new folders created through MCP and UI resolve to the same `folder:${uuid}` shape

2. **Recovery**
   - bundle snapshots can capture and restore multi-surface edits
   - restore can target the full bundle or a selected subset

3. **Export/import fidelity**
   - markdown export writes a manifest
   - import with manifest restores exact folder assignment
   - dry-run reports unresolved or heuristic cases clearly

4. **Stable targeting**
   - selector-based lorebook reads and writes survive index shifts
   - structural moves do not require manual index recalculation

## Outcome

After this pass, the MCP layer should feel less like a set of raw mutation endpoints and more like a reliable editing protocol. Agents should be able to make large changes with less fear of losing structure, less dependence on fragile indices, and much better odds of recovering a trusted state when something goes wrong.
