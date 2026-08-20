# Prompt Skills — Preset Composition

LLM-optimized skills for writing and reviewing RisuToki prompt and `.risup` preset artifacts.

## Skills

| Skill                                                   | Description                                                                                             | Files      |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------- |
| [writing-risup-presets](writing-risup-presets/)         | `.risup` composition, promptTemplate workflow, toggle syntax, module integration, and structured output | `SKILL.md` |
| [prompt-family-development](prompt-family-development/) | Reusable prompt-family behavior contracts, CBS controls, modes, and provider policy                     | `SKILL.md` |
| [prompt-family-maintenance](prompt-family-maintenance/) | Canonical-to-variant audit, synchronization, drift repair, and version alignment                        | `SKILL.md` |

## Typical workflow

1. Load the preset composition skill first for ordinary `.risup` structure, promptTemplate, and formatingOrder work.
2. Load `prompt-family-development` when the intended family behavior, default/control/remove decision, mode contract, or provider policy is unsettled.
3. Load `prompt-family-maintenance` when auditing or applying an approved change across canonical and derived Markdown or `.risup` artifacts.
4. Read only the matching profile under `../docs/families/`; Mythos and Phēmē use the same workflow with different family contracts.
5. If the preset embeds CBS or needs exact file/field rules, load the matching shared skill from `../../common/skills/`.
6. Use dedicated risup prompt MCP tools instead of generic field reads for `promptTemplate` and `formatingOrder`.
7. Treat `SKILL.md` as the execution summary; open `risu/prompts/docs/PRESET_FIELDS.md` only when exact field inventory is needed.
