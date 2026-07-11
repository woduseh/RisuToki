---
name: authoring-self-introduction-sheets
description: 'Use when a character should be encoded through factual profile data plus a character-voiced self-introduction monologue. Primary skill for this sheet form; hand deep secrets and conditional states to lorebooks. Do not use when an omniscient profile, event system, or world architecture is the requested form.'
tags: ['authoring', 'character', 'self-introduction']
related_tools: ['inspect_document', 'read_content']
---

# Self-Introduction Character Sheets

## Outcome

Produce a factual skeleton and a playable monologue whose tone, omissions, evasions, and emphasis let the model infer character without exhaustive behavioral explanation.

## Minimal workflow

1. Write a compact factual skeleton: identity, appearance, role, relationships, current situation, and any exact data required for consistency.
2. Choose depth by expected play. A compact NPC needs a clear function and voice; a central character needs pressure responses and unresolved tensions.
3. Choose why the character is introducing themself, to whom, and what they want from the exchange. The premise should shape what they volunteer and conceal.
4. Write in the character's register. Use plain facts, selective interpretation, self-serving framing, corrections, and strategic gaps. Do not turn the monologue into an omniscient diagnosis.
5. Preserve room beyond the page. The sheet should authorize inference and improvisation consistent with its anchors, not freeze every reaction.
6. For ensembles, differentiate premise, rhythm, knowledge, and agenda; do not repeat one template with swapped traits.
7. Move hard secrets, phase-specific behavior, and conditional revelations to lorebooks or other gated surfaces.

Load `SHEET_STRUCTURE.md` for exact forms and depth variants, and `GENERATION_GUIDANCE.md` for detailed voice and omission techniques. Source guides under `risu/bot/docs/자기소개형 캐릭터 시트/` are optional background, not runtime prerequisites.

## Output

Return optional design notes only when requested, followed by the factual profile and character-voiced introduction. Add a short lorebook handoff when material was intentionally gated.

## Validation

Check that the same facts would sound different from another character, omissions reflect motive rather than author forgetfulness, the voice survives translation, model-visible prose does not expose design labels, and the result leaves `{{user}}` free to respond.
