# RisuToki Product Skills

Skill documents for agents working on **the RisuToki editor itself** — MCP workflow, tool selection, and project conventions.

> **Looking for authoring skills?** Syntax, composition, and content-creation skills now live under the selectively tracked `risu/` subtree. Start from the nearest `risu/{scope}/AGENTS.md` when you are already inside an authoring subtree.

## Product skills

| Skill                                 | Description                                              | Files                                                   |
| ------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------- |
| [project-workflow](project-workflow/) | Project rules, MCP workflow, and agent onboarding guide  | `SKILL.md` + `MCP_WORKFLOW.md` + `PROJECT_RULES.md`     |
| [using-mcp-tools](using-mcp-tools/)   | MCP tool choice, batch-safe workflows, and anti-patterns | `SKILL.md` + `TOOL_REFERENCE.md` + `FILE_STRUCTURES.md` |

## Authoring skills

| Subtree                | Purpose                                                            | Index                                      |
| ---------------------- | ------------------------------------------------------------------ | ------------------------------------------ |
| `risu/common/skills/`  | Shared syntax/reference for `.charx`, `.risum`, `.risup` authoring | [README](../risu/common/skills/README.md)  |
| `risu/bot/skills/`     | Bot and character composition guidance                             | [README](../risu/bot/skills/README.md)     |
| `risu/prompts/skills/` | `.risup` preset and prompt authoring                               | [README](../risu/prompts/skills/README.md) |
| `risu/modules/skills/` | `.risum` module authoring                                          | [README](../risu/modules/skills/README.md) |
| `risu/plugins/skills/` | RisuAI plugin v3 authoring                                         | [README](../risu/plugins/skills/README.md) |

## Frontmatter schema

Every `SKILL.md` starts with YAML frontmatter.

```yaml
---
name: using-mcp-tools
description: 'Workflow guide for choosing RisuToki MCP tools safely.'
tags: ['workflow', 'mcp', 'editing']
related_tools: ['search_all_fields', 'write_field_batch', 'read_skill']
---
```

### Required fields

- `name`
- `description`

### Optional additive fields

- `tags`
- `related_tools`
- `artifact_types`
- `canonical_sources`

The MCP `list_skills` response currently exposes `name`, `description`, `tags`, `relatedTools`, and `files`. Additional frontmatter is still useful for human routing and future tooling.

`npm run sync:skills` rebuilds `.copilot-skill-catalog/` from the tracked skill roots above so `.claude/skills`, `.gemini/skills`, and `.github/skills` all see the same unified catalog.

The catalog is repo-global. The current authoring workflow is scoped by the nearest `risu/{scope}/AGENTS.md`, not by per-directory skill availability.

## How to use

### For AI assistants

1. Use `list_skills` to discover the unified skill catalog.
2. Read `SKILL.md` first.
3. Load auxiliary reference files only when deeper detail is needed.

### For humans

Browse the relevant subtree directly:

- product/editor work → `skills/`
- shared authoring syntax → `risu/common/skills/`
- artifact-specific authoring → `risu/{bot,prompts,modules,plugins}/`
