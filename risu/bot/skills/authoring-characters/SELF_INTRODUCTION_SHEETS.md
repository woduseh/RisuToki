# Self-Introduction Character Sheets

Load this reference when the character should be encoded as a compact factual skeleton plus a character-voiced self-introduction monologue, so that tone, omissions, evasions, and emphasis let the model infer character without exhaustive behavioral explanation. It replaces the omniscient sheet form in `SKILL.md`, not the intake, mode, or validation rules.

## Workflow

1. Write a compact factual skeleton: identity, appearance, role, relationships, current situation, and any exact data required for consistency.
2. Choose depth by expected play. A compact NPC needs a clear function and voice; a central character needs pressure responses and unresolved tensions.
3. Choose why the character is introducing themself, to whom, and what they want from the exchange. The premise shapes what they volunteer and conceal.
4. Write in the character's register. Use plain facts, selective interpretation, self-serving framing, corrections, and strategic gaps. Do not turn the monologue into an omniscient diagnosis.
5. Preserve room beyond the page. The sheet authorizes inference and improvisation consistent with its anchors; it does not freeze every reaction.
6. For ensembles, differentiate premise, rhythm, knowledge, and agenda; do not repeat one template with swapped traits.
7. Move hard secrets, phase-specific behavior, and conditional revelations to lorebooks or other gated surfaces.

Load [`SELF_INTRODUCTION_STRUCTURE.md`](SELF_INTRODUCTION_STRUCTURE.md) for exact forms, depth variants, topic-by-topic voice and omission notes, and when to bend the method. The source guides under `risu/bot/docs/자기소개형 캐릭터 시트/` are optional background, not runtime prerequisites.

## Output

Return optional design notes only when requested, followed by the factual profile and the character-voiced introduction. Add a short lorebook handoff when material was intentionally gated.

## Validation

Check that the same facts would sound different from another character, omissions reflect motive rather than author forgetfulness, the voice survives translation, model-visible prose does not expose design labels, and the result leaves `{{user}}` free to respond.
