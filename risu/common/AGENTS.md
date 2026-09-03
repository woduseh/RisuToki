# Shared Authoring Syntax — Router

Choose one primary syntax Skill for the surface being edited:

- Exact artifact fields and item shapes: `file-structure-reference`
- CBS expressions: `writing-cbs-syntax`
- Lorebook entry syntax: `writing-lorebooks`
- Regex entries: `writing-regex-scripts`
- Lua function bodies and APIs: `writing-lua-scripts`
- RisuAI HTML/CSS: `writing-html-css`
- Restricted paste-target/WYSIWYG HTML: `writing-restricted-wysiwyg-html`
- Structured/V2 trigger orchestration: `writing-trigger-scripts`
- Standing-image prompts and Danbooru tag validation: `writing-standing-image-prompts`

This subtree is syntax/reference, not bot, preset, module, or plugin composition. Switch to the nearest artifact router when composition is the main task. Add another syntax Skill only when the current surface genuinely combines both syntaxes.

Exact tag names, API signatures, decorators, stage names, and their permissions change between RisuAI versions. When exactness matters, read the skill's reference or the bundled syntax guide instead of answering from memory; a familiar name is not a verified signature. Skills whose rules depend on runtime behavior name the RisuAI baseline they were verified against.

When correct behavior depends on the ordering of two or more scripting layers, start with the primary surface and load `writing-trigger-scripts/RUNTIME_INTEROP.md` as a reference; do not introduce an umbrella scripting Skill.
