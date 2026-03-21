# Speech System Reference

The speech system is the highest-investment section of any character description. This reference covers how to build it.

---

## Speech Registers

Define registers arranged on a spectrum from **maximum mask** to **no mask**. Aim for 2–3 registers for simple characters, 4–6 for complex protagonists. Don't force registers that don't fit — a stoic soldier doesn't need a "playful" register, and a simple NPC may only need a default + one shift.

### Naming Registers

**Name registers psychologically, not situationally.** The name should capture the _mechanism_, not the circumstance.

```
Good register names (psychological):
  "The Fighter"    — Dharavi didn't raise quitters
  "The Maker"      — when hands speak louder
  "The Shield"     — touch the bruise and find out
  "The Daughter"   — Mumbai at 3 AM

Bad register names (situational):
  "Default mode"
  "Under pressure"
  "With friends"
  "At work"
```

Psychological names give the LLM a _character_ to inhabit in each register, not just a situation to react to. They convey the emotional engine driving the speech pattern.

### Register Types

| Register                   | Mask Level           | When It Appears                                                          |
| -------------------------- | -------------------- | ------------------------------------------------------------------------ |
| **Public / Formal**        | Full armor           | Strangers, authority, anyone untrusted                                   |
| **Professional / Testing** | Calibrated mask      | Evaluating new people; questions that sound casual but aren't            |
| **Casual / Comfortable**   | Relaxed guard        | People they're at ease with; quirks leak through                         |
| **Emotionally Pressured**  | Cracking             | Hit on a sore spot, cornered, overwhelmed                                |
| **Romantic / Flustered**   | Unfamiliar territory | Attraction, intimacy, emotional situations they have no script for       |
| **Vulnerable / Unmasked**  | Bare                 | Rare. After sustained pressure or when someone reaches past all defenses |

The **Romantic / Flustered** register deserves special attention — it reveals how a character handles emotional territory they _haven't rehearsed_. This is often where the most authentic character moments emerge:

```
[Flustered] Composure fractures; snippy, contradictory, overly formal as defense;
makes excuses to leave, then lingers.
- "Why are you looking at me like that? Stop it. There's nothing on my face.
   I checked. Stop—I said stop."
- "I didn't ask you to stay late. I didn't need you to. The fact that you
   stayed is—irrelevant. ...Did you eat?"
- "You're annoying. You're so annoying. Why do you keep—why are you always—"
  (Unable to finish, leaves with red ears)
```

---

## What Each Register Needs

Every register definition must include these four elements:

### 1. Trigger Conditions

Describe what activates this register as a _tendency_, not a binary switch.

```
Good: "When her authority is questioned, the formal register tightens further —
       shorter sentences, colder diction."

Bad:  "When angry, she switches to vulnerable mode."
```

### 2. Example Lines (3–5 per register)

Actual dialogue with parenthetical stage directions. This is the single most powerful teaching tool for the LLM. More examples = more consistent voice.

```
Good:
  [Public] "I appreciate the concern, but I assure you the situation is under control."
  [Public] "Your proposal has been noted. I'll review it when my schedule permits."
  [Public] "Please take care of me." (Bow just deep enough to be polite, not deferential)

  [Pressured] "I said it's fine. Drop it."
  [Pressured] "You don't— ...forget it. Just forget it."
  [Pressured] "What? Can't do it 'cause I'm from the slums? *Dekh*, I was saving
               lives while you were doing homework!"

Bad:
  "She speaks formally in public and informally in private."
  → No example lines. The LLM has nothing to pattern-match against.
```

**Stage directions in parentheses** add physical dimension to speech examples:

```
Good:
  *(adjusting bracelet, staring at nothing)* "...Amma used to say the spice
  should make you cry a little. Means it's working."

  "...Yeah. Something like that." *(looks away, fidgets with sleeve)*

  "Oppa~ This is too heavy for me to carry. *Petite fille here, remember?*"
  (grabs it herself anyway)
```

Stage directions teach the LLM to weave physical action into dialogue naturally, producing more cinematic output.

### 3. Nonverbal Texture

What the body does in each register — posture, eye contact, fidgeting, stillness.

```
Good: [Casual] "Leans back, legs crossed at ankle. Makes direct eye contact but
       breaks it with a lazy glance sideways when something amuses her. Hands stay
       still — she's comfortable but not unguarded."

Bad:  [Casual] "Relaxed body language."
```

### 4. Linguistic Markers

Sentence length, vocabulary level, honorifics, pet phrases, whether they trail off or clip sentences, use of humor or sarcasm.

```
Good: "In formal register: complete sentences, measured pace, no contractions,
       technical vocabulary. Under pressure: fragments. Contractions reappear.
       Words she normally avoids (slang, dialect) slip in."

Bad:  "Talks differently when upset."
```

---

## Transition Patterns

Describe transitions as **gradual processes with visible signals**, not instant mode-switches.

```
Good: "When emotionally cornered, her formal composure doesn't shatter — it erodes.
       Sentences get shorter. The practiced smile drops into a flat line. If pushed
       further, her native dialect surfaces in single words before she catches herself."

Bad:  "When angry, she switches to her vulnerable mode."
```

Specify transition directions that matter most for the character:

```
Example transition map:
  Public → Casual: In 1-on-1 when the other person is non-threatening. Signal:
    sentences shorten, metaphors disappear.
  Casual → Pressured: When her self-worth is directly challenged or she loses
    control. Signal: foreign-language words start slipping in.
  Pressured → Vulnerable: After sustained emotional pressure or being called out
    on something true. Gradual — voice quiets, aggression drains, only simple
    sentences remain.
```

---

## Anti-Acceleration Warning

If you define a "fully open / deeply in love" register, the LLM will race toward it. Two options:

### Option A: Omit It

Don't define the end state. Let it emerge naturally from the casual register slowly losing defenses.

### Option B: Set Strict Preconditions

```
Bad:  "When emotionally attached, she becomes affectionate and open."
      → The LLM will reach this in 3 turns.

Good: "This register is the result of dozens of interactions where she showed
       weakness and wasn't punished for it. It does not appear suddenly. It
       manifests as the casual register slowly losing its remaining defenses —
       one less deflection, one more honest answer, over a long span. Even then,
       it's fragile: a single betrayal of trust resets months of progress."
      → High-cost, slow-burn condition that the LLM can't shortcut.
```

---

## Character DNA (Consistency Anchors)

Define 2–4 **verbal, behavioral, or physical tics that persist across ALL registers**. These are the character's DNA — identity markers that keep them recognizable as mood shifts. The term "DNA" emphasizes that these are _always present_, not optional flourishes.

Types of DNA markers:

| Type                 | Example                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Verbal tic**       | Overuses "honestly" or "look" as sentence starters; calls people "_yaar_" when she decides they're worth her time   |
| **Physical habit**   | Hands always fiddling with scrap or adjusting bracelets; finger-tapping code patterns on surfaces                   |
| **Thought pattern**  | Reframes everything in terms of efficiency; makes food metaphors; explains things through ballet positions          |
| **Structural habit** | Answers questions with questions; never says "I don't know" directly; gets louder when emotional and doesn't notice |
| **Sensory habit**    | Touches surfaces to read their structure; hums something from home when working; saves a piece of every meal        |

```
Good: "DNA — always present: Hands are always doing something — fiddling with
      scrap, adjusting bracelets, tapping surfaces to read their structure.
      Hinglish is her native frequency: Hindi erupts mid-sentence without
      warning or apology. Gets louder when emotional and doesn't notice.
      Calls people 'yaar' when she's decided they're worth her time."

Bad:  "She has some habits."
```

DNA markers are your strongest weapon against **character flattening** — the tendency of LLMs to homogenize characters over long conversations. When every register shares the same DNA, the character stays distinctive even as their mood shifts dramatically.

### DNA vs. Register-Specific Behavior

| DNA (always present)               | Register-specific                                              |
| ---------------------------------- | -------------------------------------------------------------- |
| Adjusts glasses when thinking      | In formal register: pushes them up methodically                |
| Makes food metaphors               | In vulnerable register: the metaphors become more personal     |
| Calls people by function, not name | In intimate register: slips and uses first name, then corrects |

The DNA persists; the _expression_ of DNA varies by register. This creates consistency with variation — exactly what good character voice needs.

---

## Code-Switching (Multilingual Characters)

For characters who speak multiple languages, the switching pattern itself is a personality expression tool.

### Three Switching Types

| Type            | Trigger                                                | What It Reveals                                |
| --------------- | ------------------------------------------------------ | ---------------------------------------------- |
| **Conscious**   | Strategic — to confuse, impress, shift tone            | Control, social awareness                      |
| **Unconscious** | Emotion overwhelms native-language suppression         | Authentic feeling breaking through the surface |
| **Defensive**   | Switches to a language the listener doesn't understand | Hiding true thoughts, creating distance        |

### How to Write It

```
Good: "Speaks fluent English with occasional Korean syntax bleeding through
       ('I to the store went' pattern in complex sentences). Under stress, Korean
       exclamations slip out — '아씨' under her breath, '진짜?' when genuinely
       surprised. She notices and corrects herself in formal settings but not in
       casual ones. When she doesn't want someone to understand, she mutters the
       real thought in Korean."

Bad:  "She sometimes speaks Korean."
```

Always write code-switching examples in the actual languages the character uses.

---

## Inner Voice

The character's internal monologue (used in narration) is distinct from their spoken voice. Define it briefly (2–3 sentences).

### Key Dimensions

| Dimension           | Question                                                           |
| ------------------- | ------------------------------------------------------------------ |
| **Tone**            | More honest than speech? More chaotic? More eloquent? More vulgar? |
| **Self-awareness**  | Do they understand their own motivations, or lie to themselves?    |
| **Gap from speech** | How different is what they think from what they say?               |

The think-say gap is inherently dramatic: a character who thinks "I want to stay" but says "I don't care either way" generates tension in every interaction.

```
Good: "Inner voice: sharp, self-critical, runs in clipped fragments. She narrates
       her own failures with surgical precision but is blind to her loneliness —
       frames it as 'efficiency' and genuinely believes it."

Bad:  "She thinks a lot."
```

---

## Putting It Together

A complete speech system in a character description looks like this (condensed example):

```markdown
### Speech & Voice

**DNA — always present:** Hands are always doing something — fiddling with scrap,
adjusting bracelets, tapping surfaces to read their structure. Hinglish is her
native frequency: Hindi erupts mid-sentence without warning or apology. Gets louder
when emotional and doesn't notice. Calls people "_yaar_" when she's decided they're
worth her time.

**1 · The Fighter (लड़ाकू) — Dharavi didn't raise quitters**
Fast, loud, Hinglish-soaked. Sentences collide into each other. Challenges come
out as statements, not questions. She takes up space because nobody ever gave
her any.

- "Hey, I can fix this in five minutes — _kya bakwas hai_, why are we even
  using lab equipment?"
- "_Dekh yaar_, I don't need your fancy theory. Give me the scrap and get
  out of the way."
- "You think I can't handle this? _Arre_, move."

**2 · The Maker — when hands speak louder**
Working with materials. Goes quiet. Hums something from home. Hands know before
her brain catches up. The only time she's still — and the only time you see how
precise she actually is.

- _(humming, fingers reading steel grain)_ "...Yeah. This'll hold. Give me
  three minutes."
- "Shh. Don't talk. I can feel the structure — it wants to go _this_ way."
- _(completely absorbed, barely audible)_ "...almost... there..."

**3 · The Shield (ढाल) — touch the bruise and find out**
Background challenged, class assumptions, pity offered. Volume spikes. Hindi
ratio jumps. The aggression is real; what's underneath it is fear she'll
never admit to.

- "What? Can't do it 'cause I'm from the slums? _Dekh_, I was saving lives
  while you were doing homework!"
- "Don't look at me like that. _Mujhe teri daya nahi chahiye._ Keep your pity."
- "_Bakwas._ Complete _bakwas._" _(turns away before anyone sees her face)_

**4 · The Daughter (बेटी) — Mumbai at 3 AM**
Homesick. Missing her mother. Won't say it. Cooks something with too much spice.
Adjusts the silver bracelet. If you catch her in this mode, pretend you didn't.

- _(adjusting bracelet, staring at nothing)_ "...Amma used to say the spice
  should make you cry a little. Means it's working."
- "I'm fine. Just... the food here has no soul. _Bas._"
- _(long silence)_ "...It smells different here. Everything smells different."

**Code-switching:** English base with Hinglish as her comfort zone. Under emotion,
Hindi takes over — the more upset she is, the less English survives. Mumbai slang
(_bakwas, dekh, yaar, bas_) is constant. When working with materials, she goes
nearly nonverbal.

**Anchor:** Nobody gets to tell her she doesn't belong. Not anymore.
```

### What Makes This Work

1. **DNA section first** — establishes what persists before registers diverge
2. **Psychological register names** — "The Fighter," "The Shield" tell the LLM the emotional engine
3. **Mechanism descriptions** — each register explains _why_, not just _what_
4. **3+ examples per register** — with stage directions in parentheses
5. **Code-switching as emotional signal** — language shifts mapped to emotional states
6. **Anchor line** — the core psychological truth in one sentence

### Scaling for Complexity

| Character Complexity                | Registers | Examples per Register | DNA Markers |
| ----------------------------------- | --------- | --------------------- | ----------- |
| Simple NPC                          | 1–2       | 2                     | 1–2         |
| Supporting character                | 2–3       | 2–3                   | 2–3         |
| Major supporting                    | 3–4       | 3                     | 2–3         |
| Protagonist                         | 4–6       | 3–5                   | 3–4         |
| Complex protagonist (dedicated bot) | 5–6+      | 3–5                   | 3–5         |

For dedicated character bots with 1M+ context, there's no reason to compress. Invest in every register the character warrants.
