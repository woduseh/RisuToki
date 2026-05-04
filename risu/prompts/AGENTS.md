# Preset Authoring — Agent Routing

> Thin routing file. Full content lives in the linked skills and docs.

## What to read / when

| Order | Topic                        | How to load                                             |
| ----- | ---------------------------- | ------------------------------------------------------- |
| 1     | Project rules & MCP workflow | `read_skill("project-workflow")`                        |
| 2     | MCP tool selection           | `read_skill("using-mcp-tools")` before MCP reads/writes |
| 3     | **Preset composition**       | `read_skill("writing-risup-presets")`                   |
| 4     | Preset field reference       | `risu/prompts/docs/PRESET_FIELDS.md`                    |

## Shared syntax (load on demand)

| Topic                                   | Skill                                    |
| --------------------------------------- | ---------------------------------------- |
| CBS templates inside prompt text        | `read_skill("writing-cbs-syntax")`       |
| File structures                         | `read_skill("file-structure-reference")` |
| Module pairing for `moduleIntergration` | `read_skill("writing-risum-modules")`    |

## Mandatory rules

1. **Read `project-workflow` first** every session.
2. **Do not bulk-read `promptTemplate` or `formatingOrder` with generic field reads** when structured risup prompt tools can answer the question.
3. Carry the latest `expected_type` and optional `expected_preview` from `list_risup_prompt_items` into writes when editing by index.
4. Use `export_risup_prompt_to_text` for large prompt rewrites, `diff_risup_prompt` for preset comparison, and snippets for reusable blocks.
5. Local `.risup` work products in this directory stay ignored. Only routing/docs/skills surfaces are tracked here.
6. Bot, module, and plugin composition workflows are separate. Only pull them in when the preset task explicitly crosses those boundaries (for example, documenting `moduleIntergration`).
7. Use `writing-risup-presets` as the primary skill first; load `writing-cbs-syntax` or module/file-structure skills only after a concrete toggle, CBS, or module-pairing need appears.
