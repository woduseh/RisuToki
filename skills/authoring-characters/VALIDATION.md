# Validation Checklist

Use these checks **after** you have a draft. They are diagnostic tools, not purity tests — skip any check that does not apply to the bot's architecture.

> A character that fails one box but performs brilliantly in scenes is still better than a template that passes everything and feels dead.

---

## Core Checks

| Check                       | Applies to                        | Question                                                                                             | Fix if weak                                                   |
| --------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| **Behavioral Engine**       | All                               | Can you predict the character's gut reaction in 3 random scenes?                                     | Strengthen anchor, wound, Want vs. Need, or contradiction     |
| **Wound Specificity**       | Single / major cast               | Is the wound a scene or at least a sensory fragment, not a summary label?                            | Replace abstract trauma text with a lived moment              |
| **Want vs. Need Collision** | Single / major cast               | Do the conscious goal and vulnerable need actually pull against each other?                          | Write both explicitly in draft notes, then weave them back in |
| **Speech Investment**       | All                               | Are there enough distinctive example lines to keep the voice from collapsing into generic LLM prose? | Add or sharpen diagnostic lines                               |
| **DNA Markers**             | All                               | Are there 2–4 always-present habits/tics that survive every mood?                                    | Add verbal, structural, or physical DNA markers               |
| **Silence Rules**           | Single / guarded characters       | Does the character avoid naming key feelings directly in a consistent way?                           | Add 2–4 direct-to-indirect substitutions                      |
| **Truth Budget**            | Single / slow-burn / guarded bots | Is there any gating on when the character can admit fear, need, jealousy, etc.?                      | Add trust stages or at least explicit disclosure ceilings     |
| **Narration Lens**          | All                               | Does the narration notice what _this_ character would notice first?                                  | Define 2–4 stable perception filters                          |
| **Current Situation**       | All                               | Is there enough "right now" pressure for the RP to start with direction?                             | Add active tension, recent events, and uncertainty            |
| **Strategic Gaps**          | All                               | Did you define tendencies instead of scripting future outcomes?                                      | Remove "will eventually..." and replace with conditions       |
| **Scale Fit**               | All                               | Is the depth appropriate for the bot's cast size and architecture?                                   | Compress or expand using `BOT_SCALES.md`                      |

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
| **30-Turn Drift**       | Continue long enough for novelty to wear off         | DNA markers, silence rules, and narration lens still survive                 |
| **Model Switch**        | Run on a second model if possible                    | Core behavior remains recognizable even if tone changes                      |

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

| Anti-pattern                  | How it usually looks                                                   | Why it hurts                                        | Fix                                                   |
| ----------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------- |
| **Keyword Soup**              | "cold, sharp, secretly warm, stubborn, lonely"                         | Labels do not teach performance                     | Rewrite as condition -> reaction -> leak              |
| **Emotion Labeling**          | "She loves him" / "She hates pity"                                     | The model states feelings instead of staging them   | Add silence rules, triggers, and indirect tells       |
| **Register Without Examples** | "Formal in public, casual in private"                                  | No pattern for the model to imitate                 | Add 2–5 lines per important register                  |
| **DNA Absence**               | Any capable model could have written these lines                       | Long-chat drift becomes inevitable                  | Add repeated verbal / physical signatures             |
| **Narration Vacuum**          | Dialogue is specific; narration is generic                             | The character sounds right but sees the world wrong | Add narration lens and barks                          |
| **Future Scripting**          | "Eventually falls in love"                                             | Kills emergence and accelerates intimacy            | Remove trajectories; keep thresholds                  |
| **Overfit Examples**          | Example lines are so specific the model parrots them                   | Output becomes repetitive cosplay                   | Vary examples and treat them as patterns, not scripts |
| **Description Bloat**         | Every character gets a full protagonist sheet in a world bot           | Attention collapses and all voices blur             | Re-tier the cast using `BOT_SCALES.md`                |
| **Lorebook Dump Risk**        | Backstory detail appears in description or always-on text without need | The bot starts explaining instead of roleplaying    | Move gated detail into lorebook architecture          |
| **Voice Collision**           | Two characters share rhythm, humor, and pressure behavior              | Ensemble scenes become unreadable                   | Build a cast contrast grid before finalizing          |

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

Use these when the bot's architecture warrants them. They are not part of the standard checklist.

| Check                            | When to use                                                    | What to look for                                                                                           |
| -------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Format-Stress Survival**       | The bot defines a specific output shape or formatting contract | Does the output format survive when the scene gets emotionally intense, complex, or multi-character?       |
| **Multi-Axis State Coherence**   | The bot tracks more than one state dimension simultaneously    | Do the different state axes (trust, arousal, mood, etc.) interact coherently or contradict each other?     |
| **Small-Scale Overengineering**  | 2–4 character ensemble with heavy technical scaffolding        | Could the bot work equally well with less machinery? Remove one system and see if output quality degrades. |
| **Supporting Ecology Integrity** | Single-character bot with load-bearing family/social web       | Do supporting figures behave consistently, or do they flatten into generic NPCs after a few turns?         |

---

## Final Reminder

The goal of validation is not to "prove the template is correct." It is to answer:

**Does the bot stay recognizable, dramatic, and usable when the scene gets messy?**
