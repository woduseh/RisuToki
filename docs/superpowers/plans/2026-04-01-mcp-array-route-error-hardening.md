# MCP Array-Route Error Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standardize MCP error envelopes for the bounded array-CRUD route cluster (regex, greetings, lua sections, css sections) by replacing bare `{ error }` responses with structured `mcpError(...)` responses while preserving current status-code semantics.

**Architecture:** Keep all production changes inside `src\lib\mcp-api-server.ts` by reusing the existing `mcpError()` / `jsonMcpError()` helper pair instead of inventing new response abstractions. Add targeted integration tests in `src\lib\mcp-api-server.test.ts` that pin representative structured 400 responses for each migrated route family, then update agent-facing docs to describe the change as additive rather than universal across the whole MCP surface.

**Tech Stack:** TypeScript, Node `http` integration tests with Vitest, existing MCP API server helpers, bundled MCP docs in `AGENTS.md` and `skills\using-mcp-tools\TOOL_REFERENCE.md`, npm version metadata.

---

## File Map

- Modify: `src\lib\mcp-api-server.ts` — migrate bare validation/guard errors in regex, greetings, lua section, and css section routes to structured `mcpError(...)` calls.
- Modify: `src\lib\mcp-api-server.test.ts` — add representative integration tests asserting the new structured error envelope for each migrated route family.
- Modify: `AGENTS.md` — document that `v0.34.0` standardizes structured MCP error responses only for the bounded array-CRUD route cluster, while keeping the top-level `error` field for compatibility.
- Modify: `skills\using-mcp-tools\TOOL_REFERENCE.md` — add a concise response-contract note for the newly standardized cluster.
- Modify: `CHANGELOG.md` — add the eventual `v0.34.0` release section.
- Modify: `package.json` — bump version to `0.34.0` later.
- Modify: `package-lock.json` — keep lockfile version metadata aligned.

## Task 1: Add regression tests for structured error envelopes in the array-CRUD cluster

**Files:**

- Modify: `src\lib\mcp-api-server.test.ts`

- [ ] **Step 1: Write the failing regex error-envelope test**

Add a direct route test for a regex validation guard that still uses bare `jsonRes({ error })`.

```ts
it('returns a structured error envelope for invalid regex batch-write indices', async () => {
  const api = await startTestApiServer(createSearchFixture());

  try {
    const response = await postJson<{
      action?: string;
      error: string;
      status?: number;
      suggestion?: string;
      target?: string;
    }>(api.port, api.token, '/regex/batch-write', {
      entries: [{ index: 99, data: { comment: 'oops' } }],
    });

    expect(response.status).toBe(400);
    expect(response.data).toMatchObject({
      action: 'batch write regex entries',
      error: 'Index 99 out of range (0-1)',
      status: 400,
      target: 'regex:batch-write',
    });
  } finally {
    await closeServer(api.server);
  }
});
```

- [ ] **Step 2: Write the failing greetings error-envelope test**

```ts
it('returns a structured error envelope for invalid greeting reorder payloads', async () => {
  const api = await startTestApiServer(createSearchFixture());

  try {
    const response = await postJson<{
      action?: string;
      error: string;
      status?: number;
      suggestion?: string;
      target?: string;
    }>(api.port, api.token, '/greeting/alternate/reorder', {
      order: [0],
    });

    expect(response.status).toBe(400);
    expect(response.data).toMatchObject({
      action: 'reorder greetings',
      error: 'order must be an array of length 2 (current count)',
      status: 400,
      target: 'greeting:alternate:reorder',
    });
  } finally {
    await closeServer(api.server);
  }
});
```

- [ ] **Step 3: Write the failing lua-section error-envelope test**

```ts
it('returns a structured error envelope for invalid lua section batch payloads', async () => {
  const fixture = {
    ...createSearchFixture(),
    triggerScripts: [{ comment: 'first', type: 'manual', effect: [] }],
  };
  const api = await startTestApiServer(fixture);

  try {
    const response = await postJson<{
      action?: string;
      error: string;
      status?: number;
      suggestion?: string;
      target?: string;
    }>(api.port, api.token, '/lua/batch', {
      indices: [],
    });

    expect(response.status).toBe(400);
    expect(response.data.action).toBe('read lua sections');
    expect(response.data.error).toContain('indices');
    expect(response.data.status).toBe(400);
    expect(response.data.target).toBe('lua:batch');
  } finally {
    await closeServer(api.server);
  }
});
```

- [ ] **Step 4: Write the failing css-section error-envelope test**

```ts
it('returns a structured error envelope when css add hits a duplicate section conflict', async () => {
  const fixture = {
    ...createSearchFixture(),
    css: '/* existing css */',
  };
  const api = await startTestApiServer(fixture);

  try {
    const response = await postJson<{
      action?: string;
      details?: { existingIndex?: number };
      error: string;
      status?: number;
      suggestion?: string;
      target?: string;
    }>(api.port, api.token, '/css-section/add', {
      comment: 'duplicate-name',
      anchorComment: 'duplicate-name',
    });

    expect(response.status).toBe(400);
    expect(response.data.action).toBe('add css section');
    expect(response.data.error).toContain('already exists');
    expect(response.data.status).toBe(400);
    expect(response.data.target).toBe('css:add');
  } finally {
    await closeServer(api.server);
  }
});
```

- [ ] **Step 5: Run the targeted MCP API tests to verify they fail**

Run: `npx vitest run src/lib/mcp-api-server.test.ts --reporter=verbose`

Expected: FAIL because the chosen routes still return bare `{ error }` payloads without `action` / `target` / `status`.

- [ ] **Step 6: Commit the failing test work if you need a checkpoint**

Only if it helps the implementation flow; otherwise proceed directly after confirming failure.

## Task 2: Migrate regex and greetings validation guards to `mcpError(...)`

**Files:**

- Modify: `src\lib\mcp-api-server.ts`
- Test: `src\lib\mcp-api-server.test.ts`

- [ ] **Step 1: Replace bare regex guard errors with structured `mcpError(...)`**

Target the bare validation paths in the regex cluster, especially:

- `GET /regex/:idx`
- `POST /regex/batch-add`
- `POST /regex/batch-write`
- `POST /regex/:idx/replace`
- `POST /regex/:idx/insert`

Migration pattern:

```ts
return mcpError(res, 400, {
  action: 'batch write regex entries',
  message: `Index ${e.index} out of range (0-${regexArr.length - 1})`,
  suggestion: 'list_regex 또는 GET /regex 로 유효한 index를 다시 확인하세요.',
  target: 'regex:batch-write',
});
```

Rules:

- preserve the current HTTP status code
- preserve the current human-readable error message unless a tiny clarity fix is clearly better
- add `suggestion` when operator guidance is obvious
- if the old response had extra fields later in this cluster, move them into `details`

- [ ] **Step 2: Replace bare greetings guard errors with structured `mcpError(...)`**

Target the bare validation paths in:

- `POST /greeting/:type/batch-write`
- `POST /greeting/:type/reorder`

Rules:

- keep unknown-type and user-rejection behavior unchanged where `mcpError(...)` is already in use
- only migrate the remaining bare validation guard paths

- [ ] **Step 3: Re-run targeted MCP API tests**

Run: `npx vitest run src/lib/mcp-api-server.test.ts --reporter=verbose`

Expected: some tests may still fail for lua/css routes, but regex/greetings structured error-envelope assertions should now pass.

- [ ] **Step 4: Commit the regex/greetings migration**

```bash
git add src/lib/mcp-api-server.ts src/lib/mcp-api-server.test.ts
git commit -m "feat: standardize MCP regex and greeting errors" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

## Task 3: Migrate lua and css section validation guards to `mcpError(...)`

**Files:**

- Modify: `src\lib\mcp-api-server.ts`
- Test: `src\lib\mcp-api-server.test.ts`

- [ ] **Step 1: Migrate bare lua-section guard errors**

Focus on the array-CRUD validation and guard paths only, such as:

- invalid section index
- malformed/empty batch payloads
- invalid batch bounds

Keep the scope bounded to lua section routes; do not spill into generic field routes or trigger script normalization.

- [ ] **Step 2: Migrate bare css-section guard errors**

Focus on:

- invalid section index
- malformed/empty batch payloads
- duplicate/add conflicts that currently expose extra context

When the current response includes additional context like `existingIndex`, preserve it in:

```ts
details: { existingIndex }
```

- [ ] **Step 3: Re-run the targeted MCP API tests**

Run: `npx vitest run src/lib/mcp-api-server.test.ts --reporter=verbose`

Expected: PASS with structured error-envelope assertions now green for regex, greetings, lua, and css.

- [ ] **Step 4: Commit the lua/css migration**

```bash
git add src/lib/mcp-api-server.ts src/lib/mcp-api-server.test.ts
git commit -m "feat: standardize MCP lua and css errors" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

## Task 4: Document the bounded MCP hardening contract and ship v0.34.0

**Files:**

- Modify: `AGENTS.md`
- Modify: `skills\using-mcp-tools\TOOL_REFERENCE.md`
- Modify: `CHANGELOG.md`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Update agent-facing MCP docs**

Document only what this release actually changes:

- `AGENTS.md`
  - note that regex/greetings/lua/css section routes now standardize structured MCP error responses
  - explicitly say the top-level `error` field remains present for compatibility
  - do not claim all MCP routes are standardized yet
- `skills\using-mcp-tools\TOOL_REFERENCE.md`
  - add a short response-contract note for the newly standardized cluster
  - mention that additive fields such as `action`, `target`, `status`, and `suggestion` may be present on 4xx MCP errors in those routes

- [ ] **Step 2: Bump version metadata**

Run:

```bash
npm version 0.34.0 --no-git-tag-version
```

- [ ] **Step 3: Update changelog**

Add:

```md
## [0.34.0] - 2026-04-01

### 변경

- MCP regex / greetings / lua / css array-route validation errors now use the structured `mcpError(...)` envelope while preserving the top-level `error` field and current status codes for compatibility.

### 수정

- MCP clients now receive richer context (`action`, `target`, `status`, and targeted `suggestion`) for bounded array-route validation failures instead of bare `{ error }` payloads.
```

- [ ] **Step 4: Run full verification**

Run: `npm run build`

Expected: PASS across lint, typecheck, tests, Electron build, and renderer build.

- [ ] **Step 5: Create the release commit**

```bash
git add AGENTS.md skills/using-mcp-tools/TOOL_REFERENCE.md CHANGELOG.md package.json package-lock.json
git commit -m "v0.34.0: harden MCP array-route errors" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

## Notes

- Do not touch `toki-mcp-server.ts` in this release; the bridge behavior remains unchanged and compatibility depends on the top-level `error` field staying present.
- Do not reinterpret current HTTP 200 `{ success: false }` responses as 4xx yet. That is a later MCP hardening slice.
- Do not widen this work into lorebook, references, assets, CBS, or generic field routes even if the migration pattern feels repetitive.
- Prefer adding focused integration tests in the existing `mcp-api-server.test.ts` harness over inventing new MCP test infrastructure.
