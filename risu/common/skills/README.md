# Common Skills — Shared Syntax & Reference

LLM-optimized skill bundles for reusable authoring domains.

## Skills

| Skill                                                               | Description                                                | Files                           |
| ------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------- |
| [file-structure-reference](file-structure-reference/)               | `.charx` / `.risum` / `.risup` file structures             | `SKILL.md`                      |
| [writing-cbs-syntax](writing-cbs-syntax/)                           | CBS template syntax and validation                         | `SKILL.md` + `REFERENCE.md`     |
| [writing-lua-scripts](writing-lua-scripts/)                         | Lua 5.4 trigger APIs and patterns                          | `SKILL.md` + `API_REFERENCE.md` |
| [writing-lorebooks](writing-lorebooks/)                             | Lorebook entry structure and activation rules              | `SKILL.md`                      |
| [writing-regex-scripts](writing-regex-scripts/)                     | Regex script types and output patterns                     | `SKILL.md`                      |
| [writing-html-css](writing-html-css/)                               | HTML/CSS constraints and UI patterns                       | `SKILL.md`                      |
| [writing-restricted-wysiwyg-html](writing-restricted-wysiwyg-html/) | Target-aware HTML for sanitized paste editors              | `SKILL.md`, target profiles     |
| [writing-trigger-scripts](writing-trigger-scripts/)                 | Trigger execution model and automation planning            | `SKILL.md`                      |
| [writing-standing-image-prompts](writing-standing-image-prompts/)   | Standing-image prompt pipeline and Danbooru tag validation | `SKILL.md`, model profiles      |

## Relationship to other skill locations

- product/editor internals → `../../../skills/`
- bot composition → `../../bot/skills/`
- preset composition → `../../prompts/skills/`
- module composition → `../../modules/skills/`
- plugin authoring → `../../plugins/skills/`

Load a shared syntax skill first when exact syntax, schema, or surface behavior is the main task. For bot, preset, module, or plugin composition work, follow the nearest artifact router first and add shared syntax skills only after a concrete need appears.

## Agent routing note

Pick the smallest primary syntax skill first. Do not preload CBS, Lua, regex, lorebook, HTML/CSS, and trigger guidance together unless the current surface actually combines them. Each `SKILL.md` starts with an operating contract and points to deeper references only when needed.
