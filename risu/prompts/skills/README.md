# Prompt Skills — Preset Composition

LLM-optimized skills for writing and reviewing `.risup` presets.

## Skills

| Skill                                           | Description                                                                                             | Files      |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------- |
| [writing-risup-presets](writing-risup-presets/) | `.risup` composition, promptTemplate workflow, toggle syntax, module integration, and structured output | `SKILL.md` |

## Typical workflow

1. Load the preset composition skill first.
2. If the preset embeds CBS or needs exact file/field rules, load the matching shared skill from `../../common/skills/`.
3. Use dedicated risup prompt MCP tools instead of generic field reads for `promptTemplate` and `formatingOrder`.
4. Treat `SKILL.md` as the execution summary; open `risu/prompts/docs/PRESET_FIELDS.md` only when exact field inventory is needed.
