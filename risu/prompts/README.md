# Presets (.risup)

This directory contains preset-specific documentation and skills for RisuToki.

Presets are reusable prompt/model configuration packs. They change how requests are assembled and sent without modifying the underlying character card.

Only routing/docs/skills surfaces are tracked here. Local `.risup` work products remain ignored.

## Contents

| Path                                    | Description                                                                                                        |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `AGENTS.md`                             | Agent routing — what to read and in what order                                                                     |
| `docs/PRESET_FIELDS.md`                 | Field inventory, prompt item types, toggle syntax, and `.risup` file format                                        |
| `skills/README.md`                      | Preset skill index                                                                                                 |
| `skills/writing-risup-presets/SKILL.md` | Composition guide for promptTemplate, formatingOrder, toggles, module integration, structured output, and sampling |

## Shared syntax

Presets do not redefine CBS or file structure syntax. Load the shared skills from `../common/skills/` when you need exact mechanics:

| Topic                                     | Common skill                               |
| ----------------------------------------- | ------------------------------------------ |
| CBS in prompt text                        | `writing-cbs-syntax`                       |
| File structures                           | `file-structure-reference`                 |
| Asset prompt fields referenced by presets | `writing-asset-prompts`                    |
| Module integration pairs with             | `../modules/skills/writing-risum-modules/` |

## Quick orientation

- **Creating or restructuring a preset?** → Start with `skills/writing-risup-presets/SKILL.md`
- **Looking up exact field semantics?** → `docs/PRESET_FIELDS.md`
- **Editing `promptTemplate` through MCP?** → Use the dedicated risup prompt tools, not raw `read_field("promptTemplate")`
