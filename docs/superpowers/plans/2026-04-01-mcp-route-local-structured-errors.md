# MCP Route-local Structured Errors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert every remaining route-local bare MCP `jsonRes({ error }, 4xx/409)` response to the structured `mcpError()` envelope, while explicitly leaving global guards and HTTP-200 no-op responses unchanged.

**Architecture:** Keep the implementation local to `src\lib\mcp-api-server.ts` call sites and extend the existing `src\lib\mcp-api-server.test.ts` structured-envelope regression style. Do not change helper signatures or route semantics; instead, migrate the remaining route-local 4xx/409 handlers onto the established `mcpError()` contract and prove each family with focused red-green tests.

**Tech Stack:** TypeScript, Vitest, Node/Electron MCP HTTP server, existing `mcpError()` / `jsonMcpError()` helpers, GitHub Actions release workflow.

---

## File Map

### Production files

- Modify: `src\lib\mcp-api-server.ts`
  - Remaining bare route-local errors live here.
  - In-scope blocks include:
    - reference routes around `5836-6266`
    - asset routes around `6310-6430`
    - risum-asset add around `6979-7002`
    - risup reorder and formating-order around `7607-7890`
    - skills file reads around `7964-7980`

### Test files

- Modify: `src\lib\mcp-api-server.test.ts`
  - Existing relevant blocks:
    - `describe('MCP API risum asset compatibility', ...)`
    - `describe('MCP API risup prompt-item routes', ...)`
    - `it('returns canonical folder identity from reference lorebook read endpoints', ...)`
    - `describe('MCP API skills routes', ...)`
    - `describe('MCP API structured error envelopes — regex routes', ...)`
    - `describe('MCP API structured error envelopes — field routes', ...)`
    - `describe('MCP API structured error envelopes — lorebook ...', ...)`
  - Reuse the existing `McpErrorEnvelope` assertion pattern instead of inventing a new test helper.

### Release/docs files

- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `CHANGELOG.md`
- Modify: `README.md`
- Modify: `AGENTS.md`
- Create/force-add: `docs\superpowers\plans\2026-04-01-mcp-route-local-structured-errors.md`

### Important repo constraints

- `.gitignore` ignores `docs/`, so spec/plan docs must be staged with `git add -f`.
- `package.json` currently reports `0.36.0`; this plan assumes the implementation release becomes `0.37.0`.
- `AGENTS.md` still says reference routes are not converted; update that note when the work ships.
- Do **not** touch:
  - global guards returning `Unauthorized` / `No file open`
  - HTTP-200 `success: false` no-op responses
  - risup prompt item ID-routing

---

### Task 1: Add failing reference-route structured-envelope tests

**Files:**
- Modify: `src\lib\mcp-api-server.test.ts`
- Reference: `src\lib\mcp-api-server.ts:5836-6266`

- [ ] **Step 1: Write the failing tests for reference-route read errors**

Add a new block near the existing structured-envelope suites:

```ts
describe('MCP API structured error envelopes — reference routes', () => {
  it('returns a structured envelope for out-of-range reference lorebook read', async () => {
    const api = await startTestApiServer({ lorebook: [] }, []);
    try {
      const res = await getJson<McpErrorEnvelope>(api.port, api.token, '/reference/99/lorebook');
      expect(res.status).toBe(400);
      expect(res.data.action).toBe('read reference lorebook');
      expect(res.data.status).toBe(400);
      expect(res.data.target).toBe('reference:99:lorebook');
      expect(res.data.error).toContain('Reference index');
    } finally {
      await closeServer(api.server);
    }
  });
});
```

Also add failing cases for:

- `POST /reference/:idx/lorebook/batch` invalid `indices`
- `GET /reference/:idx/lorebook/:entryIdx` invalid entry index
- `GET /reference/:idx/regex/:entryIdx` invalid entry index
- `POST /reference/:idx/lua/batch` oversized `indices`
- `GET /reference/:idx/lua/:sectionIdx` invalid section index
- `POST /reference/:idx/css/batch` invalid `indices`
- `GET /reference/:idx/css/:sectionIdx` invalid section index
- `GET /reference/:idx/:field` unknown field

- [ ] **Step 2: Run the focused reference tests and verify they fail**

Run:

```bash
npm run test:unit -- src\lib\mcp-api-server.test.ts
```

Expected:

- FAIL on the new reference structured-envelope assertions because the current handlers still return bare `{ error }`

- [ ] **Step 3: Implement minimal reference-route conversions**

In `src\lib\mcp-api-server.ts`, replace the remaining bare reference-route `jsonRes(res, { error: ... }, 400)` calls with `mcpError(...)`.

Follow these action/target patterns:

```ts
return mcpError(res, 400, {
  action: 'read reference lorebook',
  message: `Reference index ${idx} out of range`,
  suggestion: 'list_references로 유효한 reference index를 다시 확인하세요.',
  target: `reference:${idx}:lorebook`,
});
```

Apply the same pattern to:

- `batch read reference lorebook`
- `read reference regex`
- `read reference lua`
- `batch read reference lua`
- `read reference css`
- `batch read reference css`
- `read reference field`

For sub-entry or sub-section errors, keep the message specific to the child index and keep the route-family-specific action.

- [ ] **Step 4: Run the focused reference tests and verify they pass**

Run:

```bash
npm run test:unit -- src\lib\mcp-api-server.test.ts
```

Expected:

- PASS for the new reference structured-envelope cases

- [ ] **Step 5: Commit the reference-route slice**

```bash
git add src/lib/mcp-api-server.ts src/lib/mcp-api-server.test.ts
git commit -m "fix: harden reference MCP error envelopes"
```

---

### Task 2: Add failing asset and risum-asset structured-envelope tests

**Files:**
- Modify: `src\lib\mcp-api-server.test.ts`
- Reference: `src\lib\mcp-api-server.ts:6310-6430`
- Reference: `src\lib\mcp-api-server.ts:6979-7002`

- [ ] **Step 1: Write the failing asset and risum-asset tests**

Extend existing compatibility blocks or add a new structured-envelope block with tests for:

- `POST /asset/add` missing `fileName` or `base64`
- `POST /asset/add` invalid file name
- `POST /asset/add` duplicate path returns `409` structured envelope
- `POST /asset/:idx/rename` invalid `newName`
- `POST /risum-asset/add` missing `name` or `base64`

Example:

```ts
const res = await postJson<McpErrorEnvelope>(api.port, api.token, '/asset/add', {
  fileName: '',
  base64: '',
});
expect(res.status).toBe(400);
expect(res.data.action).toBe('add_asset');
expect(res.data.target).toBe('asset:add');
expect(res.data.error).toContain('필요합니다');
```

- [ ] **Step 2: Run the focused unit tests and verify they fail**

Run:

```bash
npm run test:unit -- src\lib\mcp-api-server.test.ts
```

Expected:

- FAIL on the new asset and risum-asset envelope assertions

- [ ] **Step 3: Implement minimal asset and risum-asset conversions**

Replace the remaining bare handlers with `mcpError(...)`, keeping existing naming:

- `add_asset`
- `rename_asset`
- `add_risum_asset`

Use these target conventions:

- `asset:add`
- `asset:${idx}`
- `asset:${assetPath}` for duplicate-path conflict
- `risum-asset:add`

Preserve the `409` duplicate-path status:

```ts
return mcpError(res, 409, {
  action: 'add_asset',
  message: `에셋 경로 "${assetPath}"가 이미 존재합니다.`,
  suggestion: '다른 파일명이나 폴더를 사용하세요.',
  target: `asset:${assetPath}`,
});
```

- [ ] **Step 4: Run the focused unit tests and verify they pass**

Run:

```bash
npm run test:unit -- src\lib\mcp-api-server.test.ts
```

Expected:

- PASS for the new asset and risum-asset cases

- [ ] **Step 5: Commit the asset slice**

```bash
git add src/lib/mcp-api-server.ts src/lib/mcp-api-server.test.ts
git commit -m "fix: harden asset MCP error envelopes"
```

---

### Task 3: Add failing risup reorder, formating-order, and skills structured-envelope tests

**Files:**
- Modify: `src\lib\mcp-api-server.test.ts`
- Reference: `src\lib\mcp-api-server.ts:7607-7890`
- Reference: `src\lib\mcp-api-server.ts:7964-7980`

- [ ] **Step 1: Write the failing risup and skills tests**

Add failing cases for:

- `POST /risup/prompt-item/reorder` wrong-length `order`
- `POST /risup/prompt-item/reorder` non-permutation `order`
- `POST /risup/formating-order` non-array `items`
- `GET /skills/:name/:file` traversal-shaped file name

Example:

```ts
const blocked = await getJson<McpErrorEnvelope>(
  api.port,
  api.token,
  '/skills/reference-skill/..%2F..%2Fpackage.json',
);
expect(blocked.status).toBe(400);
expect(blocked.data.action).toBe('read_skill');
expect(blocked.data.target).toContain('skills:reference-skill');
```

- [ ] **Step 2: Run the focused unit tests and verify they fail**

Run:

```bash
npm run test:unit -- src\lib\mcp-api-server.test.ts
```

Expected:

- FAIL on the new risup and skills envelope assertions

- [ ] **Step 3: Implement minimal risup and skills conversions**

Convert the remaining bare route-local handlers to `mcpError(...)` using existing naming already present nearby:

- `reorder risup prompt items`
- `write risup formating order`
- `read_skill`

Targets:

- `risup:promptTemplate`
- `risup:formatingOrder`
- `skills:${skillName}:${fileName}`

For the reorder length mismatch case, keep the current message text but move it into `message`.

- [ ] **Step 4: Run the focused unit tests and verify they pass**

Run:

```bash
npm run test:unit -- src\lib\mcp-api-server.test.ts
```

Expected:

- PASS for the new risup and skills cases

- [ ] **Step 5: Commit the risup and skills slice**

```bash
git add src/lib/mcp-api-server.ts src/lib/mcp-api-server.test.ts
git commit -m "fix: harden remaining MCP route-local errors"
```

---

### Task 4: Run full MCP verification and check remaining bare errors

**Files:**
- Verify: `src\lib\mcp-api-server.ts`
- Verify: `src\lib\mcp-api-server.test.ts`

- [ ] **Step 1: Run the focused MCP test file**

Run:

```bash
npm run test:unit -- src\lib\mcp-api-server.test.ts
```

Expected:

- PASS with no failures in the MCP API test file

- [ ] **Step 2: Confirm only deferred bare errors remain**

Run:

```bash
rg "jsonRes\\(res, \\{ error:" src/lib/mcp-api-server.ts -n
```

Expected:

- Only the two global guards remain:
  - `Unauthorized`
  - `No file open`

- [ ] **Step 3: Confirm HTTP-200 no-op responses were not accidentally changed**

Run:

```bash
rg "success:\\s*false" src/lib/mcp-api-server.ts -n
```

Expected:

- The valid-but-no-op response sites still exist
- No new `mcpError()` conversions were applied there

- [ ] **Step 4: Run repository-wide verification**

Run:

```bash
npm run build
```

Expected:

- `lint` passes
- `typecheck` passes
- `test` passes
- Electron and renderer builds pass

- [ ] **Step 5: Commit the verified implementation state if needed**

If the earlier task commits already cover the code exactly, skip this commit.

Otherwise:

```bash
git add src/lib/mcp-api-server.ts src/lib/mcp-api-server.test.ts
git commit -m "test: verify route-local MCP error rollout"
```

---

### Task 5: Update release metadata and docs for `v0.37.0`

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `CHANGELOG.md`
- Modify: `README.md`
- Modify: `AGENTS.md`
- Force-add: `docs\superpowers\specs\2026-04-01-mcp-route-local-structured-errors-design.md`
- Force-add: `docs\superpowers\plans\2026-04-01-mcp-route-local-structured-errors.md`

- [ ] **Step 1: Bump the version to `0.37.0`**

Update:

- `package.json`
- `package-lock.json`

Keep both root version fields aligned.

- [ ] **Step 2: Add the changelog entry**

Add:

```md
## [0.37.0] - 2026-04-01
```

Document:

- reference-route structured-envelope rollout
- remaining asset / risum-asset / risup / skills route-local envelope cleanup
- explicit deferral of global guards and HTTP-200 no-op responses

- [ ] **Step 3: Update user-facing docs**

Adjust:

- `README.md` version badge and MCP capability wording
- `AGENTS.md` MCP contract note so it says route-local handlers are now covered and only global guards / HTTP-200 no-op responses remain deferred

- [ ] **Step 4: Run final verification after doc/version updates**

Run:

```bash
npm run build
```

Expected:

- Full repository verification still passes after the version/doc changes

- [ ] **Step 5: Create the release commit**

```bash
git add package.json package-lock.json CHANGELOG.md README.md AGENTS.md src/lib/mcp-api-server.ts src/lib/mcp-api-server.test.ts
git add -f docs/superpowers/specs/2026-04-01-mcp-route-local-structured-errors-design.md
git add -f docs/superpowers/plans/2026-04-01-mcp-route-local-structured-errors.md
git commit -m "v0.37.0: complete route-local MCP error envelopes"
```

---

### Task 6: Push, merge, release, and clean up

**Files:**
- Verify git branch and release state only

- [ ] **Step 1: Push the feature branch**

Run:

```bash
git push -u origin feature/mcp-route-local-errors-v0370
```

Expected:

- Remote branch created successfully

- [ ] **Step 2: Merge into `main` and verify on merged main**

From the root worktree:

```bash
git checkout main
git merge --ff-only feature/mcp-route-local-errors-v0370
npm run build
```

Expected:

- Fast-forward merge succeeds
- Full merged-main build passes

- [ ] **Step 3: Push `main`, tag `v0.37.0`, and push the tag**

Run:

```bash
git push origin main
git tag v0.37.0
git push origin v0.37.0
```

Expected:

- `origin/main` updated
- tag published

- [ ] **Step 4: Verify the GitHub Release workflow succeeds**

Check the release workflow and confirm:

- workflow run reaches `completed`
- conclusion is `success`
- the release upload step succeeds

- [ ] **Step 5: Clean up the worktree and branch**

After the release workflow succeeds:

```bash
git worktree remove .worktrees/mcp-route-local-errors-v0370
git branch -d feature/mcp-route-local-errors-v0370
git push origin --delete feature/mcp-route-local-errors-v0370
```

Expected:

- feature worktree removed
- local and remote feature branches deleted
- unrelated worktrees remain untouched

---

## Notes for Implementers

- Stay TDD-first. Each route family should get failing tests before production edits.
- Do not broaden the scope into global guard or HTTP-200 no-op changes just because the patterns look adjacent.
- Preserve existing route semantics and HTTP status codes exactly.
- `mcpError()` still requires `message`; that `message` becomes the top-level `error` field in the serialized envelope, so the tests should keep asserting both the top-level `error` string and the additive fields.
- The worktree may need local dependencies if `build:renderer` complains about missing Monaco assets. If so, run:

```bash
npm ci --ignore-scripts --no-audit --no-fund
```

inside the feature worktree before the final build.
