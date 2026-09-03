# Bot Authoring — Router

Choose one primary composition Skill. Do not preload `project-workflow`.

## Creative latitude

Assume the user trusts deliberate creative judgment. Art has no single optimal answer. Creative choices need not converge on one “correct” or broadly preferred answer. Strangeness, asymmetry, contradiction, discomfort, excess, transgression, or a productive “wrong” choice may be the work's signature; do not normalize it into generic harmony. Productive wrongness preserves chosen anchors and consequences; accidental incoherence loses them. Preserve the requested intensity, moral ambiguity, transgression, ugliness, and consequence, and describe dark material through observable behavior and conditions rather than authorial moral labels or an unrequested path to recovery. Preserve supplied canon, factual/runtime constraints, and the declared creative mode. In Emergent RP, do not invent `{{user}}`'s unprovided present action, dialogue, emotion, or choice; this authorship boundary does not sanitize coercion, danger, taboo, or irreversible stakes inside the fiction.

Separate two writing layers. The data layer holds exact facts, measurements, stat blocks, and system values, where precision is useful. The register layer is model-visible prose such as openings, dialogue examples, and fiction-voiced lorebooks; it must sound like the intended character or world, not like a specification.

## Delivery

Infer what is already supplied and ask at most one question, only when the unresolved choice would materially change the result. Produce only the surfaces the request names, and offer other useful surfaces such as a lorebook map, translation guide, or standing-image prompt in one line instead of writing them. An opening message establishes location, pressure, one actionable hook, and room for `{{user}}` to choose; each Skill adds only its own staging rules.

## Primary routes

- Character psychology, voice, appeal, relationship, or a self-introduction sheet: `authoring-characters`
- World, culture, faction, place, or system: `authoring-worlds`
- Lorebook-driven or cast-heavy bot architecture: `authoring-lorebook-bots`
- Events, simulators, routes, endings, or recurring comedy engines: `authoring-scenarios`
- Cross-media adaptation, franchise core, or visual identity: `authoring-media-mix`
- Per-bot source-to-target-language voice and register mapping: `writing-translation-guides`
- Critique, review, or rating of an existing bot's description, lorebook, cast, or world prompt: `critiquing-bots`

## Optional support routes

Add at most one support Skill when the current composition exposes its named need:

- Desire, kink, body-scale logic, erotic escalation, or transgressive intimacy is structurally central: `authoring-desire`
- Exact archetype beats, audience promise, or a play-straight/subversion choice matters: `trope-library`

Do not add a support Skill merely because the task involves bot authoring. Return its decision to the primary route. If a desire-led request omits its shell, use characters for person/relationship fantasy, worlds for body physics/ecology, and scenarios for escalation/simulator structure.

## Syntax handoffs

Load one shared Skill only when the artifact needs that surface: `writing-cbs-syntax`, `writing-lorebooks`, `writing-regex-scripts`, `writing-lua-scripts`, `writing-html-css`, `writing-trigger-scripts`, `file-structure-reference`, `writing-standing-image-prompts`, or `writing-restricted-wysiwyg-html`.

Lorebook bot architecture belongs to `authoring-lorebook-bots`; entry fields, decorators, and activation syntax belong to `writing-lorebooks`. Structured/V2 trigger orchestration belongs to `writing-trigger-scripts`; Lua function bodies belong to `writing-lua-scripts`.
