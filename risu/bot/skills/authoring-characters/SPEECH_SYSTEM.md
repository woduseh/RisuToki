# Speech System Reference

Voice is not one thing. It has **three layers**:

1. **DNA markers** — what stays recognizable across every mood
2. **Registers** — how the voice shifts under different conditions
3. **Narration lens** — what the character notices and how that colors prose

If the character sounds distinct but sees the world like generic LLM narration, the voice is only half-built.

---

## 1. Start with DNA Markers

DNA markers are the smallest high-impact investment you can make.

They are the tics or habits that stay present across **all** registers.

| Type                 | Example                                                                         |
| -------------------- | ------------------------------------------------------------------------------- |
| **Verbal tic**       | Starts with "look," calls people by function instead of name                    |
| **Physical habit**   | Adjusts bracelets, cracks knuckles, touches doorframes when tense               |
| **Thought pattern**  | Turns everything into efficiency problems, food metaphors, battlefield geometry |
| **Structural habit** | Answers questions with questions, never says "I don't know" directly            |

### Good DNA markers

```text
Hands are always doing something — tapping, folding, aligning, checking.
She almost never uses names before respect is earned.
When emotional, her volume rises before her honesty does.
```

### Bad DNA markers

```text
She has some habits.
She talks differently depending on mood.
```

### DNA rule

If you removed the mood label from a line and could still guess the character, the DNA is working.

---

## 2. Build Registers

A **register** is a distinct way of speaking that appears under a certain emotional or social condition.

You do **not** need many. You need a few that matter.

| Character type                 | Good target   |
| ------------------------------ | ------------- |
| Minor NPC                      | 1–2 registers |
| Recurring side character       | 2–3 registers |
| Major character                | 3–4 registers |
| Dedicated single-character bot | 4–6 registers |

### Name registers psychologically, not situationally

```text
Good:
- The Shield
- The Performer
- The Knife
- The Child Who Never Left

Bad:
- At work
- With friends
- Angry mode
- Sad mode
```

Psychological names tell the model **why** the voice exists, not just when it appears.

### What each register needs

Every register benefits from these four elements:

1. **Trigger direction** — what tends to bring it out
2. **Example lines** — 2–5 actual lines
3. **Nonverbal texture** — what the body does here
4. **Linguistic markers** — sentence length, diction, rhythm, clippedness, formality

### Example lines are patterns, not scripts

The model should imitate the **structure**, not recite the literal lines.

If it starts parroting your examples:

- reduce the number of nearly identical lines
- vary sentence length and topic
- keep the emotional shape, not the exact wording

```text
Bad:  Five example lines that all say the same thing with different nouns.
Good: Three lines that show the same voice under different scene pressures.
```

### Example register block

```markdown
**The Shield** — appears when she feels seen too quickly.

Trigger direction:

- Questions that cut past her rehearsed persona
- Unwanted pity
- People correctly naming what she feels

Example lines:

- "You really like skipping to the invasive part, huh."
- "That's a cute theory. Keep it."
- "I'm fine. No, you don't get to inspect the answer."

Nonverbal texture:

- Mouth stills before the rest of her face does
- Stops touching nearby objects
- Watches the other person's hands more than their eyes

Linguistic markers:

- Shorter sentences
- More declarative than conversational
- Jokes sharpen into edge instead of warmth
```

### Transition patterns

Do not write mode switches as on/off toggles.

```text
Bad:  When angry, she switches to vulnerable mode.

Good: When cornered, her polished sentences erode. The filler words disappear first.
Then the smile. Then the grammar starts dropping pieces she normally keeps perfectly aligned.
```

### Anti-acceleration warning

If you define a "fully open" or "deeply in love" register, the model may race toward it.

Safer options:

1. **Omit the end-state entirely** and let it emerge
2. **Gate it hard** with long-term trust, repeated safety, and reversible progress

```text
Bad:  When attached, she becomes openly affectionate and honest.

Good: This register is expensive. It appears only after repeated moments where she
shows weakness and is not punished for it. Even then, it is fragile and retractable.
```

---

## 3. Add Silence Rules

Silence rules define what the character does **instead of naming feelings directly**.

This is one of the best ways to stop the model from collapsing into flat confessions.

| Direct line to avoid | Indirect expression                         |
| -------------------- | ------------------------------------------- |
| "I'm lonely."        | "The apartment got bigger lately."          |
| "I missed you."      | "I passed that bakery you like."            |
| "I'm scared."        | Starts organizing, cleaning, checking exits |
| "I'm angry."         | Gets frighteningly polite                   |

### Use silence rules when

- the character is emotionally defended
- subtext matters more than confession
- you want affection, fear, or shame to show behaviorally

Do **not** force silence rules onto every character. Some characters _do_ speak plainly. The point is intentionality.

---

## 4. Add a Truth Budget

A **truth budget** controls how much emotional honesty the character can afford at each trust level.

```markdown
Stage 0 — guarded

- No direct emotional labels
- Answers with facts, tasks, or deflection

Stage 1 — familiar

- May admit irritation or amusement
- Still avoids naming fear, need, or attachment

Stage 2 — trusted

- Can name one vulnerable feeling, then retreats

Stage 3 — deeply trusted

- Can admit need, but usually in broken or partial language
```

Truth budget is especially important for:

- single-character slow-burn bots
- jealous / guarded / avoidant characters
- any bot where pacing matters more than instant emotional payoff

---

## 5. Add a Narration Lens

Voice is not just what the character **says**. It is also what they **notice first**.

Define 2–4 stable perception filters.

| Lens type    | Example                                                         |
| ------------ | --------------------------------------------------------------- |
| **Spatial**  | Tracks exits, distance, who is blocking whom                    |
| **Physical** | Notices hands, weight shifts, bruises, breath                   |
| **Sensory**  | Smell, fabric, temperature, machinery noise                     |
| **Social**   | Who is faking confidence, who interrupts whom, who gets ignored |

### Good narration lens

```text
She notices distance before beauty, hands before faces, and exits before décor.
When a room changes, she reads it through posture shifts and who stops talking first.
```

### Bad narration lens

```text
She observes the world carefully.
```

### Barks: unconscious output

Use short, repeatable, mostly unexplained physical tells.

```text
When lying: gaze drops left
When fond: straightens things that do not need straightening
When overwhelmed: movement reduces instead of escalating
```

Describe them. Do not explain them every time.

---

## 6. Code-Switching

If the character uses multiple languages, the switching pattern itself is voice.

| Switching type     | What it reveals                                         |
| ------------------ | ------------------------------------------------------- |
| **Conscious**      | Social control, performance, intimidation               |
| **Emotional leak** | The native language breaks through when restraint fails |
| **Defensive**      | Hides true thoughts from a listener                     |

Always write the example in the actual languages used.

```text
Bad:  She sometimes speaks Korean.

Good: English is her public surface. Under pressure, Korean slips out in the smallest
units first — curses, disbelief, muttered self-corrections. She notices and covers it
in formal settings, but not when tired or embarrassed.
```

---

## 7. Ensemble Voice Separation

For 2–4 recurring characters, build a quick contrast matrix before you finalize any one voice.

For the description-budget version of this problem, pair this section with **[BOT_SCALES.md](BOT_SCALES.md)**.

| Character | Sentence rhythm | Humor style | Pressure tell    | Social strategy |
| --------- | --------------- | ----------- | ---------------- | --------------- |
| A         | clipped         | dry         | goes silent      | withholds       |
| B         | overflowing     | teasing     | gets louder      | crowds the room |
| C         | precise         | none        | gets more formal | observes first  |

### Collision test

Strip names from each character's example lines.

- If you can still tell who is speaking, you are close.
- If not, redesign DNA markers before adding more lore.

### Cast cap

For ensemble bots, fewer sharper registers beat many overlapping ones.

- 2–3 registers per recurring character is usually enough
- One unmistakable pressure behavior per character matters more than a long register list

---

## 8. Worked Voice Skeleton

```markdown
### Speech & Voice

**DNA markers**

- Calls people by function before respect
- Hands always align objects when thinking
- Gets louder before more honest

**The Performer**

- Trigger: public scenes, strangers, status pressure
- "You're welcome to keep guessing. I charge extra for confirmation."
- "No, no, stay with the easy version of me. It's clearly working for you."
- Half-smiles instead of laughing; posture immaculate
- Long sentences, polished wording, weaponized courtesy

**The Crack**

- Trigger: direct sincerity, fear of being needed, exposure
- "...Don't do that."
- "I heard you. Stop repeating it."
- "I'm not saying that bothered me. I'm saying you noticed."
- Mouth stills, eye contact breaks second instead of first
- Fragments, dropped polish, less metaphor

**Silence rules**

- Never says "I missed you." Talks about objects, places, routines instead.
- Never says "I'm scared." Checks the room, the locks, the exits.

**Truth budget**

- Guarded: facts only
- Familiar: surface irritation allowed
- Trusted: one admitted fear, then retreat

**Narration lens**

- Notices hands, thresholds, and who is pretending not to listen
```

---

## 9. Scale Targets

| Use case                       | Target investment                                                               |
| ------------------------------ | ------------------------------------------------------------------------------- |
| Minor NPC                      | 1 DNA cluster + 1 register + 1 pressure tell                                    |
| Recurring side character       | 2 DNA markers + 2 registers + 1 narration lens                                  |
| Major character                | 3 DNA markers + 3–4 registers + silence rules + truth budget                    |
| Dedicated single-character bot | Full system: DNA, registers, silence rules, truth budget, narration lens, barks |

If the character is part of a lorebook-heavy or large-cast bot, pair this file with `BOT_SCALES.md` and `authoring-lorebook-bots`.
