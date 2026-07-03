---
name: authoring-media-mix
description: 'Use when designing or adapting a character/world IP across two or more media, building a franchise core, creating iconic visual identity, or translating the same creative promise between RisuAI roleplay, prose, manga/webtoon, animation, games, live-action drama, and merchandise.'
tags: ['authoring', 'media-mix', 'franchise', 'adaptation', 'visual-identity']
related_tools: ['inspect_document', 'read_content', 'read_field_batch']
---

# Media-Mix IP Authoring

## Agent Operating Contract

- **Use when:** two or more media, adaptation, franchise planning, or visual-icon design is the main problem.
- **Do not use when:** the request is only one character, one world, one simulator, one bot structure, or one finished-image prompt. Use the matching composition skill or `writing-asset-prompts`.
- **Read first:** `core-craft`, then this file. The character and world may be rough; this skill defines what must survive before specialists deepen it.
- **Load deeper only if:** `{{user}}`'s identity or compatibility must survive adaptation (`core-craft/USER_POSITION.md`), medium constraints matter ([MEDIA_PROFILES.md](MEDIA_PROFILES.md)), visual identity must be invented ([VISUAL_IDENTITY.md](VISUAL_IDENTITY.md)), or a draft is ready for adaptation QA ([VALIDATION.md](VALIDATION.md)).
- **Output/validation contract:** deliver `IP Core -> Character/World Identity -> Visual Identity -> Media Adaptation Matrix -> RisuAI Handoff`, with invariant identity separated from medium-specific expression.

## Routing Boundary

| Main problem                                                        | Primary skill             |
| ------------------------------------------------------------------- | ------------------------- |
| One character's behavior, voice, or appeal                          | `authoring-characters`    |
| World substance and pressure                                        | `authoring-worlds`        |
| Event loops, routes, or simulator rhythm                            | `authoring-scenarios`     |
| Description/lorebook distribution                                   | `authoring-lorebook-bots` |
| One Anima standing-image prompt                                     | `writing-asset-prompts`   |
| Two or more media, adaptation, franchise core, iconic visual system | **this skill**            |

Use specialist skills to deepen components, then return here to test whether the same IP survives translation between media.

When a playable derivative depends on a fixed protagonist, accepts any imported persona, or requires an in-world compatibility envelope, define that derivative through `core-craft/USER_POSITION.md`. Do not turn one derivative's player assumptions into franchise invariants unless the IP truly depends on them.

## Core Principle: Invariant Promise, Variant Delivery

An adaptation should preserve the audience promise, not every surface detail.

- **Invariant:** what must remain recognizable in every version.
- **Carrier:** how a medium delivers that invariant.
- **Compensation:** what replaces a strength the target medium cannot carry.
- **Permission:** what may change freely without breaking identity.

Example: a character's silence may be an invariant. Prose carries it through interior omission, manga through panel spacing, animation through held timing, games through unavailable dialogue choices, drama through performance and blocking, and RP through silence rules.

## Build Pipeline

### 1. Choose the Creative Mode

Declare one mode from `core-craft`:

- **Emergent RP**
- **Fixed narrative**
- **Route/serial hybrid**
- **Franchise core**

For mixed projects, name the franchise mode first and the mode of each derivative.

### 2. Write the IP Core

Keep it short enough to survive every adaptation:

- **Audience promise:** the feeling or fantasy people return for.
- **Identity sentence:** protagonist/cast + pressure + differentiator.
- **Anchor:** instantly recognizable genre or archetype.
- **Headline Signature:** the one departure that sells the work in one sentence.
- **Reinforcing Echoes:** 2–4 supporting choices that make the signature feel systemic rather than decorative.
- **Human irregularity:** 1–2 emotionally specific details that are not another neat echo, such as an embarrassing habit, an unfair resentment, or a mundane relationship wound.
- **Non-negotiables:** 3–7 facts, dynamics, or tones that cannot be removed.
- **Elastic zone:** elements that may change by medium.

Simple one-off characters may keep the lighter `Anchor + one deviation` model. Use the full signature-and-echo structure only when the IP needs repeated recognition across formats.

Do not force every name, faction, costume, power, and relationship to restate the Headline Signature. A coherent IP needs negative space. Keep the required output headings, but scale the depth of each section to the task and leave some discoveries for scenes, routes, or later specialist work.

### 3. Define Character and World Identity

Do not duplicate specialist sheets. Record only cross-media invariants:

- character role, appeal vector, contradiction, pressure behavior, voice function
- cast chemistry and each member's dramatic function
- world pressure, taboo, special rule, ordinary-life texture
- conflict engine that can generate more than one plot
- mythology/legend variant ledger when applicable

Hand off weak character interiors to `authoring-characters`, weak worlds to `authoring-worlds`, and event-poor premises to `authoring-scenarios`.

### 4. Build Visual Identity

Load [VISUAL_IDENTITY.md](VISUAL_IDENTITY.md). Define:

- silhouette and shape language
- three-color hierarchy
- face/hair or head-shape anchor
- signature prop or interface
- motion and pose grammar
- effect or transformation language
- costume invariants and variant slots
- cast-level contrast

Visual identity is design, not prompt formatting. Only after it exists should `writing-asset-prompts` convert a chosen look into an image-generation prompt.

### 5. Make the Adaptation Matrix

Load only the relevant rows from [MEDIA_PROFILES.md](MEDIA_PROFILES.md). For each target medium record:

| Field           | Question                                                |
| --------------- | ------------------------------------------------------- |
| Core carrier    | What carries the audience promise here?                 |
| Native strength | What can this medium do better than the others?         |
| Compression     | What must be simplified?                                |
| Expansion       | What deserves more room?                                |
| Compensation    | What replaces a lost channel?                           |
| Recurring unit  | Turn, chapter, episode, session, route, scene, product? |
| Failure risk    | What default adaptation mistake is most likely?         |

Do not make every medium tell the same plot in the same order.

### 6. Design the RisuAI Handoff

Treat RP as one derivative, not an afterthought:

- persistent identity -> `description`
- playable proof -> `firstMessage`
- conditional cast/world depth -> lorebook
- progression and choice residue -> state/event entries
- translation-sensitive voice -> translation guide and target-language voice capsule
- relevant player-role assumptions -> conditional User Position Contract

If the final task becomes field placement or trigger design, hand off to `authoring-lorebook-bots`.

### 7. Validate

Load [VALIDATION.md](VALIDATION.md). At minimum run:

- identity deletion test
- medium compensation test
- silhouette and palette tests
- SD and 32px icon tests
- cast lineup test
- costume-variant recognition test
- RP emergence test

## Output Format

```markdown
## IP Core

(Audience promise, identity sentence, Anchor, Headline Signature,
Reinforcing Echoes, human irregularity, non-negotiables, elastic zone)

## Character / World Identity

(Cross-media invariants and specialist handoffs)

## Visual Identity

(Silhouette, palette, motif, prop, motion, effects, costume invariants)

## Media Adaptation Matrix

(One row per target medium)

## RisuAI Handoff

(Description, opener, lorebook, progression, translation guidance)
```

## Smoke Tests

| Prompt                                                                | Expected routing                          | Expected output                                         | Forbidden behavior                           |
| --------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------- | -------------------------------------------- |
| "Turn this magical-girl bot into a manga, anime, and gacha IP."       | This skill + relevant specialist handoffs | IP core, visual system, three-medium matrix, RP handoff | Repeating one plot synopsis for every medium |
| "Make one Anima standing prompt from this finished design."           | `writing-asset-prompts`, not this skill   | Image prompt                                            | Rebuilding the franchise                     |
| "Adapt this anime cast into live action without losing their appeal." | This skill + drama profile                | Invariants, compensation plan, realism translation      | Removing every stylized trait as unrealistic |
