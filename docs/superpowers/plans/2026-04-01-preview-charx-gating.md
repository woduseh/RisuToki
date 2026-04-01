# Preview Charx-Only Gating Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `v0.35.0` so preview opens only for `charx` files, the preview menu reflects that restriction, and the four low-risk preview-local setter stubs become functional.

**Architecture:** Keep `src\app\controller.ts` as the authoritative preview gate, expose one small previewability signal from the app store for UI consumption, and keep `F5` routed through the existing controller path. Activate only the four preview-local setter stubs in `src\lib\preview-engine.ts`; do not touch chat simulation, persistence, or MCP code in this plan.

**Tech Stack:** TypeScript, Vue 3, Pinia, Vitest, existing `npm` scripts

---

## File map

- Modify: `src\stores\app-store.ts`
  - Add a small computed previewability flag derived from `_fileType`.
- Modify: `src\App.vue`
  - Pass previewability into `MenuBar`.
- Modify: `src\components\MenuBar.vue`
  - Add disabled-state support for menu items and wire the preview item to the new prop.
- Modify: `src\app\controller.ts`
  - Add the charx-only preview guard and user-facing status message.
- Modify: `src\lib\preview-engine.ts`
  - Replace the four preview-local field setter stubs with simple runtime-local writes.
- Modify: `src\App.test.ts`
  - Cover preview menu disabled-state and enabled-state.
- Modify: `src\app\keyboard-shortcuts.test.ts`
  - Cover `F5` dispatch regression.
- Modify: `src\lib\preview-engine.test.ts`
  - Cover the four setter activations using the existing preview engine test surface.
- Modify: `AGENTS.md`
  - Document the new charx-only preview rule if the file already tracks similar behavioral constraints.
- Modify: `README.md`
  - Add or update a brief note if preview behavior is user-facing enough to merit mention.
- Modify: `CHANGELOG.md`
  - Add the new `v0.35.0` entry.
- Modify: `package.json`
  - Bump version to `0.35.0`.
- Modify: `package-lock.json`
  - Align lockfile version metadata.

## Verification notes

- Worktree baseline caveat: full `npm run build` in this worktree can leave generated `test\test-mcp-search-all.js` line-ending noise and may require explicit cleanup around test runs.
- Preferred iterative verification during implementation:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test:unit -- src/app/keyboard-shortcuts.test.ts src/App.test.ts src/lib/preview-engine.test.ts`
- Before commits and before final verification, clean transient test artifacts:
  - `git checkout -- test\test-mcp-search-all.js`
  - `Remove-Item -Recurse -Force test\_mcp-api-server-tmp -ErrorAction SilentlyContinue`

### Task 1: Add failing tests for preview gating and menu state

**Files:**
- Modify: `src\App.test.ts`
- Modify: `src\app\keyboard-shortcuts.test.ts`
- Check: `src\components\MenuBar.vue`
- Check: `src\App.vue`
- Check: `src\stores\app-store.ts`

- [ ] **Step 1: Add a failing app-shell test for disabled preview when the active file is non-charx**

Add a test in `src\App.test.ts` that:

- mounts `App` with Pinia
- sets `store.setFileData({ _fileType: 'risup', name: 'Preset' } as never)`
- opens the `보기` menu
- asserts the `프리뷰` menu action has a disabled marker/class/attribute

- [ ] **Step 2: Add a failing app-shell test for enabled preview when the active file is charx**

Add a sibling test in `src\App.test.ts` that:

- mounts `App`
- sets `store.setFileData({ name: 'Character' } as never)`
- opens the `보기` menu
- asserts the `프리뷰` action is not disabled

- [ ] **Step 3: Add a focused keyboard shortcut regression test for F5 dispatch**

Extend `src\app\keyboard-shortcuts.test.ts` with:

```ts
it('opens preview on F5', () => {
  const deps = {
    handleNew: vi.fn(),
    handleOpen: vi.fn(),
    handleSave: vi.fn(),
    handleSaveAs: vi.fn(),
    closeActiveTab: vi.fn(),
    toggleSidebar: vi.fn(),
    toggleTerminal: vi.fn(),
    showPreviewPanel: vi.fn(),
    showSettingsPopup: vi.fn(),
  };

  initKeyboard(deps as never);
  dispatchKeyboardEvent({ key: 'F5' });

  expect(deps.showPreviewPanel).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 4: Run the focused tests to confirm they fail**

Run:

```powershell
npm run test:unit -- src\App.test.ts src\app\keyboard-shortcuts.test.ts
```

Expected:

- `keyboard-shortcuts.test.ts` passes or stays green
- new `App.test.ts` preview disabled-state assertions fail because the menu does not yet react to file type

- [ ] **Step 5: Commit the failing test slice**

```powershell
git add src\App.test.ts src\app\keyboard-shortcuts.test.ts
git commit -m "test: add failing preview gating regressions" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 2: Implement charx-only previewability and menu disabled state

**Files:**
- Modify: `src\stores\app-store.ts`
- Modify: `src\App.vue`
- Modify: `src\components\MenuBar.vue`
- Test: `src\App.test.ts`

- [ ] **Step 1: Add a computed previewability flag to the app store**

In `src\stores\app-store.ts`, add a small computed similar to `isRisum`:

```ts
const canPreviewCurrentFile = computed(() => Boolean(fileData.value) && !fileData.value?._fileType);
```

Return it from the store.

- [ ] **Step 2: Pass previewability from `App.vue` into `MenuBar`**

Update the `MenuBar` usage so it receives the new store-derived flag:

```vue
<MenuBar :can-preview-current-file="store.canPreviewCurrentFile" @action="handleAction">
```

- [ ] **Step 3: Add disabled-state support to `MenuBar.vue`**

Update `MenuBar.vue` to:

- accept a `canPreviewCurrentFile` prop
- extend `MenuItem` with `disabled?: boolean`
- mark the `프리뷰` action disabled when `canPreviewCurrentFile` is false
- prevent `handleAction(...)` for disabled items
- render a disabled class or attribute for disabled items

Keep the menu otherwise static.

- [ ] **Step 4: Run the focused app-shell tests**

Run:

```powershell
npm run test:unit -- src\App.test.ts
```

Expected:

- the new preview disabled/enabled tests pass
- unrelated existing `App.test.ts` assertions stay green

- [ ] **Step 5: Commit the UI/menu slice**

```powershell
git add src\stores\app-store.ts src\App.vue src\components\MenuBar.vue src\App.test.ts
git commit -m "feat: disable preview menu for non-charx files" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 3: Guard preview opening in the controller

**Files:**
- Modify: `src\app\controller.ts`
- Test: reuse `src\App.test.ts` only if sufficient; otherwise add the smallest focused coverage that proves controller-driven preview opening is blocked for non-charx

- [ ] **Step 1: Add the charx-only guard to `showPreviewPanel()`**

Near the existing `if (!fileData)` branch, add:

```ts
if (fileData._fileType) {
  setStatus('프리뷰는 .charx 파일에서만 사용할 수 있습니다');
  return;
}
```

Keep this guard before:

- preview overlay removal
- asset loading
- Wasmoon initialization

- [ ] **Step 2: Verify no keyboard branching is needed**

Confirm `src\app\keyboard-shortcuts.ts` remains unchanged because `F5` already routes through `showPreviewPanel()`.

- [ ] **Step 3: Run targeted verification**

Run:

```powershell
npm run test:unit -- src\App.test.ts src\app\keyboard-shortcuts.test.ts
npm run typecheck
```

Expected:

- tests stay green
- typecheck succeeds with the new prop/store wiring

- [ ] **Step 4: Commit the controller guard**

```powershell
git add src\app\controller.ts src\app\keyboard-shortcuts.test.ts src\App.test.ts
git commit -m "fix: block preview for non-charx files" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 4: Activate the four preview-local setter stubs

**Files:**
- Modify: `src\lib\preview-engine.ts`
- Modify: `src\lib\preview-engine.test.ts`

- [ ] **Step 1: Add failing setter tests in `preview-engine.test.ts`**

Extend the existing preview engine tests to execute Lua that calls:

- `setDescription`
- `setPersonality`
- `setScenario`
- `setFirstMessage`

Then assert the preview engine exposes the updated runtime state through the nearest existing observable surface already used in the test file.

Important:

- use the smallest existing test harness already present in `preview-engine.test.ts`
- do not invent a larger harness or new test runtime abstraction

- [ ] **Step 2: Run the focused preview-engine test**

Run:

```powershell
npm run test:unit -- src\lib\preview-engine.test.ts
```

Expected:

- the new setter tests fail because the bindings are still stubs

- [ ] **Step 3: Replace the four stubs with preview-local string writes**

In `src\lib\preview-engine.ts`, replace:

```ts
luaEngine.global.set('setDescription', (_id: unknown, _desc: unknown) => {
  /* stub */
});
```

with the minimal local-state version:

```ts
luaEngine.global.set('setDescription', (_id: unknown, desc: unknown) => {
  charDescription = String(desc ?? '');
});
```

Apply the same shape to:

- `setPersonality`
- `setScenario`
- `setFirstMessage`

Do not modify any chat stubs.

- [ ] **Step 4: Re-run the focused preview-engine test**

Run:

```powershell
npm run test:unit -- src\lib\preview-engine.test.ts
```

Expected:

- the new setter tests pass
- existing preview-engine tests remain green

- [ ] **Step 5: Commit the setter activation slice**

```powershell
git add src\lib\preview-engine.ts src\lib\preview-engine.test.ts
git commit -m "feat: activate preview-local lua field setters" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 5: Release docs, version bump, and final verification

**Files:**
- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Update release docs and version metadata**

Make these updates:

- `CHANGELOG.md`
  - add `## [0.35.0] - 2026-04-01`
  - record the charx-only preview rule and preview-local setter activation
- `package.json`
  - bump version to `0.35.0`
- `package-lock.json`
  - align version metadata
- `AGENTS.md`
  - note that preview is intentionally available only for `charx` files
- `README.md`
  - add or adjust a concise user-facing preview note only if the current README already has an appropriate preview/features section

- [ ] **Step 2: Run pre-release cleanup for known transient artifacts**

Run:

```powershell
git checkout -- test\test-mcp-search-all.js
Remove-Item -Recurse -Force test\_mcp-api-server-tmp -ErrorAction SilentlyContinue
```

- [ ] **Step 3: Run final bounded verification**

Run:

```powershell
npm run lint
npm run typecheck
npm run test:unit -- src\App.test.ts src\app\keyboard-shortcuts.test.ts src\lib\preview-engine.test.ts
```

Then, if the worktree has the required dependencies and the environment is stable enough, run:

```powershell
npm run build
```

If `npm run build` reproduces the known worktree-only Monaco/static-copy setup issue without any code failure signal, document that as an environmental baseline caveat and rely on the bounded verification evidence above plus any safe build path available from the prepared environment.

- [ ] **Step 4: Commit the release**

```powershell
git add AGENTS.md README.md CHANGELOG.md package.json package-lock.json
git commit -m "v0.35.0: gate preview to charx files" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

- [ ] **Step 5: Push, tag, release, and clean up**

After review approval and merged verification:

```powershell
git push -u origin feature/preview-charx-v0350
git checkout main
git pull
git merge feature/preview-charx-v0350
npm run lint
npm run typecheck
npm run test:unit -- src\App.test.ts src\app\keyboard-shortcuts.test.ts src\lib\preview-engine.test.ts
git push origin main
git tag -a v0.35.0 -m "v0.35.0"
git push origin v0.35.0
```

Then verify the GitHub Release workflow succeeds before removing the feature worktree and deleting the feature branch.
