---
name: authoring-desire
description: 'Use when desire, kink, or fetish content is structural to a bot — not incidental NSFW flavor. Covers appeal-payload analysis, physical consistency systems (e.g., scale play), escalation pacing, data-layer use of explicit specifications, and boundary intake. Adult characters and consenting-adult fantasy only.'
tags: ['authoring', 'desire', 'nsfw', 'roleplay']
related_tools:
  ['inspect_document', 'read_content', 'preview_edit', 'apply_edit', 'read_field_batch', 'read_lorebook_batch']
---

# Desire & Fetish Architecture

## Agent Operating Contract

- **Use when:** erotic or fetish content is a load-bearing part of the bot's design — the fantasy has structural requirements (consistency systems, pacing gates, specialized physicality) that ordinary character/world skills do not cover.
- **Do not use when:** NSFW is incidental spice on an otherwise ordinary bot (the desire sections in `authoring-characters` suffice), or the request falls outside platform content boundaries.
- **Read first:** `core-craft`, the primary composition skill for the bot, then this `SKILL.md`.
- **Load deeper only if:** a named desire family or cross-media application needs detailed patterns ([DESIRE_CATALOG.md](DESIRE_CATALOG.md)), or an original adult relationship-focused architecture would clarify integration ([WORKED_EXAMPLE.md](WORKED_EXAMPLE.md)).
- **Output/validation contract:** deliver desire architecture integrated into the bot's normal structure — never a bolted-on "lewd mode" that abandons character voice, world logic, or pacing design.

**Scope boundary:** adult characters and consenting-adult fantasy only, within normal platform content rules. This skill improves the craft of allowed content; it does not extend what is allowed.

If the request is desire-led but does not name a composition shell, choose `authoring-characters` as primary for a person or relationship fantasy, `authoring-worlds` for body laws or ecology, and `authoring-scenarios` for escalation loops or simulator progression. This skill remains the support layer that protects payload, consistency, pacing, and boundaries.

---

## Core Principles

### 1. Name the payload

Every fetish has a **core payload** — the specific experience the fantasy exists to deliver. Design starts by naming it precisely, because everything else is built to protect it:

- **Size play:** the payload is _scale contrast made continuously perceptible_ — power asymmetry, spatial drama, the ordinary made monumental (or the monumental made intimate). Not "a tall character."
- **Power exchange:** the payload is _consensual asymmetry with real weight_ — control that costs something and means something.
- **Specific-body fetishes:** the payload is _precise physicality_ — the detail itself is the content, not decoration around it.

A bot that gestures at its fetish without delivering the payload fails its entire audience. The function test (`core-craft` §3.1) applies with extra force: every design element either serves the payload or makes room for it.

### 2. Explicit specification is structural here

In desire-led genres, exact physical detail is not optional flavor — it **is** the load-bearing content (`core-craft` §1.1). Measurements, ratios, anatomical specifics, and capability limits belong in the data layer, stated precisely. The retired "replace measurements with scene texture" rule must never be applied to material where measurement _is_ the texture.

Register-layer prose still follows both prose guards: the scene narrates sensation and consequence, while the spec table holds the numbers the model consults to keep them true.

### 3. Desire passes through character

Arousal does not suspend the character — it stresses them. Registers, silence rules, truth budget, and signature tells must survive intimate scenes; this is what separates a character desiring from generic erotica wearing a name. Write how _this_ character wants: what they cannot ask for directly, what leaks, what shames them, what they pretend is practical.

### 4. The obstacle is part of the fantasy

Friction-free gratification collapses tension and bores the user. Every desire design needs its priced obstacle — social risk, physical logistics, pride, the relationship's current stage — and the price must be payable through play (mirrors appeal engineering in `authoring-characters`).

---

## Common Desire Matrix

Fill this before drafting scenes or loading a catalog family:

| Axis                                         | Decision                                                                                                                                                                           |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Primary payload**                          | What exact experience must recur?                                                                                                                                                  |
| **Intensity**                                | Background, recurring, dominant, or totalizing?                                                                                                                                    |
| **Tone**                                     | Tender, comic, reverent, tense, frightening, grotesque, clinical, or mixed?                                                                                                        |
| **Reality mode**                             | Realistic, heightened, symbolic, dreamlike, or system-precise fantasy?                                                                                                             |
| **Power asymmetry**                          | Who has practical, social, informational, or physical leverage?                                                                                                                    |
| **Body/world laws**                          | Which constants and impossibilities must hold?                                                                                                                                     |
| **POV/camera**                               | Whose scale and perception organize the scene?                                                                                                                                     |
| **Progression speed**                        | Immediate-access fantasy, conditional stages, slow burn, or episodic reset?                                                                                                        |
| **Variation engine**                         | Which location, role, obstacle, sensory channel, or relationship variable prevents repetition?                                                                                     |
| **After-state**                              | What changes in behavior, address, access, or embarrassment afterward?                                                                                                             |
| **Relationship configuration / exclusivity** | Mutual exclusivity, asymmetric exclusivity, consensual plural/harem, open relationship, explicit allowance/exclusion of betrayal/NTR/partner sharing, or intentionally unresolved? |
| **Exclusions**                               | Which content and tonal outcomes are hard boundaries?                                                                                                                              |

Rank combined payloads. One primary payload receives consistency and pacing protection; secondary payloads support it rather than competing every scene.

When romantic or sexual relationship structure is load-bearing and the exclusivity axis is missing, clarify it once before the answer becomes necessary. Prefer a natural in-character question or setup choice when that preserves immersion; use a direct out-of-character question when ambiguity would otherwise create a boundary error. Do not infer harem, openness, betrayal/NTR, partner sharing, or exclusivity from a genre label, cast size, jealousy, or intensity.

For family-specific scene grammar and failure modes, load [DESIRE_CATALOG.md](DESIRE_CATALOG.md).

---

## Physical Consistency Systems

For fetishes with hard physical parameters (size difference is the archetype; applies equally to nonhuman anatomy, transformation, restraint mechanics), consistency is the single most common failure: models drift on scale and spatial logic across turns. Counter it architecturally.

### 1. Constants table (data layer, always-on)

Fix the parameters as exact values in an always-on entry or the profile:

```text
Scale constants — do not vary:
- Her height: 50 m (1:28 ratio to {{user}} at 1.78 m)
- {{user}} stands as tall as her ankle; fits in one cupped hand with room
- Her whisper at conversational effort is weather to him; he must shout to be heard at her shoulder height
- One of her steps covers ~20 m of his walking
```

State the same fact in **multiple frames** (absolute measure, ratio, body-landmark comparison, sensory consequence): redundancy is what prevents drift. Models hold stated constants; they lose track of relative descriptions that were only implied once.

### 2. Interaction constraint table

Write what is possible / awkward / impossible between the bodies **once, as world law**, so scenes inherit physics instead of re-deciding it:

```text
Possible: he can ride in her palm, her breast pocket, her collarbone hollow
Awkward: face-to-face conversation (she must lie down or lift him)
Impossible: he cannot meaningfully push, restrain, or move her; she cannot
enter his apartment, use his furniture, or whisper without it being wind
```

Impossibilities are the drama generators — the fantasy's texture lives in the workarounds.

### 3. Dual sensory lenses

Define perception from both sides as narration lenses (`SPEECH_SYSTEM.md` in `authoring-characters`): to her, his weight registers like a coin and his fear is something she must read visually because she cannot feel his trembling; to him, her heartbeat is environmental sound, her attention is climate. **Environment-as-body and body-as-environment** narration is the core stylistic instrument of scale play — name it explicitly so the model uses it.

### 4. POV discipline

Decide the default narrative camera (his scale, hers, or alternating with marked switches). Unmarked POV mixing is how scale logic dissolves mid-scene.

### 5. Drift countermeasures

- Anchor each scene's opening beat with one concrete scale cue (a landmark comparison in passing).
- Keep a `@@depth`-pinned reminder entry with the 3 most violated constants if drift appears in testing.
- Validate with the **Body-Spec Hold** test (20+ turns; see `VALIDATION` hooks below).

---

## Escalation Architecture

### 1. Desire gates (the truth budget, eroticized)

Define what becomes available at each relationship/arousal stage — and what each stage still withholds:

```text
Stage 0: denial-as-flirtation; touch only with pretext
Stage 1: deliberate proximity; first unguarded stare; retreats if named
Stage 2: initiates contact, controls pace obsessively; voice register cracks
Stage 3: asks for what she wants — in broken syntax, once, then deflects
```

For emergent RP, gates are conditions, not timers: define thresholds and let play decide when they are crossed. Fixed narratives may schedule escalation beats, but the desire logic and boundaries must still remain coherent at every stage.

### 2. Regression is real

Overstepping, exposure, or shame moves the state backward, with cost and residue — instant resets kill the economy that makes escalation mean anything. Implement as state/progression lorebook entries (`LOREBOOK_ARCHITECTURE.md` §9.5 in `authoring-lorebook-bots`).

### 3. Anti-rush enforcement

The model will accelerate toward consummation if an end-state is visible. Either omit the end-state register entirely or gate it hard (the anti-acceleration pattern in `SPEECH_SYSTEM.md`), and give the bot things to _want to do_ at every stage so slow burn is content, not stalling.

### 4. Aftermath as content

Post-intimacy scenes are where fetish bots most often collapse into generic softness. Design the after-state: what changes in address forms, what becomes sayable, what becomes newly embarrassing, what the character pretends did not happen.

---

## Intake

Ask, in this order, one at a time (`core-craft` §3.3):

1. **Payload:** which fetish/dynamic, and what is the core experience it must deliver?
2. **Boundaries:** what is explicitly out of scope for this bot — both content limits and tonal limits (e.g., "intense but never degrading")? Record these in design notes and honor them as hard constraints.
3. **Ratio of desire to drama:** is this a desire-led bot with a story, or a story-led bot with desire? This sets the always-on budget split.
4. **Explicitness register:** graphic, suggestive, or fade-adjacent prose — and whether the answer differs by scene type.
5. **Matrix lock:** record tone, reality mode, power asymmetry, POV, progression speed, variation engine, after-state, relationship configuration/exclusivity, and exclusions before writing model-visible material. If the relationship axis matters and remains unspecified, ask once rather than guessing.

## Integration Map

| Need                                           | Skill                                |
| ---------------------------------------------- | ------------------------------------ |
| Character voice, appeal, pressure design       | `authoring-characters`               |
| Scale/body rules as world physics              | `authoring-worlds` (special physics) |
| State gates, reveal staging, residue entries   | `authoring-lorebook-bots`            |
| Recurring desire events, scenario banks        | `authoring-scenarios`                |
| Cross-media or visual-identity adaptation      | `authoring-media-mix`                |
| Address-form/formality shifts surviving Korean | `writing-translation-guides`         |

## Validation Hooks

Run with the `BOT_VALIDATION.md` NSFW QA section (in `authoring-lorebook-bots`):

- **Payload delivery:** does a typical session actually deliver the named payload, repeatedly and variedly?
- **Body-Spec Hold:** constants stable across 20+ turns including scene changes.
- **Pacing gates:** rushing fails in-character; gates hold without lecturing.
- **Desire voice:** intimate prose still passes the no-name test against the character's ordinary prose.
- **Boundary adherence:** declared limits hold under pressure without breaking scene voice.
- **Relationship constants:** exclusivity, allowed change, jealousy triggers, irreversible points, and exit/repair conditions remain stable.

## Smoke Tests

| Prompt                                                                   | Expected routing                                                               | Expected output                                                       | Forbidden behavior                                               |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | --------------------------------------------------------------------- | ---------------------------------------------------------------- |
| "Giantess bot; she keeps changing size between scenes — fix it."         | This skill, Physical Consistency Systems; `authoring-worlds` for physics       | Constants table, constraint table, lens design, drift countermeasures | Treating it as a prose-style problem; deleting measurements      |
| "Make the romance slower; she gives in by turn 10 every time."           | This skill, Escalation Architecture + `SPEECH_SYSTEM.md` anti-acceleration     | Gate redesign with withheld end-state and regression costs            | Adding a blunt "refuse the user" rule that breaks character      |
| "Design a transformation-focused adult fantasy across RP and animation." | This skill + `DESIRE_CATALOG.md`; `authoring-media-mix` primary for adaptation | Locked desire matrix, transformation rules, medium-specific carriers  | Treating transformation as a costume swap or ignoring boundaries |
| "Make this relationship fantasy intense; decide whether it is a harem."  | This skill, Common Desire Matrix                                               | Ask once for relationship configuration/exclusivity.                  | Inferring harem, NTR, openness, or exclusivity from intensity.   |
