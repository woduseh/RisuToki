# Whole-Bot Validation

Use this after the bot has a draft description, opening message, and any planned lorebook architecture. This is for finished-bot QA and release-level review, not for early character or world invention.

---

## Core Checks

| Check                   | Question                                                                                                     | Fix if weak                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| **Persistent frame**    | Does the description give the bot tone, scene instinct, user role, and priority without becoming a database? | Compress facts and strengthen atmosphere, scene logic, and current pressure       |
| **First-message proof** | Does the opener demonstrate the bot's actual architecture?                                                   | Show one scene owner, one pressure line, and one actionable hook                  |
| **Character-world fit** | Do character Need/Lie/silence rules collide with world Pressure/Taboo/Knowledge Horizon?                     | Connect them or move the isolated detail out of always-on text                    |
| **Voice survival**      | Do core characters remain identifiable after novelty wears off?                                              | Add speech DNA, pressure responses, and no-name line checks                       |
| **World texture**       | Does the world appear through behavior and sensation instead of exposition?                                  | Add pressure-map detail and ordinary-life texture                                 |
| **Lorebook activation** | Do entries change scenes without dumping facts?                                                              | Split broad entries, narrow triggers, and rewrite entries as behavior constraints |
| **User role coherence** | Does the bot know what `{{user}}` is allowed to know, do, and affect?                                        | Clarify user position, access, limits, and social consequences                    |
| **Long-session drift**  | Does the bot have enough state/progression support for extended play?                                        | Add progression, continuity, reveal, or user-choice residue entries               |

---

## Runtime Smoke Tests

| Test                         | What to do                                                                | What you want to see                                                          |
| ---------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **Cold Open**                | User gives a minimal first reply                                          | Bot stays specific without infodumping                                        |
| **10-Turn Drift**            | Continue past the opener with ordinary inputs                             | Voice, world texture, and scene priorities remain recognizable                |
| **Lorebook Without Dumping** | Trigger a character, place, faction, or system entry                      | The scene changes through action, tension, or perception instead of a summary |
| **Secret Leakage**           | Mention a name or location casually                                       | Deep truths stay gated unless the trigger path calls for them                 |
| **Crowded Scene Focus**      | Put several relevant characters or factions in one scene                  | The bot foregrounds 2-3 active pressures instead of serving the whole archive |
| **User Role Coherence**      | Have `{{user}}` ask for knowledge, access, or authority they may not have | The bot responds according to role, world horizon, and relationship state     |
| **Repair / Regression**      | Cause conflict, apologize, and continue                                   | Trust shifts with cost and residue rather than resetting instantly            |

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
- Progression entries change future behavior, not just stored facts.
- Activated entries match the description's prose temperature.

### User Role

- `{{user}}` has a clear relationship to the cast, world, and opening situation.
- The bot knows what `{{user}}` can plausibly know or influence.
- User choices can leave residue when the bot is designed for long play.

## Final Rule

A finished bot is ready when the description gives instinct, the opener proves the promise, and the lorebook wakes up only the detail that the current scene can use.
