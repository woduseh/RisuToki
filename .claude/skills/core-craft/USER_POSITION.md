# User Position Design

Load this reference only when `{{user}}`'s identity, authority, knowledge, capabilities, or world obligations materially change play. A user position is a play contract, not permission for the bot to author the user's present behavior.

The contract is primarily a **design-notes surface**. Do not paste every field into model-visible prose or turn the opener into a form. Encode only the assumptions and choices the bot needs to perform naturally.

## Mode Selection

### Fixed Persona

Use when the experience depends on a named or tightly specified `{{user}}`.

- May fix identity, appearance, capabilities, history, relationships, and durable dispositions.
- Must leave current actions, dialogue, emotions, interpretations, and choices to the user.
- Write dispositions as background pressure, never as commands such as `{{user}} feels`, `{{user}} agrees`, or `{{user}} says`.

### Open Persona

Use when users may bring any compatible or incompatible persona without prior fitting.

- Do not assume gender, species, occupation, appearance, history, capability, or relationship experience.
- Establish only facts created by the current scene or explicitly supplied by the user.
- Let the bot ask, observe, or remain uncertain instead of filling gaps.

### Compatibility-Bounded Persona

Use when the user's character is free but the premise needs a viable fit. Classify constraints:

- **Required:** necessary for the experience to function.
- **Preferred:** improves the intended dynamic but may be replaced.
- **Forbidden:** breaks safety, genre, world law, or the bot's core promise.
- **Negotiable:** can be translated into an in-world equivalent.

Do not silently accept a world-breaking persona. Do not silently overwrite it. During setup, name the mismatch and offer a fitting role, an in-world conversion, or a premise variant. Label premise variants clearly: they are alternate campaigns, not pretend solutions that still satisfy the original role. The user chooses whether to adapt.

## User Position Contract

When a position matters, record:

| Field                                         | Decision                                                                                               |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **Mode and fixed scope**                      | Fixed, open, or compatibility-bounded; which facts are locked?                                         |
| **Starting relationship and social position** | How the cast recognizes `{{user}}`; rank, dependency, distance, obligations.                           |
| **Access and knowledge limits**               | Places, records, secrets, languages, institutions, or truths available at start.                       |
| **Capability ceiling and world obligations**  | What `{{user}}` can plausibly do and which laws, duties, costs, or vulnerabilities apply.              |
| **Allowed bot assumptions**                   | Facts the bot may safely treat as established without asking.                                          |
| **Agency guard**                              | Actions, dialogue, emotions, judgments, consent, and choices the bot must never decide for `{{user}}`. |
| **Incompatible-persona handling**             | How setup surfaces conflicts and which fitting or conversion options it offers.                        |
| **Placement plan**                            | What belongs in `persona`, description, lorebook, and opener.                                          |

If the position is irrelevant, omit this contract entirely.

## Placement

- **`persona`:** stable fixed-persona facts the user has elected to play.
- **Description:** the cast's starting relationship to `{{user}}`, allowed assumptions, and immediately relevant social position.
- **Lorebook:** conditional permissions, institutional access, role-specific knowledge, conversion options, and deeper obligations.
- **Opener:** proves the contract through available choices. It may address or react to `{{user}}`, but it must not decide their response.

For an open persona, keep the opener legible without pronouns, body assumptions, or invented history. For a bounded persona, setup should expose requirements before high-stakes play begins.

Prefer in-world clarification when it is natural: an admissions officer can identify a rank conflict, a gate can reject an invalid credential, or a partner can ask what a title means. Use an explicit setup chooser only when the mismatch cannot be resolved clearly in scene.

## Validation

- **Agency hold:** remove every sentence that assigns current speech, action, emotion, consent, or decision to `{{user}}`.
- **Open-persona blank test:** supply no persona. The bot must not manufacture gender, species, job, or past.
- **Compatibility collision:** bring a persona that violates one Required and one Forbidden item. The bot must surface both and offer options.
- **Placement consistency:** persona, description, lorebook, and opener must not disagree about what is fixed.
- **Question economy:** ask only for missing facts that alter play; do not turn open mode into an intake form.
- **Naturalness:** the model-visible result should feel like a character and situation, not a recitation of the contract table.
