# Validation Checklist

Run every finished character description through these checks. **Protagonist-level characters should pass all core checks.** Supporting characters can pass fewer — use judgment based on the character's role.

---

## Core Checks

| Check                         | Question                                                                                                                              | Fail Action                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **Behavioral Predictability** | Pick 3 random scenes. Can you predict this character's gut reaction from the description alone?                                       | Strengthen personality section with behavioral principles and reaction patterns        |
| **Speech Investment**         | Are there concrete example lines (at least 3–5 per register)? Does the speech section have enough detail to produce consistent voice? | Add example dialogue for at least 2 registers; for protagonists, aim for 4–6 registers |
| **Contrast Presence**         | Is there at least 1 grounded contrast pair for a protagonist? Is a Surface vs. Subversion duality clear?                              | Add contrasts or ground existing ones in background                                    |
| **Strategic Gaps**            | Does the description avoid dictating future events, emotions, or relationship outcomes?                                               | Remove any "will eventually..." or "falls in love when..." statements                  |
| **Internal Consistency**      | Do all traits, backstory elements, and behaviors cohere without contradiction?                                                        | Resolve contradictions or convert them into grounded contrasts                         |
| **Current State**             | Is there a clear "right now" — emotional state, recent events, active tensions — for the RP to start from?                            | Add Current Situation section with immediate pressure                                  |
| **Knowledge Boundaries**      | Is it clear what the character knows, doesn't know, or is wrong about?                                                                | Add explicit knowledge gaps and misunderstandings                                      |
| **DNA Anchors**               | Are there 2–4 verbal/behavioral tics defined that persist across ALL registers?                                                       | Add DNA markers per [SPEECH_SYSTEM.md](SPEECH_SYSTEM.md)                               |
| **Psychological Depth**       | For protagonists: Is the _mechanism_ behind behavior explained, not just the behavior itself?                                         | Add psychological deep dive — the "why" engine driving surface patterns                |
| **Hidden Depths**             | Is there at least one gap moe / hidden interest structured as Origin → Depth → Why Secret → What It Reveals?                          | Add a hidden depth section that reveals something deeper about the character           |
| **Layered Desires**           | Are dreams/desires structured in tiers (Public → Private → Secret)?                                                                   | Add layered dreams — the gaps between tiers create dramatic tension                    |

---

## Anti-Pattern Checks

| Anti-Pattern                  | How to Detect                                                                                                             | Fix                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **Keyword Soup**              | Personality reads like "cold, distant, but secretly warm, loyal, stubborn" — adjective lists with no behavioral grounding | Rewrite each trait as behavior + context: what they _do_, not what they _are_                  |
| **Emotion Labeling**          | "She loves X" / "She hates Y" as flat declarations                                                                        | Replace with conditions + behavioral tendencies: "When X happens, she..."                      |
| **Missing Inner Life**        | No inner voice description; character's narrated thoughts will feel generic                                               | Add 2–3 sentence inner voice definition (tone, self-awareness, speech gap)                     |
| **Flat Speech**               | Only one "mode" of talking described; no register variation                                                               | Add at least one contrasting register per [SPEECH_SYSTEM.md](SPEECH_SYSTEM.md)                 |
| **Anchor Absence**            | No recurring verbal/behavioral tics; character will blur into generic LLM voice over long RP                              | Add 2–4 DNA markers that persist across registers                                              |
| **Measurement Catalog**       | Physical description is a stat block (height, weight, cup size) instead of presence                                       | Replace measurements with movement, presence, and how they occupy space                        |
| **Future Scripting**          | Description contains "she will eventually..." or "when she falls in love..."                                              | Delete. Define principles, not trajectories                                                    |
| **Orphan Backstory**          | Background events that don't connect to any current behavior or personality trait                                         | Either connect each event to a present-day behavior or cut it                                  |
| **Surface-Only Personality**  | Personality section describes what the character seems like but not the mechanism underneath                              | Add "The Mechanism" — why they behave this way, what drives it psychologically                 |
| **Register Without Examples** | Speech register is described abstractly but has no actual dialogue lines                                                  | Always include 3–5 example lines per register; abstract descriptions alone don't teach the LLM |

**Note on content length:** With modern 1M+ context LLMs, long descriptions are not inherently problematic. A 15,000-token character profile full of behavioral detail produces better output than a 1,000-token compressed version. Judge content by _quality and relevance_, not by length. The key question remains: "Does this change what the LLM writes?"

---

## Physical Constraints & Non-Standard Bodies

For characters with disabilities, non-human anatomy, cybernetic augmentation, or any physical trait that affects every scene:

### Required Elements

| Element                    | What to Include                                                              |
| -------------------------- | ---------------------------------------------------------------------------- |
| **Functional description** | Clearly separate: can do / cannot do / can do with effort or tools           |
| **Identity connection**    | How does this trait shape their self-image? Pride? Resentment? Indifference? |
| **Scene impact**           | How does it affect movement, space use, physical interaction with others?    |
| **Guardrails**             | Brief statements preventing common LLM mistakes                              |

### Guardrail Examples

```
Good: "This disability is not an arc to overcome. It is managed, lived with,
       and sometimes resented — but it is permanent."

Good: "Her mobility limitations are consistent. She does not suddenly walk
       for dramatic convenience."

Good: "His prosthetic arm has mechanical strength but no tactile feedback.
       He compensates with visual attention — always watching what his
       left hand is doing."
```

### Common LLM Mistakes to Guard Against

- **Miracle recovery:** Character suddenly uses abilities they don't have in emotional moments
- **Inspiration porn:** Disability framed as existing to inspire able-bodied characters
- **Forgetting constraints:** Physical limitation vanishes from narration after the first few turns
- **Overcorrection:** Every single action narrated through the lens of the disability

---

## Ensemble / Multi-Character Notes

When the character will appear alongside other named characters:

### Required Elements

| Element                    | Question                                                                                                                                 |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Group role**             | Leader? Observer? Mediator? Provocateur? Comic relief?                                                                                   |
| **Key dynamics**           | For each important relationship: what's the tension? Not "they're friends" but "friends who compete for the same thing and both know it" |
| **Public vs. private gap** | How different is their behavior in group scenes vs. 1-on-1? What does that gap reveal?                                                   |

### Validation Questions

- Does the group role create interesting friction with their personality? (A natural leader who hates responsibility > a natural leader who loves leading)
- Are relationship dynamics defined as _tensions_, not just labels?
- Can you imagine a group scene where this character's behavior differs from a 1-on-1 scene with the same person? If not, the public/private gap needs work.

Include ensemble information as a brief note within Personality or as a short addendum — not a full section unless relationships are the character's primary dimension.

---

## Quick Validation Workflow

Use this order for efficient validation:

1. **Speech check first** — if speech is underinvested, fix that before anything else (it affects everything)
2. **DNA anchor check** — verify 2–4 DNA markers defined across all registers
3. **Contrast check** — verify at least 1 grounded contrast pair; check for Surface vs. Subversion structure
4. **Behavioral predictability** — run the 3-scene test
5. **Depth check** — for protagonists: psychological mechanism present? Hidden depths structured? Dreams layered?
6. **Anti-pattern scan** — check each anti-pattern in the table
7. **Gaps and boundaries** — verify strategic gaps and knowledge boundaries
8. **Specialist checks** — physical constraints and/or ensemble notes if applicable

If more than 2 core checks fail, consider a full restructure rather than patching individual sections.
