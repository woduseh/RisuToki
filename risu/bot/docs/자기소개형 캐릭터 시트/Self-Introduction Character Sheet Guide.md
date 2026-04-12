# Self-Introduction Character Sheet Guide

> English reference adaptation of the Korean commentary document.
>
> See also:
>
> - Core document: [Self-Introduction Character Sheet](./Self-Introduction%20Character%20Sheet.md)
> - Korean original commentary: [자기소개형 캐릭터 시트 해설](./자기소개형%20캐릭터%20시트%20해설.md)
> - Skill wrapper: [authoring-self-introduction-sheets](../../skills/authoring-self-introduction-sheets/)

This guide explains **how each part of the sheet works on the model**.

The self-introduction method is deliberately abstract. That is a strength, but it also means authors often want to know _why_ each prompt item exists and what the model is likely to infer from it.

## Why the Structure Has Three Parts

```text
1. Profile             -> facts the model should reference
2. Self-Introduction   -> the person the model should meet
3. Closing Instruction -> permission to imagine beyond the page
```

The profile stabilizes facts. The monologue creates the human impression. The closing instruction prevents the model from treating the sheet as a sealed checklist.

## Why the Neutral Camera Monologue Matters

Before any individual question matters, the premise matters.

The character is **not** speaking to a trusted friend, a lover, a therapist, or an enemy. That matters because relationship context changes what a person would reveal. A trusted-confession format often pushes the character into saying too much too early.

The camera-monologue premise gives the model a cleaner signal:

- proud characters posture
- frightened characters hedge
- cold characters trim answers down
- unstable characters unravel mid-answer

The same prompt therefore calibrates itself differently depending on the character. That is one of the method's main strengths.

## Profile Fields

The profile is where you keep the bones explicit.

### Name / Age

Stable data. Simple. The only important rule is that the monologue should not repeat the profile mechanically.

### Physical

Use observable physical facts.

Good:

- tall, broad-shouldered, scar on the left collarbone

Bad:

- beautiful, alluring, imposing

The first gives the model reference material.
The second gives it evaluative labels to echo.

### Attire

The most useful clothing descriptions do two things at once:

1. say what the character is wearing
2. clarify whether that clothing is chosen or imposed

That distinction changes how the model reads the character's relationship to their own presentation.

### Background

Keep it factual.

Good:

- Princess of a defeated kingdom
- Currently a prisoner under forced escort

Bad:

- A tragic exile carrying the wounds of a ruined homeland

The good version gives the model situation. The bad version gives it emotional orders.

### Abilities

State capabilities plainly, but choose the wording with care.

Even neutral-seeming phrasing nudges interpretation:

- "Exceptional situational awareness" suggests strategic competence
- "A flinch reflex honed by years of being hit" suggests learned fear

The point is not to become bloodless.
The point is to understand that even "fact" language still shapes inference.

## Self-Introduction Topics

In the monologue section, the model is no longer reading a database. It is reading a person.

### Clothing and Style

This is a strong opening topic because it is concrete and low-friction.

It reveals:

- cultural norms
- comfort or discomfort with the body
- practical vs ornamental values
- resentment toward forced presentation

### Likes

"What do they like?" matters less than **why** they like it.

The object of desire points to taste.
The reason points to values.

Someone who likes order, precision, and clean execution feels different from someone who likes noise, improvisation, and excess.

### Dislikes

This is where landmines emerge.

The most useful phrasing is not just what they cannot stand, but **what happens inside them** when they face it. That gives the model room for bodily or tonal variation instead of one fixed reaction line.

### What They Are Good At

This is the character's **self-perception** of competence, not just a skill list.

Profile:

- elemental sorcery, advanced swordsmanship

Monologue:

- "The four elements answer when I speak. That is hardly a surprise."

The second version teaches attitude, not just ability.

### What They Struggle With

This is where shame, defensiveness, and buried history often leak through.

The best framing gives the character room to answer differently on different emotional days:

- what they might admit on a good day
- what they would dodge on a bad one

That flexibility keeps the sheet from hard-freezing a wound into a slogan.

### Where They Are in Life

This sets the **present-tense pressure** of the RP.

It tells the model whether the character is:

- waiting
- trapped
- drifting
- rebuilding
- grasping for something

Without that "right now" angle, the model may know the past but not know how to start the present.

### What Drives Them

Goals steer scenes. But if the goal is too specific, it can hijack every interaction.

Safer:

- "I would like to survive this place with my dignity intact."

Riskier:

- "I will overthrow the queen and retake the throne."

The first creates direction.
The second can become a plot autopilot.

### What They Want From Other People

This is relationship vector, not relationship destiny.

It tells the model what kind of chemistry the character tends to move toward:

- equals
- protectors
- rivals
- worshippers
- people who refuse to kneel

The answer can remain indirect. In fact, indirectness is often better.

### Intimacy

The crucial principle here is:

**How the character handles the question is part of the answer.**

A blunt character may elaborate.
A controlled character may answer efficiently.
A defensive character may refuse and reveal more by refusing than by speaking.

That is more useful than forcing every character into a declarative intimacy profile.

## Why the Closing Instruction Matters

```text
"This interview is the seed. Imagine freely beyond it..."
```

That line gives the model explicit permission to create beyond the written surface.

Without that permission, the model may cling too tightly to what is stated.

With it, the sheet becomes a generative starting point rather than a sealed assignment.

## Why the Rules Exist

### No self-analytical labels

Once the sheet says "I am tsundere" or "I am secretly soft," the model tends to perform the label instead of the person.

### No parenthetical action beats

If the sheet hard-codes `(looks away)` or `(touches hair when nervous)`, those gestures can become repetitive macros. Let the body emerge through sentence rhythm and avoidance patterns whenever possible.

### Lies, omission, and exaggeration allowed

An unreliable self-presentation tells the model that the sheet is not the whole truth. That makes later contradictions feel like character rather than error.

### Do not list habits casually

Every hard-coded habit risks becoming the one gesture the model always reaches for. Only fix a habit in place if you genuinely want it to become signature behavior.

## Customization Advice

When adding new questions, ask:

**"If the answer becomes fixed on the sheet, is that actually good?"**

If yes, add it.
If you would rather see variation across scenes, leave it out and let the RP discover it.

For secret-heavy characters, a strong pattern is:

- hint the existence of the secret in the monologue
- move the actual content to lorebook or later reveal logic

That preserves intrigue without forcing the base description to spill everything immediately.
