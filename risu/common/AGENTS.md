# Shared Authoring Syntax — Router

Choose one primary syntax Skill for the surface being edited:

- Exact artifact fields and item shapes: `file-structure-reference`
- CBS expressions: `writing-cbs-syntax`
- Lorebook entry syntax: `writing-lorebooks`
- Regex entries: `writing-regex-scripts`
- Lua function bodies and APIs: `writing-lua-scripts`
- RisuAI HTML/CSS: `writing-html-css`
- Limited Arca/WYSIWYG HTML: `writing-arca-html`
- Structured/V2 trigger orchestration: `writing-trigger-scripts`
- Standing-image prompts: `writing-asset-prompts`; Danbooru validation: `writing-danbooru-tags`

This subtree is syntax/reference, not bot, preset, module, or plugin composition. Switch to the nearest artifact router when composition is the main task. Add another syntax Skill only when the current surface genuinely combines both syntaxes.

When correct behavior depends on the ordering of two or more scripting layers, start with the primary surface and load `writing-trigger-scripts/RUNTIME_INTEROP.md` as a reference; do not introduce an umbrella scripting Skill.

Use `using-mcp-tools` only when selecting concrete artifact read/write operations. Prefer dedicated Lua, CSS, greeting, lorebook, regex, trigger, and `.risup` prompt surfaces over broad field dumps.
