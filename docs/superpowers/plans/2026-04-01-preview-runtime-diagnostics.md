# Preview Runtime Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add bounded iframe readiness, explicit preview lifecycle diagnostics, and visible in-panel preview failure UX without refactoring the broader preview engine.

**Architecture:** Keep the timeout at the iframe runtime boundary in `src\lib\preview-runtime.ts`, then make `src\lib\preview-session.ts` the single source of truth for preview init/runtime diagnostics state. `src\lib\preview-panel.ts` should stay reactive to the session snapshot, rendering a compact loading banner and persistent error banner while leaving controller-owned Wasmoon preflight unchanged.

**Tech Stack:** TypeScript, Vitest, Electron/Vite renderer DOM tests, existing preview runtime/session/panel helpers, CSS regression tests, npm version metadata.

---

## File Map

- Modify: `src\lib\preview-runtime.ts` — add iframe ready timeout, typed timeout error, and cleanup for pending ready state.
- Modify: `src\lib\preview-runtime.test.ts` — lock timeout and successful ready-handshake behavior for `createIframePreviewRuntime(...)`.
- Modify: `src\lib\preview-session.ts` — extend `PreviewSnapshot` with `initState`, `initError`, and `runtimeError`; capture init failures and selected post-ready runtime failures.
- Modify: `src\lib\preview-session.test.ts` — cover state transitions, timeout error capture, runtime-error persistence, and clearing on reset.
- Modify: `src\lib\preview-panel.ts` — render inline status/error banners, disable send/reset while loading, catch startup rejection, and optionally accept a narrow test-only session factory seam.
- Modify: `src\lib\preview-panel.test.ts` — cover loading banner visibility, error banner visibility, disabled controls, and caught startup rejection with a controlled fake session.
- Modify: `src\styles\app.css` — add visible styling for preview diagnostics banners.
- Modify: `src\styles\app-css.test.ts` — lock required preview diagnostics CSS selectors.
- Review only: `src\app\controller.ts` — keep `ensureWasmoon()` preflight in controller scope; do not add new controller-level loading UI in this release.
- Modify: `README.md` — document that preview now shows inline loading/error diagnostics.
- Modify: `AGENTS.md` — document the new preview diagnostics behavior for agentic workflows.
- Modify: `CHANGELOG.md` — add the `v0.33.0` release entry.
- Modify: `package.json` — bump version to `0.33.0`.
- Modify: `package-lock.json` — keep lockfile version metadata aligned with `package.json`.

## Task 1: Bound iframe readiness in the preview runtime

**Files:**

- Modify: `src\lib\preview-runtime.ts`
- Test: `src\lib\preview-runtime.test.ts`

- [ ] **Step 1: Write the failing runtime timeout tests**

Add tests around `createIframePreviewRuntime(...)` rather than only `createDocumentPreviewRuntime(...)`.

```ts
function createWindowTarget() {
  const listeners = new Set<(event: MessageEvent<unknown>) => void>();
  return {
    addEventListener(_type: string, listener: (event: MessageEvent<unknown>) => void) {
      listeners.add(listener);
    },
    removeEventListener(_type: string, listener: (event: MessageEvent<unknown>) => void) {
      listeners.delete(listener);
    },
    dispatchMessage(event: MessageEvent<unknown>) {
      for (const listener of listeners) listener(event);
    },
  };
}

it('rejects resetDocument when the iframe ready handshake never arrives', async () => {
  vi.useFakeTimers();

  const frame = {
    contentWindow: { postMessage() {} },
    setAttribute() {},
    srcdoc: '',
  } as unknown as HTMLIFrameElement;
  const windowTarget = createWindowTarget();
  const runtime = createIframePreviewRuntime(frame, windowTarget as unknown as Window);

  const resetPromise = runtime.resetDocument();

  await vi.advanceTimersByTimeAsync(5000);

  await expect(resetPromise).rejects.toBeInstanceOf(PreviewRuntimeTimeoutError);
});

it('resolves resetDocument only after the matching iframe ready handshake arrives', async () => {
  vi.useFakeTimers();

  const frame = {
    contentWindow: { postMessage() {} },
    setAttribute() {},
    srcdoc: '',
  } as unknown as HTMLIFrameElement;
  const windowTarget = createWindowTarget();
  const runtime = createIframePreviewRuntime(frame, windowTarget as unknown as Window);

  const resetPromise = runtime.resetDocument();
  const token = frame.srcdoc.match(/const TOKEN = '([^']+)'/)?.[1];

  windowTarget.dispatchMessage(
    new MessageEvent('message', {
      source: frame.contentWindow as unknown as MessageEventSource,
      data: { type: 'preview-runtime:ready', token },
    }),
  );

  await expect(resetPromise).resolves.toBeUndefined();
});
```

- [ ] **Step 2: Run the targeted runtime tests to verify they fail**

Run: `npx vitest run src/lib/preview-runtime.test.ts --reporter=verbose`

Expected: FAIL because `createIframePreviewRuntime.resetDocument()` currently waits forever and does not expose a timeout error type.

- [ ] **Step 3: Implement a typed iframe ready timeout**

Add a narrow runtime-only timeout contract:

```ts
const IFRAME_READY_TIMEOUT_MS = 5000;

export class PreviewRuntimeTimeoutError extends Error {
  constructor(message = '프리뷰 iframe 초기화 시간이 초과되었습니다.') {
    super(message);
    this.name = 'PreviewRuntimeTimeoutError';
  }
}
```

Implementation rules:

- `resetDocument()` must race the ready handshake against `IFRAME_READY_TIMEOUT_MS`
- timeout must reject with `PreviewRuntimeTimeoutError`
- success must clear the pending timeout handle
- `dispose()` must clear any pending timeout and null out the ready resolver so stale work cannot leak
- do not move timeout ownership into the panel or session

- [ ] **Step 4: Re-run the targeted runtime tests**

Run: `npx vitest run src/lib/preview-runtime.test.ts --reporter=verbose`

Expected: PASS with explicit timeout failure and successful ready-handshake resolution covered.

- [ ] **Step 5: Commit**

```bash
git add src/lib/preview-runtime.ts src/lib/preview-runtime.test.ts
git commit -m "feat: bound preview iframe readiness" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

## Task 2: Make preview-session the owner of lifecycle diagnostics

**Files:**

- Modify: `src\lib\preview-session.ts`
- Test: `src\lib\preview-session.test.ts`

- [ ] **Step 1: Write the failing session-state tests**

Add tests that lock the session snapshot contract, not panel DOM:

```ts
it('reports idle -> loading -> ready across initialize', async () => {
  const snapshots: PreviewSnapshot[] = [];
  const session = createPreviewSession({
    engine: createEngine(),
    charData: {
      name: 'Toki',
      description: '',
      firstMessage: '첫 메시지',
      defaultVariables: '',
      css: '',
      lorebook: [],
      regex: [],
      lua: '-- lua script',
    },
    chatFrame: createChatFrame(),
    windowTarget: createWindowTarget(),
    runtime: createNoopRuntime(),
    onStateChange: (snapshot) => snapshots.push(snapshot),
  });

  expect(session.getSnapshot().initState).toBe('idle');

  await session.initialize();

  expect(snapshots.map((snapshot) => snapshot.initState)).toContain('loading');
  expect(session.getSnapshot()).toMatchObject({
    initState: 'ready',
    initError: null,
    runtimeError: null,
  });
});

it('captures initError when resetDocument rejects with PreviewRuntimeTimeoutError', async () => {
  const onError = vi.fn();
  const runtime = {
    ...createNoopRuntime(),
    resetDocument: vi.fn().mockRejectedValue(new PreviewRuntimeTimeoutError()),
  };
  const session = createPreviewSession({
    engine: createEngine(),
    charData: {
      name: 'Toki',
      description: '',
      firstMessage: '첫 메시지',
      defaultVariables: '',
      css: '',
      lorebook: [],
      regex: [],
      lua: '-- lua script',
    },
    chatFrame: createChatFrame(),
    windowTarget: createWindowTarget(),
    runtime,
    onError,
  });

  await expect(session.initialize()).rejects.toBeInstanceOf(PreviewRuntimeTimeoutError);
  expect(session.getSnapshot().initState).toBe('error');
  expect(session.getSnapshot().initError).toContain('iframe');
  expect(onError).toHaveBeenCalled();
});

it('stores runtimeError after a post-ready trigger failure and clears it on reset', async () => {
  const engine = createEngine();
  engine.runLuaTriggerByName = vi.fn().mockRejectedValue(new Error('boom'));
  const chatFrame = createChatFrame();
  const windowTarget = createWindowTarget();
  const session = createPreviewSession({
    engine,
    charData: {
      name: 'Toki',
      description: '',
      firstMessage: '<button risu-trigger="onAttack">공격</button>',
      defaultVariables: '',
      css: '',
      lorebook: [],
      regex: [],
      lua: '-- lua script',
    },
    chatFrame,
    windowTarget,
  });

  await session.initialize();
  const button = chatFrame.contentDocument.querySelector('button[risu-trigger="onAttack"]') as HTMLButtonElement;
  button.click();
  await flushMessages();

  expect(session.getSnapshot().runtimeError).toContain('onAttack');

  await session.reset();

  expect(session.getSnapshot().runtimeError).toBeNull();
});
```

- [ ] **Step 2: Run the targeted session tests to verify they fail**

Run: `npx vitest run src/lib/preview-session.test.ts --reporter=verbose`

Expected: FAIL because `PreviewSnapshot` currently has no explicit lifecycle fields and session error paths do not persist diagnostics state.

- [ ] **Step 3: Implement session-owned init/runtime diagnostics**

Add explicit snapshot state:

```ts
export type PreviewInitState = 'idle' | 'loading' | 'ready' | 'error';

export interface PreviewSnapshot {
  // existing fields...
  initState: PreviewInitState;
  initError: string | null;
  runtimeError: string | null;
}
```

Implementation rules:

- initialize/reset lifecycle must set `initState = 'loading'` before async work starts
- successful initialize/reset must set `initState = 'ready'`, clear `initError`, and clear `runtimeError`
- init failures must set `initState = 'error'`, store a short user-facing `initError`, call `notifyStateChange()`, forward through `onError`, and then rethrow
- selected post-ready failures (`runLuaTrigger`, `runLuaTriggerByName`, `runLuaButtonClick`) must store a persistent `runtimeError` message and call `notifyStateChange()`
- `runtimeError` should persist until the next successful initialize/reset; do not add a dismiss button in this slice
- do not add concurrent lifecycle orchestration inside the session; the panel will enforce single-flight interaction during `loading`

- [ ] **Step 4: Re-run the targeted session tests**

Run: `npx vitest run src/lib/preview-session.test.ts --reporter=verbose`

Expected: PASS with explicit state transitions, timeout/init failure capture, and persistent post-ready runtime errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/preview-session.ts src/lib/preview-session.test.ts
git commit -m "feat: track preview lifecycle diagnostics" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

## Task 3: Surface lifecycle diagnostics inside the preview panel

**Files:**

- Modify: `src\lib\preview-panel.ts`
- Test: `src\lib\preview-panel.test.ts`

- [ ] **Step 1: Write the failing panel DOM tests**

Use a controlled fake session rather than the full runtime handshake. If the current hard import makes this awkward, add a narrow optional `createSession` dependency to `PreviewPanelDeps` for test injection.

```ts
it('shows a loading banner and disables reset/send controls while initialization is in flight', async () => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });

  let onStateChange: ((snapshot: PreviewSnapshot) => void) | undefined;
  const baseSnapshot: PreviewSnapshot = {
    messages: [],
    luaInitialized: false,
    variables: {},
    lorebook: [],
    loreMatches: [],
    scripts: [],
    defaultVariables: '',
    luaOutput: [],
    initState: 'idle',
    initError: null,
    runtimeError: null,
  };

  const initialize = vi.fn(async () => {
    onStateChange?.({ ...baseSnapshot, initState: 'loading' });
    return new Promise<void>(() => {});
  });

  const createSession = vi.fn((options: CreatePreviewSessionOptions) => {
    onStateChange = options.onStateChange;
    return {
      dispose() {},
      getSnapshot: () => baseSnapshot,
      handleSend: vi.fn().mockResolvedValue(undefined),
      initialize,
      initializeLua: vi.fn().mockResolvedValue(false),
      refreshBackground: vi.fn().mockResolvedValue(undefined),
      reset: vi.fn().mockResolvedValue(undefined),
    };
  });

  const container = document.createElement('div');
  showPreviewPanel(container, createDeps({ createSession }));

  expect(container.querySelector('.preview-status-banner')?.textContent).toContain('초기화');
  expect((container.querySelector('.preview-send-btn') as HTMLButtonElement).disabled).toBe(true);
  expect((container.querySelectorAll('.preview-header button')[1] as HTMLButtonElement).disabled).toBe(true);
});

it('shows a persistent error banner when runtimeError is present after startup', () => {
  // controlled session emits { initState: 'ready', runtimeError: 'Lua named trigger "onAttack" failed' }
});

it('catches initialize rejection so startup errors do not disappear as unhandled rejections', async () => {
  // controlled session emits error state and rejects initialize(); expect banner to remain visible and test to stay green
});
```

- [ ] **Step 2: Run the targeted panel tests to verify they fail**

Run: `npx vitest run src/lib/preview-panel.test.ts --reporter=verbose`

Expected: FAIL because the panel currently has no banner DOM, no control disabling during loading, and no caught startup-rejection path.

- [ ] **Step 3: Implement the panel diagnostics surface**

Add a small reactive UI layer in `showPreviewPanel(...)`:

```ts
const statusBanner = document.createElement('div');
statusBanner.className = 'preview-status-banner';
statusBanner.hidden = true;

const errorBanner = document.createElement('div');
errorBanner.className = 'preview-error-banner';
errorBanner.hidden = true;

function applySnapshot(snapshot: PreviewSnapshot): void {
  const loading = snapshot.initState === 'loading';
  const errorMessage =
    snapshot.initState === 'error' ? snapshot.initError : snapshot.runtimeError;

  statusBanner.hidden = !loading;
  statusBanner.textContent = loading ? '프리뷰 초기화 중...' : '';

  errorBanner.hidden = !errorMessage;
  errorBanner.textContent = errorMessage ?? '';

  chatInput.disabled = loading;
  sendBtn.disabled = loading;
  resetBtn.disabled = loading;
}
```

Implementation rules:

- place the banner surface between the header and iframe
- keep the iframe mounted; only the banners change
- preserve existing debug drawer behavior
- wrap the `requestAnimationFrame(async () => await session.initialize())` startup path in `void ...catch(() => {})` so stateful failures do not become unhandled rejections
- keep `close` and `debug` interactions available during `loading`

- [ ] **Step 4: Re-run the targeted panel tests**

Run: `npx vitest run src/lib/preview-panel.test.ts --reporter=verbose`

Expected: PASS with visible loading/error DOM and single-flight control disabling covered.

- [ ] **Step 5: Commit**

```bash
git add src/lib/preview-panel.ts src/lib/preview-panel.test.ts
git commit -m "feat: show preview diagnostics banner" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

## Task 4: Style the preview diagnostics surface

**Files:**

- Modify: `src\styles\app.css`
- Test: `src\styles\app-css.test.ts`

- [ ] **Step 1: Add the failing CSS regression tests**

```ts
describe('app.css – preview diagnostics', () => {
  it('defines a visible status banner rule for preview initialization', () => {
    expect(css).toMatch(/\.preview-status-banner\b/);
  });

  it('defines a visible error banner rule for preview failures', () => {
    expect(css).toMatch(/\.preview-error-banner\b/);
  });
});
```

- [ ] **Step 2: Run the targeted CSS tests to verify they fail**

Run: `npx vitest run src/styles/app-css.test.ts --reporter=verbose`

Expected: FAIL because the preview diagnostics banner selectors do not exist yet.

- [ ] **Step 3: Add compact preview diagnostics styles**

Add styles that are clearly visible but smaller than the debug drawer:

```css
.preview-status-banner,
.preview-error-banner {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-color);
  font-size: 12px;
}

.preview-status-banner {
  background: color-mix(in srgb, var(--accent) 12%, var(--bg-primary));
  color: var(--text-primary);
}

.preview-error-banner {
  background: color-mix(in srgb, #ff5f56 12%, var(--bg-primary));
  color: var(--text-primary);
}
```

Keep the rules compatible with the existing preview panel layout:

- no fixed positioning
- no overlay inside overlay
- no drawer/tab changes

- [ ] **Step 4: Re-run the targeted CSS tests**

Run: `npx vitest run src/styles/app-css.test.ts --reporter=verbose`

Expected: PASS with preview diagnostics selectors locked in.

- [ ] **Step 5: Commit**

```bash
git add src/styles/app.css src/styles/app-css.test.ts
git commit -m "style: add preview diagnostics banner styles" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

## Task 5: Document and ship v0.33.0

**Files:**

- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `CHANGELOG.md`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Update release docs and version metadata**

Document the behavior that a user or agent can actually observe:

- README: preview now shows inline loading/error diagnostics and does not silently hang on iframe startup failure
- AGENTS: preview diagnostics now surface startup/runtime issues inside the panel, while controller-owned Wasmoon preflight remains outside the panel
- CHANGELOG: add `## [0.33.0] - 2026-04-01` with Added/Changed/Fixed bullets

Use npm to keep manifest versions aligned:

```bash
npm version 0.33.0 --no-git-tag-version
```

- [ ] **Step 2: Run the full verification suite**

Run: `npm run build`

Expected: PASS across lint, typecheck, tests, Electron build, and renderer build.

- [ ] **Step 3: Create the release commit**

```bash
git add README.md AGENTS.md CHANGELOG.md package.json package-lock.json
git commit -m "v0.33.0: ship preview runtime diagnostics" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

## Notes

- Do not widen the slice into controller-level preview preflight UI. `src\app\controller.ts` should keep `ensureWasmoon()` where it is unless a directly coupled test proves otherwise.
- Keep `runtimeError` persistent until the next successful initialize/reset. Do not invent a dismiss button or debug badge in this release.
- Prefer the narrow optional `createSession` seam in `preview-panel.ts` over broad module mocking if the panel tests need controlled state emission.
- After Task 5, request a code review, then complete the normal branch/release tail: push feature branch, merge, tag `v0.33.0`, verify the release workflow, and clean up the worktree/branch.
