# Module Authoring — Agent Routing

> Thin routing file. Full content lives in the linked skills and docs.

## What to read

| Order | Topic                        | How to load                           |
| ----- | ---------------------------- | ------------------------------------- |
| 1     | Project rules & MCP workflow | `read_skill("project-workflow")`      |
| 2     | MCP tool selection           | `read_skill("using-mcp-tools")`       |
| 3     | **Module composition**       | `read_skill("writing-risum-modules")` |
| 4     | Module field reference       | `risu/modules/docs/MODULE_FIELDS.md`  |

## Shared syntax (load on demand)

| Topic            | Skill                                    |
| ---------------- | ---------------------------------------- |
| Lorebook entries | `read_skill("writing-lorebooks")`        |
| Regex scripts    | `read_skill("writing-regex-scripts")`    |
| Lua scripting    | `read_skill("writing-lua-scripts")`      |
| CBS templates    | `read_skill("writing-cbs-syntax")`       |
| HTML/CSS         | `read_skill("writing-html-css")`         |
| Trigger scripts  | `read_skill("writing-trigger-scripts")`  |
| File structures  | `read_skill("file-structure-reference")` |

## Mandatory rules

1. **Read `project-workflow` first** every session.
2. **Never `read_field("lua")`** in bulk — use `list_lua` → `read_lua(index)`.
3. Module-specific fields (`namespace`, `lowLevelAccess`, `backgroundEmbedding`, `customModuleToggle`) are documented in `writing-risum-modules`. Do not guess semantics — read the skill.
4. **`cjs` is reserved but unused.** Do not write runtime logic into it.
5. **Prefer soft-apply** (enable module ID) over hard-apply (`applyModule`) — soft is reversible.
6. Prefix CSS classes with `x-risu-` inside `backgroundEmbedding` to avoid collisions across modules.
7. Local `.risum` work products in this directory stay ignored. Only routing/docs/skills surfaces are tracked here.
