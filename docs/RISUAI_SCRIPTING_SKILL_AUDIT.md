# RisuAI scripting Skill audit

## Baseline

- Reviewed input: `C:/Users/wodus/Downloads/risuai skill.zip` (reference only; not copied into the catalog)
- Canonical source: local RisuAI checkout, version `2026.6.214`
- Commit: `9d8791ea842404ef3c7e6410c2359a2db7ca4bcd`
- Verified: `2026-07-11`

Public types and official guides are treated as contracts. Parser/process observations below are version-bound implementation facts. RisuToki aliases are documented separately from upstream persisted values.

## Disposition

| Topic                                                                                                | Classification            | Evidence                                                                                                                          | Integration decision                                                                              |
| ---------------------------------------------------------------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Nested CBS is evaluated inside-out; unknown tags remain literal                                      | Confirmed                 | `src/ts/parser/parser.svelte.ts`, `src/ts/cbs.ts`                                                                                 | Keep in CBS core rules                                                                            |
| `runVar` rewrites saved chat messages and executes before prompt assembly and after response storage | Version-bound             | `src/ts/process/index.svelte.ts` `runCurrentChatFunction` and its call sites                                                      | Add exact lifecycle warning and interop timeline                                                  |
| False `#when` branch contents may be evaluated before branch selection                               | Version-bound             | CBS block handlers/parser evaluation                                                                                              | Add side-effect warning; do not present as a syntax contract                                      |
| Chat variables are shared by CBS, Lua, and structured triggers                                       | Confirmed                 | parser chat-variable access plus `scriptings.ts`/`triggers.ts`                                                                    | Add shared-state matrix                                                                           |
| Missing variables use the string `null` after configured fallbacks                                   | Confirmed                 | `src/ts/parser/chatVar.svelte.ts`                                                                                                 | Keep string/null guard guidance                                                                   |
| Lua engines are keyed by execution mode and reused until source changes                              | Version-bound             | `src/ts/process/scriptings.ts` `getOrCreateEngineState(mode, type)`                                                               | Add lifecycle/state warning                                                                       |
| Lua callback `false` always cancels a send                                                           | Inaccurate                | `scriptings.ts` sets `stopSending`, but `index.svelte.ts` consumes it for `start`; input/output callers do not universally cancel | State that only a caller consuming `stopSending` can cancel; current send path does so at `start` |
| `listenEdit` receives low-level access                                                               | Inaccurate                | `runLuaEditTrigger` forces `lowLevelAccess: false`                                                                                | Document safe transformation-only behavior                                                        |
| Upstream regex request-stage value is `editprocess`                                                  | Confirmed                 | `src/ts/process/scripts.ts` `ScriptMode`                                                                                          | Make canonical persisted value explicit                                                           |
| RisuToki accepts `editrequest`                                                                       | RisuToki expression layer | `src/charx-io.ts` normalizes it to `editprocess`                                                                                  | Preserve alias and explain export normalization                                                   |
| `Risuai` and `risuai` are both valid plugin globals                                                  | Confirmed                 | `apiV3/factory.ts` assigns `window.Risuai = window.risuai`; both declarations exist in `risuai.d.ts`                              | Correct Quick Reference and use one consistent preferred spelling in examples                     |
| Plugin API v3 calls cross an async boundary                                                          | Confirmed                 | `plugins.md`, `apiV3/factory.ts`, `risuai.d.ts`                                                                                   | Retain await rule and distinguish cached properties such as `apiVersion`                          |
| Modules merge reusable lorebook/regex/trigger/assets and have separate LLA                           | Confirmed                 | `src/ts/process/modules.ts`, trigger/module loaders                                                                               | Keep concise module boundary; do not duplicate full schema                                        |
| ZIP schema is a complete stable artifact contract                                                    | Inaccurate                | Upstream types are wider and RisuToki exposes bounded aliases/protected fields                                                    | Do not import wholesale; retain dedicated schema owner                                            |

## Excluded or qualified material

- Internal pipeline ordering is recorded against the baseline above, not promised as a timeless public API.
- Exhaustive CBS/API catalogs remain in existing detailed references and must be re-audited when the upstream baseline changes.
- Python scripting implementation is not promoted as an authoring route because the supported RisuToki surface is Lua.
- ZIP examples are not copied verbatim; copyable metadata directives and code are regenerated without inline explanatory suffixes.
