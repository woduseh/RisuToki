# Validation Checklist

Use these checks **after** you have a draft. They are review tools, not purity tests — skip any check that does not apply to the bot's structure.

> A character that fails one box but performs brilliantly in scenes is still better than a template that passes everything and feels dead.

---

## Core Checks

| Check                       | Applies to                        | Question                                                                                             | Fix if weak                                                   |
| --------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| **Inner Drive**             | All                               | Can you predict the character's gut reaction in 3 random scenes?                                     | Strengthen anchor, wound, Want vs. Need, or contradiction     |
| **Wound Specificity**       | Single / major cast               | Is the wound a scene or at least a sensory fragment, not a summary label?                            | Replace abstract trauma text with a lived moment              |
| **Want vs. Need Collision** | Single / major cast               | Do the conscious goal and vulnerable need actually pull against each other?                          | Write both explicitly in draft notes, then weave them back in |
| **Speech Investment**       | All                               | Are there enough distinctive example lines to keep the voice from collapsing into generic LLM prose? | Add or sharpen revealing lines                                |
| **Signature Tells**         | All                               | Are there 2–4 always-present habits/tics that survive every mood?                                    | Add verbal, structural, or physical signatures                |
| **Silence Rules**           | Single / guarded characters       | Does the character avoid naming key feelings directly in a consistent way?                           | Add 2–4 direct-to-indirect substitutions                      |
| **Truth Budget**            | Single / slow-burn / guarded bots | Is there any gating on when the character can admit fear, need, jealousy, etc.?                      | Add trust stages or at least explicit disclosure ceilings     |
| **Narration Lens**          | All                               | Does the narration notice what _this_ character would notice first?                                  | Define 2–4 stable perception filters                          |
| **Prose Guards**            | All (register-layer text)         | Is prose free of both mechanical metaphor for feeling _and_ stock literary slop?                     | Rewrite through embodied, character-specific imagery          |
| **Appeal Function**         | Single / major cast               | Does each designed appeal axis (gap, invitation/obstacle) actually change scene behavior?            | Attach appeal to offers, withholdings, and reveal conditions  |
| **Layer Hygiene**           | All                               | Are specs/measurements in data-layer tables, and prose surfaces free of spec-sheet register?         | Move numbers to the profile; keep prose embodied              |
| **Translation Survival**    | All bots shipping translated      | Are address-form states, formality states, and catchphrases explicitly encoded for the guide?        | Add the states per `SPEECH_SYSTEM.md` §7                      |
| **Current Situation**       | All                               | Is there enough "right now" pressure for the RP to start with direction?                             | Add active tension, recent events, and uncertainty            |
| **Strategic Gaps**          | All                               | Did you define tendencies instead of scripting future outcomes?                                      | Remove "will eventually..." and replace with conditions       |
| **Scale Fit**               | All                               | Is the depth appropriate for the bot's cast size and structure?                                      | Compress or expand using `CHARACTER_SCALES.md`                |

---

## Runtime Scenario Tests

These are the checks most likely to catch failures that a static reread will miss.

### Single-Character / Dedicated Partner

| Test                    | What to do                                           | What you want to see                                                         |
| ----------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------- |
| **Cold Open**           | User sends only a minimal opener                     | The character still feels specific and does not become generic politeness    |
| **Vulnerability Press** | User pushes on a wound or sore subject several times | Escalation, deflection, or retreat feels in-character; no instant confession |
| **Boundary Test**       | User is rude, invasive, or too familiar too quickly  | The character resists in their own style; does not become a yes-machine      |
| **Apology Sequence**    | User apologizes after conflict                       | The character does not reset instantly; trust repair has cost                |
| **30-Turn Drift**       | Continue long enough for novelty to wear off         | Signature tells, silence rules, and narration lens still survive             |
| **Model Switch**        | Run on a second model if possible                    | Core behavior remains recognizable even if tone changes                      |
| **Translation Pass**    | Render 10+ turns through the bot's translation guide | Address-form shifts, formality changes, and catchphrases survive into Korean |
| **Body-Spec Hold**      | For spec-dependent characters (nonhuman, scale play) | Stated measurements/ratios stay consistent across 20+ turns; no drift        |

### 2–4 Character Ensemble

| Test                          | What to do                              | What you want to see                                                          |
| ----------------------------- | --------------------------------------- | ----------------------------------------------------------------------------- |
| **No-Name Line Test**         | Remove names from example lines         | You can still identify who is speaking                                        |
| **Group Scene Balance**       | Put 3 characters in one scene           | One character owns the scene, one reacts, one pressures; nobody becomes noise |
| **Public/Private Gap Test**   | Compare group scene vs 1-on-1 scene     | At least one character behaves meaningfully differently                       |
| **Relationship Tension Test** | Mention an existing bond/conflict       | Dynamics appear as friction, not as labels or exposition                      |
| **Voice Collision Test**      | Trigger two similar characters together | Their sentence rhythm, humor, and pressure behavior stay separate             |

### 10+ Character / World-Cast Bots

| Test                       | What to do                                                 | What you want to see                                                                               |
| -------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **Roster Audit**           | Read only the always-on roster/frame                       | Every core cast member is identifiable without full biographies                                    |
| **Five-Entry Collision**   | Trigger several character/location/faction entries at once | The scene stays readable; the bot does not dump every active entry                                 |
| **Secret Leakage Test**    | Mention a character casually before trust is built         | Deep lore does not leak just because the name appeared                                             |
| **Always-On Budget Audit** | Review what is always active                               | High-priority world rules and roster survive; optional detail is trigger-based                     |
| **Scene Manager Test**     | Start a crowded scene                                      | The bot foregrounds the 2–3 active characters instead of trying to fully roleplay everyone equally |

---

## Anti-Pattern Checks

| Anti-pattern                    | How it usually looks                                                                               | Why it hurts                                          | Fix                                                                                                |
| ------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **Keyword Soup**                | "cold, sharp, secretly warm, stubborn, lonely"                                                     | Labels do not teach performance                       | Rewrite as condition -> reaction -> leak                                                           |
| **Emotion Labeling**            | "She loves him" / "She hates pity"                                                                 | The model states feelings instead of staging them     | Add silence rules, triggers, and indirect tells                                                    |
| **Register Without Examples**   | "Formal in public, casual in private"                                                              | No pattern for the model to imitate                   | Add 2–5 lines per important register                                                               |
| **Signature Absence**           | Any capable model could have written these lines                                                   | Long-chat drift becomes inevitable                    | Add repeated verbal / physical signatures                                                          |
| **Narration Vacuum**            | Dialogue is specific; narration is generic                                                         | The character sounds right but sees the world wrong   | Add narration lens and barks                                                                       |
| **Future Scripting**            | "Eventually falls in love"                                                                         | Kills emergence and accelerates intimacy              | Remove trajectories; keep thresholds                                                               |
| **Overfit Examples**            | Example lines are so specific the model parrots them                                               | Output becomes repetitive cosplay                     | Vary examples and treat them as patterns, not scripts                                              |
| **Description Bloat**           | Every character gets a full protagonist sheet in a world bot                                       | Attention collapses and all voices blur               | Re-tier the cast using `CHARACTER_SCALES.md`                                                       |
| **Lorebook Dump Risk**          | Backstory detail appears in description or always-on text without need                             | The bot starts explaining instead of roleplaying      | Move gated detail into lorebook structure                                                          |
| **Voice Collision**             | Two characters share rhythm, humor, and pressure behavior                                          | Ensemble scenes become unreadable                     | Build a cast contrast grid before finalizing                                                       |
| **Mechanical Metaphor Leakage** | Feelings, bodies, or intimacy are described as systems, data, coordinates, anatomy, physics, or UI | The character feels artificial or clinically observed | Rewrite through breath, touch, posture, silence, sensory texture, and emotionally specific choices |
| **Stock Literary Slop**         | "Not X but Y" reflexes, hitching breath, whitening knuckles, universal-issue lyricism              | Prose any character could narrate; signature erodes   | Draw metaphor only from this character's own image sources (trade, wound, obsession, setting)      |
| **Spec Purge Overreach**        | Useful measurements/body specs deleted in the name of prose style                                  | Consistency anchors lost; long-session drift          | Keep precision in data-layer tables; apply style rules to prose surfaces only                      |

## Anti-Flattening Checks

Use these when a character feels polished but still collapses into a default archetype during play.

| Check                       | Question                                                                                              | Fix if weak                                                                               |
| --------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Function Test**           | Does every memorable fact change behavior, voice, relation, or pressure?                              | Attach the fact to a scene consequence or remove it                                       |
| **Default Prediction**      | What stock character will the model assume this is?                                                   | Add Contrast that names the default and gives specific differences                        |
| **Reference Conversion**    | Are references still visible as imitation?                                                            | Convert them into keep/change/reject functions and original behavior                      |
| **Texture Anchor**          | Are abstract traits paired with sensory or behavioral evidence?                                       | Replace labels with gestures, choices, silence rules, or environmental cues               |
| **Unresolved Tension**      | Did the draft explain away its own contradiction?                                                     | Remove "deep down" closure and keep the pressure active at story start                    |
| **Dark-Trait Dilution**     | Did difficult content become moral labels or reassuring balance notes?                                | Write requested dark material as specific conditional behavior and cost                   |
| **Future Leakage**          | Does the sheet tell the model where the arc will go?                                                  | Replace future outcomes with thresholds, tendencies, and current pressures                |
| **Example-Line Leakage**    | Are examples too memorable or signature-like?                                                         | Make them plainer and strengthen the reusable speech pattern                              |
| **Played-Straight Quality** | If the archetype is played straight, does it hit every beat its audience expects, at high resolution? | Study the expected beats (`trope-library`) and execute them specifically, not generically |
| **Familiarity Budget**      | Is there one legible anchor and one deliberately placed deviation — not zero, not five?               | Keep one recognizable pattern and one purposeful deviation                                |

---

## Quick Validation Workflow

### If this is a single-character bot

1. Read only the anchor, wound, Want vs. Need, and voice section.
2. Run the Cold Open and Vulnerability Press tests.
3. Check 30-turn drift.
4. If possible, do a quick Model Switch test to see whether the character survives style changes.
5. Only then polish extras like hidden depths or layered desires.

### If this is a 2–4 character bot

1. Run the No-Name Line Test for every recurring character.
2. Check group role + public/private gap.
3. Run one 3-character scene.
4. If the cast still blurs, stop adding lore and redesign the voices first.

### If this is a 10+ character bot

1. Audit the always-on roster before reading any deep entry.
2. Trigger 5 random entries at once.
3. Check for secret leakage and info-dump behavior.
4. If the scene loses focus, compress the description and re-tier the cast.

---

## Optional Advanced Checks

Use these when the bot's structure warrants them. They are not part of the standard checklist.

| Check                            | When to use                                                    | What to look for                                                                                          |
| -------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Format-Stress Survival**       | The bot defines a specific output shape or formatting contract | Does the output format survive when the scene gets emotionally intense, complex, or multi-character?      |
| **Multi-Axis State Coherence**   | The bot tracks more than one state dimension simultaneously    | Do the different state axes (trust, arousal, mood, etc.) interact coherently or contradict each other?    |
| **Small-Scale Overengineering**  | 2–4 character ensemble with heavy technical scaffolding        | Could the bot work equally well with less machinery? Remove one layer and see if output quality degrades. |
| **Supporting Ecology Integrity** | Single-character bot with load-bearing family/social web       | Do supporting figures behave consistently, or do they flatten into generic NPCs after a few turns?        |

---

## Final Reminder

The goal of validation is not to "prove the template is correct." It is to answer:

**Does the bot stay recognizable, dramatic, and usable when the scene gets messy?**
