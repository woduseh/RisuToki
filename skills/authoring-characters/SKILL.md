---
name: authoring-characters
description: "Writes and refactors character descriptions for LLM roleplay. Produces performance-ready descriptions with behavioral depth, speech register systems, contrast pairs, and reaction patterns. Handles any input from keywords to full bios. Use when a user asks to create, improve, or analyze a character description for any LLM roleplay frontend."
---

# Character Description Authoring

## Core Principles

1. **The description is a performance brief.** Every sentence must answer: "How does this change what the LLM writes next?" If it doesn't shape output, cut it or move it to a lorebook.

2. **Behavior over labels.** Never write "cold but warm inside." Write what the character *does* that reads as cold, and what *slips through* that hints at warmth. Labels are inert; behavioral descriptions generate usable text.

3. **Invest in speech.** Appearance shows up once; dialogue shows up every turn. Example lines and speech patterns are among the strongest tools for shaping LLM output — the model pattern-matches against concrete examples far more than abstract descriptions.

4. **Leave strategic gaps.** Define who they are and how they operate. Never define what will happen to them, who they'll fall for, or what they'll feel in specific future moments. Plant principles; let the RP grow.

5. **Internal friction creates depth.** Give the character traits that pull in different directions — both logically grounded in their history. This is most important for protagonist-level characters; simpler supporting roles may work fine with a single strong trait.

---

## Input Handling

| Input Level | Example | Response |
|---|---|---|
| **Keywords only** | "cocky swordswoman, scarred, lonely" | Ask 2–3 clarifying questions (core appeal, tone, NSFW), then build freely |
| **Brief concept** | "28, ER doctor, emotionally distant, lost someone" | Confirm tone, then produce |
| **Detailed bio** | Full backstory, personality, relationships | Fill gaps, build speech system, restructure for performance |
| **Refactor request** | Existing description needing improvement | Diagnose weaknesses, restructure per this guide, strengthen speech |

### What to Ask vs. Decide

**Always ask:** Core appeal (if ambiguous), NSFW inclusion/boundaries, desired detail level.

**Decide yourself:** Specific appearance details, background events (within personality bounds), actual dialogue lines, contrast pair shapes.

---

## Build Pipeline

### Step 1 — Find the Core Drive

Identify a central motivation that drives the character. Not a goal ("become the strongest") but a *need* ("prove I deserve to exist"). This is your design compass.

**One approach — the "Why Chain":**
1. Take the surface-level desire from the user's input
2. Ask "Why does this matter to them?" iteratively until you hit a deeper need
3. Convert to active verb phrase: not "peace" but "to seal away every source of uncertainty that could hurt me"

**Adapt by character type:**
- **Complex protagonists** — a single deep core drive works well
- **Comedy / slice-of-life characters** — may work better with a dominant personality quirk or worldview than a deep psychological need
- **Supporting characters / NPCs** — a clear role + one defining trait may be sufficient; don't force depth that isn't needed

**Usage:** The core drive is a *design compass*, not copy-paste text. Derive behavioral principles and personality tensions from it. Embed its fingerprints into personality, background, and speech — but never state it outright.

**Validation:** Imagine 3 random scenes. Can you predict the character's gut reaction using the core drive? If not, revise.

### Step 2 — Design Contrast Pairs

Aim for at least one contrast pair for protagonist-level characters. More complex characters benefit from 2–3.

1. **Extract** prominent traits from user input
2. **Invert or warp** each to find an unexpected counterpart
3. **Ground each pair** in backstory — if you can't explain why both coexist, it's a contradiction, not a contrast
4. **Bridge extreme gaps** with connecting logic

| Surface Trait | Contrast | Bridge |
|---|---|---|
| World-class violinist | Domestic disaster | Practiced 12 hrs/day since age 5; never learned to cook |
| Aggressive, foul-mouthed | Deep fragility | Low self-worth → preemptive hostility as armor |
| Luxury gourmand | Instant noodle addict | Junk food is the one space where she drops the mask |

### Step 3 — Build Speech System

> **See [SPEECH_SYSTEM.md](SPEECH_SYSTEM.md) for full reference.**

Define speech registers (at least 2 for simple characters, 3–4 for complex ones). For each: trigger conditions, 2–3 example lines, nonverbal texture, and linguistic markers. Add transition patterns between registers and 1–2 consistency anchors.

Speech examples are high-value tokens — LLMs pattern-match against concrete dialogue more effectively than abstract personality descriptions.

### Step 4 — Define Inner Voice

The character's internal monologue is distinct from spoken dialogue. Define in 2–3 sentences:

- **Tone:** More honest than speech? More chaotic? More vulgar?
- **Self-awareness:** Do they understand their own motivations, or lie to themselves?
- **Speech gap:** How wide is the distance between what they think and what they say?

> *Example: "Sharp, self-critical, runs in clipped fragments. She narrates her own failures with surgical precision but is blind to her loneliness — frames it as 'efficiency' and genuinely believes it. The gap between internal clarity and emotional blindness is where her drama lives."*

### Step 5 — Map Reaction Patterns

Define instinctive reactions to core emotional triggers. Include 3–6 depending on character complexity. These are *tendencies*, not scripts.

| Trigger | Example Pattern |
|---|---|
| **Genuine kindness** | Freezes. Deflects with sarcasm. Replays the moment later in private. |
| **Direct criticism** | Counter-attacks immediately. Quietly adjusts behavior hours later without acknowledging it. |
| **Physical affection** | Tenses. Doesn't pull away, doesn't reciprocate. Body says "I don't know how" not "I don't want this." |
| **Being seen through** | Dangerously still. Switches to coldest register. The one thing that makes her genuinely afraid. |
| **Failure** | Internalizes completely. Perfect outward composure. Sleep suffers. Compensatory obsession intensifies. |

Pick triggers most relevant to the specific character.

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

### Speech & Voice
[Registers + example lines + transitions + anchors]
[Inner voice description]
[THIS SECTION GETS THE MOST TOKENS — see SPEECH_SYSTEM.md]

### Background
[Only the past that explains who they are now]
[Formative events, not chronological biography]
["This happened → so they became this" must be clear]

### Current Situation
[Emotional state at RP start]
[Recent events creating pressure]
[Active tensions or unresolved threads]
[What they know / don't know / are wrong about]

### Appearance & Physical Presence
[2–3 defining visual traits + quality of their presence]
[Movement habits, how they occupy space]
[Physical tics that appear in narration]
[Brief — favor presence over measurements]

### Reaction Patterns
[Trigger → instinctive response mappings]
[Can fold into Personality if token budget is tight]

### Abilities & Limitations
[Can do / can't do / can do with effort]
[Only if relevant to role or if constraints affect scenes]

### Knowledge & Blind Spots
[What they're expert in / ignorant of / wrong about]
[Misunderstandings and knowledge gaps drive drama]

### Likes & Dislikes
[Daily-life detail fuel. Keywords are fine here.]

### Hidden Depths
[What surfaces only after trust is built]
[Layer: public knowledge → private → secret]
[Long-RP reward content]
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

## Token Budget Guide

These are rough guidelines, not rigid rules. Adjust based on what matters most for the specific character.

| Budget | Strategy |
|---|---|
| **500–1,000** (Minimal) | Basic info + core personality with contrasts + 3 speech examples + current situation. Everything else → lorebook. |
| **1,000–2,000** (Standard) | Basic info + personality + speech (2–4 registers) + background summary + current situation + appearance |
| **2,000–4,000** (Full) | Complete structure. Detailed speech, reaction patterns, hidden depths, inner voice |

### Suggested Section Allocation (at ~2,000 tokens)

| Section | Approx. Share | Notes |
|---|---|---|
| Speech & Voice (registers + examples + transitions) | ~25–35% | Higher if character is dialogue-heavy |
| Personality (surface + interior + contrasts) | ~20% | |
| Background + Current Situation | ~15–20% | Higher if backstory drives current behavior |
| Basic Info + Appearance | ~10% | Favor presence over measurements |
| Reaction Patterns + Inner Voice | ~10% | Can fold into Personality if tight |
| Hidden Depths + Likes/Dislikes + Other | ~10% | |

Adjust these ratios to the character. A character defined by their profession might need more in Abilities. A character in a complex political situation might need more in Current Situation.

### Description vs. Lorebook

| Keep in Description | Move to Lorebook |
|---|---|
| Core personality + contrasts | Detailed career timeline |
| Speech registers + examples | Situation-specific behavior rules |
| Current emotional state + tensions | Keyword-triggered secrets/backstory |
| Key relationship dynamics | Detailed worldbuilding / organization lore |
| Ability scope | Detailed magic/tech mechanics |
| Inner voice + reaction patterns | Extended NPC relationship details |

---

## NSFW Handling

Apply only when the user requests it. The same "does this change behavior?" test applies.

| Include (Shapes Behavior) | Omit (Doesn't Shape Behavior) |
|---|---|
| Sexual experience level → confidence/anxiety | Specific body measurements |
| How personality manifests in intimacy | Anatomical color/detail catalog |
| Behavioral patterns (control, vulnerability, playfulness) | Isolated physical stats |
| Sensory sensitivities that affect action | Body hair status |

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
(Items cut for token reasons, formatted as lorebook entries with trigger keywords.)
```

---

## Adapting by Character Complexity

Not every character needs the full pipeline. Match your investment to the role:

| Character Type | Recommended Steps | Notes |
|---|---|---|
| **Protagonist** (main RP partner) | All steps | Full depth. This is what the pipeline is designed for. |
| **Major supporting** (recurring NPC) | Steps 1, 2, 3, 6 | Core drive + 1 contrast + speech DNA + compact template |
| **Minor NPC** | Steps 3, 6 (partial) | Speech DNA + key trait. 200–500 tokens. |
| **Comedy / slice-of-life** | Steps 2, 3, 5, 6 | Lean on speech quirks and reaction patterns. Inner drive can be lighter. |
| **Mystery / slow-reveal** | All steps, emphasize Hidden Depths | Layer information carefully. What they hide matters more than what they show. |

---

## Description Language

- Write the description in the language the RP will be conducted in (especially speech examples)
- For multilingual characters, write code-switching examples in the actual languages used
- Reference data (height, birthday) can be in any language
