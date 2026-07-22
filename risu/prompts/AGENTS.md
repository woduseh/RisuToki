# Preset Authoring — Router

Choose one primary route:

- General `.risup` structure, prompts, ordering, toggles, model settings, or sampling: `writing-risup-presets`
- Designing new Mythos behavior, CBS decisions, or toggle semantics: `mythos-prompt-development`
- Repairing drift within the existing Mythos Source and model variants: `mythos-prompt-maintenance`
- Propagating a non-Mythos canonical prompt/preset to model variants: `prompt-preset-sync`

Do not combine the three sync/development Skills by default. Development hands off to Mythos maintenance only after the intended behavior is settled. Generic preset sync does not own Mythos design decisions.

Treat developer-defined reachable modes as the supported state space. For interacting conditionals, verify intended modes, meaningful combinations, and relevant boundary transitions. Do not add fallback prose, guards, branches, or combinatorial tests for states that users or the runtime cannot meaningfully reach unless a concrete failure demonstrates the need.

Use `using-mcp-tools` only for concrete artifact reads or writes. Prefer structured `.risup` prompt tools over broad `promptTemplate` or `formatingOrder` dumps, and carry current type/preview guards for index-based edits. Add `writing-cbs-syntax`, `file-structure-reference`, or `writing-risum-modules` only for a concrete CBS, file-shape, or module-integration need.

Read `risu/prompts/docs/PRESET_FIELDS.md` only when exact field semantics are required. Keep local `.risup` work products ignored.
