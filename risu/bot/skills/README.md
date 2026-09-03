# Bot Skills — Composition

LLM-optimized skills for writing, reviewing, and critiquing `.charx` bots.

## Quick chooser

| If the main problem is...                                                                         | Load                         |
| ------------------------------------------------------------------------------------------------- | ---------------------------- |
| cross-media adaptation, franchise invariants, or iconic visual identity                           | `authoring-media-mix`        |
| explicit engine, contradiction, voice, appeal, pressure scaffolding, or a self-introduction sheet | `authoring-characters`       |
| worldbuilding substance: setting, culture, factions, systems, history, places                     | `authoring-worlds`           |
| description-vs-lorebook distribution, cast compression, or conditional depth                      | `authoring-lorebook-bots`    |
| events, simulators, day cycles, routes/endings, escalation rhythm, comedy engines                 | `authoring-scenarios`        |
| structural desire/fetish content: consistency systems, escalation gates                           | `authoring-desire`           |
| archetype vocabulary: expected beats, straight execution, subversions                             | `trope-library`              |
| rendering English bot output into Korean with the voice intact                                    | `writing-translation-guides` |
| critique, review, or rating of an existing bot's assets                                           | `critiquing-bots`            |

Shared creative-latitude, mode, and register rules live in `../AGENTS.md`; there is no separate craft skill to preload.

## Composition skills

| Skill                                                     | Description                                               | Files                                                                                                                                                                                                          |
| --------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [authoring-media-mix](authoring-media-mix/)               | Cross-media IP, adaptation, and visual identity           | `SKILL.md` + `MEDIA_PROFILES.md` + `VISUAL_IDENTITY.md` + `VALIDATION.md`                                                                                                                                      |
| [authoring-characters](authoring-characters/)             | Character authoring (two tracks, appeal, voice, sheets)   | `SKILL.md` + `APPEAL_PATTERNS.md` + `SPEECH_SYSTEM.md` + `VALIDATION.md` + `CHARACTER_SCALES.md` + `WORKED_EXAMPLE.md` + `USER_POSITION.md` + `SELF_INTRODUCTION_SHEETS.md` + `SELF_INTRODUCTION_STRUCTURE.md` |
| [authoring-worlds](authoring-worlds/)                     | Worldbuilding for LLM RP                                  | `SKILL.md` + `VALIDATION.md` + `GENRE_PRESETS.md`                                                                                                                                                              |
| [authoring-lorebook-bots](authoring-lorebook-bots/)       | Lorebook-driven bot structure                             | `SKILL.md` + `LOREBOOK_ARCHITECTURE.md` + `STRUCTURE_SCALES.md` + `BOT_VALIDATION.md`                                                                                                                          |
| [authoring-scenarios](authoring-scenarios/)               | Event systems, simulators, routes/endings, comedy engines | `SKILL.md` + `EVENT_SYSTEMS.md` + `COMEDY_CRAFT.md`                                                                                                                                                            |
| [authoring-desire](authoring-desire/)                     | Structural desire/fetish architecture                     | `SKILL.md` + `DESIRE_CATALOG.md` + `WORKED_EXAMPLE.md`                                                                                                                                                         |
| [trope-library](trope-library/)                           | Archetype/trope vocabulary and execution standards        | `SKILL.md` + four catalogs                                                                                                                                                                                     |
| [writing-translation-guides](writing-translation-guides/) | Per-bot translation guides (Korean-first)                 | `SKILL.md` + `KOREAN_REGISTER.md`                                                                                                                                                                              |
| [critiquing-bots](critiquing-bots/)                       | Evidence-anchored critique of finished bots               | `SKILL.md` + `references/KOTONE_CHARACTER.md` + `references/KOTONE_ENSEMBLE.md` + `references/KOTONE_SIMULATOR.md`                                                                                             |

## Typical workflow

1. Load one composition skill first.
   - If two or more media, adaptation, franchise planning, or visual identity is the main problem, start with `authoring-media-mix`.
   - For one finished image prompt, start with `writing-standing-image-prompts`, not `authoring-media-mix`.
   - For a judgment of an existing bot rather than new content, start with `critiquing-bots`.
2. If you need a paste-target intro/profile page for a restricted WYSIWYG, load [writing-restricted-wysiwyg-html](../../common/skills/writing-restricted-wysiwyg-html/) from the shared skill set.
3. If that skill references CBS, lorebook decorators, regex, Lua callbacks, or HTML/CSS rules, load the corresponding shared skill from `../../common/skills/`.
4. Keep large references opt-in: use `USER_POSITION.md`, `COMEDY_CRAFT.md`, `APPEAL_PATTERNS.md`, `CHARACTER_SCALES.md`, `SPEECH_SYSTEM.md`, `SELF_INTRODUCTION_SHEETS.md`, `VALIDATION.md`, or `LOREBOOK_ARCHITECTURE.md` only after the primary `SKILL.md` shows that depth is needed.

Examples:

- `read_skill("authoring-characters")`
- `read_skill("authoring-characters", "SELF_INTRODUCTION_SHEETS.md")`
- `read_skill("authoring-media-mix")`
- `read_skill("authoring-worlds")`
- `read_skill("authoring-lorebook-bots")`
- `read_skill("critiquing-bots", "references/KOTONE_CHARACTER.md")`
- `read_skill("writing-restricted-wysiwyg-html")`
- `read_skill("writing-cbs-syntax")`
