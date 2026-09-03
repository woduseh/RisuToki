# Lorebook Architecture for Description-Driven Bots

How to design lorebook systems that **extend** the description instead of fighting it.

---

## Core Principle

In a typical lorebook-driven bot the description is the **persistent frame** and lorebook entries are **conditional depth**. Some designs shift the balance further toward lorebook — always-on entries, dense state notes, or structural support — and that is equally valid when it serves the bot's goals.

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

Keep planning terms out of entry prose. Use "architecture," "activation," "state," and "routing" while designing if they help, but rewrite model-visible character and relationship material as pressure, memory, gesture, silence, sensory texture, and changed choices.

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

If a secret activates on the character's name alone, it is not a secret-structure problem — it is a trigger-design failure.

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

- inner drive
- current state
- voice patterns or extra registers
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

**Beyond pairs.** Relationship structure can scale beyond two-person dynamics:

- **Relationship clusters** — group dynamics where the chemistry is between 3+ people and cannot be decomposed into pair interactions alone (e.g., a family unit, a squad that only functions as a unit, a love triangle). Write these as their own entries when the group dynamic is load-bearing.
- **Social / supporting ecology** — entries that define a character's broader social world: family patterns, community ties, professional networks, or rivalries that create pressure even when those people are offscreen. These work well for single-character bots where the ecology itself keeps drama alive.
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

For worldbuilding entries, prefer pressure-map content over encyclopedia content:

- **Official story vs actual mechanism** for power centers
- **Cost, limit, and cultural consequence** for magic or technology
- **Current manifestation** for history, not full timeline
- **Norms and taboos** as behaviors people perform or avoid
- **Texture pairs** that show a structural rule in daily life

If an entry can only say what exists, it is not finished. Add what the existence changes.

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

### 9. Continuity and Progression Entries (optional)

Use when the bot needs relationship stages, world-state movement, reveal pacing, or user-choice residue across scenes.

Good contents:

- **Relationship progression and regression** — what behavior changes after trust, betrayal, repair, intimacy, or public conflict
- **World event progression** — what has shifted because time passed or the user acted
- **Reveal stages** — public rumor, partial truth, personal confession, and hidden cause as separate layers
- **User-choice residue** — decisions that now constrain access, tone, allies, suspicion, or social cost

Write what the memory now affects, not an archive of the past. Avoid scoreboards; describe response constraints and changed behavior.

```text
After {{user}} exposes the forged ration ledgers, dock clerks stop speaking freely near them.
The harbor still accepts their coin, but favors now require an intermediary.
```

Regression is part of progression. Trust repair should have cost, delay, and visible behavior; do not let apologies reset state instantly unless the bot is designed for that.

**Automation option:** a trigger script or Lua callback can record residue via `upsertLocalLoreBook` (takes effect next turn). Automated entries follow the same standard as manual ones and need a pruning rule so residue does not accumulate into noise. See `writing-trigger-scripts` and `writing-lua-scripts`; for weighted event banks and where scenario state is stored, see `authoring-scenarios/EVENT_SYSTEMS.md`.

System, directorial, and focus-management entries for ambitious world bots are described under advanced optional patterns in `STRUCTURE_SCALES.md`.

### 10. Knowledge Horizon Entries

Use when the bot risks importing modern, genre-default, or out-of-setting assumptions.

Good contents:

- what ordinary inhabitants know
- what they misunderstand
- what vocabulary they use instead of modern concepts
- what sciences, technologies, laws, or social categories do not exist in this setting

Negative statements are acceptable here when they block strong defaults.

```text
When fever spreads, people blame bad air, bad water, broken ritual, or household spirits.
No one in this setting has a concept of germs, atoms, DNA, or modern psychiatry.
```

---

## Architecture by Bot Scale

Entry mixes per scale (single character, 2–4 ensemble, 10+ world bot), cast tiering, and folder groupings live in `STRUCTURE_SCALES.md`; this file owns entry roles and trigger design. Group folders by function, not noun type: for very large bots, Dynamics and Scenes folders are worth more than another pile of biographies.

---

## Trigger Design

### Trigger language coverage

Triggers scan the chat log, so **user input language governs key design** — independent of the bot being written in English. Policy: English keys are mandatory; Korean, Japanese, and Chinese coverage is added per the recipes below when the bot supports those players.

RisuAI matches keys as substrings by default; full-word matching is opt-in through the `@@match_full_word` decorator. Keep the default for Korean: particles attach directly to the noun (`미나가`, `미나를`, `미나한테`), so under full-word matching the key `미나` would never match. Japanese and Chinese have no spaces at all, so substring matching is the only workable mode there too.

Recipes, in order of preference:

1. **Dual plain keys, default substring matching:** `key: "Mina, 미나"` without `@@match_full_word`. Substring matching handles Korean particles and unspaced Japanese/Chinese natively. Watch for short keys that hide inside other words (e.g., a two-syllable Korean name that is also a common word) — lengthen or switch to regex.
2. **Regex keys for particle precision** (`useRegex: true`) when substring is too greedy:

```text
(Mina|미나(가|는|를|의|와|랑|한테|에게|도|만)?|ミナ|米娜)
```

3. **Topic keys need per-language variants too:** `what happened, 무슨 일, 何があった` — topic-phrase triggers are the most commonly forgotten multilingual surface.
4. **Budget by frequency:** full four-language coverage for core cast and core topics; English+Korean for secondary entries; English-only is acceptable for deep entries reached through recursive activation rather than direct user wording.

Validate with `validate_lorebook_keys`, and test by replaying real user phrasings in each supported language.

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

Use RisuAI's insertion decorators (`@@depth`, `@@role`, `@@position`) to refine already-good entry design — not to rescue weak structure.

Good use:

- keep high-priority scene-routing entries close to the response
- place low-priority world texture deeper in context
- separate narrative framing from hard instruction

Bad use:

- stacking decorators on bloated entries that should have been split
- using insertion priority to force irrelevant entries into every scene

For exact decorator syntax, use `writing-lorebooks`.

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

Ask these before calling the structure finished:

| Check                 | Question                                                                  |
| --------------------- | ------------------------------------------------------------------------- |
| **Standalone**        | Can each important entry make sense alone?                                |
| **Voice match**       | Does activated lore sound like it belongs in the same bot?                |
| **Behavioral value**  | Does each entry change scene output, not just explain facts?              |
| **Trigger depth**     | Are secrets and deep truths gated well enough?                            |
| **Collision safety**  | What happens if 4–5 relevant entries activate together?                   |
| **Cast tiering**      | Are only the truly central characters always visible?                     |
| **Scene control**     | In a crowded scene, does the bot know where to focus?                     |
| **Leak prevention**   | Can casual mentions accidentally unlock late-game information?            |
| **Progression value** | Do state entries change future behavior instead of just recording events? |
| **Reveal staging**    | Are secrets split so casual mentions cannot unlock the whole truth stack? |
| **Regression/repair** | Do relationship setbacks and repairs carry cost instead of instant reset? |
| **Choice residue**    | Do important user choices leave constraints the bot can act on later?     |

---

## Final Rule

Do not measure a lorebook by how much it contains. Measure it by how cleanly it answers:

**"When this scene changes, which information should wake up — and what should stay asleep?"**
