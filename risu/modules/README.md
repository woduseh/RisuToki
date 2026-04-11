# Modules (.risum)

This directory contains module-specific documentation and skills for RisuToki.

Modules are reusable behavior packs — lorebooks, regex scripts, triggers, Lua, and CSS — that attach to any character or chat without modifying the underlying character data.

Only routing/docs/skills surfaces are tracked here. Local `.risum` work products remain ignored.

## Contents

| Path                                    | Description                                                                                                                            |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`                             | Agent routing — what to read and in what order                                                                                         |
| `docs/MODULE_FIELDS.md`                 | Complete field inventory with types, defaults, merge behavior, and binary format                                                       |
| `skills/README.md`                      | Module skill index                                                                                                                     |
| `skills/writing-risum-modules/SKILL.md` | Composition guide: namespace, lowLevelAccess, backgroundEmbedding, toggle UI, merge order, and when to use a module vs other artifacts |

## Shared syntax

Modules share lorebook, regex, Lua, CBS, HTML/CSS, and trigger surfaces with bots. Those syntaxes are documented once under `risu/common/skills/`:

| Syntax           | Common skill               |
| ---------------- | -------------------------- |
| Lorebook entries | `writing-lorebooks`        |
| Regex scripts    | `writing-regex-scripts`    |
| Lua scripting    | `writing-lua-scripts`      |
| CBS templates    | `writing-cbs-syntax`       |
| HTML/CSS styling | `writing-html-css`         |
| Trigger scripts  | `writing-trigger-scripts`  |
| File structure   | `file-structure-reference` |

## Quick orientation

- **Creating a module?** → Start with `skills/writing-risum-modules/SKILL.md`
- **Looking up a field?** → `docs/MODULE_FIELDS.md`
- **Writing lorebooks or regex for a module?** → Same syntax as bots — see the common skills above
