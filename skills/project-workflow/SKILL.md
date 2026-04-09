---
name: project-workflow
description: 'Project-level MCP workflow rules and contribution conventions for RisuToki agents. Use when onboarding into a session, choosing MCP tools, or following versioning/CI rules.'
tags: ['workflow', 'project', 'onboarding', 'mcp', 'rules']
related_tools: ['list_skills', 'read_skill', 'list_fields', 'read_field_batch', 'write_field_batch']
---

# Project Workflow

This skill is the agent-facing entrypoint for **project-level guidance** that every coding agent should know before making changes. It covers two areas:

1. **MCP workflow** — tool selection, read rules, workflow patterns, and caveats
2. **Project rules** — versioning, documentation updates, CI, and persona workflows

## When to Use This Skill

- **Session start**: Read this skill to understand how the project expects you to work.
- **Before MCP edits**: Review the tool routing map and read rules to avoid context-wasting full dumps.
- **Before committing**: Check the versioning and documentation update rules.

---

## MCP Tool Routing — Quick Reference

| Category                 | Preferred tools                                                                                                                  | When                                   |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| **Fields**               | `list_fields`, `read_field`, `read_field_batch`, `write_field`, `write_field_batch`                                              | Small text field full read/write       |
| **Large fields**         | `search_in_field`, `read_field_range`, `replace_in_field`, `replace_in_field_batch`, `replace_block_in_field`, `insert_in_field` | Partial edits in 10+ KB fields         |
| **Unopened files**       | `probe_field`, `probe_field_batch`, `probe_lorebook`, `probe_regex`, `probe_lua`, `open_file`                                    | Reading files not yet opened in editor |
| **Lua / CSS**            | `list_lua` / `list_css` → `read_lua` / `read_css`                                                                                | Section-level read/write               |
| **Lorebook**             | `list_lorebook` → `read_lorebook` / `read_lorebook_batch`                                                                        | Browse, compare, batch edit            |
| **Regex**                | `list_regex` → `read_regex` → targeted writes                                                                                    | Entry-level operations                 |
| **Greetings / Triggers** | `list_greetings` / `list_triggers` → per-item tools                                                                              | Individual editing                     |
| **risup prompts**        | `list_risup_prompt_items`, `read_risup_prompt_item`, `read_risup_formating_order`                                                | Structured prompt editing              |
| **References**           | `list_reference_*` → `read_reference_*`                                                                                          | Read-only comparisons                  |
| **Skills**               | `list_skills`, `read_skill`                                                                                                      | On-demand guide loading                |

### Critical Read Rules

1. **Never** `read_field` these surfaces — use dedicated list→read tools instead:
   - `lua`, `css`, `alternateGreetings`, `triggerScripts`, `promptTemplate`/`formatingOrder`
2. **Batch first** — use batch tools when editing multiple entries.
3. **Probe before open** — use `probe_*` for unopened files; only `open_file` when you need to write.
4. **Search before replace** — in large fields, locate with `search_in_field` first.
5. **Snapshot before risky edits** — use `snapshot_field` for safety.

> Full details: [`docs/MCP_WORKFLOW.md`](../../docs/MCP_WORKFLOW.md)
>
> For **detailed MCP tool-selection guidance** (batch-first patterns, large-field editing, context-budget sizing), load the companion skill: `read_skill("using-mcp-tools")`.

---

## Project Rules — Quick Reference

### Versioning & Documentation (mandatory every task)

1. **`package.json` version bump** — semver
2. **`CHANGELOG.md`** — Keep a Changelog format, newest entry at top
3. **`README.md`** — update if the change is user-visible
4. **`AGENTS.md` / `docs/` / `skills/`** — update when MCP tools, fields, or workflows change

### CI / Validation

- PR validation: Ubuntu (`lint` + `typecheck` + `test`) + Windows (`build:electron` + `build:renderer`)
- MCP contract changes → run `npm run test:evals` first
- No packaging in PR — only on tag release

### File Locations

| Path                         | Purpose                                           |
| ---------------------------- | ------------------------------------------------- |
| `docs/README.md`             | Knowledge-base index                              |
| `docs/MCP_WORKFLOW.md`       | MCP tool selection, read rules, workflow patterns |
| `docs/MCP_TOOL_SURFACE.md`   | Tool families, boundaries, behavior hints         |
| `docs/MCP_ERROR_CONTRACT.md` | Success/error/no-op response contract             |
| `docs/PROJECT_RULES.md`      | Versioning, CI, persona workflows                 |
| `skills/`                    | LLM-optimized skill documents                     |
| `guides/`                    | Korean-language human guides                      |

> Full details: [`docs/PROJECT_RULES.md`](../../docs/PROJECT_RULES.md)

---

## Caveats

- `write_field`, `write_lorebook`, `add_*`, `delete_*` trigger a **user confirmation popup**.
- Lorebook `comment` may be used by Lua `getLoreBooks()` search — keep patterns consistent.
- References are **read-only**.
- risup `promptTemplate`/`formatingOrder` prefer structured UI and MCP tools; use `write_field` fallback only for unsupported raw shapes.
- `src/lib/mcp-tool-taxonomy.ts` is the single source of truth for tool→family classification. Update it when adding/removing tools.

> Full caveats: [`docs/MCP_WORKFLOW.md` §4](../../docs/MCP_WORKFLOW.md#4-주의사항)
