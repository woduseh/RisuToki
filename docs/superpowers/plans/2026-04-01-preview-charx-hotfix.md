# Preview Charx Hotfix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `v0.35.1` so explicit `_fileType: 'charx'` documents remain previewable, `.risum` / `.risup` stay blocked, and `{{charpersona}}` resolves to personality instead of description.

**Architecture:** Keep the patch small and local: normalize previewability only in the two existing preview consumers (`app-store` and `controller`) while leaving serializer behavior unchanged. Fix the `charpersona` semantic mismatch in `preview-engine`, strengthen regression tests so explicit `charx` fixtures are covered, then release the patch with updated version metadata and bounded documentation.

**Tech Stack:** TypeScript, Vue 3, Pinia, Vitest, existing npm release/build scripts

---

## File Map

- Modify: `src\App.test.ts` — change the charx preview-enabled fixture to explicit `_fileType: 'charx'`.
- Modify: `src\stores\app-store.test.ts` — add focused previewability coverage for null, missing, `charx`, `risum`, and `risup`.
- Modify: `src\lib\preview-engine.test.ts` — add failing regressions for `{{charpersona}}` versus `{{chardesc}}`.
- Modify: `src\stores\app-store.ts` — normalize `canPreviewCurrentFile` around resolved file type.
- Modify: `src\app\controller.ts` — normalize the runtime preview gate around resolved file type.
- Modify: `src\lib\preview-engine.ts` — map `charpersona` to `charPersonality`.
- Modify: `CHANGELOG.md` — add the `0.35.1` patch entry.
- Modify: `README.md` — update released version metadata.
- Modify: `AGENTS.md` — note that preview charx checks must accept missing `_fileType` and explicit `'charx'`.
- Modify: `package.json` — bump version to `0.35.1`.
- Modify: `package-lock.json` — keep lockfile metadata aligned.

## Task 1: Add failing regressions for explicit charx previewability and charpersona semantics

**Files:**

- Modify: `src\App.test.ts`
- Modify: `src\stores\app-store.test.ts`
- Modify: `src\lib\preview-engine.test.ts`

- [ ] **Step 1: Change the app-shell charx fixture to explicit `_fileType: 'charx'`**

In `src\App.test.ts`, update the existing enabled-state preview test:

```ts
store.setFileData({ _fileType: 'charx', name: 'Character' } as never);
```

Keep the assertion the same:

```ts
expect(previewAction!.classes()).not.toContain('disabled');
```

- [ ] **Step 2: Add focused store-level previewability tests**

Extend `src\stores\app-store.test.ts` with a new describe block that verifies:

```ts
it('treats explicit charx as previewable', () => {
  const store = useAppStore();
  store.setFileData({ _fileType: 'charx', name: 'Character' } as never);
  expect(store.canPreviewCurrentFile).toBe(true);
});

it('treats risum as non-previewable', () => {
  const store = useAppStore();
  store.setFileData({ _fileType: 'risum', name: 'Module' } as never);
  expect(store.canPreviewCurrentFile).toBe(false);
});
```

Also add sibling assertions for:

- `null` file data → `false`
- missing `_fileType` → `true`
- `_fileType: 'risup'` → `false`

- [ ] **Step 3: Add failing macro regressions in `preview-engine.test.ts`**

Add three focused tests:

```ts
it('{{charpersona}} resolves to personality, not description', () => {
  PreviewEngine.resetVars();
  PreviewEngine.setCharDescription('tall elf');
  PreviewEngine.setCharPersonality('brave');

  expect(PreviewEngine.risuChatParser('{{charpersona}}')).toBe('brave');
});

it('{{chardesc}} remains mapped to description', () => {
  PreviewEngine.resetVars();
  PreviewEngine.setCharDescription('tall elf');
  PreviewEngine.setCharPersonality('brave');

  expect(PreviewEngine.risuChatParser('{{chardesc}}')).toBe('tall elf');
});
```

Add one more test in the existing Lua setter area:

```ts
expect(PreviewEngine.risuChatParser('{{charpersona}}')).toBe('new personality');
```

after calling the already-available `setPersonality` Lua setter.

- [ ] **Step 4: Run the focused tests and confirm they fail for the right reasons**

Run:

```powershell
npm run test:unit -- src\App.test.ts src\stores\app-store.test.ts src\lib\preview-engine.test.ts
```

Expected:

- the explicit charx app-shell test fails because the preview action is still disabled
- the new store previewability tests fail because explicit `'charx'` is still treated as non-previewable
- the new `charpersona` regression fails because it still resolves to description

- [ ] **Step 5: Do not commit yet unless a checkpoint is truly needed**

Keep the failing tests local and proceed straight to the minimal production fix unless a checkpoint becomes useful.

## Task 2: Implement the bounded `v0.35.1` hotfix

**Files:**

- Modify: `src\stores\app-store.ts`
- Modify: `src\app\controller.ts`
- Modify: `src\lib\preview-engine.ts`
- Test: `src\App.test.ts`
- Test: `src\stores\app-store.test.ts`
- Test: `src\lib\preview-engine.test.ts`

- [ ] **Step 1: Normalize `canPreviewCurrentFile` in the app store**

Update `src\stores\app-store.ts` so the computed uses resolved file type semantics:

```ts
const canPreviewCurrentFile = computed(() => {
  if (!fileData.value) return false;
  const fileType = fileData.value._fileType || 'charx';
  return fileType === 'charx';
});
```

- [ ] **Step 2: Normalize the controller preview gate**

Update `src\app\controller.ts` inside `showPreviewPanel()`:

```ts
const previewFileType = fileData._fileType || 'charx';
if (previewFileType !== 'charx') {
  setStatus('프리뷰는 .charx 파일에서만 사용할 수 있습니다');
  return;
}
```

Keep the no-file guard and the placement before asset loading unchanged.

- [ ] **Step 3: Fix the `charpersona` macro mapping**

Update `src\lib\preview-engine.ts`:

```ts
- reg('charpersona', () => charDescription);
+ reg('charpersona', () => charPersonality);
```

Do not change any other macro aliases in this patch.

- [ ] **Step 4: Re-run the focused regression tests**

Run:

```powershell
npm run test:unit -- src\App.test.ts src\stores\app-store.test.ts src\lib\preview-engine.test.ts
npm run typecheck
```

Expected:

- all new previewability and macro regressions pass
- the touched files remain type-safe

- [ ] **Step 5: Commit the production hotfix**

```powershell
git add src\App.test.ts src\stores\app-store.test.ts src\stores\app-store.ts src\app\controller.ts src\lib\preview-engine.ts src\lib\preview-engine.test.ts
git commit -m "fix: restore explicit charx previewability" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

## Task 3: Update release docs, version metadata, and verification

**Files:**

- Modify: `CHANGELOG.md`
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Add the `0.35.1` changelog entry**

Insert a new top section in `CHANGELOG.md`:

```md
## [0.35.1] - 2026-04-01

### 수정

- **charx 프리뷰 게이트 회귀 수정**: 직렬화 뒤 `_fileType: 'charx'`가 명시된 실제 `.charx` 문서가 보기 메뉴와 `F5` 경로에서 잘못 차단되던 문제를 수정
- **preview macro 정합성 수정**: `{{charpersona}}`가 description 대신 personality를 읽도록 수정
```

- [ ] **Step 2: Update user-facing and agent-facing docs**

Apply the smallest correct doc updates:

- `README.md` version badge → `0.35.1`
- `AGENTS.md` preview note should explicitly say preview charx checks must accept both:
  - missing `_fileType`
  - explicit `_fileType: 'charx'`

- [ ] **Step 3: Bump package version metadata**

Run:

```powershell
npm version --no-git-tag-version 0.35.1
```

Expected:

- `package.json` version becomes `0.35.1`
- `package-lock.json` version metadata stays aligned

- [ ] **Step 4: Run repository verification**

Run:

```powershell
npm run lint
npm run typecheck
npm run build
```

Expected:

- lint passes
- typecheck passes
- full build passes with the hotfix included

- [ ] **Step 5: Commit release docs and version metadata**

```powershell
git add CHANGELOG.md README.md AGENTS.md package.json package-lock.json
git commit -m "v0.35.1: fix preview charx regression" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

## Task 4: Review, merge, publish, and clean up the hotfix release

**Files / surfaces:**

- Review branch diff in `hotfix/preview-hotfix-v0351`
- Merge into `main`
- Push `main`
- Push annotated tag `v0.35.1`
- Verify GitHub Actions Release workflow
- Clean up hotfix branch/worktree and update session state

- [ ] **Step 1: Request a final hotfix review**

Dispatch a review agent against the completed hotfix branch and address any real blocking issues before merge.

- [ ] **Step 2: Merge the hotfix branch into `main`**

From the repository root:

```powershell
git checkout main
git merge --no-ff hotfix/preview-hotfix-v0351 -m "Merge hotfix/preview-hotfix-v0351 for v0.35.1"
```

- [ ] **Step 3: Verify merged `main`**

Run:

```powershell
npm run build
```

Expected: merged `main` stays green before publish.

- [ ] **Step 4: Push `main` and publish the tag**

Run:

```powershell
git push origin main
git tag -a v0.35.1 -m "v0.35.1"
git push origin v0.35.1
```

- [ ] **Step 5: Verify the release workflow succeeds**

Use the GitHub Actions tools to:

- find the `Release` workflow run triggered by `v0.35.1`
- confirm the build/package/upload job succeeds
- record the workflow run ID and job ID in session state

- [ ] **Step 6: Clean up and update tracking**

After the release is verified:

- remove the hotfix worktree
- delete the local hotfix branch
- update session SQL todos/status
- update the session `plan.md` so `v0.35.1` is recorded as shipped and `v0.36.0` resumes as the next natural slice
