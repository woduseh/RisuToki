# Bot Skills — Character & Bot Composition

LLM-optimized skills for writing and reviewing `.charx` bots.

## Skills

| Skill                                               | Description                              | Files                                                               |
| --------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------- |
| [authoring-characters](authoring-characters/)       | Character description writing for LLM RP | `SKILL.md` + `SPEECH_SYSTEM.md` + `VALIDATION.md` + `BOT_SCALES.md` |
| [authoring-lorebook-bots](authoring-lorebook-bots/) | Lorebook-driven bot description writing  | `SKILL.md` + `LOREBOOK_ARCHITECTURE.md` + `BOT_SCALES.md`           |
| [writing-arca-html](writing-arca-html/)             | Restricted WYSIWYG HTML for Arca.live    | `SKILL.md`                                                          |

## Typical workflow

1. Load a bot composition skill first.
2. If that skill references CBS, lorebook decorators, regex, Lua callbacks, or HTML/CSS rules, load the corresponding shared skill from `../../common/skills/`.

Examples:

- `read_skill("authoring-characters")`
- `read_skill("authoring-lorebook-bots")`
- `read_skill("writing-cbs-syntax")`
