# Lorebook Architecture for Description-Driven Bots

How to design lorebook entries that complement a compact atmospheric bot description.

---

## Core Principle

The bot description is the **persistent tonal lens**. Lorebook entries are **on-demand detail** that the LLM interprets *through* that lens. Every entry should read like a natural extension of the description's voice.

---

## Entry Design Principles

### 1. Self-Contained

Each entry activates in isolation. It may be the only lorebook content the LLM sees in a given turn. Never assume other entries are active.

❌ **Bad** (depends on another entry):
```
The Ashplains extend south from the border described in the "Northern Reach"
entry. See also: "War of Sundering" for historical context.
```

✅ **Good** (stands alone):
```
The Ashplains are a scarred expanse of gray soil and crystallized earth where
the old magic burned itself out. Nothing grows taller than knee-height. The
wind carries a faint hum — not unpleasant, but wrong, like a song played
one note off. Travelers cross quickly and don't camp if they can help it.
```

### 2. Match the Description's Voice

If the description reads like atmospheric fiction, the lorebook should too. Tonal consistency between description and lorebook is what produces coherent output.

❌ **Bad** (clinical tone against atmospheric description):
```
The Council of Voices consists of five representatives, one from each
province. They meet quarterly in the capital. Current members: Lord Varos
(Northern Reach), Lady Ithel (Ashplains)...
```

✅ **Good** (matches atmospheric voice):
```
The Council of Voices hasn't agreed on anything meaningful in three years,
but they keep meeting — five people who represent provinces that increasingly
don't want to be represented. The sessions are formal, vicious, and largely
performative. Real decisions happen in hallways afterward.
```

### 3. Behavior Over Biography

Every entry should answer: **"How does this change what the LLM writes?"** Don't describe what something *is* — describe what it *does* to the scene.

❌ **Bad** (biography):
```
Captain Maren Dreve, age 45, served in the Royal Guard for 20 years before
being assigned to the Thornwood garrison. She has brown hair, green eyes,
and a scar on her right forearm.
```

✅ **Good** (behavioral):
```
Captain Dreve runs the Thornwood garrison like someone waiting for an
inspection that's never coming. Every patrol logged, every weapon counted,
every report filed in triplicate — in a posting everyone else treats as
exile. She doesn't smile at jokes, but she'll fix your armor strap without
being asked. The kind of officer who makes you feel guilty for not trying
harder.
```

### 4. Natural Trigger Keywords

Choose words that appear organically in conversation when the information is relevant.

| Strategy | Example |
|---|---|
| **Use the thing's common name** | `Ashplains`, `the Council` |
| **Include conversational variants** | `old magic, ancient magic, the Sundering` |
| **Avoid over-specific triggers** | ❌ `crystallized wasteland phenomenon` |
| **Avoid over-broad triggers** | ❌ `magic` alone (fires constantly) |
| **Pair broad + narrow** | `magic` + `old` as selective pair |

### 5. Layer Secrets by Trigger Depth

Hidden information should be triggered by words that only appear when the RP has progressed far enough.

| Layer | Trigger Strategy | Example |
|---|---|---|
| **Surface** | Character/place names | `Kael` → general info |
| **Mid** | Specific topics in conversation | `knighthood, oath, the Order` → backstory |
| **Deep** | Words that imply trust/discovery | `the scratched name, Oathkeeper, forgive` → secret |

A character's deepest secret shouldn't trigger on their name — it should trigger on words that only come up when trust has been built or discovery has occurred.

---

## What Goes Where: Decision Guide

| Content Type | Description | Lorebook | Rationale |
|---|---|---|---|
| World atmosphere | ✅ | | Always needed for tone |
| World mechanics (detailed) | | ✅ | Only needed when relevant |
| Core world rule (one sentence) | ✅ | | Frames everything |
| Character behavioral engine | ✅ | | Drives every response |
| Character backstory events | | ✅ | Only when referenced |
| Speech examples (3–5) | ✅ | | Voice must be constant |
| Extended speech registers | | ✅ | Niche situations only |
| Current emotional state | ✅ | | Starting fuel |
| NPC profiles | | ✅ | Only when NPC appears |
| Central NPC (1 sentence) | ✅ | | If critical to starting situation |
| Location descriptions | | ✅ | Only when at location |
| Faction/org details | | ✅ | Only when discussed |
| Secrets and hidden lore | | ✅ | Gated by trigger depth |
| Key character contradiction | ✅ (existence) | ✅ (explanation) | Split across both |
| Relationship with {{user}} | ✅ | | Always in context |

---

## Entry Sizing

**General guideline: 100–300 tokens per entry.** Adjust based on your context window budget and how many entries might be active simultaneously.

| Size | When to use |
|---|---|
| **~100 tokens** | Simple facts, minor NPCs, small locations |
| **~200 tokens** | Standard entries: locations, NPCs, mechanics |
| **~300 tokens** | Complex entries: major NPCs, pivotal lore, detailed mechanics |
| **>300 tokens** | Consider splitting into multiple entries with separate triggers |

**Why smaller entries generally work better:**
- Context window is finite — large entries crowd out other active content
- Multiple small entries give the LLM diverse, specific context per turn
- Smaller entries have cleaner trigger boundaries
- However, some entries genuinely need 300+ tokens — don't sacrifice coherence for arbitrary size limits

❌ **Bad** (800-token mega-entry):
```
Key: Vaeloria
[Entire history, geography, political system, current events, cultural
practices, religion, economy, military structure...]
```

✅ **Good** (split into focused entries):
```
Key: Vaeloria, the kingdom    → Current state & atmosphere (150 tokens)
Key: Council of Voices         → Political body (120 tokens)
Key: old magic, the Sundering  → Magic system & history (200 tokens)
Key: Northern Reach            → Region description (150 tokens)
Key: Ashplains                 → Region description (130 tokens)
```

---

## Entry Structure Pattern

A well-structured lorebook entry follows this pattern:

```
[Atmospheric hook — 1 sentence that sets the tone]
[Core information — what this is and how it affects the scene]
[Behavioral cue — how characters act around/about this thing]
[Sensory detail or narrative hook — something the LLM can use in prose]
```

**Example:**
```
The Northern Reach is where Vaeloria goes to forget its problems — and its
people. The province is cold in ways that have nothing to do with weather:
polite distances, careful silences, debts remembered for generations. The
towns are clean and orderly and profoundly unwelcoming to outsiders. People
here speak softly, drink heavily, and settle grudges across decades. If
someone from the Reach offers you hospitality, they mean it — and they'll
expect you to earn it.
```

This entry gives the LLM: setting mood, social dynamics, behavioral cues for NPCs from this region, and a narrative hook (the hospitality detail).

---

## Trigger Keyword Patterns

### Single Character Bot

```
Surface triggers (always available):
  - Character name, nickname, common references

Topic triggers (mid-conversation):
  - Backstory keywords, relationship names, location names
  - "tell me about," "what happened," specific events

Deep triggers (late-game):
  - Secret-adjacent words, emotional keywords
  - Words that imply intimacy or trust progression
```

### World-Heavy Bot

```
Location triggers:
  - Place names, "where are we," directional references

Mechanic triggers:
  - System-specific terms (magic type names, tech terms)
  - Action words ("cast," "hack," "pray")

Lore triggers:
  - Historical event names, faction names
  - Cultural terms, in-world jargon
```

### Selective Triggers (key + secondkey)

Use selective mode when a broad keyword needs narrowing:

| key | secondkey | Activates when... |
|---|---|---|
| `magic` | `history, origin, old` | Magic's history comes up, not every mention of magic |
| `Kael` | `past, knight, before` | Kael's backstory, not every scene with Kael |
| `the Council` | `corrupt, secret, truth` | Council's hidden agenda, not general Council talk |

---

## Folder Organization

For bots with many entries, organize by category:

```
📁 World
   ├── Vaeloria (current state)
   ├── The Ashplains
   ├── Northern Reach
   └── Old Magic

📁 Characters
   ├── Kael (extended backstory)
   ├── Captain Dreve
   └── The Employer

📁 Secrets (deep triggers only)
   ├── The scratched name
   ├── Why Kael left the Order
   └── The Employer's true goal

📁 Mechanics
   ├── Bloodline powers
   └── The mercenary guild system
```

Use `add_lorebook({ comment: "folder name", mode: "folder", key: "", content: "" })` to create folders, then assign entries via their `folder` field.

---

## Common Entry Mistakes

| Mistake | Fix |
|---|---|
| Entry depends on other entries being active | Make each entry fully self-contained |
| Clinical/wiki tone against atmospheric description | Rewrite in the description's voice |
| Trigger keyword is too broad (fires every turn) | Use selective mode or more specific terms |
| Trigger keyword is too specific (never fires) | Add conversational variants |
| Entry is 500+ tokens | Split into 2–3 focused entries |
| Entry describes what something *is* but not what it *does* | Add behavioral cues and narrative hooks |
| Secret info triggered by character's name | Use deep trigger words tied to discovery/trust |
| Duplicate content between description and lorebook | Remove from whichever place it's less essential |
