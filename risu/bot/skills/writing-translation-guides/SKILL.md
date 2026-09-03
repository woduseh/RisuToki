---
name: writing-translation-guides
description: 'Use when creating or revising a per-bot guide that consistently renders source-language roleplay output into Korean or another target language. Primary skill for translation behavior; hand source-character redesign to authoring-characters. Do not use when translating one passage or designing a character without a translation layer.'
tags: ['translation', 'voice', 'localization']
related_tools: ['inspect_document', 'read_content']
---

# Writing Translation Guides

## Outcome

Produce a compact mapping from source-language social and vocal cues to stable target-language choices without rewriting content or flattening character voice.

## Minimal workflow

1. Take the speaker, addressee, relationship states, address-form gates, and formality state machine from the bot's speech design (`authoring-characters/SPEECH_SYSTEM.md` §7) instead of re-deriving them; identify only what that design left undefined.
2. Map source registers to target speech levels and define transitions rather than assigning one global level.
3. Define address-form progression, including titles, names, pronouns, kinship terms, insults, and intimacy shifts.
4. Specify sentence-ending texture, rhythm, contractions, hesitation, and characteristic directness without mandating a catchphrase every turn.
5. Create a small fixed-rendering lexicon for names, terms, recurring metaphors, abilities, institutions, and deliberate non-translations.
6. Add guards against translation-ese: unnecessary pronouns, source-order calques, over-literal passive constructions, uniform honorifics, and explanatory expansion.
7. When English cannot encode a crucial target-language feature, add a short voice capsule with the exact form, trigger condition, and meaning.

For Korean targets, load [`KOREAN_REGISTER.md`](KOREAN_REGISTER.md) for the speech-level table, address-form template, translation-ese repairs, and the guide skeleton.

## Output

Return a guide organized by relationship state, speech level, address form, sentence texture, fixed renderings, prohibited renderings, and a few contrastive examples. Keep it operational; do not duplicate the full character sheet.

## Validation

Test neutral, intimate, hostile, embarrassed, public, and power-reversed lines. Verify that state changes produce predictable address/formality changes, fixed terms remain stable, and translations sound native while preserving intent and character distinction.
