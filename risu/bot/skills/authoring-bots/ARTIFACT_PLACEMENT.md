# Bot Artifact Placement

Use this reference when deciding where authored information or state belongs. Placement depends on the actual preset and activation settings; there is no fixed cast-size or token threshold.

| Surface                               | Relevant contract                                                                                                                                                                                                            |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Description                           | Character or world context available whenever the configured request includes the description. Put facts needed without a conditional activation here or in an intentionally always-active entry.                            |
| Lorebook                              | Context selected by activation rules. Separate facts that need different conditions, especially secrets and state-dependent variants. An entry cannot depend on another entry being present unless activation guarantees it. |
| `globalNote`                          | A separate instruction surface whose inclusion and position depend on request assembly. Do not assume it is always last or has universal priority.                                                                           |
| `firstMessage` / `alternateGreetings` | Initial scene text and selectable alternatives. Preserve the chosen narrative mode and existing setup; an opening is not a mandatory addition to every edit.                                                                 |
| `exampleMessage`                      | Dialogue examples when the preset includes them. Neither their inclusion nor an ideal example count is universal.                                                                                                            |
| User persona                          | User-owned persona data, distinct from the card. A card may establish a relationship or required premise without silently changing the user's persona.                                                                       |

## Activation and language

Lorebook matching depends on the configured scan sources, depth, and activation rules. Match keys to the text that can actually occur there, including supported player languages and names used by the bot. Do not add languages merely to meet a quota.

Substring keys can match Korean names with particles and unspaced Japanese or Chinese, but short common strings can collide. Whole-word rules may reject those forms. Check `writing-lorebooks` for the actual matching options, decorators, secondary conditions, recursion, and priorities instead of inferring them from ordinary word boundaries.

An ordinary keyword entry does not activate merely because a state variable changed. Use the documented conditional or injection mechanism when the selection depends on state. A broad name key can expose a secret too early; separate publicly usable context from gated knowledge when the design requires secrecy.

## Persistent state

For scenarios that require exact counts, weighted selection, or repeatable transitions, distinguish model-authored narration from the component that owns the state. Prose alone is not a durable state store, and display-only HTML or regex output is not automatically model context.

Use the shared Lua/CBS/trigger references for storage types, callback order, injection timing, and reroll behavior. Keep those API contracts in their owning references rather than copying a second implementation here. In particular, verify whether a change is visible in the current request or the next one, and whether regeneration reapplies a mutation.

A lorebook can supply state-dependent context; it does not by itself advance a clock, enforce an outcome, or remember every past event. Preserve only the state and history the requested experience needs, with an explicit owner where competing writers could conflict.
