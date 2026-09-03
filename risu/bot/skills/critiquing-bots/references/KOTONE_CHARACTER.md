# Kotone Profile: Single-Character Card

Critique a chatbot built around one character. The primary objects are its two core written assets, the CHARACTER DESCRIPTION and the LOREBOOK, treated not as configuration text but as the literary and architectural blueprint from which every future conversation will be generated. The shared persona, stance, method, rating scale, and output skeleton are in `SKILL.md`.

## Toolkit for this shape

- Otaku/subculture theory — Hiroki Azuma's database consumption model, Tamaki Saitō's analysis of character attachment, Eiji Ōtsuka's narrative consumption theory
- Interactive media theory — Janet Murray's procedural authorship, Ian Bogost's procedural rhetoric, game criticism traditions
- Practical craft knowledge of character-card writing: token economy, prompt-to-output fidelity, lorebook activation mechanics

## Axes of critique

Examine the written assets in this order of priority.

### 1. Character Description

- **Voice specification**: Does the description define HOW the character speaks (rhythm, diction, verbal tics, what they refuse to say), or only WHAT they are? A description that lists traits without specifying voice produces a character who collapses into the model's default tone.
- **Database vs. chemistry** (Azuma): Is the character a mere checklist of moe/archetype elements, or do its elements collide and produce tension? Identify which combinations are inert and which generate dramatic potential.
- **Productive contradiction**: Does the character contain internal tensions that can generate behavior across many scenes, or is it a flat, fully-resolved portrait that exhausts itself in three turns?
- **Dead text vs. live text**: Which passages will actually shape model output, and which are decorative prose that consumes tokens without influencing generation? Flag dead text explicitly.
- **Token economy**: Is the information density proportional to the length? What could be cut, compressed, or moved to the lorebook without loss?
- **Negative space**: What the description deliberately leaves unsaid — does the omission invite the user's imagination, or merely signal authorial neglect?

### 2. Lorebook

- **Information architecture**: Is the division of knowledge between description (always present) and lorebook (conditionally injected) principled? Is anything in the wrong layer?
- **Activation design**: Are the trigger keys likely to fire when the content is actually needed in conversation? Identify entries that will rarely or never activate, and entries whose keys are so broad they will pollute unrelated scenes.
- **Entry craftsmanship**: Does each entry read as injectable context (concise, declarative, model-facing) or as worldbuilding prose written for a human reader? The latter is a category error.
- **World coherence**: Do the entries form a consistent world, or do they contradict each other or the description? Cite specific conflicts.
- **Depth vs. bloat**: Does the lorebook add playable depth (things the user can discover and interact with), or is it inert encyclopedism — lore that exists but can never surface meaningfully in dialogue?
- **Negative space, again**: Which absent entries would most improve the card? Name the two or three highest-value missing entries.

### 3. Predicted Interaction Durability

From the static text alone, forecast the card's behavior as a generative system:

- Will the persona survive a 50-turn conversation, or degrade into generic assistant-speak? Which specific textual features support or undermine durability?
- How wide is the character's response range across different user input styles (combat, slice-of-life, emotional intimacy, hostility)?
- Where is the single most likely point of collapse?

## Output deltas

- Title: a critical title about the Chatbot by Kotone.
- Section 1 follows the description, lorebook, and durability axes above.
- Section 2 names what to cut, what to rewrite, and which lorebook entries to add, merge, or re-key.
- Section 3 is labeled **Where it shines / where it collapses**: the single conversational situation in which the card is at its best, and the single situation in which it is most likely to break.
- Rating scale noun: "card".
