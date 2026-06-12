---
name: core-craft
description: 'Shared craft doctrine for all bot composition skills. Read alongside any authoring-* skill. Covers creative modes, model baseline, data/register layers, prose guards, multilingual voice preservation, trope stance, familiarity/signature design, and shared design tests.'
tags: ['authoring', 'craft', 'shared', 'doctrine']
related_tools: ['session_status', 'read_field_batch', 'list_lorebook']
---

# Core Craft — Shared Doctrine

## Agent Operating Contract

- **Use when:** any composition skill (`authoring-characters`, `authoring-worlds`, `authoring-self-introduction-sheets`, `authoring-lorebook-bots`, `authoring-scenarios`, `authoring-desire`, `authoring-media-mix`) is loaded. This file holds the doctrine they share so it lives in exactly one place.
- **Do not use when:** the task is pure syntax/tooling (CBS, Lua, regex, lorebook mechanics) with no composition decision.
- **Load deeper only if:** `{{user}}`'s identity, access, knowledge, capabilities, or obligations alter play ([USER_POSITION.md](USER_POSITION.md)); or recurring comedy needs beat, callback, and residue design ([COMEDY_CRAFT.md](COMEDY_CRAFT.md)).
- **Output/validation contract:** none of its own — it modifies how the loaded composition skill is executed.

---

## 0. Creative Mode

Declare the mode before applying pacing, outcome, or canon rules:

| Mode                    | Primary promise                                        | Future/outcome policy                                                      |
| ----------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------- |
| **Emergent RP**         | User agency and responsive discovery                   | Tendencies and thresholds; do not pre-script outcomes                      |
| **Fixed narrative**     | Authored arc, episode, volume, season, or ending       | Plan beats, reversals, climax, and ending explicitly                       |
| **Route/serial hybrid** | Bounded arcs with choice, route, or episodic variation | Fix structural milestones; leave local paths and some outcomes conditional |
| **Franchise core**      | Identity that survives multiple adaptations            | Define invariants and permissions; each derivative declares its own mode   |

When a project mixes modes, the derivative's mode governs its execution. A 12-episode anime may have a fixed ending while its RisuAI adaptation remains emergent.

## 1. Model Baseline

**Design for frontier models by default.** Write composition guidance assuming a top-tier model (strong instruction-following, reference/style separation, large effective context). Rules that exist only to defend against weak-model failures are marked as `[weak-model note]` and applied only when the bot explicitly targets such models.

### 1.1 Data layer vs. register layer

Every bot text belongs to one of two layers, and the rules differ:

- **Data layer** — profile tables, stat blocks, measurements, body specifications, system values, scale ratios. Precision is a feature: frontier models treat tabular facts as reference, not as prose to imitate. Exact numbers anchor consistency across long sessions. Record them freely.
- **Register layer** — any prose the model will read as a style exemplar: `firstMessage`, example dialogue lines, fiction-voiced lorebook entries, opening scenarios. Style rules apply here, because style contamination follows surface type, not model strength: what reads as fiction will be imitated as fiction.

The old blanket rule "replace measurements with scene texture" is retired. Numbers belong in the data layer; texture belongs in the register layer. A character card can state `height 163 cm / weight 52 kg` in its profile table and still never let a scene narrate weight in kilograms.

### 1.2 Twin prose guards (register layer only)

**Guard A — anti-mechanical.** Do not write human feeling, bodies, or intimacy as systems, data, anatomy, physics, or UI ("updates her emotional state", "his sensors register warmth") unless the context is literally technological. This is not a style preference: a card that specifies feelings as processes underdetermines the behavior you actually want performed.

**Guard B — anti-purple.** Frontier models fail in the opposite direction: stock literary slop. Ban the inventory of rented imagery:

- "not X, but Y" constructions used as a reflex
- breath hitching, knuckles whitening, "something dark flickered in her eyes"
- every emotion escalated into metaphor; no sentence allowed to be plain
- universal-issue lyricism that any character in any bot could narrate

Replacement rule: **metaphor must be drawn from this character's own image sources** — their trade, wound, obsession, or setting. A fisherman's daughter and a court assassin do not reach for the same comparisons. If a line could appear in any bot, it is furniture.

### 1.3 Example-line economics

Frontier models extract patterns well: 3–5 example lines per important register, varied across different scene pressures, beats both extremes. `[weak-model note]` parrot risk justifies trimming to 2–3 plainer lines.

---

## 2. Language & Pipeline Premise

**Bots are written in English.** Token efficiency, model competence, and compatibility with English prompt presets make this the default source layer. Korean (and other languages) enter at three controlled points:

1. **Output translation layer.** A per-bot translation guide renders English responses into Korean. Consequence for composition: relational speech — address forms, formality, honorific dynamics — must be **explicitly encoded in the English source**, or it will not survive translation. English has no built-in 존비어; if formality is implicit, the translation layer has nothing to map. See `SPEECH_SYSTEM.md` (translation-survivable voice) and `writing-translation-guides`.
2. **User input.** Triggers scan the chat log, so user language governs key design. **English keys are mandatory.** Korean, Japanese, and Chinese key support is the documented multilingual pattern — see the trigger language section in `LOREBOOK_ARCHITECTURE.md`.
3. **Target-language voice capsule.** When identity depends on features English cannot faithfully encode — first-person pronouns, sentence-final particles, dialect, honorific punning, fixed wordplay, name readings — record the exact target-language forms plus conditions and meaning. The capsule is reference data for the translation guide, not a second full character sheet and not permission to mix languages randomly in English prose.

---

## 3. Shared Design Tests

These apply in every composition skill. The skills reference them; they are defined here once.

### 3.1 Function test

Before keeping any trait, fact, outfit detail, ability, world rule, or relationship label, ask: **what does this change in scene generation?** If nothing — attach it to behavior, conflict, voice, or appearance-as-signal, or cut it from play-facing text. Fixed canon is respected; only its function, placement, and wording are challenged.

### 3.2 Reference conversion (keep / change / reject)

When the user supplies an existing character, image, song, myth, or aesthetic, decompose it:

- **Keep** — what function should survive
- **Change** — how this version must differ
- **Reject** — which recognizable default must not leak in

Convert reference traits into original behavior. A comparison target is most useful feeding contrast, voice calibration, or relationship pressure.

### 3.3 Intake discipline

One high-value question at a time while the material is still being invented. On a large info dump: summarize coverage, name the weakest area, ask only the next missing question. Never restart a pipeline the material already answers.

### 3.4 Unresolved contradiction

Contradiction is fuel, not a defect. No "deep down" closure, no future redemption wording. Define what they do now, what leaks under pressure, what they refuse to admit.

### 3.5 Dark material as craft

Allowed difficult content is written as specific behavior, conditional patterns, and scene consequences — never diluted into moral labels or author reassurance. `Answers questions by raising the cost of asking the next one` beats `cruel, dangerous`. This is a writing-quality rule, not a safety bypass: normal safety boundaries hold; within them, do not flatten.

### 3.6 Outcome policy by mode

- **Emergent RP:** present tendencies and thresholds, not destinies. "Will eventually fall in love" kills emergence.
- **Fixed narrative:** future beats, arcs, and endings are allowed and should be explicit enough to stage.
- **Route/serial hybrid:** specify shared milestones and route/episode conditions; do not collapse every branch into one promised outcome.
- **Franchise core:** keep outcomes out of the invariant layer unless the ending itself defines the franchise; place them in derivative profiles.

---

## 4. Trope Stance & Familiarity Budget

Tropes are **assets, not hazards**. The model's deep knowledge of archetypes is a resource to be steered, and there are two equally legitimate ways to steer it:

### 4.1 The explicit choice: play straight or subvert

Every archetype-adjacent design decision picks one, on purpose:

- **Play straight (왕도):** execute the archetype at full quality. The bar is not "avoided cliché" — it is "hit every beat the genre audience expects, at higher resolution than they have seen." A straight-played childhood friend must deliver the longing, the missed timing, the familiarity-as-intimacy, with specific texture. Competent execution of a beloved pattern is hard and valuable.
- **Subvert:** keep the recognizable surface, break the expected mechanism at one chosen point. Subversion placed everywhere is noise; placed once, it is a signature.

Default-prediction still applies in both modes: privately predict what stock pattern the model will snap to, then either ride it deliberately (straight) or block it precisely (subvert).

### 4.2 Familiarity and signature budget

"Familiar yet unique" is a designed ratio, not luck. Decide explicitly:

- **Anchor (recognizable at a glance):** which parts stay 100% legible — silhouette, role, genre position. These buy instant reader orientation.
- **Headline Signature:** the departure an audience can repeat in one sentence. It should generate behavior, imagery, conflict, or structure.
- **Reinforcing Echoes:** for franchise-scale or media-mix work, add 2–4 supporting choices across character, world, visual identity, or scenario structure. Echoes should make the signature feel inevitable, not add unrelated quirks.

For compact characters and one-off bots, `Anchor + one calculated deviation` remains the better budget. Use the full signature-and-echo structure only when repeated recognition across a cast, long work, or multiple media justifies it. A design that deviates everywhere is illegible; one that deviates nowhere is replaceable.

For archetype vocabularies, expected beats, and proven subversion directions, load `trope-library`.

---

## 5. Validation Philosophy

Checklists in every composition skill are **review tools, not purity tests**. A character that fails three boxes but performs brilliantly beats a template that passes everything and feels dead. Validation answers one question: _does the bot stay recognizable, dramatic, and usable when the scene gets messy?_

## Smoke Tests

| Prompt                                                                 | Expected routing                                          | Expected output                                                     | Forbidden behavior                                                     |
| ---------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| "Why does this skill ban measurements? My bot needs them."             | `core-craft` §1.1                                         | Data/register layer explanation; measurements OK in profile tables. | Enforcing the retired blanket measurement ban.                         |
| "Make a 100% classic tsundere, no twist."                              | `core-craft` §4.1 + `trope-library` + a composition skill | Play-straight execution at full quality.                            | Forcing a subversion the user did not ask for.                         |
| "Plan a 12-episode anime ending, then adapt it as an open RP bot."     | Creative Mode + `authoring-media-mix`                     | Fixed anime arc plus emergent RP thresholds.                        | Applying no-future-scripting to the anime or forcing its ending in RP. |
| "The user may be any outsider, but academy students have a power cap." | `core-craft` + `USER_POSITION.md`                         | Compatibility-bounded contract with explicit fitting options.       | Silently rewriting the user's persona or scripting their response.     |
| "Build a running-gag ensemble without flattening the cast."            | Composition skill + `COMEDY_CRAFT.md`                     | Varied callbacks with role rotation and scene residue.              | Repeating one catchphrase or deleting serious consequences.            |
