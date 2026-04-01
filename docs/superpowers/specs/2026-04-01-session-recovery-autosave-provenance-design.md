# Session Recovery and Autosave Provenance Design

Date: 2026-04-01

Status: Approved design draft

## Problem

RisuToki already has autosave, but it still does not provide trustworthy session recovery.

The sharpest problems are:

- autosave artifacts are opaque and carry no explicit provenance
- the app does not distinguish clean exit from interrupted exit
- startup never offers to recover the last interrupted session
- autosave cleanup still contains a legacy dotfile cleanup path (`.{base}.autosave.charx`) that does not match the current canonical autosave naming pattern
- autosave currently writes `.charx` unconditionally, even when the active source file is `.risum` or `.risup`

That last point makes the current recovery story unsafe for non-`.charx` work. A recovery feature built on top of lossy autosaves would look helpful while silently weakening source fidelity.

This design should ship the first safe session-continuity slice: **recover the latest interrupted document intentionally, with explicit provenance, without serializing the whole UI session or contaminating source files with session metadata.**

## Goals

- Make autosave artifacts reopenable for all three supported source types: `.charx`, `.risum`, and `.risup`.
- Record recovery provenance outside the source document payload.
- Detect interrupted sessions and offer an explicit recovery choice at startup.
- Show clear, low-noise provenance when a session is restored from autosave.
- Keep source-file save paths authoritative after the user explicitly chooses recovery.
- Add regression coverage for autosave format selection, recovery candidate discovery, stale recovery warnings, and cleanup.

## Non-Goals

- No full tab, panel, popout, preview, terminal, or Monaco undo-state restoration in this pass.
- No persistence of `dirtyFields` as restored editor state, `backup-store`, chat history, or preview runtime state.
- No prompt-item stable IDs or formatting-order cross-reference work in this pass.
- No metadata embedded into `.charx`, `.risum`, or `.risup` payloads beyond their existing contracts.
- No new restore UI for untitled documents without a canonical source path in this pass.
- No broad autosave retention-policy redesign beyond what is needed to keep recovery safe and cleanup coherent.
- No expansion of `src\lib\main-state-store.ts` beyond using its existing `setCurrentDocument()` / `resetCurrentDocument()` contract.

## Chosen Direction

Use a **two-plane recovery model**:

1. **File-type-safe autosave artifacts**
   - autosave writes a valid file in the same logical format as the active source
   - each autosave artifact gets a small sidecar JSON file that records provenance

2. **App-managed interrupted-session record**
   - the main process stores a small recovery record under `app.getPath('userData')`
   - startup checks that record for an interrupted session and a viable latest autosave candidate
   - the renderer presents an explicit restore choice: recover autosave, open original, or ignore

This is safer than broad “session restore” because it restores only the document layer, preserves explicit user control, and does not depend on unstable tab identities or UI-state serialization.

## Design

### 1. Recovery metadata boundaries

Add one small, dedicated recovery helper layer instead of attaching recovery state to `CharxData`.

- New file: `src\lib\session-recovery.ts`
- New test: `src\lib\session-recovery.test.ts`

This module should define the recovery contracts and pure helpers used by both autosave and startup recovery.

Recommended types:

- `AutosaveProvenance`
  - `sourceFilePath: string | null`
  - `sourceFileType: 'charx' | 'risum' | 'risup'`
  - `autosavePath: string`
  - `savedAt: string`
  - `dirtyFields: string[]`
  - `appVersion: string`
- `SessionRecoveryRecord`
  - `sourceFilePath: string | null`
  - `sourceFileType: 'charx' | 'risum' | 'risup' | null`
  - `latestAutosavePath: string | null`
  - `latestAutosaveMetaPath: string | null`
  - `cleanExit: boolean`
  - `updatedAt: string`
- `PendingRecoveryCandidate`
  - `sourceFilePath: string`
  - `autosavePath: string`
  - `provenance: AutosaveProvenance`
  - `staleWarning: string | null`
  - `originalMtimeMs: number | null`
  - `autosaveMtimeMs: number | null`

This helper layer should also own:

- file-type → autosave extension mapping
- autosave sidecar path derivation
- recovery record path derivation
- latest viable candidate selection
- stale candidate classification

The recovery record belongs in app-managed state. It must not be written into the loaded source file.

`AutosaveProvenance.dirtyFields` is informational only. It exists so users and tests can inspect what the autosave captured. It must not be replayed into `TabManager.dirtyFields` or any restored editor-dirty state.

### 2. File-type-safe autosave artifacts

`autosave-manager.ts` should stop treating every file as a `.charx`.

- File to modify: `src\lib\autosave-manager.ts`
- Test surface to extend: `src\lib\autosave-manager.test.ts`

Required behavior:

- choose the autosave writer from the active `_fileType`
  - `.charx` → `saveCharx`
  - `.risum` → `saveRisum`
  - `.risup` → `saveRisup`
- use a same-type autosave filename:
  - `{base}_autosave_{timestamp}.charx`
  - `{base}_autosave_{timestamp}.risum`
  - `{base}_autosave_{timestamp}.risup`
- write a sidecar JSON file next to the autosave artifact, for example:
  - `{autosavePath}.toki-recovery.json`
- return the autosave path and enough metadata for the renderer to show a meaningful status message

The autosave sidecar should record:

- original source path
- source file type
- autosave path
- save timestamp
- dirty field IDs captured for that autosave
- app version

Cleanup rules:

- `cleanup-autosave` must remove both autosave artifacts and their sidecars
- cleanup should recognize the current canonical naming pattern, not only the dead legacy dotfile pattern
- cleanup may also remove legacy malformed autosave leftovers for the same base name as a compatibility cleanup step

This pass should keep autosave artifact content valid and source-compatible. Provenance lives next to the artifact, not inside it.

### 3. Interrupted-session detection

Add a small main-process recovery manager instead of burying startup logic in `main.ts`.

- New file: `src\lib\session-recovery-manager.ts`
- New test: `src\lib\session-recovery-manager.test.ts`
- `main.ts` should initialize it

The recovery manager should:

- mark the session as `cleanExit: false` when a document becomes the active editing target
- update the recovery record after open, save, save-as, and successful autosave
- mark the session as `cleanExit: true` during normal shutdown
- on startup, inspect the persisted record and latest autosave metadata
- prepare one pending recovery candidate only when:
  - the previous session did not exit cleanly
  - the original source path still exists
  - the latest autosave artifact still exists
  - the autosave artifact and provenance sidecar agree on type/path sufficiently to trust recovery

This manager should expose narrow IPC surfaces rather than pushing raw filesystem logic into the renderer.

Recommended IPC shape:

- `get-pending-session-recovery`
  - returns recovery candidate metadata or `null`
- `resolve-pending-session-recovery`
  - input: `'restore' | 'open-original' | 'ignore'`
  - returns document payload + recovery info for restore, or original document payload for open-original, or `null` for ignore

If the user chooses restore:

- load the autosave artifact into `currentData`
- set `currentFilePath` to the **original source path**
- preserve recovery provenance in manager state long enough for the renderer to show it

This is important. “Restore” should mean “continue from autosaved content and save back to the original source path,” not “start editing a stray autosave artifact path.”

If the user chooses open-original:

- load the original file normally
- clear the pending recovery candidate for this launch

If the user chooses ignore:

- clear the pending recovery candidate for this launch
- leave autosave files on disk until the next explicit save or cleanup

This pass should keep `main-state-store.ts` untouched as a data shape. The recovery manager should use the existing main-state setter methods instead of introducing new shared mutable session fields.

### 4. Startup recovery UX

Keep the recovery prompt explicit and small.

- File to modify: `src\app\controller.ts`
- File to modify: `src\lib\dialog.ts`
- Type surface to update: `src\electron-api.d.ts`
- Preload bridge to update: `src\lib\preload-api.ts`

Startup flow:

1. Renderer initializes as usual.
2. Early in `initMainRenderer()`, the renderer asks for a pending recovery candidate.
3. If there is no candidate, startup continues unchanged.
4. If there is a candidate, show one focused dialog with three choices:
   - `자동 저장 복원`
   - `원본 열기`
   - `무시`

The prompt should include:

- source filename
- autosave timestamp
- a short stale warning when the autosave is suspiciously older than the original or otherwise degraded

For this first pass, “stale” should mean the autosave artifact is more than **24 hours older** than the current original file mtime. The warning may also appear when sidecar metadata is missing or partially mismatched, but the 24-hour rule is the default threshold that tests should lock.

Recommended Korean tone:

- title: `자동 저장 복원`
- message:
  - `비정상 종료 뒤 자동 저장 파일이 발견되었습니다.`
  - `자동 저장: 04/01 09:41:20`
  - `원본: Character.charx`
  - optional warning line when stale

This pass should reuse the existing MomoTalk-style renderer dialog patterns instead of introducing a native platform dialog.

### 5. Restored-session provenance in the UI

When the user restores from autosave, the UI should make that fact visible without turning the whole app into a diagnostics panel.

Primary surfaces:

- sticky status-bar message
  - example: `자동 저장에서 복원됨: Character.charx (04/01 09:41:20)`
- file-label suffix
  - example: `Character [자동복원]`

This provenance should clear when:

- the user successfully saves
- the user successfully saves as a new path
- the user opens a different file
- the user creates a new file

This pass does **not** need a full settings-panel recovery section. Status bar plus file-label badge is enough for the first release.

`src\stores\app-store.ts` only needs a small reactive value for restored-session provenance, such as the current restored badge label or restore-source summary used by the file label.

`src\lib\file-actions.ts` should clear restored-session provenance on successful save, save-as, open, and new-file transitions so the badge and sticky recovery context do not outlive the recovered session they describe.

### 6. Boundaries for later phases

This slice intentionally stops before “full session continuity.”

Later work may build on this foundation to add:

- reopen-last-file preferences
- open-tab restoration
- active-tab restoration
- prompt-item-stable targeting for richer per-surface continuity

Those features should come later because they depend on more stable editor identities and a larger UX decision surface. This release is only about safe document recovery and provenance.

### 7. Release shape

This is a user-visible feature addition, so the release should be treated as a **MINOR** bump under the repository's SemVer rules.

## Surfaces Likely To Change

- Create: `src\lib\session-recovery.ts`
- Create: `src\lib\session-recovery.test.ts`
- Create: `src\lib\session-recovery-manager.ts`
- Create: `src\lib\session-recovery-manager.test.ts`
- Modify: `src\lib\autosave-manager.ts`
- Modify: `src\lib\autosave-manager.test.ts`
- Modify: `main.ts`
- Modify: `src\lib\preload-api.ts`
- Modify: `src\electron-api.d.ts`
- Modify: `src\app\controller.ts`
- Modify: `src\lib\dialog.ts`
- Modify: `src\lib\file-actions.ts`
- Modify: `src\stores\app-store.ts`
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `CHANGELOG.md`
- Modify: `package.json`
- Modify: `package-lock.json`

## Verification Plan

Validate this work in five layers.

1. **Pure recovery helper layer**
   - extension mapping is correct for all file types
   - autosave sidecar path derivation is stable
   - stale candidate classification is predictable
   - invalid or missing sidecars degrade safely

2. **Autosave writer layer**
   - `.charx`, `.risum`, and `.risup` autosaves call the correct save function
   - autosave filenames use the correct extension
   - sidecar provenance is written alongside autosave artifacts
   - cleanup removes matching autosaves and sidecars

3. **Recovery manager layer**
   - interrupted-session record is marked dirty/clean at the right times
   - startup only offers recovery when a viable candidate exists
   - restore resolves to autosaved content while preserving the original save target path
   - open-original and ignore clear the pending candidate correctly

4. **Renderer UX layer**
   - startup recovery dialog appears only when expected
   - restore shows sticky provenance status
   - file label gains and clears `[자동복원]` at the right times

5. **Release validation**
   - focused unit tests for new recovery/autosave surfaces
   - `npm run build`

## Risks and Mitigations

- **Risk:** recovery metadata leaks into source files.
  - **Mitigation:** keep provenance in sidecar JSON and app-managed recovery records only.

- **Risk:** `.risup` or `.risum` autosave stays lossy because the wrong writer is still used somewhere.
  - **Mitigation:** route autosave through explicit file-type dispatch and lock it with tests.

- **Risk:** restore silently edits the autosave artifact path instead of the original source path.
  - **Mitigation:** on explicit restore, bind `currentFilePath` back to the original source path.

- **Risk:** stale or mismatched autosaves create false confidence.
  - **Mitigation:** classify stale candidates and surface a warning in the prompt instead of silently restoring.

- **Risk:** startup recovery logic grows into broad session serialization.
  - **Mitigation:** keep this pass document-only and defer tab/UI continuity to later slices.

## Outcome

After this pass, autosave should stop being a best-effort dump and become a trustworthy recovery surface. RisuToki should recover interrupted work deliberately, tell the user exactly what was restored, and keep source-file integrity ahead of convenience.
