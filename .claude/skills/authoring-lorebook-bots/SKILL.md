---
name: authoring-lorebook-bots
description: 'Use when a cast-heavy or setting-heavy bot must divide persistent tone, scene logic, and conditional depth between description, opening, and lorebooks. Primary skill for bot information architecture; hand entry fields, decorators, and activation syntax to writing-lorebooks. Do not use when the task is a single-character sheet or lorebook syntax alone.'
tags: ['authoring', 'bot', 'lorebook', 'architecture']
related_tools: ['inspect_document', 'read_content', 'manage_items', 'preview_edit', 'apply_edit', 'validate_content']
---

# Lorebook-Driven Bot Architecture

## Outcome

Produce a compact persistent bot anchor plus a deliberate lorebook architecture so the model knows how scenes feel, what remains always true, and when deeper material should activate.

## Boundaries

This Skill owns distribution and scene architecture. `authoring-characters` owns deep character psychology, `authoring-worlds` owns world substance, and `writing-lorebooks` owns entry schema, keywords, decorators, and CBS syntax. Hand off when one of those becomes the main problem.

Load `STRUCTURE_SCALES.md` for cast/complexity sizing, `LOREBOOK_ARCHITECTURE.md` for detailed trigger and placement patterns, and `BOT_VALIDATION.md` for extended audits.

## Minimal workflow

1. Define the atmospheric core in one sentence: recurring pressure, emotional weather, and the kind of choice the bot should keep producing.
2. Write the world as a present-tense pressure field, not an encyclopedia or timeline.
3. Tier the cast by scene function and recurrence. Give always-visible characters short, contrasting thumbnails; place conditional biography, secrets, local knowledge, and state-dependent variants in lorebooks.
4. Establish a lorebook contract: what information belongs behind which conditions, how the base description signals that deeper context exists, and how entries avoid contradicting persistent facts.
5. Define scene logic: default locations, who can initiate, common sources of friction, how scenes change state, and how inactive cast members remain out of focus.
6. Allocate material:
   - Description: tone, persistent rules, core cast functions, scene grammar.
   - Lorebooks: conditional facts, locations, minor cast, secrets, phases, and deep reference.
   - Global note: short always-on operational constraints only.
   - Opening: immediate situation, pressure, visible cast, and an actionable user choice.
7. If world logic is too generic or contradictory to distribute, hand back to `authoring-worlds` before polishing entries.

Keep authoring labels such as “tier,” “entry,” or “activation” out of model-visible prose unless the fiction itself uses them.

## Output

Return, as needed: concise design notes, persistent bot description, opening message, and a lorebook map listing entry purpose, trigger concept, priority/depth intent, and dependencies. Do not expand every mapped entry unless requested.

## Validation

Verify that the base description works when no lorebook fires, conditional entries add rather than restate information, cast members remain distinguishable at scale, triggers match likely user language, and the opening demonstrates the intended scene grammar without scripting `{{user}}`.
