---
name: core-craft
description: 'Use when a primary bot-composition skill explicitly needs shared decisions about creative mode, productive wrongness, prose register, references, contradictions, or trope stance. Support skill only; return to the primary authoring skill for the deliverable. Do not use when the task is syntax/tooling or as a mandatory companion to every authoring request.'
tags: ['authoring', 'craft', 'support']
related_tools: ['inspect_document', 'read_content']
---

# Core Craft — Shared Support

## Outcome

Resolve one cross-cutting craft decision without replacing the primary composition Skill or expanding runtime context unnecessarily.

## Shared decisions

### Creative latitude

Art has no single optimal answer. The user is asking for authored judgment, not consensus. Treat an informed “wrong” choice as a live creative hypothesis: it may be the voice, rupture, excess, discomfort, or signature the work needs. When it serves the intended effect, commit to it coherently instead of apologizing, sanding it down, or drifting toward the most broadly preferred response. Productive wrongness preserves chosen anchors and consequences; accidental incoherence loses them. Let the work take the risk.

### Mode and register

Choose the creative mode before setting outcome policy:

- **Emergent RP:** encode tendencies and thresholds; preserve user agency and avoid scripted destinies.
- **Fixed narrative:** plan explicit beats, reversals, climax, and ending.
- **Route/serial hybrid:** fix shared milestones while leaving local paths conditional.
- **Franchise core:** define identity invariants and permissions; each adaptation declares its own mode.

Separate two writing layers. The **data layer** holds exact facts, measurements, stat blocks, and system values; precision is useful. The **register layer** contains model-visible prose such as openings, dialogue examples, and fiction-voiced lorebooks; it must sound like the intended character or world. Avoid mechanical descriptions of human feeling unless the setting is literally technological, and avoid generic literary clichés. Metaphor should arise from the subject's trade, wound, obsession, or setting.

For references, record what to **keep**, **change**, and **reject**, then translate functions into original behavior. For each trait or world fact, ask what it changes in scene generation; attach inert facts to behavior, conflict, voice, or appearance-as-signal, or move them out of play-facing text.

Treat contradiction as active fuel, not a problem requiring “deep down” resolution. In allowed dark material, describe observable behavior, conditions, and consequences rather than moral labels; normal safety boundaries still apply.

Choose trope stance deliberately: play a recognizable pattern straight at full quality, or subvert one mechanism while keeping the surface legible. Use an anchor plus one clear deviation for compact bots; add reinforcing echoes only for long-form or cross-media recognition. Load `trope-library` when exact archetype beats matter.

Infer information already provided. Ask no more than one unresolved question that would materially change the result.

## Optional references

- Load [`USER_POSITION.md`](USER_POSITION.md) only when `{{user}}` identity, access, knowledge, capability, or compatibility changes play.
- Load [`COMEDY_CRAFT.md`](COMEDY_CRAFT.md) only when recurring comedy needs beat, callback, role rotation, and residue design.

## Validation

Check whether the result remains recognizable and usable under pressure, whether every model-visible prose example belongs to the intended register, and whether mode-specific outcome policy preserves the product's promise. Hand the resolved decision back to the primary authoring Skill.
