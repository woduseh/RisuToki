# Character Authoring by Bot Scale

> See also: [Lorebook Bot Architecture by Scale](../../authoring-lorebook-bots/BOT_SCALES.md) for description vs lorebook distribution decisions.

Use this file after reading `SKILL.md` when the main problem is **how much character depth to keep in the description at a given bot scale**.

> The scale recipes below are strong defaults drawn from real reference bots. They are not the only way to build at each scale — treat them as starting points, not constraints.

---

## Quick Chooser

| Bot shape                                | Description job                                                    | Lorebook job                                                | Risk if you over-write the description          |
| ---------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------- | ----------------------------------------------- |
| **Single-character / dedicated partner** | Carry most of the character's engine and voice                     | Handle optional state, reaction, and deep reveals           | Mostly wasted time, not fatal                   |
| **2–4 recurring characters**             | Give each character a diagnostic identity and shared group tension | Hold deeper backstory, pair dynamics, situational behavior  | Voice collision and cast blur                   |
| **10+ world/cast**                       | Frame the world, roster, POV rules, and only the core cast         | Carry most character detail, relationships, and progression | Attention collapse, info-dumps, trigger pileups |

If the architecture is lorebook-heavy, pair this with `authoring-lorebook-bots`. If you want a minimal factual profile plus a self-introduction monologue instead of an explicit scaffolded sheet, use `authoring-self-introduction-sheets`.

---

## 1. Single-Character Bots

This is the most description-heavy case. The character **is** the experience.

### What the description should usually contain

- Anchor sentence
- Wound as scene
- Want vs. Need
- Surface vs. Subversion
- Mask / Leak pattern for major emotions
- Full speech system
- Current situation
- Blind spots, hidden wants, or layered desires

### What can still live in lorebook

Single-character bots still benefit from lorebook layers when you need dynamic behavior:

| Layer                    | Best home                                          | Why                                                                                      |
| ------------------------ | -------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **State**                | Lorebook / state-tracking surface                  | Relationship progression and regression are easier to gate than to keep always-on        |
| **Reaction**             | Lorebook                                           | Topic-sensitive or environment-sensitive responses do not need to live in the main sheet |
| **Deep reveal / secret** | Lorebook                                           | Lets discovery happen late instead of leaking in the first 5 turns                       |
| **Direction**            | Post-history reminder / Author's Note-like surface | Short turn rules work better near the response point than inside the main description    |

### Supporting ecology

Some single-character bots define a **supporting ecology** — family members, household dynamics, workplace hierarchies, or social webs — that is load-bearing architecture rather than optional flavor. When the character's behavior is shaped by relationships the user will encounter (a controlling parent, a dependent sibling, a rivalrous coworker), those figures deserve lorebook investment even though the bot is still fundamentally single-character-centered.

Signs a supporting ecology needs structural support:

- The character's reactions in scenes depend on who else is present or recently mentioned.
- Family or social dynamics are a primary source of tension, not just backstory.
- The user is expected to interact with supporting figures, not just hear about them.

This does not mean every single-character bot needs a cast lorebook. It means that when the character's world is part of the experience, treating it as architecture pays off.

### Good target

If you can remove the lorebook and the character still **feels** right, the description is doing its job.

### Common failure

Writing only a static biography. The model may understand who the character _was_ without knowing how to perform them **now**.

---

## 2. Small Ensemble Bots (2–4 recurring characters)

This is the easiest scale to overbuild. You still want meaningful character identity, but you no longer have infinite room.

> **Simplicity is a legitimate path.** Some small ensembles work best with short character dossiers always-on and minimal technical scaffolding. Not every 2–4 character bot needs complex trigger systems, state tracking, or elaborate lorebook architecture. If the cast is well-differentiated and the description carries enough voice, the bot can be structurally simple and still perform well.

### The cast-design rule

Do **not** design characters one by one in isolation. Design a **contrast grid** first.

| Character | Role in group                        | Public mask                    | Private crack         | Speech signature                              | Pressure channel                                  |
| --------- | ------------------------------------ | ------------------------------ | --------------------- | --------------------------------------------- | ------------------------------------------------- |
| A         | Leader / instigator / witness / foil | What they show in group scenes | What slips in private | The line rhythm or verbal tic nobody else has | Silence / anger / humor / competence / caretaking |

If two characters share the same speech signature **and** the same pressure channel, they will blur together.

For the voice-design side of that grid, pair this section with **[SPEECH_SYSTEM.md](SPEECH_SYSTEM.md)**.

### What stays in the description

Per character, keep at minimum:

- 1 anchor sentence
- 1 contradiction or core crack
- 2 diagnostic lines of speech
- 1 group role
- 1 private/public difference

Also include:

- the shared group tension
- why these characters stay together
- what kind of scenes the cast naturally generates

### What moves to lorebook

These elements are good candidates for lorebook if the bot grows complex enough to need them. A simple ensemble may keep everything in the description:

- Full backstory
- Detailed reaction maps
- Pair-specific dynamics
- Relationship progression
- Topic-sensitive reveals

### Voice collision test

Take the character names off their example lines.

- If you can still tell who said each line, the cast is probably distinct enough.
- If two sets of lines feel interchangeable, redesign before you keep writing.

### Opening-message rule

Do not introduce every cast member equally. Pick:

1. the scene owner
2. one secondary presence
3. the group tension

The rest can enter later through lorebook activation or subsequent turns.

---

## 3. Large World / Large Cast Bots (10+ characters)

At this scale, the description stops being a set of full character sheets. It becomes a **framing and routing surface**.

### Tier the cast

| Tier                | Who belongs here                                            | Description investment      | Lorebook investment |
| ------------------- | ----------------------------------------------------------- | --------------------------- | ------------------- |
| **POV / core cast** | 1–3 characters the bot revolves around                      | Moderate to high            | High                |
| **Recurring cast**  | Characters who appear often but do not define the bot alone | Thumbnail only              | Moderate            |
| **Background cast** | Specialists, cameo NPCs, social filler                      | Roster mention only or none | Low to moderate     |

### What the description should do

- establish the world tone
- identify the core cast
- state the narrative mode or scene-management expectation
- define what kinds of conflicts the bot should generate

### What the description should **not** do

- hold 10 full personalities
- explain every faction
- encode the full relationship matrix
- store every speech system inline

### Thumbnail pattern for non-core characters

For recurring or minor cast, one strong line beats a mini-biography.

Reusable template:

```text
[Name] [role-verb] [behavioral signature] — [one telling detail].
```

```text
Bad:  Mina is a 27-year-old archivist with green eyes who likes tea and works in the east tower.
Good: Mina files rumors the way other people sharpen knives — quietly, precisely, and with obvious enjoyment.
```

### Large-cast warning signs

- You cannot tell who should speak first in a crowded scene.
- Five characters have "sarcastic, sharp, observant" voice notes.
- The description is carrying relationship detail that only matters in 1 of 20 scenes.
- Every new entry adds facts but not scene pressure.

When these appear, move into `authoring-lorebook-bots`.

---

## 4. Handoff Checklist to `authoring-lorebook-bots`

Move from pure character authoring into lorebook-bot architecture when:

- the description is mostly framing rather than performance detail
- multiple characters need independent triggerable depth
- relationship arcs or secrets must activate conditionally
- you need roster entries, pair-dynamics entries, or scene-management rules
- the same bot should support both solo scenes and multi-character world scenes

In practice:

- **Single-character bot** → start here, then add lorebook layers only if needed
- **2–4 character bot** → start here for cast identity, then pair with lorebook-bot architecture
- **10+ cast bot** → use this file only for deciding who deserves full character treatment; do the real architecture in `authoring-lorebook-bots`
