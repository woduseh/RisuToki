# Common Skills — Shared Syntax & Reference

LLM-optimized skill bundles for reusable authoring domains.

## Skills

| Skill                                                 | Description                                     | Files                           |
| ----------------------------------------------------- | ----------------------------------------------- | ------------------------------- |
| [file-structure-reference](file-structure-reference/) | `.charx` / `.risum` / `.risup` file structures  | `SKILL.md`                      |
| [writing-cbs-syntax](writing-cbs-syntax/)             | CBS template syntax and validation              | `SKILL.md` + `REFERENCE.md`     |
| [writing-lua-scripts](writing-lua-scripts/)           | Lua 5.4 trigger APIs and patterns               | `SKILL.md` + `API_REFERENCE.md` |
| [writing-lorebooks](writing-lorebooks/)               | Lorebook entry structure and activation rules   | `SKILL.md`                      |
| [writing-regex-scripts](writing-regex-scripts/)       | Regex script types and output patterns          | `SKILL.md`                      |
| [writing-html-css](writing-html-css/)                 | HTML/CSS constraints and UI patterns            | `SKILL.md`                      |
| [writing-arca-html](writing-arca-html/)               | Restricted WYSIWYG HTML for Arca.live           | `SKILL.md`                      |
| [writing-trigger-scripts](writing-trigger-scripts/)   | Trigger execution model and automation planning | `SKILL.md`                      |
| [writing-asset-prompts](writing-asset-prompts/)       | Asset prompt pipeline for character imagery     | `SKILL.md`                      |
| [writing-danbooru-tags](writing-danbooru-tags/)       | Danbooru tag discovery and validation           | `SKILL.md`                      |

## Relationship to other skill locations

- product/editor internals → `../../../skills/`
- bot composition → `../../bot/skills/`
- preset composition → `../../prompts/skills/`
- module composition → `../../modules/skills/`
- plugin authoring → `../../plugins/skills/`

Load a shared syntax skill first when you need exact field or surface behavior, then load the artifact-specific skill for composition guidance.
