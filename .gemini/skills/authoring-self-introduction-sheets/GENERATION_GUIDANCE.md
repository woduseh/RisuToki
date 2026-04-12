# Self-Introduction Generation Guidance

This file is **not** a copy-paste prompt bank.

Use it when you want to brief a model or an agent into the self-introduction method without turning the method into a rigid doctrine.

## Core Stance

The goal is to help the model produce a character sheet that:

- keeps factual information stable
- lets the character's own voice do more of the interpretive work
- leaves room for inference rather than pre-labeling every behavior

That does **not** mean every rule should be obeyed mechanically. Treat the method as a set of strong defaults. If a specific character clearly benefits from a small exception, make the exception on purpose.

## What to Emphasize When Briefing a Model

### 1. Separate the profile from the self-presentation

Tell the model that the sheet has two different jobs:

- the **profile** stabilizes facts
- the **self-introduction** reveals character through how they talk

If those two jobs blur together, the sheet tends to collapse back into a labeled resume.

### 2. Use the neutral camera premise

The character is speaking:

- alone
- without an interviewer
- without a trusted confidant
- without an audience to perform for

This premise matters because it naturally changes how much each character reveals. Proud characters posture. Guarded characters trim answers. Frightened characters hedge. Unstable characters may unravel.

### 3. Ask for voice, not self-diagnosis

When briefing the model, prioritize:

- sentence rhythm
- topic choice
- evasion
- emphasis
- refusal
- over-explanation or under-explanation

Do **not** ask the model to summarize the character in flat labels if the goal is self-introduction style.

### 4. Leave some things for inference

If the prompt nails down every hidden want, every gesture, and every emotional trigger, the output may become too closed and repetitive.

The model should still have interpretive work to do after the sheet is written.

### 5. Keep the closing instruction generative

The ending should make it clear that the interview is a starting point. The sheet should guide future performance, not claim to contain everything.

## Compact vs. Deep

### Use Compact when

- the character only needs a clean, strong introduction
- you want the monologue to stay focused
- the sheet should establish presence quickly

Typical Compact territory:

- clothing / style
- likes
- dislikes
- immediate wants
- current situation

### Use Deep when

- the character should breathe more on the page
- avoidance, emphasis, and contradiction inside the monologue matter more
- the model needs more room to show the character's priorities and blind spots

Typical Deep territory:

- competence
- struggle
- current life position
- motive
- desired connection
- intimacy as a handled topic rather than a fixed declaration

## When to Bend the Method

Do **not** treat these rules as absolute.

It is reasonable to bend the method when:

- one signature habit is central enough to deserve always-on status
- the character is genuinely plainspoken and would name feelings directly
- direct safety or boundary language is more important than stylistic purity
- a worldbuilding fact would become confusing if left too implicit

The point is not minimalism for its own sake.
The point is to avoid needless over-definition.

## Good Inputs for the Model

When asking a model to create a self-introduction sheet, give it:

- setting
- appearance
- current role or situation
- any essential constraints or boundaries
- the intended depth level
- existing sheet material if this is a refactor

If you are converting from an older resume-style sheet, tell the model to preserve the character but rebuild the information into:

1. factual profile
2. voiced self-introduction
3. generative closing instruction

## Common Failure Modes

### Failure: the sheet still reads like a trait list

Correction:

- reduce labels
- move more of the reading into the monologue
- stop explaining the personality in third-person summary language

### Failure: the monologue sounds like exposition, not self-presentation

Correction:

- reinforce the camera premise
- ask for stronger topic preference and avoidance
- let the character cut, dodge, brag, understate, or wander

### Failure: the method becomes dogma

Correction:

- keep the high-level intent
- break local rules where a specific character obviously needs it
- judge by whether the sheet produces a more alive character, not by purity

### Failure: the sheet leaves too much unsaid and loses clarity

Correction:

- restore a little more factual stability in the profile
- make current circumstances clearer
- allow one or two more explicit signals if the output is becoming vague instead of evocative

## Final Reminder

Use this file as a generation compass.

The goal is not to make every self-introduction sheet look identical.
The goal is to help the model understand the style well enough to produce characters that feel introduced rather than cataloged.
