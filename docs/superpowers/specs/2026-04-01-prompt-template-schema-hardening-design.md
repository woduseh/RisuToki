# Prompt Template Schema Hardening Design

Date: 2026-04-01

Status: Approved design draft

## Problem

RisuToki already exposes a strong structured editor for `.risup` `promptTemplate` and `formatingOrder`, but the underlying schema is still too loose in three ways:

- prompt items have no stable identity, so renderer and MCP flows still address them by array index
- legacy `.risup` files load without a migration boundary that can normalize prompt items into a more durable model
- `formatingOrder` is validated as “array of strings,” but not cross-checked against the active prompt template strongly enough to surface actionable warnings

That makes prompt editing workable, but it weakens continuity and tooling safety. Array-index identity is fragile for reorder flows, MCP tooling cannot talk about prompt items in a durable way, and malformed or stale formatting-order references remain harder to diagnose than they should be.

This slice should ship the first safe hardening pass: **introduce stable prompt-item IDs, preserve backward compatibility for old `.risup` files, and surface warning-level formatting-order mismatches without breaking existing prompt data or MCP clients.**

## Goals

- Add stable IDs to supported `promptTemplate` items.
- Migrate legacy `.risup` prompt items that do not yet carry IDs.
- Preserve unknown / unsupported prompt item shapes without data loss.
- Propagate stable IDs through renderer, save/load, autosave, and MCP prompt-item surfaces.
- Add warning-level cross-reference checks between `promptTemplate` and `formatingOrder`.
- Keep old `.risup` files loadable and savable without requiring a manual migration step.
- Add regression coverage for migration, ID round-trip, reorder stability, MCP prompt-item reads/writes, and formatting-order warnings.

## Non-Goals

- No broad Zod-first rewrite of all risup prompt validation in this pass.
- No hard rejection of legacy or dangling `formatingOrder` references when opening old files.
- No redesign of the `risup-prompt-editor` visual layout beyond what is needed to preserve stable IDs.
- No replacement of index-based MCP routes with ID-addressed routes in this pass.
- No new prompt item kinds or prompt runtime semantics.
- No change to autosave provenance contracts beyond carrying the normalized prompt JSON that already lives inside `.risup` artifacts.
- No generalized schema-versioning system for all risup fields.

## Chosen Direction

Use a **migration-safe identity layer**:

1. **Prompt item IDs become part of the persisted structured model**
   - supported prompt items carry a stable `id`
   - old files missing IDs are normalized on read
   - save and autosave preserve those IDs on round-trip

2. **Formatting-order checks stay warning-first**
   - cross-reference mismatches surface as warnings
   - UI and MCP surfaces can expose those warnings
   - writes remain backward-compatible in `v0.32.0`

This is safer than a stricter schema-rejection slice because it adds durability without making old preset files fail to load or save.

## Design

### 1. Stable prompt-item identity

Add stable IDs inside the prompt model rather than bolting them onto editor-only state.

- File to modify: `src\lib\risup-prompt-model.ts`
- Test surface to extend: `src\lib\risup-prompt-model.test.ts`

Required behavior:

- all supported `PromptItem*Model` variants should carry `id: string`
- unknown / unsupported items should still retain their original `rawValue`
- unknown / unsupported items should also expose a top-level `id` when the raw object already contains one, so identity does not disappear from the typed model if a future or downgraded build treats a once-supported item as unknown
- when parsing a supported item:
  - if the raw object already has a valid string `id`, preserve it
  - otherwise generate a new stable ID during normalization
- when serializing a supported item:
  - always write the `id` field back into the output object
- default prompt-item factories should always generate a fresh unique ID

This identity belongs to the saved `promptTemplate` data, not to transient renderer-only state.

### 2. Migration-safe read boundary

Legacy `.risup` files should normalize into the new prompt-item model as they are opened.

- File to modify: `src\charx-io.ts`
- Related helper surface: `src\lib\risup-prompt-model.ts`
- Test surface to extend: `test\test-charx.ts`

Recommended load path:

1. `openRisup()` reads the preset payload.
2. `extractPresetFields()` converts raw preset data into `CharxData`.
3. During that conversion, `charx-io.ts` should call a prompt-model normalization helper rather than duplicating per-item parse logic locally.
4. That prompt-model helper should normalize `promptTemplate` so supported items always have IDs before the JSON string reaches the renderer.

Migration rules:

- old prompt items without `id` receive deterministically generated IDs derived from their saved raw content plus an occurrence counter, so reopening the same legacy file without saving does not create a different ID set every time
- existing IDs are preserved
- unsupported prompt items remain lossless through `rawValue`
- malformed-but-openable legacy prompt data should still load if it can be represented as the existing unknown-item model

This keeps migration-on-read as the single safe boundary for:

- normal file open
- startup recovery / autosave recovery reopen
- future editor sessions that re-open the same `.risup`

No separate “migration command” is needed.

Legacy-ID stability note:

- for files that have never been re-saved by a v0.32.0+ build, generated IDs are only as stable as the on-disk legacy item content they are derived from
- once the user saves, those IDs become explicit persisted data and should remain stable on later opens

### 3. Save / autosave / mutation boundary behavior

Once normalized, IDs must round-trip through every existing write surface.

- File to modify: `src\charx-io.ts`
- File to modify: `src\lib\data-serializer.ts`
- File to review/cover: `src\lib\autosave-manager.ts`
- Test surfaces:
  - `src\lib\data-serializer.test.ts`
  - `src\lib\autosave-manager.test.ts`

Required behavior:

- `saveRisup()` writes prompt items with IDs back into the preset payload
- `applyUpdates()` accepts `promptTemplate` values that include IDs
- autosave writes keep IDs intact
- restore from autosave should reopen the normalized prompt data with the same IDs

This pass should not introduce a second migration path on save. Save should only persist what the normalized in-memory model already contains.

### 4. Renderer/editor propagation

The structured prompt editor should preserve item identity across add, remove, reorder, and type-change flows.

- File to modify: `src\lib\risup-prompt-editor.ts`
- File to modify: `src\lib\form-editor.ts` only if necessary
- Test surface to extend: `src\lib\risup-prompt-editor.test.ts`

Required behavior:

- newly added items get a fresh ID
- moving items up/down preserves the same IDs
- removing one item does not rewrite the IDs of the remaining items
- changing an item type should preserve its existing ID when the user is conceptually editing the same item

Implementation note:

- `defaultPromptItem()` should keep generating fresh IDs for true new-item creation
- type-change flows should preserve the old item’s ID explicitly at the caller site when swapping to a new default shape
- do not make the factory itself responsible for “sometimes preserve old ID” behavior

This pass does not need to surface IDs visibly in the UI. Internal stability is enough.

`src\lib\form-editor.ts` is already a large file, so changes there should stay minimal. Prefer keeping most of the identity logic in `risup-prompt-editor.ts` and the prompt-model helpers.

### 5. MCP prompt-item surfaces

MCP prompt-item tools should start exposing the stable identity layer without breaking existing index-based clients.

- File to modify: `src\lib\mcp-api-server.ts`
- File to modify: `toki-mcp-server.ts`
- Test surface to extend: `src\lib\mcp-api-server.test.ts`
- Docs to update later:
  - `skills\using-mcp-tools\TOOL_REFERENCE.md`
  - `AGENTS.md` if behavior guidance changes materially

Required behavior:

- `list_risup_prompt_items` should include each item’s `id`
- `read_risup_prompt_item` should include the `id`
- existing index-addressed write/add/delete/reorder routes stay intact
- write/add flows should preserve provided IDs when valid and generate IDs when absent

This keeps the external contract additive in `v0.32.0`. A future release can decide whether to add ID-addressed routes.

### 6. Formatting-order cross-reference warnings

`formatingOrder` should remain loadable and writable, but it should stop being a silent blind spot.

- File to modify: `src\lib\risup-prompt-model.ts`
- File to modify: `src\lib\risup-form-editor.ts`
- File to modify: `src\lib\mcp-api-server.ts`
- Test surfaces:
  - `src\lib\risup-prompt-model.test.ts`
  - `src\lib\risup-form-editor.test.ts`
  - `src\lib\mcp-api-server.test.ts`

Required behavior:

- add a pure helper that compares the active `promptTemplate` items and `formatingOrder` tokens
- return warning strings when:
  - formatting-order tokens are duplicated
  - a formatting-order token references no supported prompt item in the current template
- warnings should be non-blocking in `v0.32.0`
- UI save validation may show the warning
- MCP responses may include warnings in success payloads where practical

This pass should not hard-error on cross-reference mismatches. The goal is to surface repair guidance, not to strand existing presets.

### 7. Boundaries for later phases

This slice intentionally stops before stricter semantic enforcement.

Later work may build on this foundation to add:

- ID-addressed MCP prompt-item routes
- stronger formatting-order enforcement or auto-repair
- richer prompt diagnostics in the renderer
- broader prompt schema hardening for nested risup structures
- schema-version annotations or migration markers if future prompt-item changes require them

## File map

### Production

- `src\lib\risup-prompt-model.ts`
- `src\charx-io.ts`
- `src\lib\data-serializer.ts`
- `src\lib\risup-prompt-editor.ts`
- `src\lib\risup-form-editor.ts`
- `src\lib\mcp-api-server.ts`
- `toki-mcp-server.ts`

### Tests

- `src\lib\risup-prompt-model.test.ts`
- `test\test-charx.ts`
- `src\lib\data-serializer.test.ts`
- `src\lib\autosave-manager.test.ts`
- `src\lib\risup-prompt-editor.test.ts`
- `src\lib\risup-form-editor.test.ts`
- `src\lib\mcp-api-server.test.ts`

### Docs / release

- `README.md`
- `AGENTS.md`
- `CHANGELOG.md`
- `package.json`

## Validation checklist

- legacy `.risup` files without item IDs open successfully
- saving a migrated `.risup` persists IDs
- autosave / recovery round-trips preserve IDs
- prompt-item reorder and type-change preserve identity
- MCP prompt-item read/list responses expose IDs
- formatting-order duplicates and dangling references surface as warnings
- full verification still passes:
  - `npm run lint`
  - `npm run typecheck`
  - `npm test`
  - `npm run build`

## Notes

- Keep the scope centered on stable IDs plus warning-only cross-reference checks. Do not let this turn into a full validation framework rewrite.
- Prefer pure helper extraction inside `risup-prompt-model.ts` over pushing new stateful logic into large renderer files.
- Preserve existing backward-compatible behaviors unless the change directly serves stable identity or warning visibility.
