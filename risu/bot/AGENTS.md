# Bot Authoring — Agent Routing

> Thin routing file. Full content lives in the linked skills and docs.

## What to read

| Order | Topic                                        | How to load                             |
| ----- | -------------------------------------------- | --------------------------------------- |
| 1     | Project rules & MCP workflow                 | `read_skill("project-workflow")`        |
| 2     | MCP tool selection                           | `read_skill("using-mcp-tools")`         |
| 3     | Character-first bot composition              | `read_skill("authoring-characters")`    |
| 4     | Lorebook-driven / cast-heavy bot composition | `read_skill("authoring-lorebook-bots")` |
| 5     | Bot-specific critique / reference docs       | `risu/bot/docs/`                        |

## Shared syntax (load on demand)

| Topic            | Skill                                    |
| ---------------- | ---------------------------------------- |
| CBS templates    | `read_skill("writing-cbs-syntax")`       |
| Lorebook entries | `read_skill("writing-lorebooks")`        |
| Regex scripts    | `read_skill("writing-regex-scripts")`    |
| Lua scripting    | `read_skill("writing-lua-scripts")`      |
| HTML/CSS         | `read_skill("writing-html-css")`         |
| Trigger scripts  | `read_skill("writing-trigger-scripts")`  |
| File structures  | `read_skill("file-structure-reference")` |
| Asset prompts    | `read_skill("writing-asset-prompts")`    |
| Danbooru tags    | `read_skill("writing-danbooru-tags")`    |
| Arca intro HTML  | `read_skill("writing-arca-html")`        |

## Mandatory rules

1. **Read `project-workflow` first** every session.
2. Use **`authoring-characters`** when one character sheet is the core problem; use **`authoring-lorebook-bots`** when the description is mostly framing and the heavy lifting lives in lorebooks.
3. Use dedicated MCP surfaces for `lua`, `css`, greetings, lorebooks, regex, and triggers. Do not bulk-read those through generic `read_field`.
4. Treat files in `docs/` as bot-specific review/reference material; shared syntax belongs in `risu/common/skills/`.
5. Local `.charx` work products in this directory stay ignored. Only routing/docs/skills surfaces are tracked here.
