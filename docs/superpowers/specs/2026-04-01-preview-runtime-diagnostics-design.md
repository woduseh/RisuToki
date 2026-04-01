# Preview Runtime Diagnostics Design

Date: 2026-04-01

Status: Draft for review

## Problem

RisuToki's preview surface is now functionally rich, but its initialization and failure UX is still too opaque.

The current preview flow has three user-facing gaps:

- preview startup has no explicit loading state, so opening can feel frozen while Wasmoon and iframe runtime boot
- iframe readiness has no timeout, so a failed runtime handshake can leave the preview hanging indefinitely
- initialization/runtime failures are reported to the global status bar, which sits behind the preview overlay and is easy to miss

This makes preview regressions harder to detect and much harder to diagnose from the UI, even though the underlying runtime and debug tooling are already fairly capable.

The next slice should ship the smallest safe diagnostics foundation: **bounded iframe readiness, explicit preview init state, and in-panel error visibility**.

## Goals

- Add a bounded readiness timeout for the iframe preview runtime.
- Make preview initialization state explicit instead of implicit.
- Surface preview startup failures and selected post-ready runtime failures inside the preview panel itself.
- Preserve the existing preview architecture and debug tooling.
- Keep the new diagnostics additive and low-risk.
- Add regression coverage for timeout, init-state transitions, and in-panel error visibility.

## Non-Goals

- No broad rewrite of the preview engine, parser, or Lua execution pipeline.
- No redesign of the preview debug drawer into a full diagnostics console.
- No refactor of preview popout architecture in this slice.
- No persistent error history or badge counter yet.
- No change to CBS/Lua semantics, chat rendering semantics, or lorebook/debug contract.
- No general-purpose async task framework for all panels.

## Chosen Direction

Use a **minimal lifecycle-state layer** centered on the existing preview session/runtime boundary.

1. **Bound iframe readiness**
   - `createIframePreviewRuntime()` should reject if the iframe runtime never sends its ready handshake within a fixed timeout.

2. **Track explicit init state in the preview session snapshot**
   - preview state should expose whether initialization is `idle`, `loading`, `ready`, or `error`
   - initialization failures should be captured as user-facing state, not only as console/status-bar noise

3. **Track post-ready runtime errors separately**
   - later Lua/runtime failures should not overload the meaning of init state
   - they should surface through a separate `runtimeError` field in the snapshot

4. **Render diagnostics inside the preview panel**
   - the panel should show a lightweight loading surface during initialization
   - the panel should show a persistent in-panel error banner when initialization fails or when a later runtime error is present
   - existing `reportRuntimeError()` status-bar reporting remains as a secondary channel

This is the smallest slice that makes failures visible without dragging the preview system into a larger redesign.

## Why this direction

Compared with an “Errors” debug tab or a larger session-controller rewrite, this approach is lower risk because it changes only the preview lifecycle boundary and the already-owned panel DOM.

- `preview-runtime.ts` already owns the iframe handshake.
- `preview-session.ts` already owns snapshot state and lifecycle sequencing.
- `preview-panel.ts` already owns visible DOM for the overlay.

That means the slice can stay focused on:

- timeout
- state transitions
- visible diagnostics

without touching the heavy parser/runtime core in `preview-engine.ts`.

## Design

### 1. Add explicit preview init state to the session snapshot

File to modify: `src\lib\preview-session.ts`

Extend `PreviewSnapshot` with explicit lifecycle fields:

```ts
type PreviewInitState = 'idle' | 'loading' | 'ready' | 'error';

interface PreviewSnapshot {
  // existing fields...
  initState: PreviewInitState;
  initError: string | null;
  runtimeError: string | null;
}
```

Required behavior:

- newly created sessions start in `idle`
- `initialize()` and `reset()` set state to `loading` before async work starts
- successful completion sets state to `ready` and clears `initError`
- initialization failure sets state to `error` and stores a user-facing message in `initError`
- later successful reset should recover from `error` back to `ready`
- successful initialize/reset should also clear `runtimeError`

Design constraint:

- keep this state in `preview-session.ts`, because it is the single lifecycle owner already feeding `onStateChange`
- `initState` / `initError` are only for initialization/reset lifecycle, not for general runtime failures after startup

### 2. Bound iframe readiness with a typed timeout path

File to modify: `src\lib\preview-runtime.ts`

Current risk:

- `createIframePreviewRuntime.resetDocument()` waits on `readyPromise` forever if the iframe runtime never posts `preview-runtime:ready`

Add:

```ts
const IFRAME_READY_TIMEOUT_MS = 5000;

export class PreviewRuntimeTimeoutError extends Error {
  constructor(message = '프리뷰 iframe 초기화 시간이 초과되었습니다.') {
    super(message);
    this.name = 'PreviewRuntimeTimeoutError';
  }
}
```

Required behavior:

- `resetDocument()` should race the ready handshake against a timeout
- timeout should reject with `PreviewRuntimeTimeoutError`
- success should clear the pending timeout and resolve normally
- disposal should not leak a pending timeout or stale resolver

Design constraint:

- keep timeout logic self-contained inside `preview-runtime.ts`
- do not move timeout handling into the panel; the runtime owns the handshake and should own its timeout

### 3. Capture initialization failures instead of letting them disappear

File to modify: `src\lib\preview-session.ts`

Current gaps:

- `initialize()` and `reset()` can reject through `runtime.resetDocument()` or `engine.initLua()`
- those rejections are not converted into stable snapshot state

Required behavior:

- wrap init/reset lifecycle work in `try` / `catch`
- on failure:
  - set `initState = 'error'`
  - set `initError` to a concise user-facing message
  - leave `runtimeError` reserved for post-ready failures
  - call `notifyStateChange()`
  - forward the error through `onError` for existing status-bar/console reporting
  - rethrow only if the caller still needs failure semantics, but the session state itself must already be coherent

Message rules:

- iframe timeout should produce a message specific to preview startup timeout
- generic init failures should produce a stable fallback such as `프리뷰 초기화에 실패했습니다.`
- avoid surfacing giant raw stack traces inside the panel body

Design constraint:

- keep messages short and readable in the panel
- detailed error objects can continue going through `reportRuntimeError()` / console

### 4. Show loading and error surfaces inside the panel

Files to modify:

- `src\lib\preview-panel.ts`
- `src\styles\app.css`

Add two lightweight DOM surfaces owned by the panel:

- `preview-status-banner` or equivalent inline loading surface
- `preview-error-banner` or equivalent inline error surface

Recommended layout:

- place the diagnostics surface between the header and the iframe so it is impossible to miss
- keep the iframe mounted so recover/reset flows remain simple

Required behavior:

- while `snapshot.initState === 'loading'`, show a compact loading banner such as `프리뷰 초기화 중...`
- while `snapshot.initState === 'error'`, show an error banner with `snapshot.initError`
- when `snapshot.runtimeError` is non-null after startup, show that same error banner surface without changing `initState` back to `error`
- when state becomes `ready` with no `runtimeError`, hide both surfaces
- runtime errors received later through `onError` should update `runtimeError`, not just the status bar
- while `initState === 'loading'`, the panel should disable reset/send interactions so the slice can preserve single-flight initialization assumptions instead of adding re-entrant lifecycle orchestration

Recommended scope:

- use a persistent inline banner, not a transient toast
- do not add a new debug tab in this slice
- do not auto-open the debug drawer on failure

### 5. Fix the swallowed initialization rejection in the panel

File to modify: `src\lib\preview-panel.ts`

Current code:

```ts
requestAnimationFrame(async () => {
  await session.initialize();
});
```

This allows rejection paths to become easy to miss.

Required behavior:

- wrap the `requestAnimationFrame` initialization call in a catch path
- ensure panel-visible error state is updated even if initialization rejects before later state updates would occur
- preserve the current “initialize after DOM mount” sequencing

The panel should not become the primary owner of init state; it should only make sure unhandled startup rejection cannot vanish.

## Explicit boundary for this slice

File reviewed: `src\app\controller.ts`

Current code awaits `ensureWasmoon()` before rendering the panel.

Decision for `v0.33.0`:

- keep `ensureWasmoon()` where it is
- if it throws, continue using the existing status/reporting path instead of inventing a new controller-level preview preflight UI

This keeps the new diagnostics scope centered on the mounted preview panel and its iframe/session lifecycle, rather than widening into app-level preflight orchestration.

## UX Direction Chosen

Use **in-panel loading + in-panel persistent error banner**.

Why this is preferred over an Errors tab:

- it is visible without opening debug UI
- it matches the urgency of startup failures
- it requires fewer moving parts than badge counts or drawer state choreography

Future slices can still add:

- an Errors tab in the debug drawer
- copyable structured diagnostics
- badge counts on the debug button

## File Map

### Production

- `src\lib\preview-runtime.ts`
- `src\lib\preview-session.ts`
- `src\lib\preview-panel.ts`
- `src\styles\app.css`
- `src\app\controller.ts` (review, minimal change only if needed)

### Tests

- `src\lib\preview-runtime.test.ts`
- `src\lib\preview-session.test.ts`
- `src\lib\preview-panel.test.ts`
- `src\styles\app-css.test.ts` if new required CSS hooks need locking

## Validation Checklist

- preview initialization enters `loading` before async work completes
- successful startup transitions to `ready`
- iframe readiness timeout transitions to `error`
- timeout path surfaces a visible in-panel error message
- non-timeout initialization failures also surface a visible in-panel error message
- reset can recover from error back to ready
- full verification still passes:
  - `npm run lint`
  - `npm run typecheck`
  - `npm test`
  - `npm run build`

## Risks and Mitigations

### Risk: timeout fires for legitimately slow environments

Mitigation:

- use a moderate fixed timeout rather than an aggressive one
- keep the error message actionable and allow reset/retry

### Risk: panel and session state drift

Mitigation:

- make `PreviewSnapshot` the single source of truth for init and runtime diagnostics state
- keep the panel purely reactive to snapshot changes

### Risk: CSS regressions hide the new diagnostics surface

Mitigation:

- keep the DOM structure minimal
- add or extend CSS regression tests if the new classes are critical to layout visibility

### Risk: runtime error banner becomes noisy

Mitigation:

- keep messages concise
- in this slice, optimize for visibility of real failures over sophisticated deduplication

## Notes

- Do not widen the slice into a general preview refactor.
- Avoid touching `preview-engine.ts`, `preview-format.ts`, and `preview-debug.ts` unless a directly coupled test forces it.
- Preserve the current debug drawer behavior; diagnostics visibility is the priority, not diagnostics history.
- This slice assumes one active initialization/reset at a time. Instead of adding concurrent lifecycle orchestration, the panel should disable interactive reset/send controls during `loading`.
