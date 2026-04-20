# Lorebook Bot Architecture by Scale

> See also: [Character Authoring by Bot Scale](../../authoring-characters/BOT_SCALES.md) for per-character depth decisions at each scale.

Use this file when the main question is **how to distribute description vs lorebook responsibility at a given bot scale**.

> The recipes below are starting points drawn from common patterns, not rigid templates. Your bot may need more, less, or different architecture depending on its goals and the model it runs on.

---

## Quick Chooser

| Bot shape                                | Description emphasis                    | Lorebook emphasis                                   |
| ---------------------------------------- | --------------------------------------- | --------------------------------------------------- |
| **Single-character + optional lorebook** | Character engine, tone, current tension | Dynamic state, topic reactions, deep reveals        |
| **2–4 recurring characters**             | Group tension, thumbnails, scene mode   | Full profiles, pair dynamics, scene management      |
| **10+ cast / world bot**                 | World tone, POV rules, core cast only   | Roster, factions, locations, relationships, secrets |

If the question is "how do I write this character well?" start with `authoring-characters` for an explicit scaffolded sheet, or `authoring-self-introduction-sheets` for the self-introduction monologue method.

---

## 1. Single-Character Bots with Lorebook Support

This is the lightest architecture. The description should still be able to carry the RP by itself.

### Description should carry

- full character engine
- speech and narration identity
- relationship dynamic with {{user}}
- current state
- opening tension

### Lorebook should carry

- trust or progression states
- reaction branches for sensitive topics
- deep reveals or backstory layers
- optional world/location support

### Common entry set

| Entry type                 | Purpose                                                                             |
| -------------------------- | ----------------------------------------------------------------------------------- |
| **State cluster**          | Handles progression, regression, emotional stages                                   |
| **Reaction entries**       | Topic-specific behavior shifts                                                      |
| **Deep reveal entries**    | Hidden truths that should not leak early                                            |
| **World support entries**  | Optional setting texture when needed                                                |
| **Social ecology entries** | Optional family, community, or relationship network that creates offscreen pressure |

Not every single-character bot needs all of these. A bot with one strong state axis and a few reveal gates can be excellent with minimal lorebook.

### Good pattern

Description:

- "who this person is every turn"

Lorebook:

- "what wakes up only under certain conditions"

Some single-character bots flip this balance — placing behavioral state machinery in lorebook while the description focuses on teaching the model how to interpret and use that machinery. Both approaches work.

### Common mistake

Moving too much of the character's soul into lorebook.

If the base description feels hollow without triggers, the architecture may be upside down — unless the bot is deliberately designed as a lorebook-heavy system where the description acts as an interpretive frame rather than a full character engine.

---

## 2. Small Ensemble Bots (2–4 recurring characters)

This scale often benefits from explicit architecture, but the amount of scaffolding varies widely. Some small ensembles work beautifully with short always-on dossiers and no trigger gating at all; others benefit from deeper lorebook structure. Let the bot's needs drive the decision.

### Description should carry

- world tone
- group tension
- why these characters share a scene space
- one thumbnail per recurring character
- the relationship shape between {{user}} and the group
- opening-scene logic

### Lorebook should carry

- one fuller profile per recurring character
- pair-dynamics entries (when the relationships create scenes on their own)
- setting/location support
- shared history and secrets
- scene-management rules if scenes get crowded

### Common entry set

| Entry type                               | Why it matters                                          |
| ---------------------------------------- | ------------------------------------------------------- |
| **Roster summary**                       | Keeps the cast legible in always-on context             |
| **Full profile per recurring character** | Lets each person go deeper when active                  |
| **Pair-dynamics entries**                | Carries the actual dramatic chemistry                   |
| **Scene-management entry**               | Prevents four people from talking equally at once       |
| **World/location entries**               | Supports scene changes without bloating the description |

Not all of these are necessary. A 3-character bot with strong always-on profiles and no complex trigger logic can outperform one with elaborate architecture if the cast chemistry is well-written.

### Pair-dynamics rule

If the relationship itself creates scenes, write an entry for the relationship, not just the people.

### Opening-message rule

Open with:

1. one scene owner
2. one secondary presence
3. the group's tension

Do not stage the whole ensemble equally on turn one.

### Common mistake

Writing four excellent individual sheets but no architecture for how they interact.

The result is four monologues sharing a setting.

---

## 3. Large World / Large Cast Bots (10+ characters)

This is an architecture-first problem. The patterns below reflect what works in many successful world bots, but no single bot needs all of them.

### Description should carry

- world tone
- genre contract
- current instability
- POV or scene-routing rules
- only the core cast

### Lorebook should carry

- roster entries
- core cast profiles
- recurring cast thumbnails or medium profiles
- faction entries
- location entries
- relationship clusters
- secret layers
- scene-management logic

### Cast tiering

| Tier                | Description presence               | Lorebook depth |
| ------------------- | ---------------------------------- | -------------- |
| **Core cast**       | Yes                                | High           |
| **Recurring cast**  | Usually no more than brief mention | Medium         |
| **Background cast** | Usually none                       | Low            |

### Common entry groups

```text
World
  - Current state
  - Major factions
  - Key institutions

Cast
  - Roster summary
  - Core cast profiles
  - Recurring cast profiles

Dynamics
  - Major relationship clusters
  - Shared rivalries
  - Secret alignments

Locations
  - Major hubs
  - Restricted or dangerous zones

Scenes
  - Scene-management rules
  - Spotlight rules
  - Crowd handling rules

Secrets
  - Rumors
  - Mid-depth truths
  - Hidden causes
```

Most world bots will use a subset of these groups. Do not build folders you cannot fill with entries that change scenes.

### Advanced optional patterns

Ambitious world bots sometimes use structural lorebook entries that direct storytelling rather than adding content:

- **System / directorial entries** — meta-narrative instructions that tell the bot how to pace events, calibrate tension, or handle narrative transitions. These are steering entries, not world lore.
- **Event dramaturgy entries** — entries that shape dramatic rhythm: escalation beats, cooldown periods, crisis timing, or arc progression rules.
- **Focus management entries** — entries that define how to foreground and background characters as scenes shift, preventing attention spread across the full roster.
- **User-context routing** — entries that adjust tone, available cast, or scenario direction based on the user's current location, role, or phase in the story.

These are power tools. They add significant value in the right hands and significant overhead in the wrong ones. Do not add them because the category exists — add them when the bot genuinely needs the steering.

### Scene cap rule

In most scenes, only **2–3 characters** should meaningfully own the response.

Everyone else can be:

- present
- referenced
- lightly reactive

If the bot tries to fully roleplay 8 people at once, it will degrade.

### Common mistake

Using the description as a roster encyclopedia.

That usually causes:

- attention collapse
- generic voices
- repeated exposition
- secret leakage

---

## 4. Which Surface Should Carry It?

Use this decision table when you are unsure.

| Content                                          | Best home                                                      |
| ------------------------------------------------ | -------------------------------------------------------------- |
| The world's emotional weather                    | Description                                                    |
| The one-line reason a character matters          | Description or roster summary                                  |
| The full performance engine for a core character | Character profile entry + maybe compressed description mention |
| Relationship chemistry                           | Pair-dynamics entry                                            |
| Deep backstory                                   | Lorebook                                                       |
| Topic-based reactions                            | Lorebook                                                       |
| "How to handle crowded scenes"                   | Scene-management entry                                         |
| Slow reveal or secret chain                      | Layered secret entries                                         |

---

## 5. Failure Signals by Scale

### Single-character

- Base description feels empty without lorebook
- The bot cannot hold character without triggers

### 2–4 ensemble

- Characters are individually good but scenes feel unfocused
- Pair chemistry is implied, not architected
- Everyone speaks with similar rhythm

### 10+ cast

- The first message introduces too many people
- Lore triggers cause info-dumps
- Side characters steal attention from the scene owner
- Deep truths activate on casual mentions

When these appear, reduce always-on text and strengthen routing.

---

## Final Reminder

At larger scales, your job is not to store everything.

Your job is to decide:

**what the model should always remember, what it should recall conditionally, and what it should not surface yet.**

The scales and recipes here are reference points. The best bot at any scale is the one whose architecture serves its specific vision — not the one that checks the most boxes.
