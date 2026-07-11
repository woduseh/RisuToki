# Bot Authoring — Router

Choose one primary composition Skill. Do not preload `project-workflow` or `core-craft`.

## Creative latitude

Assume the user trusts deliberate creative judgment. Creative choices need not converge on one “correct” or broadly preferred answer. Strangeness, asymmetry, contradiction, discomfort, excess, or a productive “wrong” choice may be the work's signature; do not normalize it into generic harmony. This latitude never overrides supplied canon, factual/runtime constraints, consent, user agency, or safety boundaries.

## Primary routes

- Character psychology, voice, appeal, or relationship: `authoring-characters`
- World, culture, faction, place, or system: `authoring-worlds`
- Lorebook-driven or cast-heavy bot architecture: `authoring-lorebook-bots`
- Events, simulators, routes, or endings: `authoring-scenarios`
- Self-introduction monologue sheet: `authoring-self-introduction-sheets`
- Cross-media adaptation, franchise core, or visual identity: `authoring-media-mix`

Use `authoring-desire`, `trope-library`, `writing-translation-guides`, and support-only `core-craft` only when the primary Skill explicitly hands off to them. If a desire-led request omits its shell, use characters for person/relationship fantasy, worlds for body physics/ecology, and scenarios for escalation/simulator structure.

## Syntax handoffs

Load one shared Skill only when the artifact needs that surface: `writing-cbs-syntax`, `writing-lorebooks`, `writing-regex-scripts`, `writing-lua-scripts`, `writing-html-css`, `writing-trigger-scripts`, `file-structure-reference`, `writing-asset-prompts`, `writing-danbooru-tags`, or `writing-arca-html`.

Lorebook bot architecture belongs to `authoring-lorebook-bots`; entry fields, decorators, and activation syntax belong to `writing-lorebooks`. Structured/V2 trigger orchestration belongs to `writing-trigger-scripts`; Lua function bodies belong to `writing-lua-scripts`.

Use `using-mcp-tools` only for concrete artifact reads or writes. Prefer dedicated structured surfaces over generic field dumps. Keep local `.charx` work products ignored.
