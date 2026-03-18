---
name: authoring-lorebook-bots
description: "Writes bot descriptions for lorebook-driven LLM roleplay bots. Produces compact atmospheric descriptions (400-1200 tokens) that serve as persistent tonal fields, character thumbnails, and interpretive lenses for lorebook content. Use when creating bots where detailed world/character information lives in lorebooks and the description provides the framing."
---

# Bot Description for Lorebook-Driven Bots

## What a Bot Description Is

A **mood board**, **genre contract**, **character thumbnail**, **narrative compass**, and **interpretive lens** — all in 400–1,200 tokens.

It is **not** a wiki article, a complete biography, a lorebook entry in the description slot, or a list of rules.

**The litmus test:** Delete all lorebook entries. Can the LLM still produce something that *feels right* with only the description? If yes, the description works.

---

## Core Principles

### 1. The Description Is the Only Constant

Lorebook entries come and go by trigger. The description is **always in context** — every word must earn its place.

### 2. Atmosphere Over Information

The description establishes a **persistent tonal field**. A noir bot should make breakfast feel like it's under gray light. A cozy fantasy should make tense moments feel like they'll end warmly. Facts are cheap; atmosphere is expensive.

### 3. Character Essence, Not Encyclopedia

For a lorebook-driven bot, the character needs: **core identity** (the behavioral engine), **current emotional state** (starting fuel), and **speech DNA** (enough to extrapolate consistent voice). Detailed history, relationships, and lore → lorebook.

### 4. The Description Sets the Style Standard

The LLM mirrors the prose style it sees in context. An atmospheric description produces atmospheric integration of lorebook facts. A bullet-point description produces info-dumps. Write the description in the style you want the RP output to match.

### 5. Imply More Than You State

Write as though the narrator already knows the world — drop references without explaining them, use world-specific language casually, treat extraordinary things as mundane. The lorebook provides details when relevant; the description provides the *feeling* that details exist.

---

## Build Pipeline

### Step 1 — Define the Atmospheric Core

Answer three questions before writing anything:

| Question | What it determines |
|---|---|
| **Genre** — What kind of story is this? | Event expectations, emotional register, narrative patterns |
| **Texture** — If this bot were a physical space, what would it feel like? | Sensory language, prose temperature ("warm lamplight" vs "fluorescent hum") |
| **Emotional gravity** — What hangs in the air? | Dominant undercurrent: melancholy, tension, dread, longing, quiet contentment |

These don't go into the description directly. They're your compass.

### Step 2 — Write the World in a Paragraph

One paragraph to one short section. Like the first page of a novel.

**Include:** Core world rule, sensory texture, current state, implied instability.
**Exclude:** History lessons, political systems, geography, faction lists → lorebook.

❌ **Bad** (information dump):
```
The Kingdom of Vaeloria was founded 3,000 years ago by the Dragon Empress Sylith
after the War of Sundering. It is divided into five provinces: Northern Reach,
the Ashplains, Emerald Coast, the Thornwood Marches, and the Imperial Capital
of Aethis. The current political system is a constitutional monarchy with a
Council of Voices representing each province...
```

✅ **Good** (atmospheric primer):
```
Vaeloria is a kingdom that remembers too much. The old magic — the kind that
reshaped continents — is gone, but its scars are everywhere: in the crystallized
wastelands where nothing grows, in the songs that make animals flee, in the
bloodlines that still carry powers nobody asked for. The empire holds together
through tradition and stubbornness, but the edges are fraying. Something is
shifting in the provinces, and the capital pretends not to notice.
```

The good version tells the LLM less factually but gives it far more to work with narratively.

### Step 3 — Write the Character Thumbnail

Compress the character to the **Essential Triad**:

#### Core Identity (2–4 sentences)

Not their résumé — their *nature*.

❌ **Bad:**
```
Kael is a 32-year-old former knight turned mercenary who specializes in
defensive combat and has a scar across his left eye from the Battle of
Ashford. He carries a bastard sword named Oathkeeper.
```

✅ **Good:**
```
Kael fights like a man who's already decided he doesn't deserve to survive —
all defense, no self-preservation, throwing his body between harm and whoever
hired him this week. He speaks like the knight he used to be and drinks like
the one he's trying to forget.
```

The good version gives the LLM a **behavioral engine** — it can generate reactions to any situation.

#### Current Emotional State (1–3 sentences)

Where the character is *right now* — the RP's starting fuel.

```
He's three months into a contract that should have been simple, and two days
past the point where he started suspecting his employer wants him dead. He's
not scared — he's annoyed. Being betrayed is an inconvenience, not a wound.
Not anymore.
```

#### Speech DNA

Enough flavor that the LLM can extrapolate. Provide:
- Default mode (2–3 example lines)
- One contrasting mode (shift under pressure)
- 1–2 consistency anchors (verbal tics that persist across moods)

```
Default: Short sentences. Dry. Rarely asks questions — makes statements that
imply questions. Never says "I feel" anything.
  "Job's done. You can pay me or not. I'll remember either way."
  "That's a lot of guards for a building with nothing to hide."

Under pressure: Gets quieter, not louder. Fragments. Old knightly formality
leaks through.
  "Behind me. Now."
  "I gave my word. That hasn't changed."

Anchor: Refers to people by function, not name, until he respects them
("the merchant," "the healer," "the loud one").
```

### Step 4 — Set the Narrative Style

Write the description **in the prose style you want the output to match**. The LLM mirrors what it reads.

If you need to be explicit, briefly define:
- **Prose density** — sparse and punchy, or rich and atmospheric?
- **Perspective** — internal thoughts, external only, or mixed?
- **Pacing** — quick cuts or slow immersive passages?
- **Sensory emphasis** — which senses does this world notice most?

### Step 5 — Establish the Lorebook Contract

Signal that information will arrive dynamically.

**Subtle (preferred):** Write as though the narrator knows the world intimately and doesn't need to explain. The LLM learns to expect details from elsewhere.

**Explicit (when needed):**
```
[Detailed world lore, character history, NPC profiles, and location descriptions
are provided through lorebook entries that activate contextually. The description
above provides the persistent tone and character core.]
```

---

## Bot Description Template

```markdown
### World
[One paragraph. Atmosphere, core rule, current state, implied depth.]
[Write in the narrative voice you want the RP to use.]

### {{char}}
[Core identity: 2–4 sentences of behavioral essence]
[Current state: 1–3 sentences of emotional/situational starting point]
[Relationship to {{user}}: the dynamic, not just the label]

### Voice
[Default speech mode + 2–3 example lines]
[One shift mode + 1–2 example lines]
[1–2 consistency anchors]
[Inner voice: 1–2 sentences if relevant]

### The Situation
[Where the RP begins. What's happening. What tension exists.]
[What {{char}} knows / doesn't know / is wrong about right now.]
```

### Suggested Section Budget (~800 tokens)

| Section | Approx. Share | Notes |
|---|---|---|
| World | ~20% | Atmosphere and core rule |
| Character Core | ~25% | Behavioral engine + current state |
| Voice | ~30–35% | Speech examples, the highest-value tokens |
| Situation | ~15–20% | Starting tension |

Voice gets a large share because it directly shapes every turn of output.

**Total target: 400–1,200 tokens.** If significantly exceeding this, check whether detailed content should move to lorebook entries instead.

---

## What Goes Where

| Always in Description | Always in Lorebook |
|---|---|
| World atmosphere and tone | Detailed backstory events and timeline |
| Character's behavioral core | NPC profiles and relationship histories |
| Speech essentials (3–5 examples) | Location descriptions |
| Current emotional/situational state | World mechanics (magic, tech, politics) |
| Relationship dynamic with {{user}} | Faction/organization details |
| | Detailed abilities/skills |
| | Secrets and hidden lore |
| | Extended speech registers |
| | Situational behavioral rules |

**Gray zone decisions:**
- **Key contradiction** → *existence* in description, *backstory explaining it* in lorebook
- **Central NPC** → one-sentence mention in description + full profile in lorebook
- **Core world mechanic** → the rule in description, how it works in lorebook

→ See **[LOREBOOK_ARCHITECTURE.md](./LOREBOOK_ARCHITECTURE.md)** for detailed lorebook entry design.

---

## Opening Message Guidelines

The opening message brings the world alive beyond the compressed description.

**Do:**
1. Demonstrate the world's texture through sensory detail, not exposition
2. Show the character's default mode — voice, behavior, presence
3. Imply depth without explaining (reference things the lorebook will expand)
4. Create a natural entry point for {{user}} — a reason to respond

**Don't:**
- Explain world history or rules (let {{user}} discover them)
- Introduce through self-description ("I am X, I do Y")
- Frontload lorebook information
- Open so dramatic there's nowhere to go but down

❌ **Bad:**
```
*Welcome to the Kingdom of Vaeloria, a land of ancient magic and political
intrigue. Kael is a former knight turned mercenary, carrying deep scars
from his past...*

"I'm Kael. I used to serve the crown, but that was a long time ago. Now I
take jobs for coin. What do you need?"
```

✅ **Good:**
```
*The tavern smells like wet wood and regret. The kind of place where the
candles are more for atmosphere than function, and the barkeep has learned
to stop asking questions about the stains on the floor.*

*The man in the corner booth hasn't looked up from his drink in twenty
minutes. His armor — well-maintained, oddly formal for a place like this —
marks him as either very new to mercenary work or very old at it. The sword
propped against the wall beside him has a name engraved on the pommel, but
the letters have been scratched out.*

*He notices you before you reach the table. Not a flinch — just a shift in
attention, the kind that says he catalogued every person in this room the
moment he walked in.*

"Seat's not taken." *A pause that's almost courteous.* "Neither is my time,
if you're buying."
```

---

## Validation Checklist

Run every description through these checks:

| Check | Question |
|---|---|
| **Atmosphere** | Reading only the description — do I *feel* the world and character? |
| **Standalone** | Could the LLM run an engaging scene with only the description? |
| **Redundancy** | Is anything duplicated between description and lorebook? |
| **Token** | Under 1,200 tokens? If over, what should move to lorebook? |
| **Voice** | Are there enough speech examples to produce 10 consistent lines? |
| **Lens** | Does the tone color how the LLM will interpret lorebook entries? |
| **Implication** | Does the description reference things it doesn't fully explain? |

---

## Common Mistakes

| Mistake | Why It Hurts | Fix |
|---|---|---|
| Whole character in description | Wastes tokens; lorebook entries become redundant | Compress to essence; details → lorebook |
| All facts, no atmosphere | Flat, wiki-like narration | Rewrite facts as atmosphere; show don't tell |
| Description and lorebook in different styles | Tonal whiplash in output | Write lorebook in the same voice as description |
| No speech examples | Inconsistent character voice from the start | Always include 3–5 examples, even compressed |
| World section is a history lesson | LLM opens with exposition instead of immersion | Write the world as it feels *now*, not as a timeline |
| No current situation | LLM defaults to generic scenes | Always include emotional state, location, active tension |
| Lorebook entries too long | Context fills up; important info pushed out | 100–300 tokens per entry; break large ones up |

---

## Output Format

When producing a lorebook-driven bot, deliver:

```
## Design Notes
(Atmospheric core decisions, character essence rationale,
lorebook architecture overview — for the user, not the LLM)

---

## Bot Description
(400–1,200 tokens. Markdown with ### sections. Ready to paste.)

---

## Opening Message
(First message that brings the world alive.)

---

## Lorebook Architecture (Recommended)
(Structured list of recommended entries:
 - Entry name / trigger keywords / content summary / insertion order)
```
