# Shared Authoring Syntax — Agent Routing

> Thin routing file. Full content lives in the linked skills and docs.

## What to read / when

| Order | Topic                           | How to load                                             |
| ----- | ------------------------------- | ------------------------------------------------------- |
| 1     | Project rules & MCP workflow    | `read_skill("project-workflow")`                        |
| 2     | MCP tool selection              | `read_skill("using-mcp-tools")` before MCP reads/writes |
| 3     | Shared syntax/reference index   | `risu/common/skills/README.md`                          |
| 4     | Shared docs/reference materials | `risu/common/docs/`                                     |

## Shared syntax skills

| Topic             | Skill                                    |
| ----------------- | ---------------------------------------- |
| File structures   | `read_skill("file-structure-reference")` |
| CBS templates     | `read_skill("writing-cbs-syntax")`       |
| Lorebooks         | `read_skill("writing-lorebooks")`        |
| Regex scripts     | `read_skill("writing-regex-scripts")`    |
| Lua scripting     | `read_skill("writing-lua-scripts")`      |
| HTML/CSS          | `read_skill("writing-html-css")`         |
| Arca/WYSIWYG HTML | `read_skill("writing-arca-html")`        |
| Trigger scripts   | `read_skill("writing-trigger-scripts")`  |
| Asset prompts     | `read_skill("writing-asset-prompts")`    |
| Danbooru tags     | `read_skill("writing-danbooru-tags")`    |

## Mandatory rules

1. **Read `project-workflow` first** every session.
2. This subtree is shared syntax/reference only. Do not treat bot, preset, module, or plugin composition workflows as the default path here.
3. Use dedicated MCP surfaces for `lua`, `css`, greetings, lorebooks, regex, triggers, and risup prompt structures instead of broad `read_field` dumps.
4. If the task is artifact-specific, switch to the nearest `risu/{bot,prompts,modules,plugins}/AGENTS.md` router.
5. Pick one shared syntax/reference skill first. Load additional syntax skills only when the current surface actually combines those syntaxes.
