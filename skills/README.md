# RisuToki Product Skills

Skill documents for agents working on **the RisuToki editor itself** — MCP workflow, tool selection, and project conventions.

> **Looking for authoring skills?** Syntax, composition, and content-creation skills now live under the selectively tracked `risu/` subtree. Start from the nearest `risu/{scope}/AGENTS.md` when you are already inside an authoring subtree.

## Product skills

| Skill                                 | Description                                                                                 | Files                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| [project-workflow](project-workflow/) | Repository code, validation, documentation, versioning, and release workflow                | `SKILL.md` + `MCP_WORKFLOW.md` + `PROJECT_RULES.md`     |
| [using-mcp-tools](using-mcp-tools/)   | MCP tool choice, batch-safe workflows, unopened-file probe/write routing, and anti-patterns | `SKILL.md` + `TOOL_REFERENCE.md` + `FILE_STRUCTURES.md` |

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
description: 'Primary skill. Use when choosing RisuToki MCP reads, previews, applies, or validation. Do not use when the task is repository code or release workflow; hand off to project-workflow.'
tags: ['workflow', 'mcp', 'editing']
related_tools: ['read_content', 'search_document', 'preview_edit', 'apply_edit', 'read_skill']
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

The MCP `list_skills` response currently exposes `name`, `description`, `tags`, `relatedTools`, and `files`. `files` covers top-level Markdown plus `references/*.md`, and `read_skill` serves the latter as `references/<name>.md`; deeper directories are not served. Additional frontmatter is still useful for human routing and future tooling.

## Agent skill authoring standard

Every skill should make the first read decisive. Keep `SKILL.md` as the execution layer, not the archive:

- Keep `SKILL.md` as short as it can be while still being complete; move long examples, catalogs, and theory into sibling reference files.
- Put `Use when`, the meaningful exclusion, and the Primary/Support role in the frontmatter description. In the body, state the outcome and only the boundaries, workflow, conditional references, and validation the skill actually needs; do not add a fixed boilerplate contract.
- Prefer one primary skill per task. Add shared syntax skills only when the current artifact actually uses that syntax.
- Put decision boundaries before examples so the model can route without scanning the whole file.
- Keep routing/evaluation cases in deterministic test fixtures, not in the runtime `SKILL.md` context.
- In `related_tools`, list facade tools first (`inspect_document`, `read_content`, `search_document`, `analyze_content`, `validate_content`, `preview_edit`/`apply_edit`, `manage_items`/`manage_assets`/`manage_file`) and keep only the domain-specific granular tools that remain real fallback surfaces after them — list order signals priority. See `using-mcp-tools` for the facade-first routing contract.
- Treat large reference files as opt-in depth, not required startup context. Put target, model, or platform profiles in the skill's `references/` directory so MCP clients can read them. A document outside the skill directory must live under a guide root (`risu/*/docs`), which MCP clients read through the guidance target's `guide` selector; do not point a skill at any other location.
- Name the approval gate. When the editor dialog or a write gate confirms a mutation, say so, so a capable model applies a matching preview instead of asking permission in chat.
- Write positive contracts: state when a format, surface, or clarifying question is appropriate rather than only prohibiting it. Blanket prohibitions make current models under-deliver.
- Where correctness depends on a RisuAI version, state the verified baseline and point at the reference so the model verifies instead of recalling.
- Keep skills harness-neutral. Do not restate rules the Claude Code or Codex system prompt already supplies, such as progress updates, tool-call batching, or general autonomy, unless this repository changes them.

`npm run sync:skills` rebuilds `.skill-catalog/` from the tracked skill roots above so Codex (`.agents/skills`) and Claude Code (`.claude/skills`) see the same unified catalog. Gemini and GitHub Copilot Skill mirrors are no longer generated.

The catalog is **repo-root scoped in this repository**: Claude Code reads `.claude/skills`, while Codex reads `.agents/skills`; RisuToki refreshes both after `npm run sync:skills` (or `npm install`, via `prepare`). Codex can scan parent `.agents/skills` directories from the current working directory up to the repo root, but RisuToki does not create nested subtree-specific catalogs. Placing a `skills/` folder inside a subtree therefore does not make those skills visible independently here. The current authoring workflow is scoped by the nearest `risu/{scope}/AGENTS.md`, which decides which skills from the global catalog are relevant to the task at hand.

## How to use

### For AI assistants

1. Let the root or nearest subtree router choose one primary Skill from the client-visible catalog. Claude Code loads the root `AGENTS.md` automatically through the `@AGENTS.md` import in `CLAUDE.md`.
2. If discovery is still needed, call `list_skills` with the current `scopes`, a narrow `query`, and `detail: "summary"`; the no-argument call remains the full compatibility view.
3. Read that Skill's `SKILL.md` first and load auxiliary references only when its routing rules expose a concrete need.

### For humans

Browse the relevant subtree directly:

- product/editor work → `skills/`
- shared authoring syntax → `risu/common/skills/`
- artifact-specific authoring → `risu/{bot,prompts,modules,plugins}/`
