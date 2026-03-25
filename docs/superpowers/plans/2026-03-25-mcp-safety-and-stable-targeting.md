# MCP Safety and Stable Targeting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden lorebook-centered MCP workflows with canonical folder identity, manifest-backed backup/restore, bundle snapshots, and selector-based targeting while preserving existing index-based tools.

**Architecture:** Add three focused helper modules: `lorebook-folders.ts` for folder identity normalization, `mcp-snapshot-bundles.ts` for disk-backed multi-surface rollback, and `mcp-lorebook-selectors.ts` for stable lorebook matching and moves. Wire them into `mcp-api-server.ts`, `lorebook-io.ts`, UI folder creation/import flows, and `toki-mcp-server.ts`, then lock the behavior with unit tests, route tests, and stdio MCP smoke coverage.

**Tech Stack:** TypeScript, Vitest, Node HTTP API routes, MCP stdio server, Electron IPC helpers, existing lorebook UI/editor flows.

---

## File Map

- Create: `src\lib\lorebook-folders.ts` — canonical lorebook folder identity helpers shared by UI, MCP, and import/export code.
- Create: `src\lib\lorebook-folders.test.ts` — unit tests for `key`-first folder identity, `id` fallback, and normalized folder refs.
- Create: `src\lib\mcp-snapshot-bundles.ts` — bundle capture, persistence, listing, and restore validation helpers.
- Create: `src\lib\mcp-snapshot-bundles.test.ts` — unit tests for bundle persistence and mismatch rejection.
- Create: `src\lib\mcp-lorebook-selectors.ts` — selector parsing, matching, ambiguity handling, and move planning.
- Create: `src\lib\mcp-lorebook-selectors.test.ts` — unit tests for selector resolution and move semantics.
- Create: `test\test-mcp-lorebook-tools.ts` — stdio MCP smoke test for new lorebook safety/selector tools.
- Modify: `src\app\controller.ts` — keep live lorebook folder resolution aligned with the canonical folder contract.
- Modify: `main.ts` — provide loaded file metadata to server-side MCP helpers.
- Modify: `src\lib\mcp-api-server.ts` — add normalized lorebook metadata, bundle routes, selector routes, and manifest-aware import/export behavior.
- Modify: `src\lib\mcp-api-server.test.ts` — add route-level tests for bundles, selectors, and enriched lorebook list responses.
- Modify: `src\lib\lorebook-io.ts` — emit/read authoritative markdown manifest and use shared folder normalization.
- Modify: `src\lib\lorebook-io.test.ts` — expand export/import roundtrip coverage to manifest-backed behavior.
- Modify: `src\lib\sidebar-actions.ts` — create folder entries with canonical `key` UUIDs.
- Modify: `src\lib\form-editor.ts` — create and read folder entries through the shared folder helper.
- Modify: `src\lib\asset-manager.ts` — keep non-MCP lorebook import/export flows aligned with the MCP contract.
- Modify: `test\test-mcp-search-all.ts` — keep the existing `startApiServer(...)` caller compiling after MCP deps expand.
- Modify: `toki-mcp-server.ts` — register new MCP tools and update schemas/descriptions.
- Modify: `package.json` — include new files in lint coverage, extend MCP smoke tests, bump version.
- Modify: `tsconfig.node-libs.json` — ensure the new MCP smoke test compiles to `test\test-mcp-lorebook-tools.js`.
- Modify: `README.md` — document the new MCP recovery and selector tools.
- Modify: `AGENTS.md` — document new tool contracts and canonical lorebook folder behavior.
- Modify: `CHANGELOG.md` — add the release entry.

## Task 1: Normalize the lorebook folder contract

**Files:**

- Create: `src\lib\lorebook-folders.ts`
- Test: `src\lib\lorebook-folders.test.ts`
- Modify: `src\lib\lorebook-io.ts`
- Modify: `src\lib\lorebook-io.test.ts`
- Modify: `src\app\controller.ts`
- Modify: `src\lib\sidebar-actions.ts`
- Modify: `src\lib\sidebar-dnd.test.ts`
- Modify: `src\lib\form-editor.ts`
- Modify: `src\lib\asset-manager.ts`
- Modify: `src\lib\mcp-api-server.ts`
- Modify: `src\lib\mcp-api-server.test.ts`

- [ ] **Step 1: Write the failing folder-contract unit tests**

```ts
it('prefers folder UUIDs stored in key and falls back to id for legacy folders', () => {
  expect(getFolderUuid({ mode: 'folder', key: 'uuid-key', id: 'legacy-id' })).toBe('uuid-key');
  expect(getFolderUuid({ mode: 'folder', key: '', id: 'legacy-id' })).toBe('legacy-id');
});

it('normalizes child folder refs to folder:uuid form', () => {
  expect(normalizeFolderRef('uuid-key')).toBe('folder:uuid-key');
  expect(normalizeFolderRef('folder:uuid-key')).toBe('folder:uuid-key');
});
```

- [ ] **Step 2: Run the targeted tests to verify they fail**

Before running, extend:

- `src/lib/sidebar-dnd.test.ts` to assert normalized folder refs still work during folder moves
- `src/lib/mcp-api-server.test.ts` to assert `/lorebook/add` and `/lorebook/batch-add` create canonical `key` UUIDs for folder entries

Run: `npx vitest run src/lib/lorebook-folders.test.ts src/lib/lorebook-io.test.ts src/lib/sidebar-dnd.test.ts src/lib/mcp-api-server.test.ts`

Expected: FAIL because `src/lib/lorebook-folders.ts` does not exist yet and current `lorebook-io` tests still assume folder identity lives in `id`.

- [ ] **Step 3: Implement the shared folder helper**

```ts
export function getFolderUuid(entry: LorebookEntry): string | null;
export function toFolderRef(uuidOrRef: string): string;
export function getFolderRef(entry: LorebookEntry): string | null;
export function buildFolderInfoMap(entries: LorebookEntry[]): Map<string, { name: string }>;
```

Make `key` the canonical write path for new folders. Keep `id` as a read-only fallback for legacy data.

- [ ] **Step 4: Replace ad-hoc folder UUID logic in UI, MCP, and import/export code**

Update the relevant paths so they all create and read folders through the helper:

- `sidebar-actions.ts` new folders use `key: folderUuid`
- `sidebar-actions.ts` reorder and folder-move flows normalize folder refs through the helper instead of trusting raw strings
- `sidebar-actions.ts` `importLorebook()` normalizes any imported `entry.folder` values through the helper before pushing them into live state
- `src/app/controller.ts` resolves folder entries through the shared helper so live UI reads the same canonical folder identity the writers produce
- `form-editor.ts` new folders use `key: folderUuid`
- `mcp-api-server.ts` `POST /lorebook/add` and `/lorebook/batch-add` generate canonical `key` UUIDs when `mode: 'folder'`
- `mcp-api-server.ts` `write_lorebook`, `write_lorebook_batch`, and `clone_lorebook` preserve or normalize canonical folder identity instead of leaking mixed `id`-based state
- `asset-manager.ts` and `mcp-api-server.ts` import-created folders write canonical `key` UUIDs instead of new `id` values
- `asset-manager.ts`, `lorebook-io.ts`, and `mcp-api-server.ts` read normalized folder refs instead of building `folder:${entry.id}`

- [ ] **Step 5: Update the existing lorebook IO tests to the canonical contract**

Replace `id: 'folder-uuid-1'` fixtures with `key: 'folder-uuid-1'` where the fixture represents newly created data, and add a separate legacy fixture for `id` fallback.

- [ ] **Step 6: Re-run the targeted tests**

Run: `npx vitest run src/lib/lorebook-folders.test.ts src/lib/lorebook-io.test.ts src/lib/sidebar-dnd.test.ts src/lib/mcp-api-server.test.ts`

Expected: PASS with both canonical `key` folders and legacy `id` folders resolving to the same normalized `folder:uuid` identity across helper, UI move, and MCP add flows.

- [ ] **Step 7: Commit**

```bash
git add src/lib/lorebook-folders.ts src/lib/lorebook-folders.test.ts src/lib/lorebook-io.ts src/lib/lorebook-io.test.ts src/app/controller.ts src/lib/sidebar-actions.ts src/lib/sidebar-dnd.test.ts src/lib/form-editor.ts src/lib/asset-manager.ts src/lib/mcp-api-server.ts src/lib/mcp-api-server.test.ts
git commit -m "feat: normalize lorebook folder identities" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

## Task 2: Make markdown lorebook export authoritative

**Files:**

- Modify: `src\lib\lorebook-io.ts`
- Modify: `src\lib\lorebook-io.test.ts`
- Modify: `src\lib\mcp-api-server.ts`
- Modify: `src\lib\asset-manager.ts`
- Modify: `main.ts`
- Modify: `src\lib\mcp-api-server.test.ts`
- Modify: `test\test-mcp-search-all.ts`

- [ ] **Step 1: Write failing tests for manifest-backed markdown export**

```ts
it('writes a restore-grade manifest next to markdown exports', async () => {
  const result = await exportToMarkdown(entries, dir);
  expect(result.files).toContain('_lorebook_manifest.json');
});

it('prefers the manifest over directory heuristics during markdown import', async () => {
  const imported = await importFromMarkdown(dir);
  expect(imported.find((e) => e.comment === 'Alice')?.folderId).toBe('folder:folder-uuid-1');
});
```

- [ ] **Step 2: Run the lorebook IO tests to verify they fail**

Run: `npx vitest run src/lib/lorebook-io.test.ts`

Expected: FAIL because the current exporter only writes `_export_meta.json` and the importer only infers folders from directory names.

- [ ] **Step 3: Implement the markdown manifest contract**

Emit `_lorebook_manifest.json` with restore-grade metadata:

```json
{
  "version": 1,
  "format": "md",
  "fileType": "charx",
  "source": "card.charx",
  "folders": [{ "folderId": "folder:uuid", "name": "Characters" }],
  "entries": [
    {
      "comment": "Alice",
      "folderId": "folder:uuid",
      "folderPath": "Characters",
      "originalIndex": 1,
      "file": "Characters/Alice.md"
    }
  ]
}
```

Keep `_export_meta.json` controlled by the existing metadata option if that remains useful, but `_lorebook_manifest.json` must be written unconditionally for markdown export. It is part of the restore contract, not optional decoration.
Include `entryId` in the manifest only when the lorebook entry already has an `id`. Do not invent a new entry-ID scheme in this pass.

Extend the import data model so the manifest can flow through import/resolve/apply without collapsing back to folder-name heuristics:

```ts
interface ImportEntry {
  comment: string;
  data: LorebookEntry;
  folderId?: string;
  folderPath?: string;
  entryId?: string;
  warnings?: string[];
  sourcePath: string;
}
```

- [ ] **Step 4: Teach markdown import and route dry-run to use the manifest**

When `_lorebook_manifest.json` exists:

- read folder assignment from the manifest first
- read source file metadata from a new `getCurrentFileMeta` dependency wired from `main.ts`
- surface explicit warnings only when manifest data is missing or cannot be resolved
- keep directory-name inference as fallback, not the primary contract

- [ ] **Step 5: Plumb loaded file metadata into the server/test harness**

Add a dependency such as:

```ts
getCurrentFileMeta: () => { fileName: string; filePath: string; fileType: string } | null;
```

Wire it through:

- `main.ts`
- `src/lib/mcp-api-server.ts`
- `src/lib/mcp-api-server.test.ts` test harness
- `test/test-mcp-search-all.ts` existing `startApiServer(...)` caller, or make the new deps optional with safe defaults
- `src/lib/asset-manager.ts` where restore-grade source metadata is needed

- [ ] **Step 6: Extract a shared import-apply helper and use it from both MCP and UI paths**

Move the “create folders → assign folder refs → add entries → overwrite existing entries” logic into a shared helper exported from `lorebook-io.ts`, then call that helper from both:

- `src/lib/mcp-api-server.ts`
- `src/lib/asset-manager.ts`

This prevents the UI dialog path from silently drifting away from the MCP route path.

- [ ] **Step 7: Keep asset-manager parity with the MCP route behavior**

Add a focused verification for the shared apply path in `src/lib/lorebook-io.test.ts` or `src/lib/mcp-api-server.test.ts` so a manifest-backed import cannot pass in MCP while failing in the UI-backed import flow.

- [ ] **Step 8: Re-run the lorebook IO and route tests**

Run: `npx vitest run src/lib/lorebook-io.test.ts src/lib/mcp-api-server.test.ts`

Expected: PASS with manifest emission, manifest-preferred import, current single-level folder roundtrip preserved, route dry-run warnings based on manifest fallback paths, and shared apply logic covering both MCP and UI import flows.

- [ ] **Step 9: Commit**

```bash
git add main.ts src/lib/lorebook-io.ts src/lib/lorebook-io.test.ts src/lib/mcp-api-server.ts src/lib/mcp-api-server.test.ts src/lib/asset-manager.ts test/test-mcp-search-all.ts
git commit -m "feat: add manifest-backed lorebook export" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

## Task 3: Add bundle snapshots for multi-surface rollback

**Files:**

- Create: `src\lib\mcp-snapshot-bundles.ts`
- Test: `src\lib\mcp-snapshot-bundles.test.ts`
- Modify: `main.ts`
- Modify: `src\lib\mcp-api-server.ts`
- Modify: `src\lib\mcp-api-server.test.ts`
- Modify: `tsconfig.node-libs.json`
- Modify: `toki-mcp-server.ts`
- Modify: `test\test-mcp-lorebook-tools.ts`

- [ ] **Step 1: Write failing unit tests for bundle persistence and mismatch rejection**

```ts
it('persists a bundle for the current file in the app backup directory', async () => {
  const bundle = await createSnapshotBundle(store, fixture);
  expect(await fs.promises.stat(bundle.filePath)).toBeDefined();
});

it('rejects restore when loaded file metadata does not match the bundle', async () => {
  await expect(restoreSnapshotBundle(store, bundleId, otherFileMeta)).rejects.toThrow('file mismatch');
});
```

Define the public lorebook target shape now so bundle work does not invent a conflicting API before Task 4:

```ts
interface BundleLorebookTarget {
  index: number;
  entryId?: string;
  comment?: string;
}

interface SnapshotBundleRequest {
  fields?: string[];
  lorebook?: { indices?: number[]; resolvedTargets?: BundleLorebookTarget[] };
  regex?: { indices: number[] };
  lua?: { indices: number[] };
  css?: { indices: number[] };
  greetings?: { type: 'alternate'; indices: number[] };
  triggers?: { indices: number[] };
}
```

Task 4 should make `find_lorebook(...)` return data that can be passed straight into `resolvedTargets`.

Bundle response shapes for planning:

```ts
interface SnapshotBundleSummary {
  bundleId: string;
  fileName: string;
  fileType: string;
  createdAt: string;
  targets: {
    fields: string[];
    lorebook: BundleLorebookTarget[];
    regex: number[];
    lua: number[];
    css: number[];
    greetings: number[];
    triggers: number[];
  };
}

interface RestoreBundleRequest {
  bundleId: string;
  allowCrossFile?: boolean;
  restore?: {
    fields?: string[];
    lorebook?: number[];
    regex?: number[];
    lua?: number[];
    css?: number[];
    greetings?: number[];
    triggers?: number[];
  };
}
```

`list_snapshot_bundles` should default to current-file bundles only and return per-target metadata, not just counts.

Cover the full required target set in the bundle request fixtures:

- fields by name
- lorebook entries by index or selector result
- regex entries by index
- Lua sections by index
- CSS sections by index
- greetings by index
- triggers by index

- [ ] **Step 2: Write failing route tests for bundle MCP routes**

Add route tests in `src/lib/mcp-api-server.test.ts` for:

- snapshot bundle creation
- bundle listing
- full restore
- partial restore
- mismatch rejection

- [ ] **Step 3: Run the targeted tests to verify they fail**

Run: `npx vitest run src/lib/mcp-snapshot-bundles.test.ts src/lib/mcp-api-server.test.ts`

Expected: FAIL because the helper module and bundle routes do not exist yet.

- [ ] **Step 4: Implement the bundle helper**

```ts
export function createBundleStore(baseDir: string): SnapshotBundleStore;
export async function saveSnapshotBundle(
  store: SnapshotBundleStore,
  request: SnapshotBundleRequest,
): Promise<SnapshotBundleSummary>;
export async function listSnapshotBundles(
  store: SnapshotBundleStore,
  fileFingerprint: string,
): Promise<SnapshotBundleSummary[]>;
export async function restoreSnapshotBundle(
  store: SnapshotBundleStore,
  request: RestoreBundleRequest,
): Promise<RestoreResult>;
```

Persist bundle payloads under an app-managed temp/session backup directory. Store file name and file type metadata with every bundle.
Reuse the `getCurrentFileMeta` plumbing from Task 2 so default same-file restore checks have real file metadata instead of inferred card content.

- [ ] **Step 4A: Add bundle-storage directory plumbing from main.ts**

Expose an MCP dependency such as:

```ts
getMcpStateDir: () => string;
```

Implement it in `main.ts` from the app-managed user data path, and update the `src/lib/mcp-api-server.test.ts` harness to inject a temp directory.
Also update `test/test-mcp-search-all.ts` or make the new dependency optional with a safe temp-directory default so the existing MCP build/test path keeps working.

- [ ] **Step 5: Wire the HTTP routes and MCP tools**

Add the new route family in `mcp-api-server.ts` and register these tools in `toki-mcp-server.ts`:

- `snapshot_bundle`
- `list_snapshot_bundles`
- `restore_snapshot_bundle`

`restore_snapshot_bundle` must reject file/type mismatches by default, but allow an explicit opt-in override for cross-file restore.

- [ ] **Step 6: Add a stdio MCP smoke test**

In `test/test-mcp-lorebook-tools.ts`, verify that the new tools are registered and that at least one happy-path request returns structured JSON instead of a generic “not found” fallback.

Before the first `build:node-libs` run in this task, add `test\test-mcp-lorebook-tools.ts` to `tsconfig.node-libs.json` so `test\test-mcp-lorebook-tools.js` is emitted.

- [ ] **Step 7: Re-run the targeted tests**

Run: `npx vitest run src/lib/mcp-snapshot-bundles.test.ts src/lib/mcp-api-server.test.ts && npm run build:node-libs && npm run build:mcp && node test/test-mcp-lorebook-tools.js`

Expected: PASS with bundle persistence, main-process-backed storage directory plumbing, mismatch rejection, route coverage, and stdio registration all aligned.

- [ ] **Step 8: Commit**

```bash
git add main.ts tsconfig.node-libs.json src/lib/mcp-snapshot-bundles.ts src/lib/mcp-snapshot-bundles.test.ts src/lib/mcp-api-server.ts src/lib/mcp-api-server.test.ts toki-mcp-server.ts test/test-mcp-lorebook-tools.ts
git commit -m "feat: add MCP snapshot bundle recovery" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

## Task 4: Add selector-based lorebook targeting and move operations

**Files:**

- Create: `src\lib\mcp-lorebook-selectors.ts`
- Test: `src\lib\mcp-lorebook-selectors.test.ts`
- Modify: `src\lib\mcp-api-server.ts`
- Modify: `src\lib\mcp-api-server.test.ts`
- Modify: `toki-mcp-server.ts`
- Modify: `test\test-mcp-lorebook-tools.ts`

- [ ] **Step 1: Write failing selector unit tests**

```ts
it('matches a lorebook entry by exact comment and folder id', () => {
  expect(findLorebookMatches(entries, { comment: 'Border Economy', folder_id: 'folder:uuid-1' })).toHaveLength(1);
});

it('fails ambiguous write targets unless multi-match is explicit', () => {
  expect(() => resolveSingleWriteTarget(entries, { comment_regex: '^Boss' })).toThrow('ambiguous');
});
```

- [ ] **Step 2: Write failing route tests for selector routes and richer list metadata**

Add route tests for:

- `find_lorebook`
- `read_lorebook_by`
- `write_lorebook_by`
- `move_lorebook_entries`
- `list_lorebook` returning `entryId`, `folderId`, `folderName`, `folderPath`, and `isFolder`

- [ ] **Step 3: Run the targeted tests to verify they fail**

Run: `npx vitest run src/lib/mcp-lorebook-selectors.test.ts src/lib/mcp-api-server.test.ts`

Expected: FAIL because selector helpers and the new lorebook routes do not exist yet.

- [ ] **Step 4: Implement selector parsing and move planning**

```ts
export interface LorebookSelector {
  entry_id?: string;
  comment?: string;
  comment_regex?: string;
  folder_id?: string;
  folder_path?: string;
  mode?: string;
}
```

In this pass, `entry_id` maps to the existing lorebook `id` field only when it already exists. Do not introduce a new entry-ID generation scheme yet.

Selector tool request/response shapes for planning:

```ts
read_lorebook_by({
  selector: { comment: 'Border Economy' }
}) => {
  count: 1,
  entries: [{ index: 5, entryId: 'existing-id', comment: 'Border Economy', entry: { ... } }]
};

write_lorebook_by({
  selector: { comment_regex: '^Boss' },
  data: { insertorder: 300 },
  allow_multiple: false
}) => {
  updated: 1,
  entries: [{ index: 21, comment: 'Boss Alpha' }]
};

move_lorebook_entries({
  selector: { comment: 'Border Economy' },
  destination: { folder_id: 'folder:uuid-1', before: { comment: 'CCZ Core Reality' } },
  normalize_insertorder: false
}) => {
  moved: 1,
  entries: [{ index: 5, comment: 'Border Economy', folderId: 'folder:uuid-1' }]
};
```

Implement helpers for:

- collecting matches
- matching by canonical entry identity when available
- rejecting ambiguous writes by default
- moving entries into or out of folders
- moving an entry before or after another selector target
- optional `insertorder` normalization only when the caller requests it

- [ ] **Step 5: Wire selector routes and MCP tools**

Register the minimum selector toolset in `toki-mcp-server.ts`:

- `find_lorebook`
- `read_lorebook_by`
- `write_lorebook_by`
- `move_lorebook_entries`

Make sure route responses include both stable identity data and the current live index.

- [ ] **Step 6: Extend the stdio smoke test**

Verify that selector tools are registered and that `list_lorebook` / selector reads return the enriched metadata contract.

- [ ] **Step 7: Re-run the targeted tests**

Run: `npx vitest run src/lib/mcp-lorebook-selectors.test.ts src/lib/mcp-api-server.test.ts && npm run build:node-libs && npm run build:mcp && node test/test-mcp-lorebook-tools.js`

Expected: PASS with selector matching, ambiguous-write protection, move behavior, and tool/route registration all aligned.

- [ ] **Step 8: Commit**

```bash
git add src/lib/mcp-lorebook-selectors.ts src/lib/mcp-lorebook-selectors.test.ts src/lib/mcp-api-server.ts src/lib/mcp-api-server.test.ts toki-mcp-server.ts test/test-mcp-lorebook-tools.ts
git commit -m "feat: add selector-based lorebook targeting" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

## Task 5: Update docs, versioning, and full-project validation

**Files:**

- Modify: `package.json`
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Update lint and MCP test coverage in package.json**

Add every new `.ts` file and every newly modified-but-currently-unlisted file to the explicit lint command, including at minimum:

- `src/lib/lorebook-io.ts`
- `src/lib/lorebook-io.test.ts`
- `src/lib/sidebar-dnd.test.ts`
- `src/app/controller.ts`
- `test/test-mcp-search-all.ts`
- `test/test-mcp-lorebook-tools.ts`

Also extend `test:mcp` to run the new `test/test-mcp-lorebook-tools.js` smoke test after the build steps.

- [ ] **Step 2: Bump the version for new MCP functionality**

Update `package.json` from `0.22.5` to `0.23.0`.

- [ ] **Step 3: Update CHANGELOG.md**

Add `## [0.23.0] - 2026-03-25` at the top with:

- new bundle snapshot tools
- manifest-backed lorebook export/import
- selector-based lorebook targeting
- lorebook folder contract normalization

- [ ] **Step 4: Update README.md and AGENTS.md**

Document:

- the new bundle snapshot tools
- the new selector-based lorebook tools
- the markdown manifest behavior
- the canonical lorebook folder identity rule

- [ ] **Step 5: Run lint**

Run: `npm run lint`

Expected: PASS with the new files included in the explicit lint list.

- [ ] **Step 6: Run typecheck**

Run: `npm run typecheck`

Expected: PASS with new helper modules, route schemas, and tests typed correctly.

- [ ] **Step 7: Run the full test suite**

Run: `npm test`

Expected: PASS including the new lorebook IO, selector, bundle, and MCP smoke coverage.

- [ ] **Step 8: Run the Windows build verification**

Run: `npm run build:electron && npm run build:renderer`

Expected: PASS with the MCP server bundle, Electron main process, preload bundle, and renderer build all succeeding.

- [ ] **Step 9: Commit the release**

```bash
git add main.ts package.json tsconfig.node-libs.json README.md AGENTS.md CHANGELOG.md docs/superpowers/specs/2026-03-25-mcp-safety-and-targeting-design.md docs/superpowers/plans/2026-03-25-mcp-safety-and-stable-targeting.md src/app/controller.ts src/lib/lorebook-folders.ts src/lib/lorebook-folders.test.ts src/lib/mcp-snapshot-bundles.ts src/lib/mcp-snapshot-bundles.test.ts src/lib/mcp-lorebook-selectors.ts src/lib/mcp-lorebook-selectors.test.ts src/lib/mcp-api-server.ts src/lib/mcp-api-server.test.ts src/lib/lorebook-io.ts src/lib/lorebook-io.test.ts src/lib/sidebar-actions.ts src/lib/sidebar-dnd.test.ts src/lib/form-editor.ts src/lib/asset-manager.ts toki-mcp-server.ts test/test-mcp-lorebook-tools.ts
git commit -m "v0.23.0: add MCP safety and stable targeting tools" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```
