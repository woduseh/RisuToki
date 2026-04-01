# Preview Charx-Only Gating Design

Date: 2026-04-01
Status: Draft for review

## Problem

RisuToki's preview entry points currently open for any loaded document as long as a file is present.

That behavior is too broad for the current product contract.

- The user explicitly requested that preview be disabled when the opened file is not a `charx` file.
- The current preview entry path only checks whether `fileData` exists.
- The `F5` shortcut, the menu action, and the controller action map all flow into the same preview-opening function.
- The menu currently gives no visual hint that preview is nonsensical for non-`charx` files.
- The preview runtime also still contains several tiny setter stubs that silently discard writes to preview-local character fields.

The next slice should therefore ship a small, bounded preview-focused release that does two things:

1. enforce a **charx-only preview gate**
2. activate the lowest-risk preview-local setter stubs that already fit the same preview-only scope

This keeps the release tight while addressing both the explicit user request and the most obvious low-risk preview gap nearby.

## Goals

- Allow preview only when the active document is a `charx` file.
- Block preview for all non-`charx` document types, including `risum` and `risup`.
- Apply the gate consistently across all current preview entry points.
- Give the user clear UI feedback when preview is unavailable.
- Add a visible disabled state for the preview menu action when the active document is not previewable.
- Activate the preview-local Lua setter stubs for:
  - `setDescription`
  - `setPersonality`
  - `setScenario`
  - `setFirstMessage`
- Add focused regression coverage for preview gating and setter behavior.
- Keep the release bounded enough for a single small release wave.

## Non-Goals

- No preview chat-history simulation in this slice.
- No implementation of `setChat`, `addChat`, `removeChat`, `sendInput`, `sleep`, or chat-read stubs.
- No new multi-turn preview model.
- No real LLM-backed preview responses.
- No broader preview UI redesign.
- No changes to `charx`, `risum`, or `risup` file parsing semantics.
- No change to persistence or save behavior from preview-local setter calls.
- No MCP API work in this slice.

## Chosen Direction

Ship `v0.35.0` as a **bounded preview usability release** with three concrete changes:

1. **charx-only preview gating**
   - the app should only open preview when the active file is `charx`
   - `risum` and `risup` should both be treated as non-previewable in this release

2. **preview menu disabled state**
   - the menu should visually communicate when preview is unavailable
   - the action should remain guarded at the controller level even if the UI is bypassed

3. **preview-local setter stub activation**
   - the four field setters should stop silently discarding values
   - they should update only preview-local runtime state
   - they must not alter saved document data

This creates a clean release boundary:

- the gating work resolves the explicit user request
- the setter work improves nearby preview fidelity without pulling in chat simulation or larger runtime changes

## Why this direction

This is the smallest release that is both useful and coherent.

Compared with a larger preview rewrite, it is safer because it stays inside already-owned boundaries:

- preview activation lives in the controller and keyboard/menu wiring
- menu affordances live in `MenuBar.vue`
- preview-local field mutation already lives in `preview-engine.ts`

Compared with a gate-only release, this version is better because the four setter stubs are already tiny, isolated, and preview-only. Splitting them into a separate release would add ceremony without meaningful risk reduction.

## Design

### 1. Treat previewability as `charx`-only

Files to modify:

- `src\app\controller.ts`
- `src\stores\app-store.ts`

Current convention:

- `charx` is represented by a missing `_fileType`
- `risum` uses `_fileType === 'risum'`
- `risup` uses `_fileType === 'risup'`

The preview gate should intentionally follow the user's wording:

- preview allowed only when the active file is `charx`
- preview blocked for every non-`charx` type

Add a small reusable previewability check derived from the current file type.

Preferred shape:

```ts
const isCharx = !fileData?._fileType;
const canPreviewCurrentFile = Boolean(fileData) && isCharx;
```

Implementation constraint:

- keep the logic explicit and local
- do not introduce a broad file-type abstraction unless needed by the touched files

### 2. Guard preview at the controller entry point

File to modify:

- `src\app\controller.ts`

`showPreviewPanel()` is the authoritative preview entry path for:

- `F5`
- the `preview-test` menu action
- any other controller-driven preview reopen path

Add an early guard before preview asset loading and before overlay construction:

- if no file is open, keep the existing status behavior
- if a non-`charx` file is active:
  - do not open preview
  - do not load preview assets
  - surface a clear status message

Recommended message:

`프리뷰는 .charx 파일에서만 사용할 수 있습니다`

Design constraint:

- the controller guard is the real protection
- UI disabling is only a supporting affordance, not the primary safety mechanism

### 3. Surface disabled preview state in the menu

Files to modify:

- `src\components\MenuBar.vue`
- `src\App.vue`
- `src\stores\app-store.ts`

The preview menu item is currently static.

The menu should reflect preview availability so users are not encouraged to invoke an action that will always be rejected.

Additive design:

- expose a small computed previewability flag from the app store
- pass that flag into `MenuBar` from `App.vue`
- add `disabled?: boolean` support to menu entries
- prevent disabled items from firing actions
- render a disabled visual state for the preview item

Design constraints:

- keep the menu structure mostly static
- do not refactor the whole menu system into a dynamic schema service
- only the touched preview action needs reactive disabled-state support in this slice

### 4. Keep keyboard behavior simple and consistent

Files to modify:

- `src\app\keyboard-shortcuts.ts`
- possibly none, if controller-level guarding is sufficient

`F5` should continue to route through `showPreviewPanel()`.

The keyboard layer does not need its own file-type branch if the controller gate is already authoritative.

Preferred behavior:

- keep `F5` wired as-is
- rely on the controller guard to reject non-`charx` files
- verify through tests that invoking preview from the keyboard path respects the gate

This avoids duplicating file-type logic across layers.

### 5. Activate preview-local setter stubs only

File to modify:

- `src\lib\preview-engine.ts`

The following Lua API setters are currently explicit stubs:

- `setDescription`
- `setPersonality`
- `setScenario`
- `setFirstMessage`

These should become simple preview-local state writes.

Required behavior:

- accept the incoming value
- coerce to string consistently with adjacent preview bindings such as `String(value ?? '')`
- update the corresponding preview-local field used by the runtime
- affect only the active preview session

These setters must remain:

- non-persistent
- local to preview runtime state
- independent from disk saves or editor model writes

Explicitly deferred:

- `setChat`
- `setMemory`
- `addChat`
- `removeChat`
- `sendInput`
- `sleep`
- any read-side chat simulation improvements

### 6. Error handling and user experience

User-visible behavior should be straightforward:

- no file open
  - existing message remains unchanged
- non-`charx` file open
  - preview does not open
  - status message explains that preview is charx-only
- `charx` file open
  - preview opens as before

The disabled menu state should align with the same rule so the UI and runtime do not disagree.

### 7. Testing strategy

Files likely to modify:

- `src\app\keyboard-shortcuts.test.ts`
- `src\App.test.ts`
- `src\lib\preview-engine.test.ts`

Required coverage:

1. **menu disabled-state**
   - preview action is disabled when the active file is non-`charx`
   - preview action is enabled when the active file is `charx`

2. **controller/entry-path behavior**
   - preview invocation for non-`charx` files does not open the overlay
   - preview invocation for `charx` files still opens normally

3. **setter activation**
   - each of the four setters updates preview-local state
   - the write does not require persistence or external side effects

Testing constraint:

- reuse existing preview and app-shell test patterns where possible
- avoid introducing a new heavyweight integration harness if a smaller unit or component test is sufficient

## Release boundaries

### In scope for `v0.35.0`

- charx-only preview gating
- preview menu disabled-state
- four preview-local setter activations
- focused regression tests
- docs/version/changelog updates required for release

### Deferred after `v0.35.0`

The next natural release waves after this slice are:

1. **`v0.36.0` — MCP error-envelope completion**
   - finish the remaining bounded `mcpError(...)` migration outside the `v0.34.0` route families

2. **`v0.37.0` — risup prompt item ID routing**
   - add additive ID-addressed prompt-item routes on top of the current index-based behavior

3. **later preview follow-up slices**
   - chat-read stubs
   - chat-mutation stubs
   - richer preview simulation

Those are intentionally separate releases and should not be folded into this first preview wave.

## Risks and mitigations

### Risk: duplicated file-type logic drifts

Mitigation:

- keep the controller gate authoritative
- expose one small previewability flag for UI consumption

### Risk: disabled menu still fires actions

Mitigation:

- enforce both UI disable and click guard behavior

### Risk: setter activation leaks into persisted document state

Mitigation:

- restrict changes to preview-engine runtime locals only
- do not touch editor save/update paths

### Risk: future `risum` preview support becomes harder

Mitigation:

- document that charx-only gating is an intentional product rule for this release, not a parser limitation
- keep the previewability check simple enough to relax later if product policy changes
