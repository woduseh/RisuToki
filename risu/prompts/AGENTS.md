# Preset Authoring — Router

Choose one primary route:

- General `.risup` structure, prompts, ordering, toggles, model settings, or sampling: `writing-risup-presets`
- Designing or revising a reusable prompt family's behavior, CBS decisions, modes, or provider policy: `prompt-family-development`
- Auditing or applying an approved change across a canonical prompt family and its Markdown or `.risup` variants: `prompt-family-maintenance`

Do not combine development and maintenance by default. Development hands off only after the intended family behavior is settled; maintenance returns unresolved policy decisions instead of encoding them as drift repairs. Read only the matching family profile under `risu/prompts/docs/families/` when one exists.

Treat developer-defined reachable modes as the supported state space. For interacting conditionals, verify intended modes, meaningful combinations, and relevant boundary transitions. Do not add fallback prose, guards, branches, or combinatorial tests for states that users or the runtime cannot meaningfully reach unless a concrete failure demonstrates the need.

Add `writing-cbs-syntax`, `file-structure-reference`, or `writing-risum-modules` only for a concrete CBS, file-shape, or module-integration need.

Read `risu/prompts/docs/PRESET_FIELDS.md` only when exact field semantics are required.
