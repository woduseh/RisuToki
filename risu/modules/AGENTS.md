# Module Authoring — Router

Use `writing-risum-modules` as the primary Skill for `.risum` composition. Add a shared syntax Skill only when the module contains that surface. Do not load bot, preset, or plugin workflows unless the task explicitly crosses artifacts.

Key boundaries:

- Prefer reversible soft-apply by enabling the module ID; use hard `applyModule` only when permanent merging is intended.
- `cjs` is reserved and unused; never place runtime logic there.
- Keep module-specific CSS classes unique inside `backgroundEmbedding`; RisuAI prefixes them with `x-risu-` at render time.
- Read `risu/modules/docs/MODULE_FIELDS.md` only when exact field semantics are needed.
