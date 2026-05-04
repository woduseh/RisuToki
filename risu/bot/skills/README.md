# Bot Skills — Composition

LLM-optimized skills for writing and reviewing `.charx` bots.

## Quick chooser

| If the main problem is...                                                       | Load                                 |
| ------------------------------------------------------------------------------- | ------------------------------------ |
| explicit engine, contradiction, voice, and pressure scaffolding for a character | `authoring-characters`               |
| a factual profile plus a voice-led self-introduction sheet                      | `authoring-self-introduction-sheets` |
| description-vs-lorebook distribution, cast compression, or conditional depth    | `authoring-lorebook-bots`            |

## Composition skills

| Skill                                                                     | Description                                  | Files                                                               |
| ------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------- |
| [authoring-characters](authoring-characters/)                             | Character description writing for LLM RP     | `SKILL.md` + `SPEECH_SYSTEM.md` + `VALIDATION.md` + `BOT_SCALES.md` |
| [authoring-self-introduction-sheets](authoring-self-introduction-sheets/) | Self-introduction monologue character sheets | `SKILL.md` + `SHEET_STRUCTURE.md` + `GENERATION_GUIDANCE.md`        |
| [authoring-lorebook-bots](authoring-lorebook-bots/)                       | Lorebook-driven bot description writing      | `SKILL.md` + `LOREBOOK_ARCHITECTURE.md` + `BOT_SCALES.md`           |

## Typical workflow

1. Load one composition skill first.
2. If you need a paste-target intro/profile page for a restricted WYSIWYG, load [writing-arca-html](../../common/skills/writing-arca-html/) from the shared skill set.
3. If that skill references CBS, lorebook decorators, regex, Lua callbacks, or HTML/CSS rules, load the corresponding shared skill from `../../common/skills/`.
4. Keep large references opt-in: use `BOT_SCALES.md`, `SPEECH_SYSTEM.md`, `VALIDATION.md`, or `LOREBOOK_ARCHITECTURE.md` only after the primary `SKILL.md` shows that depth is needed.

Examples:

- `read_skill("authoring-characters")`
- `read_skill("authoring-self-introduction-sheets")`
- `read_skill("authoring-lorebook-bots")`
- `read_skill("writing-arca-html")`
- `read_skill("writing-cbs-syntax")`
