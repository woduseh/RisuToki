---
name: authoring-worlds
description: 'Use when creating, refining, or diagnosing worldbuilding for RisuAI roleplay bots: settings, cultures, factions, power structures, magic or technology systems, places, active history, knowledge horizons, and worlds that feel dry, generic, cliche, or disconnected from scenes. Use for world substance; use authoring-lorebook-bots when the main task is distributing finished material into description, lorebook entries, globalNote, or firstMessage.'
---

# World Authoring

## Agent Operating Contract

- **Use when:** the main task is designing, refactoring, or diagnosing the world itself: setting pressure, culture, factions, institutions, places, systems, active history, or knowledge horizon.
- **Do not use when:** the main task is one character's engine/voice, self-introduction sheets, lorebook trigger architecture, raw lorebook syntax, or technical CBS/Lua/regex/HTML work.
- **Read first:** this `SKILL.md` only. Load [VALIDATION.md](VALIDATION.md) after drafting or when diagnosing why a world feels flat.
- **Load deeper only if:** world material needs placement into description/lorebook/globalNote/firstMessage; then hand off to [authoring-lorebook-bots](../authoring-lorebook-bots/). For exact lorebook decorators and trigger syntax, use `writing-lorebooks`.
- **Output/validation contract:** produce a scene-useful world frame and deep-reference candidates, not a wiki. Verify that every world element changes behavior, speech, sensation, conflict, or withholding in play.

> This skill answers **what the world is and how it acts on scenes**. It does not decide final RisuAI storage, keyword triggers, insertion depth, or large-bot scene routing. Those are architecture tasks for `authoring-lorebook-bots` and syntax tasks for `writing-lorebooks`.

## Role Boundary

| Concern                                                                  | Primary skill                        | Focus                   |
| ------------------------------------------------------------------------ | ------------------------------------ | ----------------------- |
| One character's internal engine, voice, contradiction, pressure response | `authoring-characters`               | Character performance   |
| Factual profile plus character-voiced introduction                       | `authoring-self-introduction-sheets` | Character through voice |
| World substance: culture, pressure, power, systems, places, history      | **this skill**                       | World design            |
| Description vs lorebook/globalNote/firstMessage distribution             | `authoring-lorebook-bots`            | Bot architecture        |
| Lorebook keys, decorators, insertion behavior                            | `writing-lorebooks`                  | Lorebook syntax         |

If a task crosses boundaries, use this skill to make the world vivid first, then use `authoring-lorebook-bots` to place it.

## Cross-Handoff with Character Design

World entries can create characters, but not every named person deserves character-depth writing. Keep factions, social roles, and NPC candidates in this skill while they only need scene function, behavioral signature, or public pressure.

Move a figure to [authoring-characters](../authoring-characters/) when they need independent voice, motivation, contradiction, pressure responses, or a specific relationship engine with `{{user}}`. When doing so, keep the handoff anchored to the world's Pressure, Taboo, and Knowledge Horizon so the character does not float free of the setting.

---

## Core Principles

### 1. Pressure map, not encyclopedia

A roleplay world is not a catalog of facts. It is the set of forces that changes what people do, avoid, assume, smell, say, and fear saying.

```text
Weak: The empire is in decline.
Strong: Tax collectors come twice as often and apologize differently each time.
```

Before keeping any world fact, ask:

**Does this change how an inhabitant behaves, speaks, senses, or withholds information in a scene?**

If not, attach a consequence or leave it out of the play-facing world frame.

### 2. Active present beats timeline

Write the world at the story's starting moment. Avoid future promises like "the empire will collapse" or "war is coming." If instability matters, write how it appears now.

### 3. Texture anchors abstractions

Abstract claims need sensory or behavioral anchors.

```text
Weak: Magic is feared.
Strong: People step around spell ash in the street even after rain has washed the circle away.
```

Every structural rule should have at least one texture pair: a sound, smell, ritual, gesture, clothing repair, street habit, taboo phrase, or ordinary inconvenience.

### 4. Contradictions stay unresolved

Power, religion, magic, and social norms get stronger when the official story and actual mechanism disagree. Do not tidy the contradiction into a solved secret or future revelation.

### 5. Cross-source to block defaults

If the world leans on one obvious reference, genre, or culture, predict the model's default and add an off-pattern source or pressure unless the user intentionally wants that default.

Use Contrast to name the likely misread:

```text
This setting borrows monsoon-port logistics and courtly ancestor rites; it is not medieval Europe by default.
```

### 6. Knowledge horizon blocks leakage

Define what ordinary inhabitants know, misunderstand, and cannot conceptualize. This prevents modern Earth knowledge, genre assumptions, or author omniscience from leaking into scenes.

Negative statements are acceptable when they block strong defaults:

```text
No one here has a concept of germs, atoms, DNA, or modern psychiatry.
```

---

## Intake Rules

- Ask one high-value question at a time while the world is still being invented.
- If the user provides a large setting dump, summarize what is already covered, identify the weakest area, then ask the next missing question.
- Treat references as raw material: keep, change, reject. Convert them into pressure, texture, behavior, system limits, or Contrast.
- Respect fixed canon. Challenge only its scene function, consequence, placement, or wording.
- Do not moralize difficult settings. Write allowed dark material through institutional behavior, inhabitant logic, and scene consequences rather than author judgment.

---

## Build Pipeline

Use this as a flexible order. Skip what is irrelevant, but make sure every retained element has scene function.

### Step 1 - Story Direction and RP Mode

Identify the kind of RP this world is meant to host: genre, atmosphere, tone, scene scale, expected user role, and whether NSFW or dark content is in scope.

All later choices are judged against this direction.

### Step 2 - Anchor References and Cross-Pollination

Identify the strongest visual, cultural, historical, or genre anchor. If it is single-source, ask what second source, off-pattern pressure, or deliberate difference should prevent default drift.

### Step 3 - Current Pressures

Write one to three forces acting on inhabitants right now.

Good pressure is observable: prices changing, roads closing, greetings becoming risky, weather reshaping labor, rituals becoming stricter, officials changing tone.

### Step 4 - Norms and Taboos

Define what ordinary people do without thinking and what they avoid naming.

- **Norms:** greetings, address forms, eating habits, signs of respect, signs of disrespect, work rhythms.
- **Taboos:** dangerous words, unmentioned history, forbidden relationships, public silence patterns.

Write taboos as avoidance behavior, not moral commentary.

### Step 5 - Texture of Ordinary Life

Describe one ordinary street, household, workplace, shrine, station, market, or classroom scene. Look for concrete sound, smell, light, clothing, repairs, tools, food, weather, and gestures.

If the answer is abstract, probe for a mundane sensory detail.

### Step 6 - Power and Structural Contradiction

For each major power center, establish:

- official story of why it has authority
- actual mechanism that keeps authority working
- who knows the contradiction
- what it costs to expose or ignore it

Keep the contradiction active and unresolved.

### Step 7 - System Logic

For magic, technology, supernatural rules, or other special logic, define:

- what it can do
- what it costs
- what it cannot do
- who is allowed or barred from using it
- what metaphors, professions, taboos, or daily habits it creates

Limits are more useful than powers because they preserve tension.

### Step 8 - Active History Only

Record only past events that still press on the present.

Use:

```text
event -> wound on the world -> current manifestation
```

Full timelines belong in deep notes unless the user explicitly wants a world bible.

### Step 9 - Factions, Places, NPC Candidates, Knowledge Horizon

Sketch reference-layer elements lightly:

- **Factions:** who they are, what they want, who they oppose, how members behave.
- **Places:** what makes the place different from a generic version, sensory signature, social character.
- **NPC candidates:** light role and behavioral signature only; deep characters move to `authoring-characters`.
- **Knowledge horizon:** what people know, misunderstand, cannot know, and which anachronisms to block.

### Step 10 - Contrast Against Default

Name the world this is most likely to be mistaken for and specify differences. Contrast may use negative statements because the comparison target is precise.

---

## Assembly Guidance

Produce a world-design draft in this shape unless the user asks for a different format:

```markdown
## Design Notes

(Story direction, core pressures, default risks, cross-source logic)

---

## World Frame

(Always-useful world substance: pressure, norms, taboos, texture, contrast)

---

## Deep Reference Candidates

(Power centers, system logic, active history, factions, places, knowledge horizon, NPC candidates)

---

## Handoff to Lorebook Architecture

(What should later become description material, lorebook entries, or character-design followups)
```

Do not invent final lorebook keywords, insertion depth, or RisuAI storage policy unless the user asks for architecture. When that becomes the task, switch to `authoring-lorebook-bots` and `writing-lorebooks` as needed.

## Smoke Tests

| Prompt                                                                            | Expected routing                                                                    | Expected output                                     | Forbidden behavior                            |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------- |
| "Build a world. I have many setting facts, but it does not feel alive in scenes." | Primary: `authoring-worlds`; load `VALIDATION.md` after a draft.                    | Pressure-map diagnosis and revised world frame.     | Jumping straight to lorebook keyword design.  |
| "This magic system feels like generic fantasy."                                   | Primary: `authoring-worlds`.                                                        | Cost/limit/cultural consequence plus Contrast.      | Adding more powers without limits or texture. |
| "Split this world into lorebook entries."                                         | Primary: `authoring-lorebook-bots`; use this skill only if world substance is weak. | Description/lorebook distribution and trigger plan. | Rebuilding the entire world before routing.   |
