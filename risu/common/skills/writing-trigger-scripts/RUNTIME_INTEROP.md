# RisuAI scripting runtime interoperability

> Verified against RisuAI `2026.8.250`, commit `984f46b7306ca38312a043e0ef28d447f2a92766`, on 2026-08-31.
> Canonical sources: `src/ts/process/index.svelte.ts`, `scriptings.ts`, `scripts.ts`, `triggers.ts`, `modules.ts`, `src/ts/parser/*`, and `src/ts/plugins/apiV3/*`.
> Public types are contracts; exact ordering below is a version-bound implementation observation.

Use this reference only when a task crosses two or more of CBS, Lua, structured triggers, regex, modules, or plugin hooks.

## Shared state

Chat variables converge on the current chat's `scriptstate` keys:

| Layer                | Read                        | Write                             | Notes                                                   |
| -------------------- | --------------------------- | --------------------------------- | ------------------------------------------------------- |
| CBS                  | `{{getvar::key}}`           | `setvar`/`addvar`/`setdefaultvar` | Mutation requires a `runVar` caller                     |
| Lua                  | `getChatVar(id, key)`       | `setChatVar(id, key, value)`      | `id` is a capability key; values are strings            |
| Lua structured state | `getState(id, key)`         | `setState(id, key, value)`        | JSON wrapper using a namespaced chat key                |
| Structured triggers  | variable conditions/actions | variable actions                  | Same chat state, with local V2 variables where declared |
| Plugin               | indexed chat/database APIs  | matching setters                  | Requires the relevant permission and explicit save call |

An absent chat variable falls through configured defaults and otherwise resolves to the string `null`. Do not confuse it with Lua `nil`, JavaScript `null`, or an empty string. Display processing uses temporary variables/state where provided; never rely on display rendering for durable mutation.

## One send cycle

The following is the useful dependency order, not a promise that every internal helper is public API:

1. The `input` trigger/Lua `onInput` runs before the new user message is appended. It cannot reliably read that new text through last-message helpers.
2. User input passes through Lua edit-input listeners, plugin input handlers, CBS parsing, and `editinput` regex before storage.
3. The saved chat receives a `runVar` pass. Mutation tags execute, and all CBS in those messages is replaced with its current rendered value.
4. Lorebook and prompt assembly evaluate their supported CBS surfaces without automatically enabling `runVar` mutation.
5. `start` triggers/Lua `onStart` run during prompt assembly on every send. The normal send path consumes `stopSending` here and can cancel before the request.
6. Each assembled message receives canonical `editprocess` regex processing. RisuToki's `editrequest` is an input alias for this persisted stage.
7. Lua `editRequest` listeners and request-state structured triggers edit model input without changing saved chat.
8. Plugin before-request replacers/body interceptors run before the provider request; after-request replacers run on the response side.
9. Response processing applies Lua edit-output listeners, plugin output handlers, CBS parsing, and `editoutput` regex before storing the message. In strong streaming-display optimization mode, this postprocessing is deferred until streaming ends; balanced mode coalesces display updates.
10. The saved chat receives another `runVar` pass, so response mutation tags execute before `output` triggers/Lua `onOutput`.
11. Plugin output chat listeners run after output triggers and inlay processing. They are awaited sequentially and receive a snapshot whose direct mutations are not persisted.
12. Display rendering repeatedly applies Lua edit-display listeners, display triggers, plugin display handlers, CBS, and `editdisplay` regex without changing the stored message.

Do not use this timeline to move a transformation casually between layers. The persistence, visibility, permissions, input shape, and repeat frequency differ.

## Lua lifecycle and cancellation

- Lua engines are cached by mode and protected by a per-engine mutex. A global may survive repeated calls in one mode but is not shared with another mode and is not durable across code reload/restart.
- Persist cross-mode state with chat variables or `getState`/`setState`.
- Edit listeners are invoked without low-level access. `editDisplay` is still more restricted and writes to temporary display state.
- Returning `false` or calling `stopChat` sets `stopSending` inside the scripting result. It cancels only if the caller checks that result; in the verified send path, the decisive check is after `start`.
- Direct Promise-returning host APIs need `:await()` inside a coroutine/async callback. Lua convenience wrappers marked as internally awaited must not be awaited again.

## Rerolls, recursion, and repeated effects

- A reroll re-enters prompt assembly and output processing without reproducing every initial input-side step. Treat `start`, request hooks, response `runVar`, and output logic as repeatable.
- `sendAIprompt` can start another send cycle. Guard it with explicit state to prevent unbounded regeneration.
- Manual triggers can invoke other manual triggers. Respect the runtime recursion bound and add your own termination condition.
- Display handlers run on re-render. Keep them deterministic or intentionally presentation-only; do not perform durable writes, LLM calls, or network effects there.
- Stable CBS choices such as `pick` are appropriate when refresh consistency matters; non-deterministic choices such as `random` may change when the containing surface is evaluated again.

## Modules and merge boundaries

- Active module lorebooks, regex, triggers, assets, and background embedding are merged into the current runtime rather than becoming a new character identity.
- Module trigger low-level access is controlled by the module's own trust flag, independently of the character flag.
- Character/chat content precedes appended module lorebook and trigger sources in the verified loaders. Regex also includes active preset entries; inspect sibling order when transformations depend on one another.
- Hard module application copies data into a character. It is not equivalent to reversible activation and no longer preserves module ownership.

## Plugin boundary

- `risuai` and `Risuai` reference the same API v3 proxy at this baseline.
- Calls cross an async sandbox boundary; cached properties such as `apiVersion` are values, while API and safe-DOM methods return Promises.
- Plugin hooks participate at specific pipeline points but do not inherit Lua/CBS permissions or persistence rules.
- Host DOM, database, replacer, provider, fetch-log, and send-chat capabilities may require user permission. Treat denial as a normal result and clean up registered handlers on unload.

## Validation checklist

- Identify the layer that owns the transformation and its canonical persisted stage.
- State whether the result is stored, model-visible, display-only, or temporary.
- Verify repeat behavior for reroll, refresh, manual re-entry, and automatic resend.
- Verify the capability key/permission/LLA required at the exact caller.
- Test missing string `null`, malformed JSON state, no-op input, and denied capability paths.
