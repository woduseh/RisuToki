# Lorebook Architecture for Description-Driven Bots

How to design lorebook systems that **extend** the description instead of fighting it.

---

## Core Principle

In a typical lorebook-driven bot the description is the **persistent frame** and lorebook entries are **conditional depth**. Some designs shift the balance further toward lorebook — always-on entries, dense state systems, or structural scaffolding — and that is equally valid when it serves the bot's goals.

Regardless of balance, every entry should answer:

**"When this activates, how does it change what the bot writes in this scene?"**

If the answer is "it adds facts but not behavior, tone, or scene logic," the entry is probably weak.

---

## Entry Design Principles

### 1. Self-Contained

Each entry may activate alone. Never assume other entries are present.

```text
Bad:  See also the Northern Reach entry for context.
Good: The Northern Reach treats hospitality like debt — offered carefully, remembered forever.
```

### 2. Match the Description's Voice

The lorebook should read like it belongs to the same bot.

- atmospheric description + clinical lorebook = tonal whiplash
- clinical description + atmospheric lorebook = awkward paste-in prose

### 3. Behavior Over Biography

Write what changes scenes.

```text
Bad:  Captain Dreve is 45, born in Korvel, promoted at 34...
Good: Captain Dreve makes everyone stand straighter by existing within ten feet of them.
```

### 4. Signal Density Over Raw Length

Large context windows do **not** remove attention limits.

Long entries are fine if they stay rich with:

- behavior
- speech cues
- sensory texture
- social pressure
- scene consequences

Cut sentences that do not materially change likely output.

### 5. Secrets Need Trigger Depth

If a secret activates on the character's name alone, it is not a secret architecture problem — it is a trigger-design failure.

---

## Entry Roles

Think in **roles**, not just topics.

### 1. Roster Entries

Roster entries are lightweight "who matters here?" guides.

Best for:

- large casts
- academy / office / guild / squad bots
- rotating scene ownership

A good roster entry gives:

- name
- one thumbnail line
- scene function
- maybe one pressure clue

```text
Mina — archivist; turns rumors into leverage before anyone notices they're ammunition.
Rook — guard captain; speaks softly enough that everyone else becomes louder by comparison.
Sera — medic; gentle hands, ruthless triage, zero patience for avoidable damage.
```

### 2. Full Character Profile Entries

Use when a character needs more than a thumbnail.

Good contents:

- behavioral engine
- current state
- speech system or extra registers
- topic-specific reactions
- secrets or contradictions

These are ideal for:

- recurring characters in 2–4 cast bots
- core cast in world bots
- single-character bots with lorebook augmentation

### 3. Pair-Dynamics and Relationship Architecture Entries

One of the most underused high-value entry types.

Use when the relationship itself changes scenes more than either character alone.

Best contents:

- how they behave around each other
- what topics destabilize them
- their default power imbalance
- what each misreads about the other

```text
Mina + Rook: Mina treats his restraint as moral superiority and keeps poking it.
Rook treats her needling as a test he refuses to fail. Their scenes are controlled
duels disguised as logistics.
```

**Beyond pairs.** Relationship architecture can scale beyond two-person dynamics:

- **Relationship clusters** — group dynamics where the chemistry is between 3+ people and cannot be decomposed into pair interactions alone (e.g., a family unit, a squad that only functions as a unit, a love triangle). Write these as their own entries when the group dynamic is load-bearing.
- **Social / supporting ecology** — entries that define a character's broader social world: family patterns, community ties, professional networks, or rivalries that create pressure even when those people are offscreen. These work well for single-character bots where the ecology itself is a dramatic engine.
- **Continuity / event-summary memory** — entries that record significant relationship events or state changes so the bot can reference shared history. Useful in longer-running scenarios but not every bot needs them.

Use whichever shape fits the bot. A single-character bot might need ecology entries but no pair dynamics; a small ensemble might need only pairs; a world bot might need clusters.

### 4. World / Institution Entries

Use for:

- factions
- schools
- churches
- companies
- governments
- cultures

Focus on:

- how it pressures people
- how it behaves in scenes
- what social texture it adds

### 5. Location Entries

Good location entries do more than describe the room.

They should also tell the bot:

- how people behave there
- what is safe / unsafe to say there
- what sensory details matter
- what kinds of interactions this place invites

### 6. State / Reaction Entries

These are excellent for dynamic bots.

Use them for:

- trust progression
- suspicion states
- injury reactions
- grief loops
- topic-specific behavior changes

They are often better than stuffing every conditional reaction into the main description.

### 7. Scene-Management Entries

Critical for multi-character or world-heavy bots.

These entries tell the bot how to handle crowded scenes.

Good contents:

- who gets spotlight first
- how many active characters should meaningfully speak
- when background cast should stay background
- whether scenes prefer tight POV or wide ensemble play

### 8. Secret / Reveal Entries

Secrets should be layered.

Use separate entries for:

- public rumor
- mid-depth truth
- actual hidden cause

This prevents the classic failure where one trigger reveals the entire mystery stack at once.

### 9. Continuity / Event-Summary Entries (optional)

In longer-running or progression-heavy bots, dedicated entries can track significant events, relationship milestones, or world-state changes that the bot should remember across scenes.

Good uses:

- recording relationship turning points so the bot can reference shared history
- tracking world events that shift the political or social landscape
- maintaining a running summary of user decisions that affect the scenario

Not every bot needs these. They shine most in bots designed for extended play or bots where cumulative history is a dramatic resource.

### 10. System / Directorial Entries (advanced, optional)

In ambitious world bots or large-cast scenarios, some entries serve a **meta-narrative** function — they direct how the bot handles storytelling rather than adding world content.

Examples:

- **event dramaturgy** — entries that pace escalation, calibrate dramatic tension, or define event rhythms across sessions
- **focus management** — entries that tell the bot how to foreground and background characters in crowded scenes, preventing attention spread
- **user-context routing** — entries that adjust tone, cast availability, or scenario branches based on where the user is or what role they occupy

These are power tools for complex designs. Most bots do not need them, and adding them to a bot that does not need them creates overhead without benefit.

---

## Architecture by Bot Scale

### Single-Character Bot with Lorebook Support

One common entry mix (adjust to fit your bot):

- 1 state/reaction entry cluster
- optional world-support entries
- 1–2 deep reveal entries
- optional location entries if the setting matters strongly

Keep the emotional engine in the description. Use lorebook to make it responsive.

### 2–4 Character Ensemble

One common entry mix (adjust to fit your bot):

- 1 roster summary entry
- 1 full profile per recurring character
- 1 pair-dynamics entry per major relationship
- 1 scene-management entry if group scenes are common
- world/location entries as needed

This scale is where pair-dynamics entries shine the most.

Not every small ensemble needs complex scaffolding. If the cast works with short always-on dossiers and natural keyword triggers, that simplicity is a strength, not a gap.

### 10+ Character / World Bot

Common entry groups (most world bots will not need all of these):

- 1 always-on roster summary
- full profiles only for core cast
- recurring cast as thumbnail or medium entries
- scene-management entry
- relationship cluster entries
- world / faction / location entries
- layered secret entries

Do **not** build 15 protagonist-grade always-on entries unless the bot is explicitly designed for that load and the underlying model handles it well.

---

## Trigger Design

### Natural Trigger Keywords

Choose words users will actually say.

| Good strategy          | Example                                                |
| ---------------------- | ------------------------------------------------------ |
| Common name            | `Mina`, `the council`, `east tower`                    |
| Conversational variant | `old magic`, `ancient magic`, `the old stuff`          |
| Topic phrase           | `what happened`, `before the war`, `why did you leave` |

Avoid:

- jargon nobody will type
- single ultra-broad words that fire constantly
- secrets attached to casual name mentions

### Layered Trigger Depth

| Layer         | Trigger style               | Example                                                   |
| ------------- | --------------------------- | --------------------------------------------------------- |
| **Surface**   | name / place / common label | `Mina`, `east tower`                                      |
| **Mid-depth** | topic cluster               | `archives`, `rumors`, `blackmail`                         |
| **Deep**      | trust / discovery language  | `what are you hiding`, `why did you keep this`, `forgive` |

### Collision Safeguards

Trigger collisions happen when too many relevant entries fire together.

Signs:

- the bot starts listing facts from all active entries
- a scene with one character suddenly includes three factions and two secrets
- hidden layers surface just because neighboring keywords were present

Safeguards:

1. split broad entries into focused ones
2. give deep content narrower trigger paths
3. prefer layered entries over all-in-one mega entries
4. use selective or secondary keyword logic when available
5. keep always-on summaries lightweight

### Selective / Secondary Triggers

When a broad keyword is unavoidable, require a second condition.

| Broad key     | Secondary topic            | Purpose                                      |
| ------------- | -------------------------- | -------------------------------------------- |
| `magic`       | `old, origin, history`     | Stops history dumping on every spell mention |
| `Mina`        | `past, archives, rumor`    | Backstory activates only when relevant       |
| `the council` | `secret, corruption, vote` | Hidden politics stay hidden                  |

### Decorator-Aware Activation Notes

If your lorebook system supports insertion decorators or depth controls such as `@@depth`, `@@role`, or `@@position`, use them to refine already-good entry design — not to rescue bad architecture.

Good use:

- keep high-priority scene-routing entries close to the response
- place low-priority world texture deeper in context
- separate narrative framing from hard instruction

Bad use:

- stacking decorators on bloated entries that should have been split
- using insertion priority to force irrelevant entries into every scene

For exact decorator syntax, use `writing-lorebooks`.

---

## Folder Organization

Group by function, not just by noun type.

```text
World
  - Current State
  - Core Institutions
  - Major Factions

Cast
  - Roster Summary
  - Core Cast Profiles
  - Recurring Cast Profiles

Dynamics
  - Pair Relationships
  - Rivalries
  - Shared Secrets

Scenes
  - Scene Management
  - Social Rules
  - Event Logic

Secrets
  - Public Rumors
  - Mid-Depth Truths
  - Hidden Causes
```

For very large bots, "Dynamics" and "Scenes" folders are often more valuable than yet another pile of biographies.

---

## Always-On Budget

Always-on entries compete for attention every turn.

Good always-on candidates:

- world current-state summary
- short roster summary
- scene-management entry
- output or spoiler-prevention rules

Move to keyword triggers when content is:

- topic-specific
- location-specific
- relationship-specific
- secret or reveal-driven
- only relevant in some phases of play

If your always-on stack becomes a second description, compress it.

---

## Audit Checklist

Ask these before calling the architecture finished:

| Check                | Question                                                       |
| -------------------- | -------------------------------------------------------------- |
| **Standalone**       | Can each important entry make sense alone?                     |
| **Voice match**      | Does activated lore sound like it belongs in the same bot?     |
| **Behavioral value** | Does each entry change scene output, not just explain facts?   |
| **Trigger depth**    | Are secrets and deep truths gated well enough?                 |
| **Collision safety** | What happens if 4–5 relevant entries activate together?        |
| **Cast tiering**     | Are only the truly central characters always visible?          |
| **Scene control**    | In a crowded scene, does the bot know where to focus?          |
| **Leak prevention**  | Can casual mentions accidentally unlock late-game information? |

---

## Final Rule

Do not measure a lorebook by how much it contains.

Measure it by how cleanly it answers:

**"When this scene changes, which information should wake up — and what should stay asleep?"**

The roles, patterns, and architecture outlines in this document are tools, not requirements. Use what serves your bot and leave the rest.
