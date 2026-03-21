# RisuAI Skills Library

Structured skill documents for LLMs working with RisuAI `.charx`, `.risum`, and `.risup` files. Each skill follows the [Claude Agent Skills best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) format with YAML frontmatter, progressive disclosure, and practical examples.

## Syntax & Tool Skills

| Skill                                               | Description                            | Files                       |
| --------------------------------------------------- | -------------------------------------- | --------------------------- |
| [writing-cbs-syntax](writing-cbs-syntax/)           | CBS template tag reference (130+ tags) | SKILL.md + REFERENCE.md     |
| [writing-lua-scripts](writing-lua-scripts/)         | Lua 5.4 scripting API for RisuAI       | SKILL.md + API_REFERENCE.md |
| [writing-lorebooks](writing-lorebooks/)             | Lorebook entry structure and patterns  | SKILL.md                    |
| [writing-regex-scripts](writing-regex-scripts/)     | Regex script types and patterns        | SKILL.md                    |
| [writing-html-css](writing-html-css/)               | HTML/CSS with RisuAI constraints       | SKILL.md                    |
| [writing-trigger-scripts](writing-trigger-scripts/) | Event-driven trigger automation        | SKILL.md                    |
| [writing-asset-prompts](writing-asset-prompts/)     | Anima model image prompt generation    | SKILL.md                    |

## Authoring Skills

| Skill                                               | Description                              | Files                                       |
| --------------------------------------------------- | ---------------------------------------- | ------------------------------------------- |
| [authoring-characters](authoring-characters/)       | Character description writing for LLM RP | SKILL.md + SPEECH_SYSTEM.md + VALIDATION.md |
| [authoring-lorebook-bots](authoring-lorebook-bots/) | Lorebook-driven bot description writing  | SKILL.md + LOREBOOK_ARCHITECTURE.md         |

## Philosophy

These guides are **toolkits, not rulebooks.** They describe patterns that tend to produce strong LLM roleplay output — but no pattern is universal. A bot's setting, tone, character count, and target experience should always take priority over any guideline written here.

**Pick what works. Ignore what doesn't. Break any rule that produces a more compelling result.**

The only real test is whether the LLM generates output that feels alive, consistent, and engaging. If skipping the speech register system makes a minimalist character hit harder, skip it. If adding a section the guide never mentions makes the bot sing, add it. These documents exist to help — not to constrain.

### Signal Density over Token Count

With large context windows (200K–1M+), the constraint is no longer **space** — it's **attention**. The LLM can hold everything you give it, but it must still find what matters among everything present.

The question is never "how many tokens?" but **"does every sentence change what the LLM writes next?"**

- **Rich detail** — behavioral nuance, sensory texture, speech examples, reaction patterns, atmospheric prose — makes the world more alive. Add freely.
- **Signal noise** — facts that don't affect behavior, repeated information, filler text — wastes the LLM's attention no matter how large the context. Cut always.

Token counts in these guides are **reference floors, not ceilings.** A 600-token lorebook entry where every sentence is actionable outperforms a 200-token entry padded with filler. A 3,000-token description that's all signal outperforms a 1,000-token one that cuts behavioral depth for brevity. Size entries and descriptions to their purpose, not to a budget.

## How to Use

Each skill directory contains:

- **SKILL.md** — Overview with YAML frontmatter (name + description), core concepts, workflows, and examples. Under 500 lines.
- **Reference files** — Detailed content loaded on demand (API references, validation checklists, etc.)

### For AI Assistants

1. Read `SKILL.md` when the skill topic is relevant to the user's request
2. Read reference files only when deeper detail is needed
3. The `description` field in YAML frontmatter indicates when to use each skill

### For Humans

Browse individual skills for structured reference material. The `guides/` folder contains the original Korean-language guides for direct human reference.

## Relationship to `guides/`

The `skills/` folder contains LLM-optimized English versions of the guides. The original `guides/` folder is preserved with the Korean-language source material:

```
guides/          → Human-readable Korean guides (original)
skills/          → LLM-optimized English skills (this folder)
```
