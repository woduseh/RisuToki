# MCP Field and Lorebook Structured Error Envelope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `v0.36.0` by converting the remaining field and lorebook MCP validation guards from bare `{ error }` 400 responses to the structured `mcpError()` envelope.

**Architecture:** Keep the rollout narrow and mechanical. Add failing structured-error regressions in `src\lib\mcp-api-server.test.ts`, convert only the field and lorebook bare-400 validation guards in `src\lib\mcp-api-server.ts`, and leave reference routes, global guards, and `success: false` no-op responses untouched.

**Tech Stack:** TypeScript, Node HTTP server, Vitest, existing npm build/test/release scripts

---

## File Map

- Modify: `src\lib\mcp-api-server.test.ts` — add failing structured-error coverage for field and lorebook route families.
- Modify: `src\lib\mcp-api-server.ts` — replace the remaining field+lorebook bare 400 validation returns with `mcpError()`.
- Modify: `CHANGELOG.md` — add the `0.36.0` release entry.
- Modify: `README.md` — update the released version and describe the bounded MCP error-envelope expansion.
- Modify: `AGENTS.md` — document that field+lorebook validation routes now use structured error envelopes while reference/no-op routes remain deferred.
- Modify: `package.json` — bump version to `0.36.0`.
- Modify: `package-lock.json` — keep lockfile metadata aligned.
- Create: `docs\superpowers\specs\2026-04-01-mcp-field-lorebook-structured-errors-design.md`
- Create: `docs\superpowers\plans\2026-04-01-mcp-field-lorebook-structured-errors.md`

## Preflight

**Files:**

- Modify: none
- Test: `src\lib\mcp-api-server.test.ts`

- [ ] **Step 1: Generate node-library artifacts required by lorebook MCP tests**

Run:

```powershell
npm run build:node-libs
```

Expected: `tsc -p tsconfig.node-libs.json` exits successfully.

- [ ] **Step 2: Confirm the current MCP API baseline before adding tests**

Run:

```powershell
npm run test:unit -- src\lib\mcp-api-server.test.ts
```

Expected: the existing MCP API test file passes on the fresh `v0.35.1` baseline.

## Task 1: Add failing field structured-error regressions

**Files:**

- Modify: `src\lib\mcp-api-server.test.ts`
- Test: `src\lib\mcp-api-server.test.ts`

- [ ] **Step 1: Add a new field structured-error describe block**

Add a sibling section after the existing CSS structured-error tests:

```ts
describe('MCP API structured error envelopes — field routes', () => {
  it('returns a structured error envelope for unknown field in GET /field/:name', async () => {
    const api = await startTestApiServer(createSearchFixture());
    try {
      const res = await getJson<McpErrorEnvelope>(api.port, api.token, '/field/not-a-real-field');
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'field:not-a-real-field');
      expect(res.data.error).toContain('Unknown field');
    } finally {
      await closeServer(api.server);
    }
  });
});
```

In the same describe block, add sibling tests for:

- `POST /field/batch` with `fields: 'not-an-array'`
- `POST /field/batch` with 21 fields
- `POST /field/batch-write` with `entries: []`
- `POST /field/batch-write` with 21 entries
- `POST /field/description/insert` with `position: 'after'` and no `anchor`
- `POST /field/description/batch-replace` with `replacements: []`
- `POST /field/description/batch-replace` with 51 replacements
- `POST /field/description/batch-replace` with one replacement missing `find`

Each test should assert `action`, `status: 400`, `target`, and a route-specific `error` substring.

- [ ] **Step 2: Run only the new field tests and verify RED**

Run:

```powershell
npm run test:unit -- src\lib\mcp-api-server.test.ts -t "MCP API structured error envelopes — field routes"
```

Expected: FAIL because the current field routes still return bare `{ error }` payloads without `action`, `status`, or `target`.

- [ ] **Step 3: Leave the failing tests in place**

Do not change the tests to match current behavior. Move straight to the minimal production fix.

## Task 2: Implement field structured-error conversions

**Files:**

- Modify: `src\lib\mcp-api-server.ts`
- Test: `src\lib\mcp-api-server.test.ts`

- [ ] **Step 1: Convert the shared `/field/:name` unsupported-field guard**

Replace the bare 400 at the common field-name guard with method-aware action naming:

```ts
const fieldAction = req.method === 'GET' ? 'read field' : 'update field';
return mcpError(res, 400, {
  action: fieldAction,
  message: `Unknown field: ${fieldName} ${hint}`,
  suggestion: 'list_fields 또는 GET /field/batch 로 허용된 필드를 다시 확인하세요.',
  target: `field:${fieldName}`,
});
```

- [ ] **Step 2: Convert field batch-read and batch-write validation guards**

Replace the bare 400s in:

- `POST /field/batch`
- `POST /field/batch-write`

with route-scoped envelopes such as:

```ts
return mcpError(res, 400, {
  action: 'read field batch',
  message: 'fields must be a non-empty string array',
  suggestion: '{ fields: ["name", "description"] } 형식으로 다시 보내세요.',
  target: 'field:batch',
});
```

and:

```ts
return mcpError(res, 400, {
  action: 'batch write field',
  message: `Maximum ${MAX_BATCH_WRITE} entries per batch`,
  suggestion: `entries 배열 길이를 ${MAX_BATCH_WRITE} 이하로 줄여 다시 시도하세요.`,
  target: 'field:batch-write',
});
```

- [ ] **Step 3: Convert field insert and batch-replace validation guards**

Replace the bare 400s in:

- `POST /field/:name/insert`
- `POST /field/:name/batch-replace`

with route-scoped envelopes such as:

```ts
return mcpError(res, 400, {
  action: 'insert in field',
  message: 'position이 "after" 또는 "before"일 때 anchor가 필요합니다',
  suggestion: 'position이 before/after 라면 anchor 문자열을 함께 보내세요.',
  target: `field:${fieldName}`,
});
```

and:

```ts
return mcpError(res, 400, {
  action: 'batch replace in field',
  message: 'Each replacement must include "find"',
  suggestion: '{ replacements: [{ find: "...", replace: "..." }] } 형식으로 전달하세요.',
  target: `field:${fieldName}`,
});
```

- [ ] **Step 4: Re-run the field tests and confirm GREEN**

Run:

```powershell
npm run test:unit -- src\lib\mcp-api-server.test.ts -t "MCP API structured error envelopes — field routes"
```

Expected: PASS.

- [ ] **Step 5: Commit the field slice**

```powershell
git add src\lib\mcp-api-server.ts src\lib\mcp-api-server.test.ts
git commit -m "fix: structure field MCP error envelopes" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

## Task 3: Add failing lorebook read and diff regressions

**Files:**

- Modify: `src\lib\mcp-api-server.test.ts`
- Test: `src\lib\mcp-api-server.test.ts`

- [ ] **Step 1: Add a lorebook read/diff structured-error describe block**

Add a new section:

```ts
describe('MCP API structured error envelopes — lorebook read and diff routes', () => {
  it('returns a structured error envelope for invalid index in GET /lorebook/:idx', async () => {
    const api = await startTestApiServer({ lorebook: [] });
    try {
      const res = await getJson<McpErrorEnvelope>(api.port, api.token, '/lorebook/999');
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'read lorebook entry');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'lorebook:999');
      expect(res.data.error).toContain('out of range');
    } finally {
      await closeServer(api.server);
    }
  });
});
```

In the same block, add sibling tests for:

- `POST /lorebook/batch` with `indices: 'not-an-array'`
- `POST /lorebook/batch` with 51 indices
- `POST /lorebook/diff` with missing `index`
- `POST /lorebook/diff` with missing `refIndex` / `refEntryIndex`
- `POST /lorebook/diff` with current entry index out of range
- `POST /lorebook/diff` with reference file index out of range
- `POST /lorebook/diff` with reference entry index out of range
- `POST /lorebook/clone` with an invalid source index

- [ ] **Step 2: Run only the new lorebook read/diff tests and verify RED**

Run:

```powershell
npm run test:unit -- src\lib\mcp-api-server.test.ts -t "MCP API structured error envelopes — lorebook read and diff routes"
```

Expected: FAIL because these lorebook read/diff guards still return bare `{ error }` payloads.

- [ ] **Step 3: Keep the tests failing and move to implementation**

Do not relax the assertions. The missing envelope is the bug.

## Task 4: Implement lorebook read and diff structured-error conversions

**Files:**

- Modify: `src\lib\mcp-api-server.ts`
- Test: `src\lib\mcp-api-server.test.ts`

- [ ] **Step 1: Convert single-entry lorebook reads and batch reads**

Replace the bare 400s in:

- `GET /lorebook/:idx`
- `POST /lorebook/batch`

with envelopes such as:

```ts
return mcpError(res, 400, {
  action: 'read lorebook entry',
  message: `Index ${idx} out of range`,
  suggestion: 'GET /lorebook 또는 list_lorebook 으로 유효한 index를 다시 확인하세요.',
  target: `lorebook:${idx}`,
});
```

and:

```ts
return mcpError(res, 400, {
  action: 'batch read lorebook',
  message: 'indices must be an array of numbers',
  suggestion: '{ indices: [0, 1, 2] } 형식으로 다시 보내세요.',
  target: 'lorebook:batch',
});
```

- [ ] **Step 2: Convert lorebook diff validation guards**

Replace the bare 400s in `POST /lorebook/diff` with a consistent route-level envelope:

```ts
return mcpError(res, 400, {
  action: 'diff lorebook entry',
  message: 'refIndex and refEntryIndex are required',
  suggestion: '{ index, refIndex, refEntryIndex } 형식으로 현재 항목과 비교 대상을 모두 지정하세요.',
  target: 'lorebook:diff',
});
```

For the out-of-range branches, keep the message specific to the invalid index while keeping the same action family.

- [ ] **Step 3: Convert the lorebook clone invalid-index guard**

Replace:

```ts
return jsonRes(res, { error: `Source index ${sourceIdx} out of range` }, 400);
```

with:

```ts
return mcpError(res, 400, {
  action: 'clone lorebook entry',
  message: `Source index ${sourceIdx} out of range`,
  suggestion: 'GET /lorebook 또는 list_lorebook 으로 복제할 항목의 index를 다시 확인하세요.',
  target: `lorebook:clone:${sourceIdx}`,
});
```

- [ ] **Step 4: Re-run the lorebook read/diff tests and confirm GREEN**

Run:

```powershell
npm run test:unit -- src\lib\mcp-api-server.test.ts -t "MCP API structured error envelopes — lorebook read and diff routes"
```

Expected: PASS.

- [ ] **Step 5: Commit the lorebook read/diff slice**

```powershell
git add src\lib\mcp-api-server.ts src\lib\mcp-api-server.test.ts
git commit -m "fix: structure lorebook read MCP error envelopes" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

## Task 5: Add failing lorebook mutation regressions

**Files:**

- Modify: `src\lib\mcp-api-server.test.ts`
- Test: `src\lib\mcp-api-server.test.ts`

- [ ] **Step 1: Add a lorebook mutation structured-error describe block**

Add a new section:

```ts
describe('MCP API structured error envelopes — lorebook mutation routes', () => {
  it('returns a structured error envelope for empty entries in POST /lorebook/batch-write', async () => {
    const api = await startTestApiServer({ lorebook: [{ comment: 'A', content: 'x', key: 'a', mode: 'normal' }] });
    try {
      const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/lorebook/batch-write', { entries: [] });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('action', 'batch write lorebook');
      expect(res.data).toHaveProperty('status', 400);
      expect(res.data).toHaveProperty('target', 'lorebook:batch-write');
      expect(res.data.error).toContain('entries must be a non-empty array');
    } finally {
      await closeServer(api.server);
    }
  });
});
```

In the same block, add sibling tests for:

- `POST /lorebook/batch-write` with 51 entries
- `POST /lorebook/batch-write` with an invalid entry index
- `POST /lorebook/batch-add` with `entries: []`
- `POST /lorebook/batch-add` with 51 entries
- `POST /lorebook/batch-delete` with `indices: []`
- `POST /lorebook/batch-delete` with 51 indices
- `POST /lorebook/batch-delete` with an invalid index
- `POST /lorebook/batch-replace` with `replacements: []`
- `POST /lorebook/batch-replace` with 51 replacements
- `POST /lorebook/batch-replace` with an invalid replacement index
- `POST /lorebook/batch-replace` with a replacement missing `find`
- `POST /lorebook/batch-insert` with `insertions: []`
- `POST /lorebook/batch-insert` with 51 insertions
- `POST /lorebook/batch-insert` with an invalid insertion index
- `POST /lorebook/batch-insert` with missing `content`
- `POST /lorebook/0/insert` with `position: 'before'` and no `anchor`

- [ ] **Step 2: Run only the new lorebook mutation tests and verify RED**

Run:

```powershell
npm run test:unit -- src\lib\mcp-api-server.test.ts -t "MCP API structured error envelopes — lorebook mutation routes"
```

Expected: FAIL because these mutation guards still return bare `{ error }` payloads.

- [ ] **Step 3: Keep the RED tests unchanged**

The failing assertions are the proof that the old response shape is still present.

## Task 6: Implement lorebook mutation structured-error conversions

**Files:**

- Modify: `src\lib\mcp-api-server.ts`
- Test: `src\lib\mcp-api-server.test.ts`

- [ ] **Step 1: Convert lorebook batch-write, batch-add, and batch-delete validation guards**

Replace the remaining bare 400s in:

- `POST /lorebook/batch-write`
- `POST /lorebook/batch-add`
- `POST /lorebook/batch-delete`

with envelopes using the existing route action names:

```ts
return mcpError(res, 400, {
  action: 'batch delete lorebook entries',
  message: `Invalid index: ${idx}`,
  suggestion: 'GET /lorebook 또는 list_lorebook 으로 삭제할 항목의 index를 다시 확인하세요.',
  target: 'lorebook:batch-delete',
});
```

- [ ] **Step 2: Convert lorebook batch-replace and batch-insert validation guards**

Replace the bare 400s in:

- `POST /lorebook/batch-replace`
- `POST /lorebook/batch-insert`

with `mcpError()` envelopes using:

- `action: 'batch replace lorebook'`
- `action: 'batch insert lorebook'`

and route-specific suggestions such as:

```ts
suggestion: '{ replacements: [{ index: 0, find: "...", replace: "..." }] } 형식으로 다시 보내세요.'
```

and:

```ts
suggestion: '{ insertions: [{ index: 0, content: "..." }] } 형식으로 다시 보내세요.'
```

- [ ] **Step 3: Convert the single-entry lorebook insert anchor-required guard**

Replace:

```ts
return jsonRes(res, { error: 'position이 "after" 또는 "before"일 때 anchor가 필요합니다' }, 400);
```

with:

```ts
return mcpError(res, 400, {
  action: 'insert lorebook content',
  message: 'position이 "after" 또는 "before"일 때 anchor가 필요합니다',
  suggestion: 'position이 before/after 라면 anchor 문자열을 함께 보내세요.',
  target: `lorebook:${idx}`,
});
```

- [ ] **Step 4: Re-run the lorebook mutation tests and confirm GREEN**

Run:

```powershell
npm run test:unit -- src\lib\mcp-api-server.test.ts -t "MCP API structured error envelopes — lorebook mutation routes"
```

Expected: PASS.

- [ ] **Step 5: Commit the lorebook mutation slice**

```powershell
git add src\lib\mcp-api-server.ts src\lib\mcp-api-server.test.ts
git commit -m "fix: structure lorebook mutation MCP error envelopes" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

## Task 7: Update release docs, version metadata, and verify the repository

**Files:**

- Modify: `CHANGELOG.md`
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `docs\superpowers\specs\2026-04-01-mcp-field-lorebook-structured-errors-design.md`
- Create: `docs\superpowers\plans\2026-04-01-mcp-field-lorebook-structured-errors.md`

- [ ] **Step 1: Bump the version to `0.36.0`**

Run:

```powershell
npm version --no-git-tag-version 0.36.0
```

Expected: `package.json` and `package-lock.json` both update to `0.36.0`.

- [ ] **Step 2: Update the changelog and user-facing docs**

Apply the smallest correct docs update:

- `CHANGELOG.md` — add `## [0.36.0] - 2026-04-01`
- `README.md` — update the current release version and say field+lorebook validation routes now return structured MCP error envelopes
- `AGENTS.md` — note that field+lorebook 400 validation guards should use `mcpError()`, while reference/no-op routes remain deferred

- [ ] **Step 3: Re-run the full MCP API test file**

Run:

```powershell
npm run test:unit -- src\lib\mcp-api-server.test.ts
```

Expected: the full MCP API test file passes with the new field+lorebook structured-error coverage.

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
- build passes

- [ ] **Step 5: Commit the release-prep slice**

```powershell
git add CHANGELOG.md README.md AGENTS.md package.json package-lock.json src\lib\mcp-api-server.ts src\lib\mcp-api-server.test.ts
git add -f docs\superpowers\specs\2026-04-01-mcp-field-lorebook-structured-errors-design.md docs\superpowers\plans\2026-04-01-mcp-field-lorebook-structured-errors.md
git commit -m "v0.36.0: complete field and lorebook MCP error envelopes" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

## Task 8: Merge, release, and clean up

**Files:**

- Modify: none
- Test: repository release workflow

- [ ] **Step 1: Rebase or fast-forward-check against `main` before publishing**

Run:

```powershell
git fetch origin
git --no-pager status --short --branch
git --no-pager log --oneline --decorate -5
```

Expected: the worktree is clean except for intended release changes, and the branch is ready to integrate.

- [ ] **Step 2: Push the feature branch for traceability**

```powershell
git push -u origin feature/mcp-errors-v0360
```

- [ ] **Step 3: Merge the verified branch into `main`**

Use the repository’s current fast-forward workflow if still clean:

```powershell
git checkout main
git merge --ff-only feature/mcp-errors-v0360
```

- [ ] **Step 4: Verify the merged `main` branch again**

Run:

```powershell
npm run build
```

Expected: merged `main` still builds successfully.

- [ ] **Step 5: Push `main`, tag the release, and push the tag**

```powershell
git push origin main
git tag v0.36.0
git push origin v0.36.0
```

- [ ] **Step 6: Verify the GitHub Actions release workflow**

Confirm the `Release` workflow for `v0.36.0` completes successfully before claiming the slice is shipped.

- [ ] **Step 7: Clean up local integration artifacts after release verification**

Only after the release workflow succeeds:

```powershell
git worktree remove .worktrees\mcp-errors-v0360
git branch -D feature/mcp-errors-v0360
```
