# Bot Skills — Composition

LLM-optimized skills for writing and reviewing `.charx` bots.

## Quick chooser

| If the main problem is...                                                        | Load                                     |
| -------------------------------------------------------------------------------- | ---------------------------------------- |
| shared doctrine: model baseline, prose guards, trope stance, translation premise | `core-craft` (alongside any skill below) |
| cross-media adaptation, franchise invariants, or iconic visual identity          | `authoring-media-mix`                    |
| explicit engine, contradiction, voice, appeal, and pressure scaffolding          | `authoring-characters`                   |
| worldbuilding substance: setting, culture, factions, systems, history, places    | `authoring-worlds`                       |
| a factual profile plus a voice-led self-introduction sheet                       | `authoring-self-introduction-sheets`     |
| description-vs-lorebook distribution, cast compression, or conditional depth     | `authoring-lorebook-bots`                |
| events, simulators, day cycles, routes/endings, escalation rhythm                | `authoring-scenarios`                    |
| structural desire/fetish content: consistency systems, escalation gates          | `authoring-desire`                       |
| archetype vocabulary: expected beats, straight execution, subversions            | `trope-library`                          |
| rendering English bot output into Korean with the voice intact                   | `writing-translation-guides`             |

## Composition skills

| Skill                                                                     | Description                                        | Files                                                                                                                  |
| ------------------------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| [core-craft](core-craft/)                                                 | Shared doctrine for all composition skills         | `SKILL.md` + `USER_POSITION.md` + `COMEDY_CRAFT.md`                                                                    |
| [authoring-media-mix](authoring-media-mix/)                               | Cross-media IP, adaptation, and visual identity    | `SKILL.md` + `MEDIA_PROFILES.md` + `VISUAL_IDENTITY.md` + `VALIDATION.md`                                              |
| [authoring-characters](authoring-characters/)                             | Character authoring (two tracks, appeal, voice)    | `SKILL.md` + `APPEAL_PATTERNS.md` + `SPEECH_SYSTEM.md` + `VALIDATION.md` + `CHARACTER_SCALES.md` + `WORKED_EXAMPLE.md` |
| [authoring-worlds](authoring-worlds/)                                     | Worldbuilding for LLM RP                           | `SKILL.md` + `VALIDATION.md` + `GENRE_PRESETS.md`                                                                      |
| [authoring-self-introduction-sheets](authoring-self-introduction-sheets/) | Self-introduction sheets (premise family)          | `SKILL.md` + `SHEET_STRUCTURE.md` + `GENERATION_GUIDANCE.md`                                                           |
| [authoring-lorebook-bots](authoring-lorebook-bots/)                       | Lorebook-driven bot structure                      | `SKILL.md` + `LOREBOOK_ARCHITECTURE.md` + `STRUCTURE_SCALES.md` + `BOT_VALIDATION.md`                                  |
| [authoring-scenarios](authoring-scenarios/)                               | Event systems, simulators, routes/endings          | `SKILL.md`                                                                                                             |
| [authoring-desire](authoring-desire/)                                     | Structural desire/fetish architecture              | `SKILL.md` + `DESIRE_CATALOG.md` + `WORKED_EXAMPLE.md`                                                                 |
| [trope-library](trope-library/)                                           | Archetype/trope vocabulary and execution standards | `SKILL.md` + `TROPES.md` + four focused catalogs                                                                       |
| [writing-translation-guides](writing-translation-guides/)                 | Per-bot English→Korean translation guides          | `SKILL.md`                                                                                                             |

## Typical workflow

1. Load one composition skill first.
   - If two or more media, adaptation, franchise planning, or visual identity is the main problem, start with `authoring-media-mix`.
   - For one finished image prompt, start with `writing-asset-prompts`, not `authoring-media-mix`.
2. If you need a paste-target intro/profile page for a restricted WYSIWYG, load [writing-arca-html](../../common/skills/writing-arca-html/) from the shared skill set.
3. If that skill references CBS, lorebook decorators, regex, Lua callbacks, or HTML/CSS rules, load the corresponding shared skill from `../../common/skills/`.
4. Keep large references opt-in: use `USER_POSITION.md`, `COMEDY_CRAFT.md`, `APPEAL_PATTERNS.md`, `CHARACTER_SCALES.md`, `SPEECH_SYSTEM.md`, `VALIDATION.md`, or `LOREBOOK_ARCHITECTURE.md` only after the primary `SKILL.md` shows that depth is needed.

Examples:

- `read_skill("authoring-characters")`
- `read_skill("authoring-media-mix")`
- `read_skill("authoring-worlds")`
- `read_skill("authoring-self-introduction-sheets")`
- `read_skill("authoring-lorebook-bots")`
- `read_skill("writing-arca-html")`
- `read_skill("writing-cbs-syntax")`
