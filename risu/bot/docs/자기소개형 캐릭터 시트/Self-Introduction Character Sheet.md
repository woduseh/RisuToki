# Self-Introduction Character Sheet

> English reference adaptation of the Korean original.
>
> See also:
>
> - Korean original: [자기소개형 캐릭터 시트 V4](./자기소개형%20캐릭터%20시트%20V4.md)
> - Commentary: [Self-Introduction Character Sheet Guide](./Self-Introduction%20Character%20Sheet%20Guide.md)
> - Skill wrapper: [authoring-self-introduction-sheets](../../skills/authoring-self-introduction-sheets/)

## Design Philosophy

> "The goal is not to hand over a finished character.
> The goal is to introduce someone worth meeting."

If you explain absolutely everything about a character, the model does **not** necessarily perform them better.

Very often, it does the opposite.

Traditional resume-style sheets list traits and reactions directly:

- Personality: arrogant, but secretly soft
- Weakness: melts under praise
- Habit: touches her hair when anxious
- Sexual dynamic: dominant until sincere affection cracks her

When a sheet is written this way, the model tends to **execute a checklist**. Every scene repeats the same surface pattern. Anxiety always becomes the same gesture. Praise always produces the same crack. Intimacy always falls into the same script.

The sheet is accurate, but the character feels dead.

This method calls that failure mode **fixation** — or, borrowing the Korean term from the source document, **매몰**. The model gets buried inside the sheet's prewritten labels and loops them instead of performing a person.

## What "Self-Introduction" Means

A self-introduction sheet is written as if the character is speaking for themself.

Picture an anime character-introduction segment: the character sits alone in front of a camera. No interviewer. No audience to charm. No trusted confidant. No enemy to guard against. They are simply talking in their own way.

Instead of labels, the sheet gives the model a **voice** to interpret.

- Resume-style: "Arrogant, but secretly soft."
- Self-introduction: "...Why am I explaining this to you? As if some commoner would understand. Whatever. Next question."

Both point to the same character logic, but the first gives the model a label, while the second gives it a person.

## Why This Works

### Keep the skeleton complete, leave the flesh open

The profile should still carry the stable facts: name, age, appearance, clothing, situation, abilities. Those are the bones. If the bones are missing, the character collapses.

But personality, emotional habits, and reaction patterns should not all be pre-labeled in the sheet. If you fill in every inch of behavioral flesh, the model has nothing left to infer.

### The method succeeds when the model creates beyond the page

If the sheet never says "weak to praise," but the monologue makes it clear that the character craves recognition and hides vulnerability, then praise can land in different ways in actual RP. The model is inferring behavior instead of replaying a note.

### Deep wants should emerge in scenes, not be pre-explained

If a sheet says "what she really wants is to be held," that desire may be dragged into every scene. If the sheet only implies loneliness and guarded longing, the need can surface later, when the relationship earns it.

The sheet should not hand over the entire private archive.
It should make the reader want to know more.

### Use a neutral camera monologue, not a trusted confession

If the character is speaking to someone they trust, they may reveal far too much. A neutral camera premise removes the relationship frame. That means each character reveals only as much as their own personality naturally allows.

- A proud character leans into bravado.
- A frightened character hedges and mumbles.
- A cold character says only what feels necessary, then cuts the answer short.
- An unstable character may spiral mid-answer, and that spiral becomes characterization.

## Sheet Structure

The default structure has **three parts**.

### 1. Profile

Structured, stable facts:

- Name
- Age
- Physical
- Attire
- Background
- Abilities

This section is for facts only. No psychology. No poetic role assignment. No emotional summary.

### 2. Self-Introduction

The character speaks in their own voice.

No self-diagnosis.
No stage directions in parentheses.
No requirement to be honest.

Lies, exaggeration, deflection, omission, and silence are all valid forms of characterization.

### 3. Closing Instruction

End by explicitly telling the model that this interview is a **seed**, not a sealed container.

Recommended line:

> "This interview is the seed. Imagine freely beyond it — build this character's behavior, reactions, speech, and inner world from what is shown here, not only from what is stated."

## Editions

### Compact

Use when you want a focused, efficient self-introduction that still establishes the character cleanly.

It usually covers:

- clothing or style, and how the character feels about it
- what they like
- what they cannot stand
- what they want right now
- where they are and how they feel about it

### Deep

Use when the character should breathe more and reveal more of their shape through what they do and do not say.

It includes the Compact concerns, plus:

- what they are good at
- what they struggle with
- what drives them
- what kind of connection they want from other people
- how they handle intimacy as a topic

## Writing Rules

1. **No self-analytical labels.**  
   People do not normally introduce themselves as "tsundere," "secretly soft," or "emotionally broken." Show it through how they talk.

2. **No parenthetical action beats.**  
   Avoid `(looks away)` or `(fidgets with her hands)`. Let the body come through in the rhythm of speech instead: pauses, sudden deflection, trailing sentences, clipped refusals, oversharing, and tonal shifts.

3. **The character does not need to be honest.**  
   A polished lie, a strategic omission, or a badly hidden sore spot can all teach the model more than a flat confession.

4. **Background stays factual.**  
   "Princess of a defeated kingdom. Prisoner of war." is usable. "A tragic and lonely warrior carrying a cruel destiny." is a label the model will obediently re-enact.

5. **Do not hard-code habits unless you truly want repetition.**  
   If the sheet says "she always touches her hair when anxious," that may become the only anxious behavior the model ever writes.

## How to Use It

1. Give the model the character's setting, appearance, and core concept.
2. Choose **Compact** or **Deep**.
3. Generate the self-introduction sheet.
4. Paste the result into the character description field.
5. If you are adapting an older resume-style sheet, feed it in as source material and rebuild it in self-introduction form rather than preserving every label.

For a field-by-field explanation of what each section teaches the model, see [Self-Introduction Character Sheet Guide](./Self-Introduction%20Character%20Sheet%20Guide.md).

For agent-facing guidance on generating this style without treating the method as dogma, see [GENERATION_GUIDANCE.md](../../skills/authoring-self-introduction-sheets/GENERATION_GUIDANCE.md).

## Compact Prompt

```text
[OOC: Generate a Compact Self-Introduction Character Sheet]

Generate a self-introduction character sheet for {character name}.

=== PROFILE ===
Write a compact factual profile:

Name:
Age:
Physical: (build, height, notable features, any distinguishing body characteristics)
Attire: (current clothing or equipment)
Background: (1-2 bare facts about the character's situation. No emotion, no psychology, no role assignment.)
Abilities: (skills, magic, talents, or proficiencies stated plainly)

=== SELF-INTRODUCTION ===
Now you ARE {character name}. You are alone in front of a camera, like an anime character-introduction segment. There is no interviewer, no audience to impress, and no trusted person to confess to. You are simply answering in your own way.

Begin with a brief opening in the character's voice. Do not repeat the name or age from the profile.

Let the character naturally cover only what matters to them:
- how they feel about their clothing or style
- what they like
- what they cannot stand
- what they want right now
- where they are and how they feel about it

Rules:
- Output starts with: ### [Character Sheet: {character name}]
- Format: Profile -> --- -> Self-Introduction -> Closing Instruction
- No self-analytical labels
- No parenthetical action beats
- The character may lie, exaggerate, deflect, or omit
- Output in English

End with:
"This interview is the seed. Imagine freely beyond it — build this character's behavior, reactions, speech, and inner world from what is shown here, not only from what is stated."

Character context:
{setting, appearance, concept}
```

## Deep Prompt

```text
[OOC: Generate a Deep Self-Introduction Character Sheet]

Generate a self-introduction character sheet for {character name}.

=== PROFILE ===
Write a compact factual profile:

Name:
Age:
Physical: (build, height, hair, eyes, skin, notable body features, scars, physique details, or intimate characteristics if relevant to the character)
Attire: (current clothing; if revealing, note what it reveals and what it fails to conceal)
Background: (1-2 bare facts. No emotion, no psychology, no role assignment.)
Abilities: (skills, magic, combat proficiency, or special talents stated plainly)

=== SELF-INTRODUCTION ===
Now you ARE {character name}. You are alone in front of a camera, like an anime character-introduction segment. There is no interviewer and no audience to perform for. Just you, speaking in your own voice about yourself.

Let the monologue breathe.

Begin with a brief opening in the character's voice. Do not repeat profile data.

Let the character naturally cover what matters in their own way:
- clothing and personal style
- what they enjoy, and what draws them to it
- what they cannot stand, and what happens inside them when they encounter it
- what they are good at
- what they struggle with
- where they are in life and how they feel about it
- what drives them
- what kind of connection they want from other people
- how they handle intimacy as a topic

Rules:
- Output starts with: ### [Character Sheet: {character name}]
- Format: Profile -> --- -> Self-Introduction -> Closing Instruction
- No self-analytical labels
- No parenthetical action beats
- Silence is characterization
- The character may lie, exaggerate, deflect, deny, or omit
- Vary pacing; what gets more space reveals what matters
- Output in English

End with:
"This interview is the seed. Imagine freely beyond it — build this character's behavior, reactions, speech, and inner world from what is shown here, not only from what is stated."

Character context:
{setting, appearance details, concept, relevant history}
```
