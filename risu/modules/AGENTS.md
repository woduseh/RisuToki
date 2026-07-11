# Module Authoring — Router

Use `writing-risum-modules` as the primary Skill for `.risum` composition. Use `using-mcp-tools` only for concrete artifact operations; add a shared syntax Skill only when the module contains that surface.

Key boundaries:

- Prefer reversible soft-apply by enabling the module ID; use hard `applyModule` only when permanent merging is intended.
- Use dedicated Lua, CSS, lorebook, regex, and trigger surfaces instead of broad field dumps.
- `cjs` is reserved and unused; never place runtime logic there.
- Keep module-specific CSS classes unique inside `backgroundEmbedding`; RisuAI prefixes them with `x-risu-` at render time.
- Read `risu/modules/docs/MODULE_FIELDS.md` only when exact field semantics are needed.
- Keep local `.risum` work products ignored. Do not load bot, preset, or plugin workflows unless the task explicitly crosses artifacts.
