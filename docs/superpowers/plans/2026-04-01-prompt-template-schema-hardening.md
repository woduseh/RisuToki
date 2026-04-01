# Prompt Template Schema Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add stable prompt-item IDs to supported `.risup` prompt templates, migrate legacy files safely on read, and surface warning-only `formatingOrder` cross-reference issues without breaking existing index-based UI or MCP workflows.

**Architecture:** Keep the identity layer centered in `src\lib\risup-prompt-model.ts`, then invoke that model-level normalization from `charx-io.ts` so legacy files become stable before they hit renderer or autosave paths. Propagate IDs outward through the structured prompt editor, mutation boundary, and MCP prompt-item routes, while keeping `formatingOrder` checks advisory only in this release.

**Tech Stack:** TypeScript, Vitest, Node/Electron file IO, MCP HTTP API routes, MCP stdio tool definitions, existing risup prompt editor and serializer helpers.

---

## File Map

- Modify: `src\lib\risup-prompt-model.ts` — add prompt-item IDs, deterministic legacy normalization, warning helpers, and serialization support.
- Modify: `src\lib\risup-prompt-model.test.ts` — lock ID generation, ID round-trip, duplicate warnings, and `formatingOrder` warning behavior.
- Modify: `src\charx-io.ts` — normalize legacy `promptTemplate` before it becomes `CharxData`, and persist IDs back on save.
- Modify: `test\test-charx.ts` — add `.risup` load/save regression coverage for migrated IDs.
- Modify: `src\lib\data-serializer.ts` — accept ID-bearing prompt JSON and preserve warning-only behavior for valid-but-imperfect data.
- Modify: `src\lib\data-serializer.test.ts` — cover ID-bearing prompt JSON at the mutation boundary.
- Modify: `src\lib\autosave-manager.test.ts` — prove risup autosave keeps migrated IDs stable.
- Modify: `src\lib\risup-prompt-editor.ts` — preserve IDs across add/remove/reorder/type-change flows.
- Modify: `src\lib\risup-prompt-editor.test.ts` — verify add/reorder/type-change preserve identity.
- Modify: `src\lib\risup-form-editor.ts` — surface `formatingOrder` warning messages without blocking save for warning-only conditions.
- Modify: `src\lib\risup-form-editor.test.ts` — verify warning text behavior.
- Modify: `src\lib\mcp-api-server.ts` — expose IDs on prompt-item read/list responses, preserve IDs on writes, and include warning payloads where appropriate.
- Modify: `src\lib\mcp-api-server.test.ts` — cover additive MCP response shape, ID propagation, and warning-only formatting-order checks.
- Modify: `toki-mcp-server.ts` — document additive `id` fields and warning behavior for risup prompt tools.
- Modify: `package.json` — include touched files in lint coverage if needed, bump version later, and keep test/build scripts aligned.
- Modify: `README.md` — document stable IDs/warning behavior only if it becomes user-visible enough to matter.
- Modify: `AGENTS.md` — document additive MCP prompt-item ID surface and warning-only formatting-order checks.
- Modify: `CHANGELOG.md` — add the eventual `v0.32.0` release entry.

## Task 1: Add stable prompt-item IDs to the prompt model

**Files:**

- Modify: `src\lib\risup-prompt-model.ts`
- Test: `src\lib\risup-prompt-model.test.ts`

- [ ] **Step 1: Write the failing model tests for stable IDs**

```ts
it('assigns deterministic ids to supported prompt items that lack them', () => {
  const model = parsePromptTemplate(
    JSON.stringify([
      { type: 'plain', type2: 'normal', text: 'hello', role: 'system' },
      { type: 'plain', type2: 'normal', text: 'hello', role: 'system' },
    ]),
  );

  expect(model.state).toBe('valid');
  expect(model.items[0].supported && model.items[0].id).toBeTruthy();
  expect(model.items[1].supported && model.items[1].id).toBeTruthy();
  expect(model.items[0].supported && model.items[1].supported && model.items[0].id).not.toBe(model.items[1].id);
});

it('preserves an existing id through parse and serialize', () => {
  const raw = [{ id: 'prompt-plain-1', type: 'plain', type2: 'normal', text: 'hello', role: 'system' }];
  const parsed = parsePromptTemplate(JSON.stringify(raw));
  const roundTrip = JSON.parse(serializePromptTemplate(parsed));
  expect(roundTrip[0].id).toBe('prompt-plain-1');
});

it('exposes top-level id on unsupported items when rawValue already contains one', () => {
  const parsed = parsePromptTemplate(JSON.stringify([{ id: 'legacy-unknown-1', type: 'futureType', foo: 'bar' }]));
  expect(parsed.items[0].supported).toBe(false);
  expect(parsed.items[0]).toMatchObject({ id: 'legacy-unknown-1', type: 'futureType' });
});
```

- [ ] **Step 2: Run the targeted tests to verify they fail**

Run: `npx vitest run src/lib/risup-prompt-model.test.ts --reporter=verbose`

Expected: FAIL because prompt-item models currently have no `id` field and parse/serialize logic does not preserve identity.

- [ ] **Step 3: Implement stable ID support in the shared prompt model**

Add:

```ts
export interface PromptItemBaseModel {
  id: string;
}

export function normalizePromptTemplateForStorage(value: unknown): PromptTemplateModel;
export function collectFormatingOrderWarnings(prompt: PromptTemplateModel, order: FormatingOrderModel): string[];
```

Implementation rules:

- supported items always end up with `id`
- legacy items without `id` get a deterministic ID derived from raw content plus occurrence count
- unsupported items preserve `rawValue` losslessly and surface `id` if raw input had one
- serializers always write supported-item `id` back to JSON
- warning helper returns duplicate-token and dangling-reference warnings without changing parse validity

- [ ] **Step 4: Extend the model tests for warning-only formatting-order checks**

Add tests that:

- duplicate `formatingOrder` tokens produce warnings
- dangling `formatingOrder` tokens produce warnings
- valid formatting order produces no warnings
- warnings do not flip parse state from `valid` to `invalid`

- [ ] **Step 5: Re-run the targeted model tests**

Run: `npx vitest run src/lib/risup-prompt-model.test.ts --reporter=verbose`

Expected: PASS with deterministic ID generation, round-trip preservation, and warning-only `formatingOrder` diagnostics.

- [ ] **Step 6: Commit**

```bash
git add src/lib/risup-prompt-model.ts src/lib/risup-prompt-model.test.ts
git commit -m "feat: add stable risup prompt item ids" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

## Task 2: Normalize legacy `.risup` files on read and preserve IDs on save

**Files:**

- Modify: `src\charx-io.ts`
- Test: `test\test-charx.ts`
- Modify: `src\lib\data-serializer.ts`
- Modify: `src\lib\data-serializer.test.ts`
- Modify: `src\lib\autosave-manager.test.ts`

- [ ] **Step 1: Write the failing legacy migration tests**

Add to `test\test-charx.ts`:

```ts
(function testRisupPromptTemplateGetsIdsOnOpen() {
  const reopened = openRisup(filePathWithoutIds);
  const promptTemplate = JSON.parse(reopened.promptTemplate);
  assert.equal(typeof promptTemplate[0].id, 'string');
  assert.equal(typeof promptTemplate[1].id, 'string');
})();

(function testRisupPromptTemplateIdsPersistOnSave() {
  const reopened = openRisup(filePathWithoutIds);
  saveRisup(roundTripPath, reopened);
  const reopenedAgain = openRisup(roundTripPath);
  const first = JSON.parse(reopened.promptTemplate);
  const second = JSON.parse(reopenedAgain.promptTemplate);
  assert.equal(second[0].id, first[0].id);
})();
```

Add to `src\lib\data-serializer.test.ts`:

```ts
it('accepts promptTemplate JSON strings that include stable ids', () => {
  expect(() =>
    applyUpdates(data, {
      promptTemplate: JSON.stringify([{ id: 'prompt-1', type: 'plain', type2: 'normal', text: 'ok', role: 'system' }]),
    }),
  ).not.toThrow();
});
```

Add to `src\lib\autosave-manager.test.ts`:

```ts
it('preserves migrated promptTemplate ids in risup autosave writes', async () => {
  // expect saveRisup payload to keep id-bearing promptTemplate JSON
});
```

- [ ] **Step 2: Run the targeted tests to verify they fail**

Run: `node test/test-charx.js && npx vitest run src/lib/data-serializer.test.ts src/lib/autosave-manager.test.ts --reporter=verbose`

Expected: FAIL because `extractPresetFields()` still stringifies raw prompt arrays without normalization and current tests do not see persisted IDs.

- [ ] **Step 3: Implement read-time normalization in `charx-io.ts`**

Use a prompt-model helper instead of duplicating parse logic:

```ts
const normalizedPromptTemplate = normalizePromptTemplateForStorage(preset.promptTemplate ?? []);
promptTemplate: serializePromptTemplate(normalizedPromptTemplate);
```

Save-path rules:

- `saveRisup()` should write the ID-bearing prompt JSON back into the preset payload
- keep the existing compatibility behavior for other scalar/JSON-backed fields
- do not introduce a second migration pass on save; just persist normalized in-memory data

- [ ] **Step 4: Update the serializer boundary to treat ID-bearing prompt JSON as valid**

Keep the mutation boundary strict for malformed JSON, but allow valid prompt items with `id` fields.

- [ ] **Step 5: Re-run the targeted tests**

Run: `node test/test-charx.js && npx vitest run src/lib/data-serializer.test.ts src/lib/autosave-manager.test.ts --reporter=verbose`

Expected: PASS with legacy files gaining IDs on open, IDs surviving save/autosave round-trip, and mutation-boundary validation still rejecting malformed JSON.

- [ ] **Step 6: Commit**

```bash
git add src/charx-io.ts test/test-charx.ts src/lib/data-serializer.ts src/lib/data-serializer.test.ts src/lib/autosave-manager.test.ts
git commit -m "feat: normalize legacy risup prompt ids on read" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

## Task 3: Preserve prompt-item identity in the structured renderer editor

**Files:**

- Modify: `src\lib\risup-prompt-editor.ts`
- Test: `src\lib\risup-prompt-editor.test.ts`

- [ ] **Step 1: Write the failing editor identity tests**

```ts
it('preserves the same id when an item type changes', () => {
  const template = JSON.stringify([{ id: 'prompt-1', type: 'plain', type2: 'normal', text: 'Hello', role: 'system' }]);
  // change type to chat, then expect resulting JSON[0].id === 'prompt-1'
});

it('preserves ids when items are reordered', () => {
  const template = JSON.stringify([
    { id: 'prompt-a', type: 'plain', type2: 'normal', text: 'A', role: 'system' },
    { id: 'prompt-b', type: 'plain', type2: 'normal', text: 'B', role: 'system' },
  ]);
  // click move-up on item B, assert ids reorder with items rather than regenerate
});

it('creates a fresh id when a new item is added', () => {
  // click add-item and assert new JSON[0].id is a non-empty string
});
```

- [ ] **Step 2: Run the editor tests to verify they fail**

Run: `npx vitest run src/lib/risup-prompt-editor.test.ts --reporter=verbose`

Expected: FAIL because type-change currently replaces items with `defaultPromptItem(...)`, which generates a fresh object and discards prior identity.

- [ ] **Step 3: Implement caller-side ID preservation in the editor**

Key rule:

```ts
updateItem(i, (old) => preservePromptItemId(defaultPromptItem(newType), old), true);
```

Also ensure:

- add-item keeps generating a fresh ID
- reorder/remove flows simply move existing items without regenerating them
- no UI-visible ID field is required

- [ ] **Step 4: Re-run the editor tests**

Run: `npx vitest run src/lib/risup-prompt-editor.test.ts --reporter=verbose`

Expected: PASS with add/remove/reorder/type-change preserving or generating IDs in the correct places.

- [ ] **Step 5: Commit**

```bash
git add src/lib/risup-prompt-editor.ts src/lib/risup-prompt-editor.test.ts
git commit -m "feat: preserve prompt item ids in risup editor" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

## Task 4: Surface warning-only formatting-order diagnostics in validation flows

**Files:**

- Modify: `src\lib\risup-form-editor.ts`
- Test: `src\lib\risup-form-editor.test.ts`
- Modify: `src\lib\data-serializer.ts`
- Modify: `src\lib\data-serializer.test.ts`

- [ ] **Step 1: Write the failing warning tests**

```ts
it('reports warning-level formatting-order diagnostics without blocking valid promptTemplate JSON', () => {
  const errors = validateRisupDraftFields({
    promptTemplate: JSON.stringify([{ id: 'prompt-plain-1', type: 'plain', type2: 'normal', text: 'hello', role: 'system' }]),
    formatingOrder: JSON.stringify(['main', 'main', 'lorebook']),
  });

  expect(errors).toContainEqual(
    expect.objectContaining({
      field: 'formatingOrder',
      message: expect.stringContaining('중복'),
    }),
  );
});
```

Add serializer tests that confirm:

- malformed JSON still throws
- warning-only formatting-order mismatches do not throw

- [ ] **Step 2: Run the targeted validation tests to verify they fail**

Run: `npx vitest run src/lib/risup-form-editor.test.ts src/lib/data-serializer.test.ts --reporter=verbose`

Expected: FAIL because no warning helper is currently wired into draft validation or serializer boundaries.

- [ ] **Step 3: Implement warning-only diagnostics**

Implementation rules:

- malformed JSON remains blocking
- duplicate/dangling formatting-order warnings are advisory only
- `getRisupValidationMessage()` may mention warnings, but should not convert warning-only conditions into a save blocker in this release

If needed, split helpers so parse validity and warning collection remain separate.

- [ ] **Step 4: Re-run the targeted validation tests**

Run: `npx vitest run src/lib/risup-form-editor.test.ts src/lib/data-serializer.test.ts --reporter=verbose`

Expected: PASS with malformed JSON still rejected and warning-only formatting mismatches surfaced separately.

- [ ] **Step 5: Commit**

```bash
git add src/lib/risup-form-editor.ts src/lib/risup-form-editor.test.ts src/lib/data-serializer.ts src/lib/data-serializer.test.ts
git commit -m "feat: add warning-only formatting order diagnostics" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

## Task 5: Expose stable IDs and warnings through MCP risup prompt routes

**Files:**

- Modify: `src\lib\mcp-api-server.ts`
- Test: `src\lib\mcp-api-server.test.ts`
- Modify: `toki-mcp-server.ts`

- [ ] **Step 1: Write the failing MCP route tests**

Add tests that:

```ts
it('lists prompt items with additive id metadata', async () => {
  expect(res.data.items[0]).toMatchObject({ index: 0, id: expect.any(String), type: 'plain' });
});

it('reads one prompt item with id metadata', async () => {
  expect(res.data).toMatchObject({ index: 0, id: expect.any(String), type: 'plain' });
});

it('preserves an existing id when writing a prompt item by index', async () => {
  // write item with id, assert stored promptTemplate keeps that id
});

it('returns warning payloads for formatingOrder duplicates or dangling references', async () => {
  expect(res.data.warnings).toEqual(expect.arrayContaining([expect.stringContaining('중복')]));
});
```

- [ ] **Step 2: Run the MCP route tests to verify they fail**

Run: `npx vitest run src/lib/mcp-api-server.test.ts --reporter=verbose`

Expected: FAIL because MCP list/read responses do not expose `id` yet and formatting-order routes do not return warning metadata.

- [ ] **Step 3: Implement additive MCP response and write behavior**

Required behavior:

- `list_risup_prompt_items` includes `id`
- `read_risup_prompt_item` includes `id`
- index-based routing stays intact
- add/write routes preserve provided valid IDs and generate IDs when absent
- `read_risup_formating_order` and/or relevant success payloads may include `warnings`

Update tool descriptions in `toki-mcp-server.ts` so agents know IDs are additive metadata, not new addressing keys.

- [ ] **Step 4: Re-run the MCP route tests**

Run: `npx vitest run src/lib/mcp-api-server.test.ts --reporter=verbose`

Expected: PASS with additive ID metadata, backward-compatible index routes, and warning-only formatting-order diagnostics.

- [ ] **Step 5: Commit**

```bash
git add src/lib/mcp-api-server.ts src/lib/mcp-api-server.test.ts toki-mcp-server.ts
git commit -m "feat: expose stable prompt ids via mcp" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

## Task 6: Update docs, versioning, and full verification for `v0.32.0`

**Files:**

- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `CHANGELOG.md`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Write the docs/version updates**

Document:

- stable prompt-item IDs for supported risup prompt items
- additive MCP `id` metadata on prompt-item list/read surfaces
- warning-only `formatingOrder` diagnostics
- version bump to `0.32.0`

Use:

```bash
npm version 0.32.0 --no-git-tag-version
```

- [ ] **Step 2: Expand lint coverage if any newly touched files are missing from `package.json`**

Ensure all modified production/test files in this slice are included in the lint script.

- [ ] **Step 3: Run focused preflight verification**

Run:

```bash
npm run lint
npx vitest run src/lib/risup-prompt-model.test.ts src/lib/risup-prompt-editor.test.ts src/lib/risup-form-editor.test.ts src/lib/data-serializer.test.ts src/lib/mcp-api-server.test.ts src/lib/autosave-manager.test.ts --reporter=verbose
node test/test-charx.js
npm run typecheck
```

Expected: PASS with lint, the new stable-ID and warning-only coverage, and typechecking all green before the full build.

- [ ] **Step 4: Run the full repository verification**

Run:

```bash
npm run build
```

Expected: PASS with lint, typecheck, all tests, MCP smoke, Electron build, and renderer build all succeeding.

- [ ] **Step 5: Commit the release prep**

```bash
git add README.md AGENTS.md CHANGELOG.md package.json package-lock.json
git commit -m "v0.32.0: Harden risup prompt template schema" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

## Task 7: Push, tag, and verify the `v0.32.0` release

**Files:**

- No code changes expected

- [ ] **Step 1: Push the feature branch**

Run:

```bash
git push -u origin feature/prompt-schema-v0320
```

- [ ] **Step 2: Create and push the release tag**

Run:

```bash
git tag v0.32.0
git push origin v0.32.0
```

- [ ] **Step 3: Verify GitHub Actions**

Confirm:

- branch/workflow state is healthy
- `Release` workflow for tag `v0.32.0` starts
- `Lint`, `Typecheck`, `Test`, `Build Electron + Renderer`, `Package`, and artifact upload all conclude successfully

- [ ] **Step 4: Commit no further code unless release verification fails**

If the release workflow fails, treat the failure as a fresh bugfix slice with TDD before retrying.

