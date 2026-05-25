# Prompt Skills — Preset Composition

LLM-optimized skills for writing and reviewing RisuToki prompt and `.risup` preset artifacts.

## Skills

| Skill                                                   | Description                                                                                             | Files      |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------- |
| [writing-risup-presets](writing-risup-presets/)         | `.risup` composition, promptTemplate workflow, toggle syntax, module integration, and structured output | `SKILL.md` |
| [prompt-preset-sync](prompt-preset-sync/)               | Source-to-variant prompt and preset synchronization across model-specific `.md` / `.risup` versions     | `SKILL.md` |
| [mythos-prompt-development](mythos-prompt-development/) | Mythos principles, CBS decision-making, toggle design, and model-variant policy                         | `SKILL.md` |
| [mythos-prompt-maintenance](mythos-prompt-maintenance/) | Source-aware Mythos prompt suite maintenance, drift checks, and coordinated variant updates             | `SKILL.md` |

## Typical workflow

1. Load the preset composition skill first for ordinary `.risup` structure, promptTemplate, and formatingOrder work.
2. Load `prompt-preset-sync` when the task is about Source plus GPT, Claude, Gemini, DeepSeek, or other model-specific variants.
3. Load `mythos-prompt-development` when the task is about Mythos principles, CBS/default/remove decisions, or Mythos toggle design.
4. Load `mythos-prompt-maintenance` when the task is about auditing or updating an existing Mythos prompt suite across variants.
5. If the preset embeds CBS or needs exact file/field rules, load the matching shared skill from `../../common/skills/`.
6. Use dedicated risup prompt MCP tools instead of generic field reads for `promptTemplate` and `formatingOrder`.
7. Treat `SKILL.md` as the execution summary; open `risu/prompts/docs/PRESET_FIELDS.md` only when exact field inventory is needed.
