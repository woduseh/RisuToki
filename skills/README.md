# RisuToki Skills

| Scope                                 | Entry                                             |
| ------------------------------------- | ------------------------------------------------- |
| Repository code, validation, releases | [project-workflow](project-workflow/SKILL.md)     |
| MCP artifact operations               | [using-mcp-tools](using-mcp-tools/SKILL.md)       |
| Bot composition and translation       | [Bot skills](../risu/bot/skills/README.md)        |
| RisuAI syntax and formats             | [Common skills](../risu/common/skills/README.md)  |
| Phēmē and presets                     | [Prompt skills](../risu/prompts/skills/README.md) |
| Modules                               | [Module skills](../risu/modules/skills/README.md) |
| Plugins                               | [Plugin skills](../risu/plugins/skills/README.md) |

## Source and discovery

Tracked sources live here and under `risu/*/skills/`. `npm run sync:skills` rebuilds `.skill-catalog/` and the repository-level `.agents/skills` (Codex) and `.claude/skills` (Claude Code) discovery paths. Subtree folders are source locations, not independent CLI catalogs.

When the client catalog already identifies the needed skill, open it directly. MCP clients can discover skills with `list_skills` (scopes, query, summary detail) and read them with `read_skill`. The no-argument list remains a compatibility view.

## Skill document contract

Each maintained skill includes `agents/openai.yaml` with its UI display name, short description, and a default prompt mentioning `$skill-name`. This is Codex interface metadata, separate from `SKILL.md` instructions and MCP Markdown references. Invocation policy stays at its automatic-selection default.

YAML frontmatter requires `name` and `description`. Optional fields include `tags`, `related_tools`, `artifact_types`, and `canonical_sources`. Descriptions explain when the knowledge is useful; no fixed Primary/Support or exclusion wording is required.

`list_skills` exposes `name`, `description`, `tags`, `relatedTools`, and `files`. `read_skill` serves top-level Markdown and `references/*.md`; deeper directories are not served. References outside a skill must be under a `risu/*/docs` guide root to be available to MCP clients through `inspect_document` with a guidance `guide` selector.

Keep project facts, user preferences, non-obvious runtime contracts, and useful examples. General problem-solving steps, fixed creative recipes, arbitrary quotas, and repeated harness instructions do not belong in the execution layer. State the verified baseline for version-sensitive behavior. Optional recipes should identify their purpose without claiming unmeasured model performance.

Static tests check discovery and reference delivery. Live routing diagnostics and optional task-quality comparisons are described in `test/behavior-evals/README.md`; selecting a skill alone does not establish result quality.
