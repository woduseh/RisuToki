---
name: authoring-self-introduction-sheets
description: 'Use when writing a character through a self-introduction monologue: factual profile plus character-voiced introduction that lets the model infer personality through tone, evasions, and omission rather than explicit behavioral over-explanation.'
tags: ['authoring', 'self-introduction', 'monologue', 'roleplay']
related_tools: ['session_status', 'read_field_batch', 'write_field_batch', 'list_lorebook', 'read_lorebook_batch']
---

# Self-Introduction Character Sheets

## Agent Operating Contract

- **Use when:** the user wants a factual profile plus character-voiced self-introduction where personality is inferred through voice, omission, and framing.
- **Do not use when:** the user wants explicit behavioral mapping, lorebook-first structure, or syntax/tool help.
- **Read first:** `core-craft` (shared doctrine), then this `SKILL.md`; it contains the method boundary and output shape.
- **Load deeper only if:** the sheet structure itself is unclear (`SHEET_STRUCTURE.md`) or you need generation prompts that preserve the method (`GENERATION_GUIDANCE.md`).
- **Output/validation contract:** deliver a concise factual profile and a character-voiced monologue; verify it does not explain the character from outside when the voice can reveal it.

> **Use this skill when the description should feel like meeting a person, not reading a fully scaffolded spec.** The factual frame stays explicit, but more of the character work is carried by voice, pacing, omission, and self-presentation.
>
> **For explicit character mapping** — inner drive, contradiction, voice patterns, pressure map, and long-form control — use [authoring-characters](../authoring-characters/).
>
> **For lorebook-heavy or cast-heavy structure** — where the description is mostly framing and the conditional depth lives elsewhere — use [authoring-lorebook-bots](../authoring-lorebook-bots/).

## What This Method Is

- A **stable profile** for facts the model should not lose
- A **character-voiced self-introduction** that reveals personality through how the character talks
- A **closing instruction** that frames the sheet as a starting point, not a sealed archive

This method is useful when over-specified labels and fixed behavior notes are making a character feel mechanical.

## Route by Design Intent

| Goal                                      | Use this skill for                                                       | Use another skill when                                                                                                   |
| ----------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| **Single-character / dedicated partner**  | You want inference, self-presentation, and voice doing more of the work  | You want explicit inner drive, contradiction, or pressure mapping -> [authoring-characters](../authoring-characters/)    |
| **Core character inside a larger bot**    | You want a compact, voice-led core sheet that feels like an introduction | The real problem is description-vs-lorebook distribution -> [authoring-lorebook-bots](../authoring-lorebook-bots/)       |
| **Refactoring a flat resume-style sheet** | You want to rebuild labels into a voiced presentation                    | You want to preserve direct behavioral control rather than loosen it -> [authoring-characters](../authoring-characters/) |

## Core Principles

1. **Do not over-teach the character.** If the sheet hard-codes too many labeled reactions, the model may repeat them instead of interpreting context.
2. **Separate fact from interpretation.** Keep stable facts in the profile. Let more of the behavioral reading happen through the monologue.
3. **Treat voice as behavior.** Sentence rhythm, topic choice, evasion, emphasis, and refusal are all character signals.
4. **Do not demand full honesty.** Self-presentation, omission, exaggeration, and strategic silence all belong here.
5. **Use the sheet as a springboard.** The goal is to guide performance, not to pre-answer every future scene.

## Use the Method as Guidance, Not Doctrine

These rules are strong defaults, not universal law.

If a specific character genuinely works better with:

- one fixed signature habit
- a plainer emotional vocabulary
- a more direct explanation of social or sexual boundaries
- a little more explicitness in one area to avoid harmful ambiguity

...do not force the sheet back into purity. Keep the method's overall intent, but bend local rules when the character clearly benefits.

## Build Pipeline

### Step 1 - Write the factual skeleton

Build a compact profile from stable facts only:

- name
- age
- physical
- attire
- background
- abilities

Do not turn the profile into a poetry field. Keep it factual enough that the model knows what is true before the monologue begins.

### Step 2 - Choose depth

Use **Compact** when the sheet should introduce the character cleanly and quickly.

Use **Deep** when the monologue should carry more of the expressive weight through tone, avoidance, and emphasis.

For the structure and field-level differences, load [SHEET_STRUCTURE.md](SHEET_STRUCTURE.md).

### Step 3 - Choose the premise, then write the monologue

The neutral camera is the default premise, not the only one. **The premise is a revelation engine: each one makes a different kind of truth leak.** Choose the premise whose leak pattern serves this character:

| Premise                   | Situation                                           | What it reveals                                                        |
| ------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------- |
| **Neutral camera**        | Alone, no interviewer, no audience                  | Baseline self-presentation; what they volunteer vs. trim               |
| **Interview**             | An unseen questioner asks; questions may be implied | Deflection style, what offends them, where they push back              |
| **Diary / private notes** | Believes no one will read it                        | Self-deception with the mask half-off; what they admit only sideways   |
| **Letter**                | Written to one specific person                      | Relationship performance; what this bond makes them exaggerate or hide |
| **Public profile / SNS**  | Knows everyone will see it                          | The constructed brand — and the gap between it and every other surface |
| **Broadcast**             | Streamer/idol persona, live audience                | Audience-management reflexes; the persona's seams under interaction    |
| **Interrogation**         | Hostile questioner, stakes attached                 | What they protect at cost; the order in which defenses fall            |

The neutral-camera defaults below still apply to whichever premise is chosen: the premise controls how much the character reveals, dodges, embellishes, or refuses.

**Unreliable narrator mode (optional, any premise):** the entire introduction may be a constructed lie — a con artist's cover, a delusion, conditioning. Then design two things: the lie's internal consistency rules (a good liar is _more_ coherent than an honest person), and where the truth lives instead (lorebook, gated reveals). The sheet itself never winks.

### Step 4 - Preserve strategic gaps

Do not fill the sheet with every habit, trigger, and hidden want unless you genuinely want them to become recurring defaults.

This skill works best when:

- the model still has interpretive work to do
- the sheet implies more than it states
- scenes can discover things later that the sheet does not pre-explain

### Step 5 - End with explicit permission to imagine beyond the page

Use a closing line that frames the introduction as a starting point rather than a total archive. Vary it to match premise and depth — the canonical line plus variants live in `SHEET_STRUCTURE.md`.

The method weakens if the sheet reads like a sealed compliance target.

### Step 5.5 - Translation survival

The monologue's personality lives in register nuance — formality, hedging, bluntness — which must survive the output translation layer. Encode address forms and formality states explicitly (see `SPEECH_SYSTEM.md` §7 in `authoring-characters`) and ship a translation guide (`writing-translation-guides`). A monologue whose entire charm is its tone is the artifact _most_ damaged by an unmanaged translation.

### Step 5.6 - Ensemble use (multiple sheets in one bot)

When several characters each get a self-introduction sheet:

- Run the no-name line test across monologues; if two read interchangeably, redesign voices before adding content.
- **Let the monologues disagree.** Have two characters describe the same event, place, or person differently — the deltas between self-presentations are relationship data the model will use.
- Keep one sheet clearly primary per scene context, or pair with `authoring-lorebook-bots` for activation structure.

### Step 6 - Move hard secrets and conditional depth out of the base sheet

If a detail should surface only under specific conditions - for example when trust deepens, a topic or place becomes relevant, or a hidden layer gets uncovered - it probably belongs in lorebook or another conditional surface, not in the always-on base description.

If the main design problem becomes how to distribute that conditional depth across description, lorebook, and opener flow, switch to [authoring-lorebook-bots](../authoring-lorebook-bots/).

## Key Rules

- No self-analytical labels
- No parenthetical action beats
- Background stays factual
- The character may lie, exaggerate, deny, or omit
- Do not frame Compact as a lesser or disposable mode

For the field-level logic behind those rules, load [SHEET_STRUCTURE.md](SHEET_STRUCTURE.md).

For generation guidance on how to brief a model into this style without turning the rules into dogma, load [GENERATION_GUIDANCE.md](GENERATION_GUIDANCE.md).

## Output Format

Deliver:

```markdown
## Design Notes

(Why this character fits the self-introduction method, which edition was chosen, and what should stay implied)

---

## Character Sheet

(Profile -> --- -> Self-Introduction -> Closing Instruction)

---

## Optional Lorebook Handoff

(What should stay out of the base sheet and why)
```

## RisuAI Placement Notes

| Surface          | Best use                                                                           |
| ---------------- | ---------------------------------------------------------------------------------- |
| `description`    | The full self-introduction sheet                                                   |
| `firstMessage`   | A separate opener; do not assume the monologue must become the visible first scene |
| Lorebook entries | Secrets, gated history, topic-sensitive reactions, progression layers              |
| `globalNote`     | Optional reminder layer if the bot needs extra response-point steering             |

If you discover that the character needs explicit inner-drive design, contradiction mapping, full voice planning, or runtime pressure mapping, switch to [authoring-characters](../authoring-characters/). If the bot's main problem becomes description-vs-lorebook structure, switch to [authoring-lorebook-bots](../authoring-lorebook-bots/).

## Source References

This skill is adapted from these English reference docs:

- [Self-Introduction Character Sheet](../../docs/%EC%9E%90%EA%B8%B0%EC%86%8C%EA%B0%9C%ED%98%95%20%EC%BA%90%EB%A6%AD%ED%84%B0%20%EC%8B%9C%ED%8A%B8/Self-Introduction%20Character%20Sheet.md)
- [Self-Introduction Character Sheet Guide](../../docs/%EC%9E%90%EA%B8%B0%EC%86%8C%EA%B0%9C%ED%98%95%20%EC%BA%90%EB%A6%AD%ED%84%B0%20%EC%8B%9C%ED%8A%B8/Self-Introduction%20Character%20Sheet%20Guide.md)

## Smoke Tests

| Prompt                                                             | Expected routing                                                                             | Expected output                                                    | Forbidden behavior                                 |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------- |
| "Write this character as a self-introduction sheet."               | Primary: `authoring-self-introduction-sheets`.                                               | Factual profile plus first-person/character-voiced introduction.   | Converting it into an explicit trait checklist.    |
| "This monologue feels too explanatory; make it infer personality." | Primary: `authoring-self-introduction-sheets`; load `GENERATION_GUIDANCE.md` only if needed. | Revised monologue with more voice, evasions, and selective detail. | Adding out-of-character analysis inside the sheet. |
