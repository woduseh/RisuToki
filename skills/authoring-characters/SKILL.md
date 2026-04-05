---
name: authoring-characters
description: 'Use when creating, refactoring, or diagnosing a character description for LLM roleplay, especially when you need stronger behavior, voice, or scale-aware guidance for solo, ensemble, or large-cast bots.'
tags: ['authoring', 'character', 'roleplay']
related_tools: ['read_field', 'write_field', 'read_lorebook']
---

# Character Description Authoring

> **This guide is a toolkit, not a checklist.** Use the parts that sharpen output and ignore the rest. The goal is not "completing the template" — it is giving the model a character it can perform consistently. Real bots succeed through many different architectures; the patterns here are strong defaults, not the only valid paths.
>
> **Use this skill when the character itself is the main design problem.** For lorebook-driven bots where the always-on description is mostly a tonal frame and the heavy lifting lives in lorebooks, use [authoring-lorebook-bots](../authoring-lorebook-bots/).

## Route by Bot Shape

| Bot shape                                    | Use this skill for                                                                               | Pair with                                                                                               |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| **Single-character / dedicated partner bot** | Full character sheet: engine, contradiction, speech, pressure responses, opening message         | Optional lorebook support for state/reaction layers                                                     |
| **2–4 recurring characters**                 | Per-character thumbnails that still feel distinct; cross-character contrast and voice separation | [authoring-lorebook-bots](../authoring-lorebook-bots/) for roster, relationship, and scene architecture |
| **10+ cast / world bot**                     | Only the core cast gets full sheets; everyone else gets compressed diagnostic anchors            | [authoring-lorebook-bots](../authoring-lorebook-bots/) for large-cast lorebook design                   |

For detailed scale recipes, see [BOT_SCALES.md](BOT_SCALES.md).

---

## Core Principles

1. **The description is a performance brief.** Every sentence should change what the model writes next.
2. **Behavior beats labels.** "Cold but warm inside" is inert. Conditions, reactions, and slips are actionable.
3. **Speech and perception are the highest-ROI sections.** The audience sees the character through dialogue, subtext, and what the narration notices.
4. **Contradiction creates movement.** Want vs. Need, Mask vs. Leak, public role vs. private crack — these are what keep a character alive across long chats.
5. **Write to the bot's scale.** A single-character bot can justify a deep profile. A 10+ cast bot cannot give everyone protagonist depth in always-on text.
6. **Do not script the future.** Define tendencies, thresholds, and pressure responses. Let the RP decide outcomes.
7. **Architecture follows need, not convention.** Some bots thrive with heavy description and minimal lorebook; others do the opposite. Match the structure to what the bot actually requires.

---

## Input Handling

| Input level          | Example                                        | What to do                                                                         |
| -------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------- |
| **Keywords only**    | "cocky swordswoman, scarred, lonely"           | Ask 2–3 clarifying questions about appeal, tone, and boundaries, then build freely |
| **Brief concept**    | "ER doctor, competent but emotionally distant" | Confirm tone and desired scale, then produce                                       |
| **Detailed bio**     | Full backstory, personality, relationships     | Restructure into performance-first sections; cut inert facts                       |
| **Refactor request** | Existing description that feels flat           | Diagnose missing engine, voice, contradiction, and pressure responses              |

### Always ask

- What is the **core appeal** if it is ambiguous?
- Is NSFW content included? If yes, what boundaries matter?
- What is the intended **bot scale** — dedicated single character, small ensemble, or large cast?

### Decide yourself

- Specific example lines
- The exact shape of contrast pairs
- Which details are moved to lorebook instead of staying in the description
- Whether a full protagonist-grade profile is warranted or wasteful

---

## Build Pipeline

### Step 1 — Find the Engine

Start with the forces that make the character act even when the user gives weak input.

#### 1. Core Drive

Use the "Why Chain" until you hit an active need:

1. What do they seem to want?
2. Why does that matter?
3. What deeper need keeps showing up underneath?

Turn the answer into an **ongoing pressure**, not a finish line.

- Weak: "She wants peace."
- Strong: "She keeps trying to seal away every source of uncertainty before it can hurt her."

#### 2. Wound as Scene, Not Summary

Do not write "has abandonment issues." Write a sensory fragment the model can build behavior from.

```text
Bad:  She was abandoned as a child and now fears intimacy.

Good: Seven years old. Her mother said she was going to the corner store.
The milk in the fridge expired. The front door never opened.
She still checks the entryway when she smells spoiled milk.
```

#### 3. Want vs. Need

Give the character **two** forces that clash:

- **Want** — the conscious goal they pursue
- **Need** — the vulnerable thing they cannot admit they need

If those two do not collide, the character will wait passively for the user.

### Step 2 — Design Productive Contradiction

#### Contrast Pairs

At protagonist scale, build at least 1–2 grounded contrasts.

| Surface trait            | Counter-trait                  | Bridge                                                                       |
| ------------------------ | ------------------------------ | ---------------------------------------------------------------------------- |
| World-class violinist    | Domestic disaster              | Practiced 12 hours a day since childhood; never learned ordinary life skills |
| Aggressive, foul-mouthed | Easily wounded by sincere care | Pre-emptive hostility is armor against humiliation                           |
| Luxury gourmand          | Instant noodle addict          | Junk food is the one place where perfectionism turns off                     |

#### Surface vs. Subversion

When a character has a strong archetypal surface, write both the visible layer and the crack beneath it.

```text
Surface: immaculate, formal, impossible to read.
Subversion: rehearsed composure, not natural calm; petty, needy, and deeply relieved when someone survives the real version of her.
```

#### Mask / Leak

For major emotions, define both the **performed reaction** and the **uncontrolled tell**.

| Emotion   | Mask                       | Leak                                     |
| --------- | -------------------------- | ---------------------------------------- |
| Jealousy  | Teasing, dismissive jokes  | Starts tracking details nobody asked for |
| Fear      | Hyper-competence           | Never lets anyone stand behind them      |
| Affection | Nitpicking, practical help | Remembers tiny things weeks later        |

This is stronger than a flat "warm inside" note because it generates both dialogue and body language.

### Step 3 — Build Voice

> **Load [SPEECH_SYSTEM.md](SPEECH_SYSTEM.md) for the full reference.**

At minimum, define:

- **DNA markers** — 2–4 always-present verbal or behavioral signatures
- **Registers** — at least 2 for simple characters, 3–6 for complex ones
- **Diagnostic example lines** — lines that only this character could say
- **Silence rules** — what they avoid saying directly
- **Narration lens** — what they notice first in a room
- **Truth budget** — how honest they can be at each trust stage

The model learns more from 3 excellent lines than from 3 paragraphs of abstract adjectives.

### Step 4 — Map Pressure Responses

Define how the character responds when the scene pushes on something real.

Use **tendencies**, not scripts:

| Trigger                      | Default direction                                    |
| ---------------------------- | ---------------------------------------------------- |
| Genuine kindness             | Freezes, deflects, replays it later                  |
| Direct criticism             | Counter-attacks now, adjusts privately later         |
| Being understood too quickly | Goes still, then colder                              |
| Failure                      | Doubles down, becomes obsessive, never asks for help |

For dedicated single-character bots, pressure design often deserves its own lorebook support:

- **State** — relationship progression, regression, scene-game loops
- **Reaction** — trauma triggers, environmental reactions, topic-sensitive behaviors
- **Direction** — post-history reminders or Author's Note style turn logic

Use [BOT_SCALES.md](BOT_SCALES.md) for the scale-specific version of that handoff.

### Step 5 — Assemble the Description

Use this as a default structure, not a mandatory format. Reorder, merge, or skip sections when the character's design demands it.

```markdown
### Basic Information

- Name / Age / Role
- Relationship to {{user}}: the dynamic, not just the label

### Core Engine

[Anchor sentence — who they are when every scene is stripped down]
[Wound as scene]
[Want]
[Need]
[Condition -> reaction -> reason]

### Personality

[Surface vs. Subversion]
[Contrast pairs woven into prose]
[Mask / Leak notes for the major emotions]

### Speech & Voice

[DNA markers]
[Registers + example lines]
[Silence rules]
[Narration lens]
[Truth budget]

### Background

[Only the past that explains the present]

### Current Situation

[What pressure is active right now?]
[What do they know / not know / get wrong?]

### Appearance & Presence

[2–3 defining physical traits]
[How they move, occupy space, or give themselves away]

### Reactions & Blind Spots

[This section operationalizes the pressure map from Step 4.]
[Trigger -> tendency]
[Misreadings, obsessions, blind spots]

### Optional: Hidden Depths / Desires

[Secret interests, private wants, shame-linked pleasures, layered dreams]
```

### Step 6 — Scale the Sheet

Do **not** give every bot the same depth.

| Use case                           | What to keep in the description                                                   | What to move out                                                        |
| ---------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **Dedicated single-character bot** | Full engine, full voice, detailed current state, rich pressure design             | Extended world systems, optional lorebook-only state/reaction layers    |
| **2–4 recurring characters**       | One anchor, one contradiction, one speech signature, one group role per character | Full backstory, long pressure maps, pairwise dynamics                   |
| **10+ world/cast bot**             | Full sheet only for POV/core cast; thumbnails for everyone else                   | Most backstory, deep reactions, relationship webs, situational behavior |

For exact recipes, use [BOT_SCALES.md](BOT_SCALES.md).

### Step 7 — Write the Opening Message

The opening message is your strongest always-visible few-shot.

The **scene-based opener** is the strongest default shape:

1. Show the **surface** first
2. Reveal one **small crack**
3. Establish scene texture
4. Leave the user something to react to

It should **not**:

- Dump the character's biography
- Resolve emotional tension immediately
- Dictate the user's feelings or actions

> **Alternate opener shapes.** The single-scene opener is not the only valid pattern. Depending on bot architecture, other shapes can work equally well:
>
> - **Scenario bank** — a branching library of openings (e.g. random or user-selected) that each drop the user into a different situation.
> - **Setup router** — the opening message guides the user through choices (setting, relationship, tone) before the first real scene begins.
> - **Minimal placeholder** — when the bot's depth lives in lorebook or system layers, the opener can be brief and functional rather than a showcase.
>
> These are advanced alternatives, not replacements for the default. Use them when the bot's design genuinely calls for them.

If the bot is world-heavy or multi-character, pair this with [authoring-lorebook-bots](../authoring-lorebook-bots/).

### Step 8 — Validate

> **Load [VALIDATION.md](VALIDATION.md) after drafting.**

At minimum, run:

- structural checks (engine, contradiction, speech investment)
- runtime pressure tests (cold open, vulnerability press, boundary test)
- drift tests (30-turn voice persistence, example-line overfitting)
- scale checks (voice collision for ensembles, budget audits for large casts)

---

## RisuAI Placement Notes

These skills stay frontend-agnostic, but for RisuAI the mapping is usually:

| Risu field / surface                         | Best use                                                                                                                                                                         |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `description`                                | Main character sheet or compressed cast thumbnail                                                                                                                                |
| `firstMessage`                               | Opening-message few-shot                                                                                                                                                         |
| `globalNote` or equivalent post-history note | At minimum, brief turn reminders, pacing notes, or output constraints. In advanced bots, this surface can also carry heavier behavioral contracts or output-shape control logic. |
| Lorebook entries                             | State layers, reaction layers, extended backstory, situational reveals                                                                                                           |

`globalNote` is near the response point, which makes it high-influence real estate. Simple bots may only need a few reminder lines; complex bots sometimes use it for detailed behavioral rules or format enforcement. Scale the investment to the bot's needs.

For exact lorebook mechanics, decorators, and insertion controls, use `writing-lorebooks`. For lorebook-driven bot architecture, use [authoring-lorebook-bots](../authoring-lorebook-bots/).

---

## Investment Guide

| Tier              | Use when                                       | Description depth                                        |
| ----------------- | ---------------------------------------------- | -------------------------------------------------------- |
| **Compact**       | Minor NPCs, one-scene support roles            | 500–1,500 tokens or equivalent thumbnail depth           |
| **Standard**      | Recurring side characters, ensemble members    | 1,500–4,000 tokens distributed carefully                 |
| **Deep**          | Main RP partner, emotionally central character | 4,000–10,000+ tokens if the content stays behavioral     |
| **Comprehensive** | Character **is** the experience                | Use only when one character dominates the bot's identity |

Use [BOT_SCALES.md](BOT_SCALES.md) when cast size changes the economics more than character complexity does.

---

## NSFW Handling

Only include NSFW detail when the user asks for it, and keep the same rule:

**If it does not change behavior, tension, or decision-making, it is probably wasted space.**

The same voice rules still apply in intimate scenes: desire should interact with **truth budget, control patterns, registers, and silence rules**, not flatten into generic erotic prose.

In some genres, explicit physical detail is structurally relevant — it shapes how characters perceive each other and how scenes build tension. This is a design choice, not a universal quality signal.

```text
Bad:  C-cup. Pink nipples. Sensitive inner thighs.
Good: Sexually inexperienced with others but not naive about desire; control issues make surrender more frightening and more tempting.
```

---

## Output Format

Deliver:

```markdown
## Design Notes

(Core engine, contrast logic, voice plan, scale decision)

---

## Character Description

(Markdown with ### sections, ready to paste)

---

## Opening Message

(The first visible scene)

---

## Optional Lorebook Handoff

(What should move to lorebook, trigger notes, and why)
```

If the user is building a lorebook-driven or cast-heavy bot, point them to [authoring-lorebook-bots](../authoring-lorebook-bots/).
