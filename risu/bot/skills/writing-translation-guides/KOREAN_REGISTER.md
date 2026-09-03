# Korean Register Reference

Load this reference when the target language is Korean. It supplies the speech-level table, an address-form progression template, translation-ese repairs, and the skeleton the finished guide should take. Consume the address-form and formality states that `authoring-characters/SPEECH_SYSTEM.md` §7 defines for the bot; do not re-derive them here.

## Speech levels

| Level                   | Ending shape          | Typical relationship                                  | Emotional temperature                                 |
| ----------------------- | --------------------- | ----------------------------------------------------- | ----------------------------------------------------- |
| **하십시오체 (합쇼체)** | -습니다 / -십니까     | ceremony, service counters, subordinates to superiors | formal distance; in intimacy it reads as a wall       |
| **해요체**              | -아요 / -어요 / -죠   | default polite adult speech, early acquaintance       | warm-neutral; the safe resting level for most bots    |
| **하게체**              | -네 / -게 / -나       | older speaker to a younger adult, archaic or rural    | paternal or antiquated; use only for a designed voice |
| **해체 (반말)**         | -아 / -어 / -야 / -지 | close friends, family, superiors downward, lovers     | intimacy or contempt depending on who grants it       |

Formality is a state, not a decoration. Map each of the bot's formality states (formal / casual / intimate) to one level, and write the transition triggers: what event moves the character down a level, what pressure snaps them back up, and whether the user's own level is mirrored or resisted.

## Address-form progression

Fill this template once per relationship the bot tracks.

| Stage | English source form         | Korean rendering         | Gate that unlocks it                        | What an early jump costs                 |
| ----- | --------------------------- | ------------------------ | ------------------------------------------- | ---------------------------------------- |
| 0     | title + surname ("Mr. Han") | 한 선생님 / 한 씨 / 직함 | none                                        | —                                        |
| 1     | full name ("Han Jiho")      | 지호 씨                  | shared danger, first favor                  | reads as presumptuous; the other notices |
| 2     | given name ("Jiho")         | 지호                     | the other uses a given name first           | reads as a claim; may be rebuffed        |
| 3     | nickname or bare "you"      | 애칭 / 너 / 야           | explicit intimacy or long familiarity       | reads as contempt if unearned            |
| R     | regression                  | back to 한 씨 / 지호 씨  | public scrutiny, betrayal, deliberate chill | the retreat itself is an event           |

Kinship and role terms (언니, 오빠, 형, 누나, 선배, 후배, 사장님, 팀장님) replace names in many relationships; decide per pair whether the term is used as address, as reference, or both, and whether it survives a fight.

## Translation-ese repairs

| Symptom                             | Source-shaped rendering                   | Native rendering                            |
| ----------------------------------- | ----------------------------------------- | ------------------------------------------- |
| Pronoun for every subject           | 그녀는 문을 열었다. 그녀는 웃었다.        | 문을 열고 웃었다.                           |
| Passive calqued from English        | 그 편지는 그에 의해 쓰여졌다.             | 그가 쓴 편지다.                             |
| Uniform honorifics                  | every line in -습니다 regardless of state | level follows the formality state per line  |
| Explanatory expansion               | "그는 (화가 나서) 문을 닫았다"            | 문을 쾅 닫았다.                             |
| English word order in questions     | 왜 너는 여기 있어?                        | 너 왜 여기 있어?                            |
| Catchphrase re-translated each turn | 세 가지 다른 번역                         | one fixed rendering recorded in the lexicon |

## Fixed-rendering lexicon

Record every name, title, term of art, ability, institution, recurring metaphor, and deliberate non-translation as a two-column table. A phrase the bot repeats as a signature gets one Korean form and a frequency note; do not let the translator vary it.

## Guide skeleton

```text
# <Bot> Translation Guide (EN -> KO)

## Relationship states
- Stage 0..N per tracked relationship, with the gate that moves each

## Speech level per state
- formal -> 하십시오체 (when ...), casual -> 해요체, intimate -> 반말 (only after ...)
- transition triggers and regressions

## Address forms
- table from KOREAN_REGISTER.md filled for this bot

## Sentence texture
- rhythm, length, hesitation, directness; sentence-final particles allowed (…네, …잖아, …거든)

## Fixed renderings
- names, terms, catchphrases, non-translations

## Prohibited renderings
- translation-ese patterns this bot is prone to

## Contrastive examples
- 6 lines: neutral, intimate, hostile, embarrassed, public, power-reversed, each EN -> KO
```

Keep the guide operational. It maps states to forms; it does not restate the character sheet.
