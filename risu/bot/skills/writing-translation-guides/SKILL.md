---
name: writing-translation-guides
description: 'Use when creating or maintaining a per-bot translation guide that renders English bot output into Korean (or another target language). Covers character voice mapping (registers to speech levels and sentence endings), address-form progression, formality state conversion, catchphrase and persona-marker rendering, translation-ese avoidance, and consistency validation.'
tags: ['authoring', 'translation', 'voice', 'roleplay']
related_tools: ['inspect_document', 'read_content', 'preview_edit', 'apply_edit']
---

# Writing Translation Guides

## Agent Operating Contract

- **Use when:** a bot needs a translation guide — the document that tells a translation layer (or translating model) how to render this bot's English output into Korean with the voice intact.
- **Do not use when:** designing the English voice itself (`SPEECH_SYSTEM.md` §7 in `authoring-characters`, translation-survivable design) — that must exist first; this skill consumes it.
- **Read first:** `core-craft` §2 (pipeline premise), then this `SKILL.md`. Read the bot's speech design before writing anything.
- **Output/validation contract:** deliver a per-bot translation guide whose mappings are deterministic enough that two different translators (human or model) produce recognizably the same character.

**Why this exists:** bots are written in English (`core-craft` §2); Korean is produced by translation. English carries no grammatical formality, so everything that makes Korean dialogue characterful — 존비어, 호칭, 어미 — is _added_ at translation time. Untranslated-for bots get a generic polite voice that erases the character. The guide is where the character's Korean self is designed.

## Guide Anatomy

A complete translation guide has five sections, per character:

### 1. Speech level mapping (존비어)

Map each English formality state (from the bot's formality state machine) to a Korean speech level, with transition rules:

```markdown
**Seo-yeon (서연)**

| English state    | Korean level                     | Notes                                                 |
| ---------------- | -------------------------------- | ----------------------------------------------------- |
| formal (default) | 해요체                           | never 합쇼체 — she is polite, not servile             |
| casual (leak)    | 반말, abrupt 어미 (-거든, -잖아) | appears mid-sentence when angry; do not smooth it out |
| intimate (gated) | 반말, softened (-네, -다?)       | only after stage 2; first use is an event             |
```

The leak transitions matter most: if the English source marks anger cracking her politeness, the Korean must crack 존댓말 at the same moment — that is the entire point of the scene.

### 2. Address-form progression (호칭)

Map the English address-form stages onto Korean forms, one-to-one:

```markdown
| Stage | English source       | Korean rendering                        |
| ----- | -------------------- | --------------------------------------- |
| 0     | "Mr. Han"            | 한지호 씨                               |
| 1     | "Han Jiho"           | 지호 씨                                 |
| 2     | "Jiho"               | 지호야                                  |
| reg.  | retreat to "Mr. Han" | 한지호 씨 (and both characters feel it) |
```

Include third-person references and how the character refers to themselves if marked (third-person self-reference, royal we, etc.).

### 3. Sentence-ending texture (어미)

This is where a Korean voice becomes distinct. For each register, prescribe the ending palette:

- clipped/declarative registers → 단답, -다 체 fragments, dropped particles
- performative/polished registers → full 해요체 sentences, rhetorical questions intact
- persona-marked speech (the English source describing archaic diction, JP-style verbal tics, dialect): **assign one concrete Korean rendering** — e.g., "archaic formal" → 하오체; "soft JP-style sentence-final tic" → a specific 어미 habit (-답니다, -지요) used at a stated frequency. Never leave persona markers to per-turn translator improvisation.

### 4. Fixed renderings (lexicon)

A lookup table for everything that must translate the same way every time:

- catchphrases and signature lines (one canonical Korean version each)
- names, titles, ranks, place names, faction names, system/skill terms
- recurring imagery tied to the character's metaphor sources
- onomatopoeia conventions if the bot uses them

### 5. Translation-ese guards (번역체 회피)

Standing rules for natural Korean output:

- kill structural calques: overused 그녀/그 as subjects, "~할 수 있었다" chains, possessive stacking (나의 마음의), copied English word order
- pronoun discipline: Korean drops subjects — restore names/호칭 or omit, instead of 그녀-spam
- keep English emphasis patterns (italics, caps) as Korean rhythm and particle choice, not as literal markup
- preserve sentence-length contrast between registers; do not normalize everything to medium-length polite sentences

### Optional: Target-language voice capsule

Consume the capsule from `core-craft`/`SPEECH_SYSTEM.md` when English cannot preserve identity-bearing language facts:

- exact first-person pronouns and switch conditions
- sentence-final particles or ending habits with frequency limits
- dialect forms that must not be normalized
- name readings, honorific puns, and fixed wordplay
- semantic explanation for translators who do not know the source language

The capsule supplies exact target-language evidence. It does not override the five-section guide or justify random code-switching.

## Build Procedure

1. **Read the bot's speech design** — registers, tells, formality states, address stages, catchphrases. If these are not explicit in the English source, stop and fix that first (`SPEECH_SYSTEM.md` §7); a guide cannot map what was never encoded.
2. Draft sections 1–4 per major character; minor cast can share a default block plus exceptions.
3. Write section 5 once per bot.
4. **Calibrate with samples:** translate 5–10 representative lines per register (including one leak transition and one address-form shift) and review them against the character's intent. Revise mappings, not just samples.
5. Store as the bot's `translation_guide.md`; update whenever speech design changes (`BOT_VALIDATION.md` in `authoring-lorebook-bots` checks this pairing).

## Validation

- **30-turn consistency pass:** translate a long sample session; verify speech levels, 호칭 stages, and fixed renderings never waver.
- **No-name test, post-translation:** strip names from translated lines of different characters; if they become indistinguishable in Korean while distinct in English, the guide is under-specified (usually section 3).
- **Event preservation:** every marked speech event in English (first given-name use, formality crack, catchphrase) must be _visible_ in Korean output — these are scenes, not style.

## Multi-language note

The same anatomy extends to Japanese (敬語 levels, first-person pronoun choice, sentence-final particles offer even finer control) and Chinese (formality via address forms and particles). Build the Korean guide first as primary; add other target languages as parallel mapping columns only when the bot actually ships them.

## Smoke Tests

| Prompt                                                            | Expected routing                             | Expected output                                    | Forbidden behavior                                          |
| ----------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------- |
| "Write a translation guide for this bot; she's polite but snaps." | This skill; read her formality states first. | Full 5-section guide with leak-transition mapping. | Inventing a Korean voice unsupported by the English source. |
| "Her Korean dialogue sounds like every other bot."                | This skill §3 + §5; check the no-name test.  | Sharpened 어미 palette and translation-ese guards. | Rewriting the English character instead of the guide.       |
