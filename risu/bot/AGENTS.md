# Bot Authoring — Router

Choose one primary composition Skill. Do not preload `project-workflow` or `core-craft`.

## Creative latitude

Assume the user trusts deliberate creative judgment. Creative choices need not converge on one “correct” or broadly preferred answer. Strangeness, asymmetry, contradiction, discomfort, excess, transgression, or a productive “wrong” choice may be the work's signature; do not normalize it into generic harmony. Preserve supplied canon, factual/runtime constraints, and the declared creative mode. In Emergent RP, do not invent `{{user}}`'s unprovided present action, dialogue, emotion, or choice; this authorship boundary does not sanitize coercion, danger, taboo, or irreversible stakes inside the fiction.

## Primary routes

- Character psychology, voice, appeal, or relationship: `authoring-characters`
- World, culture, faction, place, or system: `authoring-worlds`
- Lorebook-driven or cast-heavy bot architecture: `authoring-lorebook-bots`
- Events, simulators, routes, or endings: `authoring-scenarios`
- Self-introduction monologue sheet: `authoring-self-introduction-sheets`
- Cross-media adaptation, franchise core, or visual identity: `authoring-media-mix`
- Per-bot source-to-target-language voice and register mapping: `writing-translation-guides`

## Optional support routes

Add at most one support Skill when the current composition exposes its named need:

- Desire, kink, body-scale logic, erotic escalation, or transgressive intimacy is structurally central: `authoring-desire`
- Exact archetype beats, audience promise, or a play-straight/subversion choice matters: `trope-library`
- A cross-cutting decision about creative mode, productive wrongness, prose register, references, or contradiction remains unresolved: `core-craft`

Do not add a support Skill merely because the task involves bot authoring. Return its decision to the primary route. If a desire-led request omits its shell, use characters for person/relationship fantasy, worlds for body physics/ecology, and scenarios for escalation/simulator structure.

## Syntax handoffs

Load one shared Skill only when the artifact needs that surface: `writing-cbs-syntax`, `writing-lorebooks`, `writing-regex-scripts`, `writing-lua-scripts`, `writing-html-css`, `writing-trigger-scripts`, `file-structure-reference`, `writing-standing-image-prompts`, `writing-danbooru-tags`, or `writing-restricted-wysiwyg-html`.

Lorebook bot architecture belongs to `authoring-lorebook-bots`; entry fields, decorators, and activation syntax belong to `writing-lorebooks`. Structured/V2 trigger orchestration belongs to `writing-trigger-scripts`; Lua function bodies belong to `writing-lua-scripts`.

Use `using-mcp-tools` only for concrete artifact reads or writes. Prefer dedicated structured surfaces over generic field dumps. Keep local `.charx` work products ignored.
