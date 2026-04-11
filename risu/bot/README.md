# risu/bot — Bot & Character Authoring

Composition guidance for writing and improving `.charx` bots and character cards.

## What lives here

- `skills/` — character, bot, and distribution-page skills
- `docs/` — critique frameworks and bot-specific reference material
- `AGENTS.md` — thin routing surface for AI assistants
- local bot project folders — ignored work products and references

## Scope boundary

| Here                                                                                              | Elsewhere                                                          |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Character description structure, lorebook-driven bot architecture, bot critique, Arca intro pages | Shared syntax like CBS, lorebook schema, Lua APIs, regex, HTML/CSS |

## Start here

- `AGENTS.md`
- `skills/README.md`
- `docs/`
- `../common/skills/README.md`

When a bot task depends on CBS/Lua/lorebook syntax details, read the corresponding shared skill from `../common/skills/`.
