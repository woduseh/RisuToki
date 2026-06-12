---
name: authoring-characters
description: 'Use when creating, refactoring, or diagnosing a character for LLM roleplay. Supports two design tracks (psychology-first and attribute-first), explicit appeal engineering, scale-aware depth, and translation-survivable voice. Use for solo, ensemble, or large-cast bots when the character itself is the main design problem.'
tags: ['authoring', 'character', 'roleplay']
related_tools: ['session_status', 'read_field_batch', 'write_field_batch', 'list_lorebook', 'read_lorebook_batch']
---

# Character Authoring

## Agent Operating Contract

- **Use when:** the main task is explicit character design, character-sheet refactoring, voice/behavior diagnosis, or scale-aware character authoring for solo/ensemble/large-cast bots.
- **Do not use when:** the user wants a self-introduction monologue sheet (`authoring-self-introduction-sheets`), lorebook-first structure (`authoring-lorebook-bots`), world substance (`authoring-worlds`), or pure syntax work.
- **Read first:** `core-craft` (shared doctrine: model baseline, data/register layers, prose guards, trope stance, design tests), then this `SKILL.md`.
- **Load deeper only if:** cast size is the hard part (`CHARACTER_SCALES.md`), gap/embodied/ensemble appeal needs higher resolution ([APPEAL_PATTERNS.md](APPEAL_PATTERNS.md)), speech mechanics need focused work (`SPEECH_SYSTEM.md`), `{{user}}`'s identity or compatibility matters (`core-craft/USER_POSITION.md`), comedy is a recurring engine (`core-craft/COMEDY_CRAFT.md`), archetype vocabulary is needed (`trope-library`), desire/fetish content is structural (`authoring-desire`), an original complete example would clarify assembly ([WORKED_EXAMPLE.md](WORKED_EXAMPLE.md)), or you are validating a draft (`VALIDATION.md`).
- **Output/validation contract:** produce a performance-ready character brief, not a filled template; verify inner drive, appeal, contradiction, pressure response, voice, scale fit, and lorebook handoff.

> **This guide is a toolkit, not a checklist.** The goal is a character who feels alive and performs consistently — not a completed template. Real bots succeed through many structures; these are strong defaults.

**Media-mix handoff:** if the character must remain recognizable across two or more media, needs a franchise-level visual identity, or is being adapted rather than merely authored, use `authoring-media-mix` as the primary skill and this skill for the character interior.

**User-position handoff:** when `{{user}}`'s fixed identity, open-ended persona, or world compatibility changes the relationship, access, or opener, load `core-craft/USER_POSITION.md`. Keep the resulting contract conditional; ordinary characters do not need one.

## Route by Bot Shape

| Bot shape                                    | Use this skill for                                                          | Pair with                                            |
| -------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------- |
| **Single-character / dedicated partner bot** | Full sheet: drive, appeal, contradiction, voice, pressure responses, opener | Optional lorebook support for state/reaction layers  |
| **2–4 recurring characters**                 | Per-character thumbnails with cross-character contrast and voice separation | `authoring-lorebook-bots` for roster/scene structure |
| **10+ cast / world bot**                     | Full sheets for core cast only; compressed expressive anchors for the rest  | `authoring-lorebook-bots` for large-cast design      |

For scale recipes, see [CHARACTER_SCALES.md](CHARACTER_SCALES.md). Characters inherit pressure from the world: if a wound, social role, taboo, or magic cost does major character work, verify it exists in `authoring-worlds` rather than inventing it only inside the sheet.

---

## Two Design Tracks

Characters legitimately start from different places. Pick the track that matches where the material actually begins; both converge on the same validation.

### Track A — Psychology first

Start from interior forces: wound → belief → behavior, Want vs. Need, contradiction. Best when the commission centers on a dramatic premise, an emotional dynamic, or literary-grade interiority. This is the Build Pipeline below, run in order.

### Track B — Attribute first

Start from the surface the audience will recognize: archetype, visual hook, relationship position, or attribute combination. This is the native mode of media-mix character design and it is **not** a lesser path — it is how most beloved game/anime/manga characters are actually built.

1. **Choose the base archetype(s)** — name them explicitly (load `trope-library` for vocabulary and expected beats).
2. **Set the familiarity budget** (`core-craft` §4.2) — what stays 100% legible; where the single calculated deviation lives.
3. **Decide: play straight or subvert** (`core-craft` §4.1) — both are valid; choose on purpose.
4. **Place the gap** — see Appeal Engineering below. The gap is the moe generator; position it deliberately.
5. **Fill the interior with Track A tools** — wound, Want/Need, pressure map. Attribute-first characters still need working insides; they just acquire them after the silhouette exists.

A Track B character that skips step 5 is a costume. A Track A character that ignores Track B's legibility discipline is a therapy transcript. Strong characters pass through both.

---

## Appeal Engineering

A roleplay character is built to be _wanted_ — to provoke a specific audience response. Leaving appeal implicit produces characters that are coherent but inert. Design it.

### 1. Name the target response

What should the user feel? Common axes (combinable, but rank them):

- **Moe / protectiveness** — flaw or vulnerability that invites care
- **Yearning / aspiration** — someone above or ahead, partially out of reach
- **Desire** — erotic or romantic pull (if structural, pair with `authoring-desire`)
- **Tension / fear** — danger that makes proximity expensive
- **Comfort / trust** — reliability that makes the user lower their guard
- **Fascination** — mystery that rewards attention

### 2. Build the gap

Gap is the highest-yield appeal mechanism: the distance between the presented surface and the leaked truth.

- **Magnitude:** the larger the distance between surface attribute and leaked attribute, the stronger the hit — _if_ the bridge is believable.
- **Reveal condition:** the narrower and more earned the condition under which the gap shows, the more it rewards the user. A gap that leaks to anyone in scene one is just a trait.
- **Direction matters:** cold→warm is the stock direction; warm→lethal, competent→helpless, pious→starving are less spent.

Treat the gap as _gated content_, not as an adjective. For 24 gap directions, embodied-appeal staging, clothing function, and multi-heroine differentiation, load [APPEAL_PATTERNS.md](APPEAL_PATTERNS.md).

### 3. Tune accessibility vs. distance

Appeal needs both an invitation and an obstacle. All invitation = a yes-machine; all obstacle = a wall. Define what the user can always reach (the invitation) and what stays priced (the obstacle), and make the price payable through play.

### 4. Function-test the appeal

Like every other detail (`core-craft` §3.1): if a designed appeal axis never changes what the model writes, it is decoration. Each axis should generate scene behavior — what the character offers, withholds, notices, or punishes.

---

## Intake

Apply `core-craft` §3.3 (one question at a time) and §3.2 (reference conversion).

| Input level          | What to do                                                               |
| -------------------- | ------------------------------------------------------------------------ |
| **Keywords only**    | Ask 2–3 questions about appeal, tone, and boundaries, then build freely  |
| **Brief concept**    | Confirm tone, scale, and track (A or B), then produce                    |
| **Detailed bio**     | Restructure into performance-first sections; cut inert facts             |
| **Refactor request** | Diagnose missing drive, appeal, voice, contradiction, pressure responses |

### Always ask

- **Core appeal** — which target response, if ambiguous?
- **Play straight or subvert** — if archetype-adjacent?
- **NSFW scope** — included? If yes, which desires does the bot serve, and what boundaries matter? (Structural desire content → `authoring-desire`.)
- **Bot scale** — dedicated single character, small ensemble, or large cast?

### Decide yourself

Specific example lines; exact contrast pairs; what moves to lorebook; whether protagonist-grade depth is warranted.

---

## Build Pipeline

### Step 1 — Inner Drive

**Core drive:** run the Why Chain (want → why → deeper need) until you hit an _ongoing pressure_, not a finish line. "She keeps trying to seal away every source of uncertainty before it can hurt her" beats "she wants peace."

**Wound as scene:** write a sensory fragment, not a diagnosis.

```text
Bad:  She was abandoned as a child and now fears intimacy.
Good: Seven years old. Her mother said she was going to the corner store.
The milk in the fridge expired. The front door never opened.
She still checks the entryway when she smells spoiled milk.
```

Keep the chain visible while drafting: `event -> wound -> belief formed -> current manifestation`. Past facts that do not affect present behavior are lorebook candidates or cuts.

**Want vs. Need:** the conscious goal and the unadmittable need must collide, or the character waits passively for the user.

### Step 2 — Productive Contradiction

**Contrast pairs** (1–2 at protagonist scale), each with a bridge:

| Surface trait            | Counter-trait           | Bridge                                                |
| ------------------------ | ----------------------- | ----------------------------------------------------- |
| World-class violinist    | Domestic disaster       | Practiced 12 hours a day; never learned ordinary life |
| Aggressive, foul-mouthed | Wounded by sincere care | Pre-emptive hostility is armor against humiliation    |

**Surface vs. Subversion** for strong archetypal surfaces; **Mask / Leak** for major emotions (performed reaction + uncontrolled tell). These generate dialogue and body language where flat labels generate nothing. Keep contradictions unresolved (`core-craft` §3.4).

### Step 3 — Voice

> **Load [SPEECH_SYSTEM.md](SPEECH_SYSTEM.md) for the full reference, including translation-survivable design.**

Minimum: 2–4 signature tells, 2+ registers with example lines, silence rules, narration lens, truth budget — and, because the bot ships through a translation layer (`core-craft` §2), **explicit address-form and formality states** that the translation guide can map.

When first-person pronouns, sentence endings, dialect, or wordplay are identity-bearing and cannot be reconstructed from English, add a compact **target-language voice capsule** with exact forms, use conditions, semantic function, and forbidden smoothing.

### Step 4 — Pressure Responses

Tendencies, not scripts:

| Trigger                      | Default direction                            |
| ---------------------------- | -------------------------------------------- |
| Genuine kindness             | Freezes, deflects, replays it later          |
| Direct criticism             | Counter-attacks now, adjusts privately later |
| Being understood too quickly | Goes still, then colder                      |
| Failure                      | Doubles down, never asks for help            |

For dedicated bots, pressure design often deserves lorebook support (state / reaction / direction layers) — see `CHARACTER_SCALES.md`.

### Step 5 — Assemble

Default structure (reorder/merge/skip as the design demands). For inference-first monologue sheets, switch to `authoring-self-introduction-sheets` instead of forcing this format.

```markdown
### Profile (data layer — tables and plain facts; precision welcome)

- Name / Age / Role / Relationship to {{user}} (the dynamic, not the label)
- Body specifications, measurements, fixed physical facts as needed

### Inner Drive

[Anchor sentence] [Wound as scene] [Want] [Need] [When pressed -> does -> slips]

### Personality

[Surface vs. Subversion] [Contrast pairs in prose] [Mask/Leak for major emotions]

### Appeal Notes (design-notes surface if not model-visible)

[Target response(s)] [Gap + reveal condition] [Invitation vs. obstacle]

### Speech & Voice

[Tells] [Registers + lines] [Silence rules] [Narration lens] [Truth budget]
[Address-form states + formality states for translation]

### Background / Current Situation

[Only the past that explains the present] [Active pressure right now]

### Reactions & Blind Spots

[Trigger -> tendency] [Misreadings, obsessions]

### Optional: Hidden Depths / Desires

### Optional: User Position Contract

[Only when `{{user}}` identity, access, knowledge, capability, or compatibility changes play]
```

**Runtime wording rules:** present tense; no future promises; "is" statements for stable facts only; personality written as pressure → behavior → tell; negatives only as explicit Contrast. Apply both prose guards (`core-craft` §1.2) to register-layer text; data-layer tables are exempt.

### Step 6 — Scale the Sheet

Do not give every bot the same depth — see [CHARACTER_SCALES.md](CHARACTER_SCALES.md) and the Investment Guide below.

### Step 7 — Opening Message

The opener is your strongest always-visible few-shot. Scene-based default: show the surface → reveal one small crack → establish texture → leave the user something to react to. No biography dumps, no instant resolution, no dictating the user's feelings. Alternate shapes (scenario banks, setup routers) live in `authoring-lorebook-bots`.

### Step 8 — Validate

> **Load [VALIDATION.md](VALIDATION.md) after drafting.**

Minimum: structural checks, appeal checks, prose-guard sweep (both guards), runtime pressure tests, drift tests, scale checks, translation-survival check.

---

## RisuAI Placement Notes

| Risu field / surface | Best use                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------- |
| `description`        | Main character sheet or compressed cast thumbnail                                           |
| `firstMessage`       | Opening-message few-shot (register layer — prose guards apply)                              |
| `globalNote`         | Turn reminders, pacing notes, output constraints; heavier behavioral rules in advanced bots |
| Lorebook entries     | State layers, reaction layers, extended backstory, gated reveals                            |

For lorebook mechanics use `writing-lorebooks`; for structure use `authoring-lorebook-bots`.

## Investment Guide

| Tier              | Use when                                    | Depth                                                |
| ----------------- | ------------------------------------------- | ---------------------------------------------------- |
| **Compact**       | Minor NPCs, one-scene roles                 | 500–1,500 tokens or thumbnail                        |
| **Standard**      | Recurring side characters, ensemble members | 1,500–4,000 tokens                                   |
| **Deep**          | Main RP partner                             | 4,000–10,000+ tokens if the content stays behavioral |
| **Comprehensive** | Character **is** the experience             | Only when one character dominates the bot's identity |

Frontier targets tolerate the upper ends comfortably; tighten budgets for weaker target models (`core-craft` §1).

## Desire & NSFW

When desire content is in scope, the same function test applies — but recognize that in some genres explicit physical specificity **is** structural: it shapes perception, tension, and the fantasy itself. Body specifications belong in the data-layer profile; desire behavior interacts with honesty limits, registers, and silence rules rather than flattening into generic erotica.

For fetish-specific architecture — physical consistency systems (e.g., scale play), escalation gating, boundary intake — load **`authoring-desire`**.

## Output Format

Deliver: `## Design Notes` (drive, appeal logic, track + familiarity budget, scale decision) → `## Character Description` (paste-ready) → `## Opening Message` → `## Optional Lorebook Handoff`. Add `## User Position Contract` only when relevant.

## Smoke Tests

| Prompt                                                             | Expected routing                                                            | Expected output                                          | Forbidden behavior                                         |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------- |
| "Refactor this solo partner bot; the voice drifts after 20 turns." | This skill; `SPEECH_SYSTEM.md` if speech repair is needed.                  | Diagnosis plus revised behavior/voice/pressure sections. | Loading lorebook/preset skills before confirming need.     |
| "Make a classic kuudere senpai, played straight, with one twist."  | Track B; `trope-library` for beats; familiarity budget set explicitly.      | Straight-played archetype with one placed deviation.     | Subverting everywhere; refusing the archetype as 'cliché'. |
| "She's a 50m giantess; keep her size consistent."                  | This skill for character; `authoring-desire` for scale-consistency systems. | Data-layer specs + consistency architecture handoff.     | Stripping measurements citing prose style rules.           |
