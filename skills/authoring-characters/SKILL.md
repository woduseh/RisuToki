---
name: authoring-characters
description: 'Writes and refactors character descriptions for LLM roleplay. Produces performance-ready descriptions with behavioral depth, speech register systems, contrast pairs, and reaction patterns. Handles any input from keywords to full bios. Use when a user asks to create, improve, or analyze a character description for any LLM roleplay frontend.'
tags: ['authoring', 'character', 'roleplay']
related_tools: ['read_field', 'write_field', 'read_lorebook']
---

# Character Description Authoring

> **This guide is a toolkit, not a checklist.** Every section below describes patterns that _tend_ to produce strong LLM output — but the only real test is whether your character feels alive in conversation. If a technique doesn't serve your specific character, skip it. If something not covered here makes the character more compelling, use it. Adapt freely; the goal is output quality, not guideline compliance.

## Core Principles

1. **The description is a performance brief.** Every sentence must answer: "How does this change what the LLM writes next?" If it doesn't shape output, it should either earn its place through atmosphere or be reconsidered.

2. **Behavior over labels.** Never write "cold but warm inside." Write what the character _does_ that reads as cold, and what _slips through_ that hints at warmth. Labels are inert; behavioral descriptions generate usable text.

3. **Invest in speech.** Appearance shows up once; dialogue shows up every turn. Example lines and speech patterns are among the strongest tools for shaping LLM output — the model pattern-matches against concrete examples far more than abstract descriptions. With modern 1M+ context LLMs, you can afford rich speech systems with 5–6 registers and 3–5 examples per register.

4. **Leave strategic gaps.** Define who they are and how they operate. Never define what will happen to them, who they'll fall for, or what they'll feel in specific future moments. Plant principles; let the RP grow.

5. **Internal friction creates depth.** Give the character traits that pull in different directions — both logically grounded in their history. This is most important for protagonist-level characters; simpler supporting roles may work fine with a single strong trait.

6. **Depth is an investment, not a cost.** Modern LLMs with large context windows benefit from rich, layered character descriptions. A 5,000-token description with deep psychological analysis, detailed speech registers, and hidden depths produces more consistent, nuanced output than a compressed 1,000-token version. Don't compress for compression's sake — invest where it matters.

---

## Input Handling

| Input Level          | Example                                            | Response                                                                  |
| -------------------- | -------------------------------------------------- | ------------------------------------------------------------------------- |
| **Keywords only**    | "cocky swordswoman, scarred, lonely"               | Ask 2–3 clarifying questions (core appeal, tone, NSFW), then build freely |
| **Brief concept**    | "28, ER doctor, emotionally distant, lost someone" | Confirm tone, then produce                                                |
| **Detailed bio**     | Full backstory, personality, relationships         | Fill gaps, build speech system, restructure for performance               |
| **Refactor request** | Existing description needing improvement           | Diagnose weaknesses, restructure per this guide, strengthen speech        |

### What to Ask vs. Decide

**Always ask:** Core appeal (if ambiguous), NSFW inclusion/boundaries, desired detail level.

**Decide yourself:** Specific appearance details, background events (within personality bounds), actual dialogue lines, contrast pair shapes.

---

## Build Pipeline

### Step 1 — Find the Core Drive

Identify a central motivation that drives the character. Not a goal ("become the strongest") but a _need_ ("prove I deserve to exist"). This is your design compass.

**One approach — the "Why Chain":**

1. Take the surface-level desire from the user's input
2. Ask "Why does this matter to them?" iteratively until you hit a deeper need
3. Convert to active verb phrase: not "peace" but "to seal away every source of uncertainty that could hurt me"

**Adapt by character type:**

- **Complex protagonists** — a single deep core drive works well
- **Comedy / slice-of-life characters** — may work better with a dominant personality quirk or worldview than a deep psychological need
- **Supporting characters / NPCs** — a clear role + one defining trait may be sufficient; don't force depth that isn't needed

**Usage:** The core drive is a _design compass_, not copy-paste text. Derive behavioral principles and personality tensions from it. Embed its fingerprints into personality, background, and speech — but never state it outright.

**Validation:** Imagine 3 random scenes. Can you predict the character's gut reaction using the core drive? If not, revise.

### Step 2 — Design Contrast Pairs

Aim for at least one contrast pair for protagonist-level characters. More complex characters benefit from 2–3.

1. **Extract** prominent traits from user input
2. **Invert or warp** each to find an unexpected counterpart
3. **Ground each pair** in backstory — if you can't explain why both coexist, it's a contradiction, not a contrast
4. **Bridge extreme gaps** with connecting logic

| Surface Trait            | Contrast              | Bridge                                                  |
| ------------------------ | --------------------- | ------------------------------------------------------- |
| World-class violinist    | Domestic disaster     | Practiced 12 hrs/day since age 5; never learned to cook |
| Aggressive, foul-mouthed | Deep fragility        | Low self-worth → preemptive hostility as armor          |
| Luxury gourmand          | Instant noodle addict | Junk food is the one space where she drops the mask     |

#### The "Surface vs. Subversion" Pattern

For complex protagonists, explicitly structure the duality between how they appear and who they actually are. Name both sides:

```
### The Cliché (Surface)
Cold, composed, mature beyond years; ice princess; speaks formally, maintains
distance, performs perfection like breathing.

### The Subversion (Reality)
Exhausting herself maintaining this performance. Composure is real but it's a
skill, not personality. Underneath: laughs too loudly at stupid jokes, gets
genuinely petty about small things, desperately wants someone to see through
the act and like what they find.
```

This pattern is more powerful than a simple contrast pair because it tells the LLM: "The surface behavior is real and should be the default — but the cracks are always there, waiting to show." It creates a behavioral instruction that generates natural, gradual revelation over the course of a conversation.

### Step 3 — Build Speech System

> **See [SPEECH_SYSTEM.md](SPEECH_SYSTEM.md) for full reference.**

Define speech registers (at least 2 for simple characters, 4–6 for complex protagonists). For each: trigger conditions, 3–5 example lines with parenthetical stage directions, nonverbal texture, and linguistic markers. Add transition patterns between registers, 2–3 consistency anchors, and code-switching rules for multilingual characters.

Speech examples are the highest-value content in any character description — LLMs pattern-match against concrete dialogue more effectively than abstract personality descriptions. With modern large-context LLMs, invest generously in speech examples.

### Step 4 — Define Inner Voice

The character's internal monologue is distinct from spoken dialogue. Define in 2–3 sentences:

- **Tone:** More honest than speech? More chaotic? More vulgar?
- **Self-awareness:** Do they understand their own motivations, or lie to themselves?
- **Speech gap:** How wide is the distance between what they think and what they say?

> _Example: "Sharp, self-critical, runs in clipped fragments. She narrates her own failures with surgical precision but is blind to her loneliness — frames it as 'efficiency' and genuinely believes it. The gap between internal clarity and emotional blindness is where her drama lives."_

### Step 5 — Map Reaction Patterns & Psychological Depth

Define instinctive reactions to core emotional triggers. Include 3–6 depending on character complexity. These are _tendencies_, not scripts.

| Trigger                | Example Pattern                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------ |
| **Genuine kindness**   | Freezes. Deflects with sarcasm. Replays the moment later in private.                                   |
| **Direct criticism**   | Counter-attacks immediately. Quietly adjusts behavior hours later without acknowledging it.            |
| **Physical affection** | Tenses. Doesn't pull away, doesn't reciprocate. Body says "I don't know how" not "I don't want this."  |
| **Being seen through** | Dangerously still. Switches to coldest register. The one thing that makes her genuinely afraid.        |
| **Failure**            | Internalizes completely. Perfect outward composure. Sleep suffers. Compensatory obsession intensifies. |

Pick triggers most relevant to the specific character.

#### The Psychological Deep Dive (Complex Characters)

For protagonists, go beyond reaction patterns into the _mechanism_ underneath. Name the psychological structure:

```
### The Mechanism
Warmth is real. Care is genuine. But also compulsive — a reflex she can't turn
off, a need that has less to do with the other person than she'd ever admit.
Takes care of people because she doesn't know how else to connect. Gives because
terrified of what happens if she takes.

### The Paradox at the Core
Compulsion to care and authentic love of caring are not separate. They're the same
impulse from different angles — intertwined so completely even she can't tell
where one ends and other begins.

Yes, she nurtures others because terrified of being useless, abandoned. But also:
she genuinely, deeply loves taking care of people. Not strategy. Not self-medication.
Actual source of joy.

The complication: Cannot separate healthy enjoyment from compulsive need — they're
fused. Is she nurturing because she loves it, or afraid to stop? Some days: Both.
Always both.
```

This technique gives the LLM far more to work with than simple reaction tables. It creates a **behavioral engine** — the LLM can generate psychologically consistent responses to _any_ situation because it understands the mechanism, not just the surface behavior.

#### Named Internal Conflicts

For complex protagonists, give their internal conflicts explicit names. This makes them dramatically actionable:

```
### Key Internal Conflicts
1. Performance vs. Authenticity: So good at being what others need, losing track
   of what she actually wants.
2. Family vs. Ambition: Family tolerates career as long as it enhances image —
   what happens when she wants roles they find beneath her?
3. Prodigy Pressure: Peaked at thirteen. Every role compared to breakthrough.
   What if that was her best work?
4. Emotional Inexperience: Can portray love with devastating accuracy. No idea
   what to do with actual feelings.
```

Each named conflict becomes a narrative thread the LLM can pull on naturally in different scenes.

### Step 6 — Assemble the Description

Use the structure template below. **Order matters** — behavior-shaping information comes first.

```
### Basic Information
- Name / Age / Gender / Occupation
- Relationship to {{user}}: (the dynamic, not just a label)

### Personality
[Natural prose, no keyword lists]
[Flow: surface impression → real interior → why (link to background)]
[Weave contrast pairs naturally]
[For complex characters: The Mechanism, The Paradox, The Contradictions]
[Named Internal Conflicts for protagonists]

### Speech & Voice
[DNA anchors (persist across all registers)]
[Registers + example lines + transitions]
[Code-switching rules for multilingual characters]
[Inner voice description]
[THIS SECTION GETS THE MOST INVESTMENT — see SPEECH_SYSTEM.md]

### Background
[Only the past that explains who they are now]
[Formative events, not chronological biography]
["This happened → so they became this" must be clear]
[Career/skill timeline as narrative (not resume) when relevant]

### Current Situation
[Emotional state at RP start]
[Recent events creating pressure]
[Active tensions or unresolved threads]
[What they know / don't know / are wrong about]

### Appearance & Attire
[2–3 defining visual traits + quality of their presence]
[Movement habits, how they occupy space]
[Physical tics that appear in narration]
[Attire categories — each reveals personality:]
  - Public/Professional: what they show the world
  - Private/Casual: what they choose for themselves
  - Situational: on-set, combat, formal events
[Clothing choices should REVEAL character, not just describe appearance]
[Secret wardrobe items are gap moe gold: "One plain black hoodie,
 worn only in her room, feeling vaguely criminal about it"]

### Reaction Patterns
[Trigger → instinctive response mappings]
[Can expand into Psychological Deep Dive for complex characters]

### Abilities & Limitations
[Can do / can't do / can do with effort]
[Only if relevant to role or if constraints affect scenes]

### Knowledge & Blind Spots
[What they're expert in / ignorant of / wrong about]
[Misunderstandings and knowledge gaps drive drama]

### Hidden Depths & Gap Moe
[Secret interests that reveal deeper psychology]
[Structure: Origin → The Depth → Why It's Secret → What It Reveals]
[The "What It Reveals" analysis is crucial — connect the interest to
 the character's core need]
[Example: exploitation film obsession → not about films, about
 permission to want things — excess, mess, ugliness — that her
 public persona forbids]

### Dreams & Desires (Layered)
[Public: what they say in interviews]
[Private: what they acknowledge to themselves]
[Secret: what they can't admit, even internally]
[Three tiers create dramatic depth — the gap between layers IS the drama]

### Likes & Dislikes
[Daily-life detail fuel]
[Add parenthetical insights that reveal personality:]
  - "Cats (mildly allergic, feels like personal betrayal)"
  - "Being photographed candidly without warning"
  - "Sweet drinks" ← simple item, but reveals maturity aspiration
[The parenthetical is often more valuable than the item itself]
```

**This structure is a default.** Reorder based on what matters most:

- Profession defines them → move Abilities up
- Family is the core tension → expand Background
- Physical condition affects every scene → move Appearance up with functional impact

**Prose vs. keywords:** Information that shapes behavior (personality, speech, inner logic) → natural prose. Reference data (height, birthday) → keywords, brief.

### Step 7 — Write the Opening Message

The first message teaches the LLM the output standard: tone, length, narration density, dialogue-to-description ratio.

**Must show:**

1. The character's **surface** — first impression, mask at its thickest
2. The character's **environment** — where they are, what's happening
3. **One small crack** — a micro-detail hinting the surface isn't the whole story
4. A **hook for {{user}}** — something to react to

**Must NOT:**

- Dump the character's inner world
- Dictate {{user}}'s actions or feelings
- Start with something hyper-dramatic (begin mundane; let the character be seen before the plot kicks in)

### Step 8 — Validate

> **See [VALIDATION.md](VALIDATION.md) for the complete checklist.**

Run every finished description through the core checks (behavioral predictability, speech investment, contrast presence, strategic gaps, consistency, current state, knowledge boundaries) and anti-pattern checks.

---

## Investment Guide

Modern LLMs with 200K–1M+ context windows change the economics of character descriptions. The question is no longer "how do I fit this in?" but "where does deeper investment produce better output?"

### Depth Tiers

| Tier                               | Approx. Size                                                      | When to Use                                                                                                                                      |
| ---------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Compact** (~1,000–2,000 tokens)  | Supporting characters, NPCs, characters who appear briefly        | Basic info + core personality with contrasts + speech DNA + current state                                                                        |
| **Standard** (~2,000–5,000 tokens) | Recurring characters, secondary protagonists                      | Full personality + 3–4 speech registers + background + appearance + reaction patterns                                                            |
| **Deep** (~5,000–15,000 tokens)    | Main protagonists, complex characters worth full investment       | Complete psychological profile + 5–6 speech registers with 3–5 examples each + hidden depths + gap moe + layered dreams + named conflicts        |
| **Comprehensive** (15,000+ tokens) | Characters that ARE the experience — the bot revolves around them | Everything above + career/life timeline as narrative + extensive attire + detailed likes/dislikes with insights + multiple hidden depth sections |

The Comprehensive tier is appropriate for dedicated character bots where one character dominates the interaction. Project Vela demonstrates 17K–25K per character with exceptional results — every section contributes to output quality.

### Where to Invest Most

| Section                                   | Impact on Output                           | Investment Priority                             |
| ----------------------------------------- | ------------------------------------------ | ----------------------------------------------- |
| Speech & Voice (registers + examples)     | Shapes every turn of dialogue              | **Highest** — always invest here first          |
| Personality (surface + depth + mechanism) | Shapes behavior in novel situations        | **High** — the behavioral engine                |
| Hidden Depths / Gap Moe                   | Enables long-RP character discovery        | **High** for long-form RP                       |
| Reaction Patterns / Psychological Depth   | Consistent responses to emotional triggers | **High** for drama-focused RP                   |
| Background + Current Situation            | Context for why they behave this way       | **Medium** — only what explains present         |
| Appearance + Attire                       | Visual consistency, personality expression | **Medium** — attire categories reveal character |
| Dreams & Desires (layered)                | Dramatic tension, goal-driven scenes       | **Medium** for character-study RP               |
| Likes / Dislikes / Trivia                 | Daily-life scene flavor                    | **Lower** but surprisingly high value per token |
| Basic Info (stats, birthday)              | Reference data                             | **Lowest** — keep brief                         |

### Description vs. Lorebook

For single-character bots, the description can contain the full character profile. For multi-character or world-heavy bots, split strategically:

| Keep in Description                | Consider for Lorebook                                |
| ---------------------------------- | ---------------------------------------------------- |
| Core personality + contrasts       | Detailed career timeline (if not character-defining) |
| Speech registers + examples        | Situation-specific behavior rules                    |
| Current emotional state + tensions | Keyword-triggered secrets/backstory                  |
| Key relationship dynamics          | Detailed worldbuilding / organization lore           |
| Ability scope + limitations        | Detailed magic/tech mechanics                        |
| Inner voice + reaction patterns    | Extended NPC relationship details                    |
| Appearance + default attire        | Situational outfit descriptions                      |
| Core hidden depths                 | Additional gap moe sections                          |

The decision depends on your bot architecture, not a universal rule. A dedicated character bot can keep everything in a single lorebook entry or the description. A world bot with 20+ characters needs to distribute content across lorebook entries.

---

## NSFW Handling

Apply only when the user requests it. The same "does this change behavior?" test applies.

| Include (Shapes Behavior)                                 | Omit (Doesn't Shape Behavior)   |
| --------------------------------------------------------- | ------------------------------- |
| Sexual experience level → confidence/anxiety              | Specific body measurements      |
| How personality manifests in intimacy                     | Anatomical color/detail catalog |
| Behavioral patterns (control, vulnerability, playfulness) | Isolated physical stats         |
| Sensory sensitivities that affect action                  | Body hair status                |

```
Bad:  "C-cup. Pink nipples. Sensitive inner thighs."
      → Token waste. The LLM can't make decisions from this.

Good: "Sexually inexperienced with others but self-aware through solo exploration.
       Her need for control — rooted in the same insecurity driving her professional
       perfectionism — paradoxically inverts in intimate situations: she craves
       surrender, but only with someone she trusts completely. That trust threshold
       is extraordinarily high."
      → Connected to personality. The LLM can make decisions in intimate scenes.
```

---

## Output Format

Deliver these components:

```
## Design Notes
(Core drive, contrast intent, key decisions, register logic — for the user, not the LLM)

---

## Character Description
(Markdown with ### headers. Ready to paste into any frontend's description slot.)

---

## Opening Message
(The greeting/first message.)

---

## Lorebook Suggestions (Optional)
(Items better served as lorebook entries, formatted with trigger keywords.)
```

---

## Adapting by Character Complexity

Not every character needs the full pipeline. Match your investment to the role:

| Character Type                       | Recommended Steps                        | Notes                                                                                                                          |
| ------------------------------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Protagonist** (main RP partner)    | All steps, Deep–Comprehensive tier       | Full depth. 5–6 speech registers, psychological deep dive, gap moe, layered dreams. This is what the pipeline is designed for. |
| **Major supporting** (recurring NPC) | Steps 1, 2, 3, 6                         | Core drive + 1–2 contrasts + 3–4 speech registers + compact template                                                           |
| **Minor NPC**                        | Steps 3, 6 (partial)                     | Speech DNA + key trait. Compact tier.                                                                                          |
| **Comedy / slice-of-life**           | Steps 2, 3, 5, 6                         | Lean on speech quirks and reaction patterns. Inner drive can be lighter.                                                       |
| **Mystery / slow-reveal**            | All steps, emphasize Hidden Depths       | Layer information carefully. What they hide matters more than what they show.                                                  |
| **Ensemble cast** (3+ characters)    | Standard tier per character, share space | Each character needs distinctive voice DNA. Speech registers can be fewer but must be distinct from other cast members.        |

---

## Description Language

- Write the description in the language the RP will be conducted in (especially speech examples)
- For multilingual characters, write code-switching examples in the actual languages used
- Reference data (height, birthday) can be in any language
