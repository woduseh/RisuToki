# Module Skills — Reusable Behavior Packs

LLM-optimized skills for writing and reviewing `.risum` modules.

## Skills

| Skill                                           | Description                                                                                                 | Files      |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------- |
| [writing-risum-modules](writing-risum-modules/) | `.risum` composition, merge order, toggle UI, namespace aliasing, and module-vs-bot/preset/plugin decisions | `SKILL.md` |

## Typical workflow

1. Load the module composition skill first.
2. If the module contains lorebooks, regex, Lua, triggers, or CSS, load the corresponding shared skill from `../../common/skills/`.
3. Treat module-specific fields (`namespace`, `lowLevelAccess`, `customModuleToggle`, `backgroundEmbedding`) as composition concerns, not generic field trivia.
