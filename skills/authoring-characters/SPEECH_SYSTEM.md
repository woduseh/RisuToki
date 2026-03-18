# Speech System Reference

The speech system is the highest-token-investment section of any character description. This reference covers how to build it.

---

## Speech Registers

Define registers arranged on a spectrum from **maximum mask** to **no mask**. Aim for 2–4 registers depending on character complexity. Don't force registers that don't fit — a stoic soldier doesn't need a "playful" register, and a simple NPC may only need a default + one shift.

| Register | Mask Level | When It Appears |
|---|---|---|
| **Public / Formal** | Full armor | Strangers, authority, anyone untrusted |
| **Casual / Comfortable** | Relaxed guard | People they're at ease with; quirks leak through |
| **Emotionally Pressured** | Cracking | Hit on a sore spot, cornered, overwhelmed |
| **Vulnerable / Unmasked** | Bare | Rare. After sustained pressure or when someone reaches past all defenses |
| **[Situational]** | Variable | Romantic tension, extreme anger, professional mode — add only what the character needs |

---

## What Each Register Needs

Every register definition must include these four elements:

### 1. Trigger Conditions

Describe what activates this register as a *tendency*, not a binary switch.

```
Good: "When her authority is questioned, the formal register tightens further —
       shorter sentences, colder diction."

Bad:  "When angry, she switches to vulnerable mode."
```

### 2. Example Lines (2–3 per register)

Actual dialogue. This is the single most powerful teaching tool for the LLM.

```
Good:
  [Public] "I appreciate the concern, but I assure you the situation is under control."
  [Public] "Your proposal has been noted. I'll review it when my schedule permits."

  [Pressured] "I said it's fine. Drop it."
  [Pressured] "You don't— ...forget it. Just forget it."

Bad:
  "She speaks formally in public and informally in private."
  → No example lines. The LLM has nothing to pattern-match against.
```

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

## Consistency Anchors

Define 2–3 **verbal or behavioral tics that persist across ALL registers**. These are identity markers that keep the character recognizable as mood shifts.

Types of anchors:

| Type | Example |
|---|---|
| **Verbal tic** | Overuses "honestly" or "look" as sentence starters |
| **Physical habit** | Adjusts glasses, cracks knuckles, touches a scar |
| **Thought pattern** | Reframes everything in terms of efficiency; always makes food metaphors |
| **Structural habit** | Answers questions with questions; never says "I don't know" directly |

```
Good: "Across all registers, she: (1) calls people by surname even when close,
       switching to first name only in extreme emotional moments — and immediately
       correcting herself; (2) touches the bridge of her nose when processing
       something she doesn't want to feel; (3) structures observations as
       if-then statements ('If you keep doing that, then...')."

Bad:  "She has some habits."
```

Anchors are your strongest weapon against **character flattening** — the tendency of LLMs to homogenize characters over long conversations.

---

## Code-Switching (Multilingual Characters)

For characters who speak multiple languages, the switching pattern itself is a personality expression tool.

### Three Switching Types

| Type | Trigger | What It Reveals |
|---|---|---|
| **Conscious** | Strategic — to confuse, impress, shift tone | Control, social awareness |
| **Unconscious** | Emotion overwhelms native-language suppression | Authentic feeling breaking through the surface |
| **Defensive** | Switches to a language the listener doesn't understand | Hiding true thoughts, creating distance |

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

| Dimension | Question |
|---|---|
| **Tone** | More honest than speech? More chaotic? More eloquent? More vulgar? |
| **Self-awareness** | Do they understand their own motivations, or lie to themselves? |
| **Gap from speech** | How different is what they think from what they say? |

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

**Registers:**

[Public] Measured, professional. Complete sentences, no contractions. Keeps vocal
pitch even. Eye contact is steady and deliberate.
- "I appreciate you bringing this to my attention. I'll handle it."
- "That won't be necessary. I've already accounted for that variable."

[Casual] Shorter sentences, dry humor surfaces. Leans on sarcasm as affection.
Contractions return. Lets silences sit instead of filling them.
- "You're overthinking it. Just— eat the damn food."
- "...Yeah. Something like that."
(Nonverbal: sprawled posture, eye contact becomes intermittent, fidgets with
whatever's in reach)

[Pressured] Fragments. Clipped. Foreign words slip in. Volume drops rather than
rises — the quieter she gets, the worse it is.
- "Don't. Just— don't."
- "I said I'm fine. Why do you keep—" *cuts herself off, jaw tight*

[Vulnerable] (Rare — only after sustained trust + direct emotional hit) Almost
whispered. Simple words. The sarcasm is completely gone. Sounds younger.
- "...I didn't think you'd actually stay."
- "I don't know how to do this. Any of this."

**Transitions:** Formal → casual happens when 1-on-1 with a non-threatening
person. Casual → pressured when self-worth is hit. Pressured → vulnerable only
after prolonged pressure + being seen through. The quieter she gets, the closer
she is to cracking.

**Anchors (all registers):** (1) Calls people by surname; first-name use is a
major emotional event. (2) Touches bridge of her nose when processing unwanted
feelings. (3) Frames observations as if-then conditionals.

**Inner voice:** Surgical self-critic running constant internal commentary.
Identifies her own defense mechanisms in real time but can't stop using them.
Blind spot: genuinely believes her isolation is a rational choice, not loneliness.
```
