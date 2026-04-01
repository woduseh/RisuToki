# Preview Charx Hotfix Design

Date: 2026-04-01

Status: Draft for review

## Problem

`v0.35.0` introduced a `.charx`-only preview gate, but the shipped implementation used the wrong contract for detecting `charx`.

The current renderer serializer explicitly normalizes `charx` payloads to:

```ts
_fileType: data._fileType || 'charx'
```

That normalization is correct. It makes serialized renderer data explicit and matches other parts of the codebase that already treat missing `_fileType` as `charx`.

The bug is in the preview consumers:

- `src\stores\app-store.ts` disables preview when `_fileType` is truthy
- `src\app\controller.ts` blocks preview when `_fileType` is truthy

That means real serialized `.charx` data with `_fileType: 'charx'` is treated as non-previewable even though it is the exact file type we meant to allow.

The existing `src\App.test.ts` fixture hid this bug because its "charx" case used a file object with no `_fileType` at all.

There is also one remaining semantic preview bug nearby:

- `src\lib\preview-engine.ts` still maps `{{charpersona}}` to the description field instead of the personality field

`v0.35.1` should therefore be a narrow patch release that restores the intended preview contract and fixes the lingering macro mapping bug without changing broader preview behavior.

## Goals

- Keep preview available for `.charx` documents whether the active file arrives with missing `_fileType` or explicit `_fileType: 'charx'`.
- Keep preview blocked for `.risum` and `.risup`.
- Keep the menu disabled-state and controller runtime guard aligned on the same normalized `charx` semantics.
- Fix `{{charpersona}}` so it resolves to preview personality instead of preview description.
- Add regression tests that catch the explicit `_fileType: 'charx'` path.
- Ship the fix as a bounded patch release with minimal blast radius.

## Non-Goals

- No new preview features.
- No preview UI redesign.
- No change to serializer behavior in `src\lib\data-serializer.ts`.
- No broader file-type abstraction across the whole app.
- No MCP `v0.36.0` work in this hotfix.
- No changes to unrelated preview macros or chat simulation behavior.

## Chosen Direction

Ship `v0.35.1` as a narrow preview contract hotfix with three production changes:

1. **Normalize previewability around resolved file type**
   - treat missing `_fileType` as `charx`
   - allow preview only when the resolved type is `charx`
   - keep `.risum` and `.risup` blocked

2. **Fix the false-green regression surface**
   - update the app-shell preview-enabled test so the charx fixture is explicit: `_fileType: 'charx'`
   - add focused store-level previewability tests so the menu contract is pinned separately from the shell fixture

3. **Correct `{{charpersona}}`**
   - map it to `charPersonality`
   - keep `{{chardesc}}` mapped to `charDescription`

## Why this direction

This is the smallest correct patch.

- The serializer is already behaving correctly and should remain explicit.
- The bug lives in two consumers that interpreted "truthy `_fileType`" as "non-charx".
- The preview macro bug is a one-token semantic mismatch in the same bounded preview surface.

Fixing only these touched consumers is safer than changing serialization or doing a broader preview refactor in a patch release.

## Design

### 1. Resolve previewability from normalized file type

Files to modify:

- `src\stores\app-store.ts`
- `src\app\controller.ts`

Use the same normalized interpretation already common elsewhere in the codebase:

```ts
const fileType = fileData?._fileType || 'charx';
const isPreviewable = fileType === 'charx';
```

Required behavior:

- no file open → preview unavailable
- missing `_fileType` → preview allowed
- `_fileType === 'charx'` → preview allowed
- `_fileType === 'risum'` → preview blocked
- `_fileType === 'risup'` → preview blocked

For `v0.35.1`, keep this logic explicit in the touched files instead of introducing a broader shared file-type utility. The scope is too small to justify a wider abstraction in a patch release.

### 2. Keep the menu and runtime gate semantically aligned

Files to modify:

- `src\stores\app-store.ts`
- `src\App.test.ts`
- `src\stores\app-store.test.ts`

The menu path should continue reflecting preview availability, but the controller guard remains authoritative.

Regression coverage should pin both layers:

- `App.test.ts` proves the actual view menu enables preview for explicit `_fileType: 'charx'`
- `app-store.test.ts` proves the computed previewability signal handles null, missing, `charx`, `risum`, and `risup`

This closes the exact test gap that allowed `v0.35.0` to ship green.

### 3. Keep the controller guard authoritative

File to modify:

- `src\app\controller.ts`

`showPreviewPanel()` should block only non-charx file types after normalizing missing `_fileType` to `charx`.

Required behavior:

- preserve the existing "파일을 먼저 열어주세요" no-file path
- preserve the existing status message for non-charx files
- do not block explicit `_fileType: 'charx'`
- keep the guard before preview asset loading and overlay creation

### 4. Correct `{{charpersona}}` semantics

Files to modify:

- `src\lib\preview-engine.ts`
- `src\lib\preview-engine.test.ts`

Current broken state:

- `{{chardesc}}` → `charDescription`
- `{{charpersona}}` → `charDescription`  **(wrong)**

Required fixed state:

- `{{chardesc}}` → `charDescription`
- `{{charpersona}}` → `charPersonality`

Regression tests should prove:

- `{{charpersona}}` and `{{chardesc}}` are distinct
- `setPersonality(...)` updates `{{charpersona}}`
- the old accidental alias does not return description text anymore

### 5. Release as a patch fix

Files to modify:

- `CHANGELOG.md`
- `README.md`
- `AGENTS.md`
- `package.json`
- `package-lock.json`

Release framing:

- version bump: `0.35.0` → `0.35.1`
- changelog entry should describe the preview gate regression and the `charpersona` semantic fix
- README only needs a minimal user-facing update for the released version metadata
- AGENTS should record the normalized preview contract so future edits do not assume "missing `_fileType` only"

## Verification

Focused regression loop:

```powershell
npm run test:unit -- src\App.test.ts src\stores\app-store.test.ts src\lib\preview-engine.test.ts
```

Repository verification before release:

```powershell
npm run lint
npm run typecheck
npm run build
```

Expected result:

- explicit `_fileType: 'charx'` stays previewable in the menu contract
- non-charx file types remain blocked
- `{{charpersona}}` resolves to personality, not description
- no broader preview or MCP behavior changes
