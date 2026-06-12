# Bot Authoring — Agent Routing

> Thin routing file. Full content lives in the linked skills and docs.

## What to read / when

| Order | Topic                                                          | How to load                                             |
| ----- | -------------------------------------------------------------- | ------------------------------------------------------- |
| 1     | Project rules & MCP workflow                                   | `read_skill("project-workflow")`                        |
| 2     | MCP tool selection                                             | `read_skill("using-mcp-tools")` before MCP reads/writes |
| 3     | Shared composition doctrine (always, with any authoring skill) | `read_skill("core-craft")`                              |
| 4     | Multi-media adaptation / franchise / visual identity           | `read_skill("authoring-media-mix")`                     |
| 5     | Explicitly scaffolded character composition                    | `read_skill("authoring-characters")`                    |
| 6     | Worldbuilding / setting composition                            | `read_skill("authoring-worlds")`                        |
| 7     | Self-introduction monologue character sheets                   | `read_skill("authoring-self-introduction-sheets")`      |
| 8     | Lorebook-driven / cast-heavy bot architecture                  | `read_skill("authoring-lorebook-bots")`                 |
| 9     | Event systems, simulators, routes/endings                      | `read_skill("authoring-scenarios")`                     |
| 10    | Structural desire/fetish architecture                          | `read_skill("authoring-desire")`                        |
| 11    | Archetype/trope vocabulary                                     | `read_skill("trope-library")`                           |
| 12    | English→Korean translation guides                              | `read_skill("writing-translation-guides")`              |
| 13    | Bot-specific critique / reference docs                         | `risu/bot/docs/`                                        |

## Shared syntax (load on demand)

| Topic             | Skill                                    |
| ----------------- | ---------------------------------------- |
| CBS templates     | `read_skill("writing-cbs-syntax")`       |
| Lorebook entries  | `read_skill("writing-lorebooks")`        |
| Regex scripts     | `read_skill("writing-regex-scripts")`    |
| Lua scripting     | `read_skill("writing-lua-scripts")`      |
| HTML/CSS          | `read_skill("writing-html-css")`         |
| Trigger scripts   | `read_skill("writing-trigger-scripts")`  |
| File structures   | `read_skill("file-structure-reference")` |
| Asset prompts     | `read_skill("writing-asset-prompts")`    |
| Danbooru tags     | `read_skill("writing-danbooru-tags")`    |
| Arca/WYSIWYG HTML | `read_skill("writing-arca-html")`        |

## Mandatory rules

1. **Read `project-workflow` first** every session.
2. Choose **one primary composition skill first**, and read **`core-craft`** alongside it. Use **`authoring-media-mix`** when two or more media, adaptation, franchise identity, or iconic visual design is the main problem; otherwise keep the narrower primary skill: **`authoring-characters`**, **`authoring-worlds`**, **`authoring-self-introduction-sheets`**, **`authoring-lorebook-bots`**, or **`authoring-scenarios`**. Load `authoring-desire`, `trope-library`, and `writing-translation-guides` as support skills only when the primary skill exposes the need.
3. Use dedicated MCP surfaces for `lua`, `css`, greetings, lorebooks, regex, and triggers. Do not bulk-read those through generic `read_field`.
4. Treat files in `docs/` as bot-specific review/reference material; shared syntax belongs in `risu/common/skills/`.
5. Local `.charx` work products in this directory stay ignored. Only routing/docs/skills surfaces are tracked here.
6. Preset, module, and plugin composition workflows are separate. Do not load them as defaults in this subtree unless the task explicitly bridges artifacts.
7. Load shared syntax skills only on demand after the primary composition skill exposes a concrete CBS, lorebook, regex, Lua, HTML/CSS, trigger, asset, or Danbooru need.
8. A request for one finished standing-image prompt routes to `writing-asset-prompts`; use `authoring-media-mix` only when visual identity itself must be designed or preserved across products.
9. `authoring-desire` remains a support skill. If a desire-led request does not name its composition shell, default to `authoring-characters` for a person/relationship fantasy, `authoring-worlds` for body physics or ecology, and `authoring-scenarios` for escalation or simulator structure.
10. Load `core-craft/USER_POSITION.md` only when `{{user}}` identity, access, knowledge, capability, or compatibility changes play. Load `core-craft/COMEDY_CRAFT.md` only when comedy is a recurring engine. These are references, not primary skills.
