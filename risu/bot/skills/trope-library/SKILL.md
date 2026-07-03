---
name: trope-library
description: 'Archetype and trope vocabulary for character and world design: expected beats, play-straight quality bars, proven subversion directions, and common degradation patterns. Use when choosing, executing, or deliberately breaking a recognizable archetype, relationship dynamic, or genre convention.'
tags: ['authoring', 'tropes', 'archetypes', 'reference']
related_tools: ['read_skill', 'inspect_document']
---

# Trope Library

## Agent Operating Contract

- **Use when:** a design decision touches a recognizable archetype, relationship dynamic, or genre convention — to identify its expected beats, execute it straight at quality, or pick a subversion with a known payoff.
- **Do not use when:** the character has no archetype anchor (pure Track A psychology-first design) — do not retrofit one.
- **Read first:** `core-craft` §4 (trope stance, familiarity budget); this `SKILL.md` for the entry format; then use [TROPES.md](TROPES.md) to choose only the relevant character, relationship, media-convention, or species/role catalog.
- **Output/validation contract:** every archetype use names its mode (straight/subverted) and its familiarity budget; played-straight executions are checked against the expected-beat list, not against "avoided cliché."

## How to Read an Entry

Each entry linked from [TROPES.md](TROPES.md) has four fields:

- **Expected beats** — what the audience is paying for. In straight mode these are obligations; skipping one is a defect, not a refinement.
- **Straight quality bar** — what separates a high-resolution execution from a generic one. The bar is always _specificity_: the trope realized through this character's particular circumstances, never the trope recited.
- **Proven subversions** — deviation directions with track records. Pick **one**; subverting multiple axes at once destroys the legibility that made the archetype worth using.
- **Degradation patterns** — how the trope rots in actual LLM play (usually: collapsing to its most-trained variant, or resolving its tension too early). These are what to explicitly block in the sheet regardless of mode.

## Usage Rules

1. **Declare the mode** (straight / subverted) in design notes before drafting — `core-craft` §4.1.
2. **In straight mode, the beats are a checklist.** Quality comes from texture resolution, not deviation.
3. **In subversion mode, keep the surface.** A subversion the audience cannot recognize as a subversion is just an unrelated character.
4. **Always block the degradation patterns.** They apply in both modes; they are the model's gravity, not the design.
5. Combination is where originality usually lives: two straight-played tropes colliding (an archetype in the _wrong genre_, a dynamic with _reversed roles_) often beats one elaborate subversion.

## Growing the Library

This is a living catalog — extend it as designs encounter new archetypes. New entries must include all four fields; an entry without degradation patterns is not finished, because the patterns are the actionable half. Keep entries compact; this is a vocabulary, not an essay collection. Preserve the indexed split so agents do not load unrelated catalogs, and keep each file's declared count synchronized with its actual entries.

## Smoke Tests

| Prompt                                                           | Expected routing                                                                                  | Expected output                                                              | Forbidden behavior                                              |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------- |
| "Classic tsundere, played 100% straight."                        | `core-craft` §4 → this skill → `CHARACTER_TROPES.md`                                              | Beat-complete straight execution with degradation blocks.                    | Sneaking in a subversion; dismissing the request as cliché.     |
| "I want a childhood friend who actually wins for once."          | `CHARACTER_TROPES.md` childhood-friend entry                                                      | One-axis subversion keeping the archetype's surface.                         | Rebuilding the character until the archetype is unrecognizable. |
| "Enemies-to-lovers that doesn't melt into romance by turn 20."   | This skill → `RELATIONSHIP_TROPES.md`; pair `authoring-desire` for escalation gating              | Beat map with degradation blocks that keep the hostility phase load-bearing. | Letting intimacy arrive before the enmity has cost anything.    |
| "Build a collectible faction cast for a gacha game."             | This skill → `MEDIA_CONVENTIONS.md`; pair `authoring-media-mix` when cross-media identity matters | Faction echo, individual anchors, and degradation guards.                    | Giving every unit protagonist-scale lore.                       |
| "Make a classic vampire maid without reducing her to a costume." | This skill → `SPECIES_ROLE_TROPES.md`; pair `authoring-characters`                                | Two legible surfaces with specific labor, appetite, and degradation guards.  | Treating species and role as a tag list.                        |
