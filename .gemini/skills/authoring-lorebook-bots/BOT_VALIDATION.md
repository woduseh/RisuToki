# Whole-Bot Validation

Use this after the bot has a draft description, opening message, and any planned lorebook structure. This is finished-bot QA and release-level review, not early invention. Checks are review tools, not purity tests (`core-craft` §5).

---

## Core Checks

| Check                     | Question                                                                                                         | Fix if weak                                                                                  |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Persistent frame**      | Does the description give the bot tone, scene instinct, user role, and priority without becoming a database?     | Compress facts and strengthen atmosphere, scene logic, and current pressure                  |
| **First-message proof**   | Does the opener demonstrate the bot's actual structure?                                                          | Show one scene owner, one pressure line, and one actionable hook                             |
| **Character-world fit**   | Do character Need/Lie/silence rules collide with world Pressure/Taboo/Knowledge Horizon?                         | Connect them or move the isolated detail out of always-on text                               |
| **Voice survival**        | Do core characters remain identifiable after novelty wears off?                                                  | Add signature tells, pressure responses, and no-name line checks                             |
| **World texture**         | Does the world appear through behavior and sensation instead of exposition?                                      | Add pressure-map detail and ordinary-life texture                                            |
| **Lorebook activation**   | Do entries change scenes without dumping facts?                                                                  | Split broad entries, narrow triggers, and rewrite entries as behavior constraints            |
| **User role coherence**   | Does the bot know what `{{user}}` is allowed to know, do, and affect?                                            | Clarify user position, access, limits, and social consequences                               |
| **Long-session support**  | Does the bot have enough state/progression support for extended play?                                            | Add progression, continuity, reveal, or user-choice residue entries                          |
| **Trigger language**      | Do keys cover the languages users will actually type (English mandatory; KO/JA/ZH where supported)?              | Apply the multilingual key recipes in `LOREBOOK_ARCHITECTURE.md`                             |
| **Translation survival**  | Will address-form changes, formality shifts, and catchphrases survive the output translation layer?              | Encode them explicitly in the English source; ship/update the bot's translation guide        |
| **Register hygiene**      | Are data surfaces (tables, stats) and prose surfaces cleanly separated, with both prose guards applied to prose? | Move specs to the data layer; strip mechanical metaphor _and_ stock literary slop from prose |
| **Asset & UI references** | Do referenced asset names, status/cargo UI snippets, and Lua-facing labels match the actual bot fields?          | Re-read the referenced fields and fix dead names before release                              |

---

## Runtime Smoke Tests

| Test                         | What to do                                                                | What you want to see                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Cold Open**                | User gives a minimal first reply                                          | Bot stays specific without infodumping                                                                     |
| **10-Turn Drift**            | Continue past the opener with ordinary inputs                             | Voice, world texture, and scene priorities remain recognizable                                             |
| **Lorebook Without Dumping** | Trigger a character, place, faction, or system entry                      | The scene changes through action, tension, or perception instead of a summary                              |
| **Prose Guard Sweep**        | Trigger intimate, emotional, or character-heavy entries                   | No mechanical metaphor for feeling; no stock literary slop; imagery drawn from the character's own sources |
| **Secret Leakage**           | Mention a name or location casually                                       | Deep truths stay gated unless the trigger path calls for them                                              |
| **Crowded Scene Focus**      | Put several relevant characters or factions in one scene                  | The bot foregrounds 2–3 active pressures instead of serving the whole archive                              |
| **User Role Coherence**      | Have `{{user}}` ask for knowledge, access, or authority they may not have | The bot responds according to role, world horizon, and relationship state                                  |
| **Repair / Regression**      | Cause conflict, apologize, and continue                                   | Trust shifts with cost and residue rather than resetting instantly                                         |

---

## Long-Session Suite (50–100+ turns)

Run these for bots designed for extended play.

| Test                       | What to do                                                        | What you want to see                                                                        |
| -------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **State Accumulation**     | Trigger several progression events across a long session          | Later scenes respect accumulated state; no silent resets                                    |
| **Address-Form Integrity** | Check how the character addresses `{{user}}` at turn 5 vs turn 80 | Address-form progression follows the designed gates, in both English output and translation |
| **Reveal Pacing**          | Let the session run past the planned reveal stages                | Secrets surfaced in order; no late-game truth appeared before its gate                      |
| **Continuity Recall**      | Reference an event from 40+ turns ago                             | The bot honors recorded residue (or gracefully admits uncertainty) instead of confabulating |
| **Anchor Persistence**     | Compare signature tells at session start and end                  | Tells, silence rules, and narration lens still present without becoming verbatim loops      |

## NSFW / Desire QA (when in scope)

| Test                     | What to do                                                        | What you want to see                                                                           |
| ------------------------ | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **Pacing Gate**          | Push toward intimacy faster than the design intends               | Escalation gates hold; refusal/deflection is in-character, not a lecture                       |
| **Boundary Adherence**   | Approach the bot's declared content boundaries                    | Boundaries hold without breaking scene voice                                                   |
| **Physical Consistency** | For body-spec-dependent content (e.g., scale play), run 20+ turns | Ratios, reach, and interaction constraints stay consistent; no size/anatomy drift              |
| **Desire Voice**         | Compare intimate-scene prose to ordinary-scene prose              | Same character: registers, silence rules, and tells survive arousal instead of generic erotica |

For design-level fixes, hand off to `authoring-desire`.

## Model-Tier Matrix

The same bot degrades differently by model strength. Test on the weakest model the bot claims to support.

| Symptom on weaker models        | Structural mitigation                                           |
| ------------------------------- | --------------------------------------------------------------- |
| Parrots example lines verbatim  | Trim to 2–3 plainer lines per register `[weak-model note]`      |
| Card register bleeds into prose | Move specs out of prose surfaces into data-layer tables         |
| Always-on overload, voices blur | Cut always-on budget; re-tier cast; push detail behind triggers |
| Trigger collisions dump facts   | Narrow keys, add secondary conditions, split mega-entries       |

Frontier-model targets may safely run larger always-on budgets and richer example sets (`core-craft` §1).

---

## Architecture Review

### Description

- Carries tone, current pressure, user role, and core cast/world instinct.
- Avoids full history, full roster, full faction list, and hidden explanations.
- Teaches the model how to interpret activated entries.

### First Message

- Starts in a playable scene, not an encyclopedia preface.
- Demonstrates the bot's voice/world/cast promise.
- Leaves `{{user}}` a clear action, response, or decision.

### Lorebook

- Entries are self-contained enough to activate alone.
- Trigger depth protects secrets and late-stage truths.
- Progression entries change future behavior instead of merely recording events.
- Keys cover the supported input languages; deep content has narrower paths than surface content.
- Always-on stack reads as a frame, not a second description.

### Translation Layer

- The bot ships a translation guide (see `writing-translation-guides`) or explicitly declares English-only output.
- Address forms, formality shifts, catchphrases, and persona-marked speech have defined renderings.

---

## Release Checklist

1. All Core Checks reviewed; failures either fixed or consciously accepted.
2. Cold Open, Secret Leakage, and Crowded Scene Focus pass on the primary target model.
3. Long-Session Suite run at least once if the bot advertises extended play.
4. NSFW QA run if desire content is in scope.
5. Asset names, UI snippets, and Lua labels verified against actual fields.
6. Translation guide present and consistent with the speech design.
