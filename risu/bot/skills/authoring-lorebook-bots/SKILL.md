---
name: authoring-lorebook-bots
description: 'Writes lorebook-driven bot descriptions that frame tone, core cast, and scene logic while deeper world and character detail lives in lorebooks.'
tags: ['authoring', 'lorebook', 'roleplay']
related_tools: ['list_lorebook', 'read_lorebook', 'write_lorebook']
---

# Bot Description for Lorebook-Driven Bots

> **Use this skill when the description is not supposed to carry everything.** In many bots the description provides the persistent frame — tone, world pressure, core cast thumbnail, and narrative direction — while the lorebook provides conditional detail. In lorebook-heavy bots the balance can shift further: the description's job becomes partly to teach the model how to read and use the lorebook itself.
>
> **If the main problem is one character's internal engine, voice, and contradictions, use [authoring-characters](../authoring-characters/).** This skill starts where single-character sheet-writing stops and architecture begins.

## Route by Bot Shape

Most bots fall somewhere along this spectrum. These are common shapes, not a closed set — your bot's needs may call for a different balance.

| Bot shape                                       | Description job                                    | Lorebook job                                                           | Pair with                                                                |
| ----------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **Single-character bot with optional lorebook** | Keep the character strong even without entries     | Add state, reaction, deep reveal, or world support                     | [authoring-characters](../authoring-characters/)                         |
| **2–4 recurring characters**                    | Establish tone, group tension, and cast thumbnails | Carry pair dynamics, deeper profiles, and scene-specific behavior      | [authoring-characters](../authoring-characters/) for per-character voice |
| **10+ cast / world bot**                        | Frame the world, POV rules, and only the core cast | Carry most character/world detail, activation rules, and secret layers | [authoring-characters](../authoring-characters/) only for the core cast  |

For scale-specific recipes, use [BOT_SCALES.md](BOT_SCALES.md). For entry design and activation logic, use [LOREBOOK_ARCHITECTURE.md](LOREBOOK_ARCHITECTURE.md).

---

## What a Lorebook-Driven Description Is

At its best, the description works as some combination of:

- **tonal field**
- **genre contract**
- **interpretive lens**
- **core-cast thumbnail board**
- **scene-direction surface**

It is generally **not** well served by being:

- a wiki article
- a full roster dump
- a database summary
- a lorebook pasted into the description slot

### Litmus test

**For description-led bots:** Delete the lorebook.

- If the bot still feels tonally right, the description works.
- If the bot still performs every hidden detail and side character, the description is probably overloaded.

**For lorebook-heavy bots:** Delete the description.

- If the bot loses all sense of tone, pacing, and genre, the description was doing its job.
- If nothing changes, the description may be dead weight or the lorebook has absorbed work the description should own.

In either case the ideal description gives the model the **right instinct**, not the full archive. How much of the engine lives in description vs lorebook varies by design — neither balance is inherently better.

---

## Core Principles

### 1. The Description Is the Persistent Anchor

Lorebook entries activate conditionally. The description is always present. That usually makes it the natural home for:

- atmosphere
- behavioral framing
- prose style
- current pressure
- the cast/world routing rules the model should never forget

In lorebook-heavy designs, some of this weight may shift to always-on lorebook entries or `globalNote`. The principle still holds: whatever is always present shapes every response.

### 2. Atmosphere Beats Information

The world section should tell the model how the world **feels to inhabit now**, not how to pass a trivia exam about it.

### 3. Description Sets the Interpretation Style

Lorebook entries are filtered through whatever prose the description establishes.

- atmospheric description -> lorebook facts integrate like fiction
- clinical description -> lorebook facts get dumped like notes

### 4. The More Characters You Have, the More Brutal Your Compression Must Be

Large casts fail because every character gets protagonist treatment in always-on text.

Keep full treatment for whoever actually defines the bot. Everyone else gets:

- a thumbnail
- a scene function
- a trigger path into deeper lore

### 5. Put Conditional Depth Where Conditions Exist

If information matters only when:

- a certain person appears
- a specific topic is raised
- trust deepens
- a place is visited
- a hidden layer is discovered

...then it probably belongs in lorebook, not in the base description.

### 6. The Description Should Teach the Bot How to Use the Lorebook

The best descriptions imply that more detail exists without turning toward exposition.

They teach the bot to:

- treat the world as already lived-in
- surface detail only when relevant
- preserve tone even when activating factual entries

In lorebook-heavy bots, this teaching role can become the description's primary job — framing the interpretive lens and behavioral contract that shapes how the model reads every lorebook entry it encounters.

---

## Role Boundary vs. `authoring-characters`

Use **authoring-characters** for:

- wound as scene
- Want vs. Need
- mask/leak
- speech system
- silence rules
- narration lens
- deep per-character performance

Use **this skill** for:

- description-level world framing
- cast compression
- roster logic
- what stays always-on vs conditional
- lorebook activation strategy
- relationship / scene / world architecture

In practice:

- write the **core cast well** with `authoring-characters`
- decide **how much of that survives in always-on text** with this skill

---

## Build Pipeline

### Step 1 — Define the Atmospheric Core

Before drafting, decide:

| Question              | What it controls                                                          |
| --------------------- | ------------------------------------------------------------------------- |
| **Genre**             | Story expectations and failure modes                                      |
| **Texture**           | Sensory language and prose temperature                                    |
| **Emotional gravity** | What hangs over normal scenes                                             |
| **Scene mode**        | Solo intimacy, rotating cast drama, world simulation, investigation, etc. |

These are your compass, not necessarily literal text to paste.

### Step 2 — Write the World as a Present Tense Pressure Field

One paragraph is often enough.

Include:

- core world rule
- sensory texture
- what is unstable **right now**
- what kinds of scenes the bot naturally wants to generate

Exclude:

- full history
- full geography
- faction lists
- system internals better handled by lorebook

```text
Bad:  The empire has seven provinces, three councils, and a 400-year succession dispute...
Good: The empire is held together by etiquette, debt, and the mutual pretense that nothing has started rotting.
```

### Step 3 — Decide the Cast Tiering

Before writing cast text, separate characters by importance.

| Tier                | Description investment                | Lorebook investment |
| ------------------- | ------------------------------------- | ------------------- |
| **Core cast**       | moderate thumbnail or full mini-sheet | high                |
| **Recurring cast**  | one-line thumbnail                    | moderate            |
| **Background cast** | roster mention or none                | low to moderate     |

If you cannot say why a character must be always-on, they probably do not belong in the description.

### Step 4 — Write Character Thumbnails, Not Full Biographies

For lorebook-driven bots, a thumbnail should usually answer:

1. what force this character brings into scenes
2. how they feel **right now**
3. what makes them distinct at a glance

```text
Bad:  Mina is a 27-year-old archivist who works in the east tower and likes tea.
Good: Mina files rumors the way other people sharpen knives — quietly, precisely, and with obvious enjoyment.
```

If a character needs a deeper engine than that, write it in `authoring-characters` and move the rest into a dedicated lorebook entry.

### Step 5 — Establish the Lorebook Contract

The description should imply that:

- specific names, places, topics, and discoveries will unlock more detail
- hidden truths arrive late, not instantly
- not every known fact deserves screen time in every scene

You can do this subtly by writing like a narrator who already knows the world.

Only use explicit meta-text when the bot truly needs it.

### Step 6 — Define Scene Logic

For lorebook-driven bots, scene logic is often more important than raw fact coverage.

Briefly define:

- who tends to own the opening beat
- how crowded scenes should focus attention
- whether the bot prefers intimate dialogue, rotating spotlight scenes, or world-reactive narration
- what kinds of conflicts should recur

This helps prevent the common failure where a rich lorebook exists but the bot does not know **how to stage it**.

### Step 7 — Decide What Goes Where

| Keep in description                  | Move to lorebook                                 |
| ------------------------------------ | ------------------------------------------------ |
| World atmosphere and tone            | Detailed history and timelines                   |
| Core world rule                      | Deep mechanics and system exceptions             |
| Core cast thumbnail                  | Full character profiles                          |
| Relationship to {{user}}             | Pair dynamics among side characters              |
| Starting situation / current tension | Location entries, faction entries, secret layers |
| Prose style and scene logic          | Topic-sensitive reactions and reveal chains      |

Gray-zone rule:

- **existence** in description
- **explanation** in lorebook

Examples:

- Key contradiction -> hint in description, full cause in lorebook
- Core institution -> one-line pressure in description, workings in lorebook
- Important NPC -> thumbnail in description, full profile in lorebook

### Step 8 — Write the Opening Message

The opening message should prove that the description+lorebook architecture creates a living scene.

Do:

1. show the world through texture, not exposition
2. foreground the current scene owner
3. imply more cast/world depth than you explain
4. leave clean room for user response

Do not:

- introduce the whole roster
- dump three active lorebook entries at once
- explain the world before anyone has acted in it

If the opening scene depends on one core character landing with protagonist-grade voice, build that character's sheet in [authoring-characters](../authoring-characters/) first.

> **Alternate firstMessage shapes.** An atmospheric scene opener is the most common shape, but bots can validly use other patterns:
>
> - **scenario bank / branch library** — multiple self-contained scene starts the user selects from
> - **setup router / setup UX** — an interactive opener that configures the scenario before play begins
> - **minimal placeholder or trigger stub** — a short seed that lets triggers or lorebook activations build the real opening
>
> These are advanced or niche patterns; the atmospheric scene opener remains a reliable default.

---

## Scale Notes

### Single-character with lorebook support

Use the description to keep the character emotionally alive on every turn.

Use lorebook for:

- state progression
- topic-based reactions
- deeper world support
- gated revelations

### 2–4 recurring characters

The description should carry:

- group tension
- each recurring character's thumbnail
- the relationship shape between {{user}} and the cast
- what kinds of scenes the ensemble creates

The lorebook should carry:

- full profiles
- pair dynamics
- rivalries, secrets, and progression
- scene-dependent behavior

Small ensembles can be structurally simple. If the cast chemistry works with short always-on dossiers and no trigger gating, that is a valid architecture — not every ensemble needs a complex scaffolding stack.

### 10+ world/cast

The description should carry:

- world tone
- POV rules
- core cast only
- scene-management expectations

The lorebook should carry almost everything else.

If the description starts resembling a cast index, stop and compress.

Use [BOT_SCALES.md](BOT_SCALES.md) for concrete recipes.

---

## RisuAI Placement Notes

This skill stays frontend-agnostic, but in RisuAI the usual mapping is:

| Risu field / surface                         | Best use                                                                                                                                                                       |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `description`                                | Tonal field, core cast thumbnails, scene logic                                                                                                                                 |
| `firstMessage`                               | Proof-of-concept scene that demonstrates the architecture                                                                                                                      |
| Lorebook entries                             | World systems, character profiles, locations, relationships, secrets, state/reaction layers                                                                                    |
| `globalNote` or equivalent post-history note | Direction rules, pacing notes, anti-spoiler reminders. In advanced bots this can carry heavier loads: behavioral contracts, output-shape rules, or persistent scene directives |

> **Advanced optional surfaces.** Some bots extend their architecture with technical surfaces like CBS variables, Lua scripting, CSS display panels, regex postprocessing, or trigger scripts — used for setup UX, live state displays, conditional routing, or output formatting. These are powerful amplifiers for ambitious designs, but they are never prerequisites. A bot with well-written description and lorebook needs none of them.

For exact lorebook mechanics, decorators, and insertion controls, use `writing-lorebooks`.

---

## Common Mistakes

| Mistake                                             | Why it hurts                                         | Fix                                                       |
| --------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------- |
| Description is a wiki summary                       | The bot opens by explaining instead of roleplaying   | Rewrite for atmosphere, pressure, and scene utility       |
| Every character gets a full sheet in always-on text | Attention collapses and cast blur starts immediately | Tier the cast and move detail to lorebook                 |
| Description and lorebook use different prose styles | Activated detail feels pasted on                     | Match voice across both surfaces                          |
| Secrets trigger on names alone                      | Deep lore leaks too early                            | Use layered or topic-sensitive triggers                   |
| Rich lorebook, weak description                     | The bot has information but no instinct              | Strengthen the description's tonal and scene-routing role |
| Rich description, dead lorebook                     | The bot feels flat outside base scenes               | Build entries that change behavior, not just store facts  |
| Crowded first message                               | User gets an infodump instead of a hook              | Start with one scene owner and one pressure line          |

For entry-level fixes, use [LOREBOOK_ARCHITECTURE.md](LOREBOOK_ARCHITECTURE.md).

---

## Output Format

Deliver:

```markdown
## Design Notes

(Atmospheric core, cast tiering, lorebook contract, scale decision)

---

## Bot Description

(Markdown with clear world / cast / situation sections, ready to paste)

---

## Opening Message

(First scene proving the description architecture works)

---

## Lorebook Architecture

(Recommended entry groups, trigger logic, and what belongs there)
```

If the user also needs a protagonist-grade character sheet for the core cast, pair this skill with [authoring-characters](../authoring-characters/).
