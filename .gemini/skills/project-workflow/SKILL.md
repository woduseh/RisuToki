---
name: project-workflow
description: 'Project-level MCP workflow rules and contribution conventions for RisuToki agents. Use when onboarding into a session, choosing MCP tools, or following versioning/CI rules.'
tags: ['workflow', 'project', 'onboarding', 'mcp', 'rules']
related_tools: ['list_skills', 'read_skill', 'list_fields', 'read_field_batch', 'write_field_batch']
---

# Project Workflow

This skill is the agent-facing entrypoint for **project-level guidance** that every coding agent should know before making changes. It covers two areas:

1. **MCP workflow** — tool selection, read rules, workflow patterns, and caveats
2. **Project rules** — versioning, documentation updates, CI, and guide locations

## Supporting Files

| File                                   | Contents                                                                                |
| -------------------------------------- | --------------------------------------------------------------------------------------- |
| [`MCP_WORKFLOW.md`](MCP_WORKFLOW.md)   | Full MCP tool routing map, read rules, workflow patterns, caveats, and skill navigation |
| [`PROJECT_RULES.md`](PROJECT_RULES.md) | Versioning, CI/release workflow, and guide locations                                    |

Load these via `read_skill("project-workflow", "MCP_WORKFLOW.md")` and `read_skill("project-workflow", "PROJECT_RULES.md")` when you need complete detail.

## When to Use This Skill

- **Session start**: Read this SKILL.md for orientation, then load supporting files as needed.
- **Before MCP edits**: Load `MCP_WORKFLOW.md` for the tool routing map and read rules.
- **Before committing**: Load `PROJECT_RULES.md` for versioning and documentation update rules.

---

## MCP Tool Routing — Quick Reference

| Category                 | Preferred tools                                                                                                                                     | When                                                 |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| **Fields**               | `list_fields`, `read_field`, `read_field_batch`, `write_field`, `write_field_batch`                                                                 | Small text field full read/write                     |
| **Large fields**         | `search_in_field`, `read_field_range`, `replace_in_field`, `replace_in_field_batch`                                                                 | Partial edits in 10+ KB fields                       |
| **Unopened files**       | `probe_field`, `probe_field_batch`, `probe_lorebook`, `probe_regex`, `probe_lua`, `open_file`                                                       | Reading files not yet opened in editor               |
| **Lua / CSS**            | `list_lua` / `list_css` → `read_lua` / `read_css`                                                                                                   | Section-level read/write                             |
| **Lorebook**             | `list_lorebook` → `read_lorebook` / `read_lorebook_batch`                                                                                           | Browse, compare, batch edit                          |
| **Regex**                | `list_regex` → `read_regex` → targeted writes                                                                                                       | Entry-level operations                               |
| **Greetings / Triggers** | `list_greetings` / `list_triggers` → per-item tools                                                                                                 | Individual editing                                   |
| **risup prompts**        | `list_risup_prompt_items`, `read_risup_prompt_item`, `read_risup_formating_order`                                                                   | Structured prompt editing                            |
| **References**           | `list_references`, `read_reference_field_batch`, `search_in_reference_field`, `read_reference_field_range`, `list_reference_*` → `read_reference_*` | Read-only comparisons, even without a main file open |
| **Skills**               | `list_skills`, `read_skill`                                                                                                                         | On-demand guide loading                              |

### Critical Read Rules

1. **Never** `read_field` these surfaces — use dedicated list→read tools instead:
   - `lua`, `css`, `alternateGreetings`, `triggerScripts`, `promptTemplate`/`formatingOrder`
2. **Batch first** — use batch tools when editing multiple entries.
3. **Probe before open** — use `probe_*` for unopened files; only `open_file` when you need to write.
4. **Search before replace** — in large fields, locate with `search_in_field` first.
5. **Snapshot before risky edits** — use `snapshot_field` for safety.

> Complete tool routing map, workflow patterns, and caveats: [`MCP_WORKFLOW.md`](MCP_WORKFLOW.md)
>
> For **detailed MCP tool-selection guidance** (batch-first patterns, large-field editing, context-budget sizing), load the companion skill: `read_skill("using-mcp-tools")`.

---

## Project Rules — Quick Reference

### Versioning & Documentation (mandatory every task)

1. **`package.json` version bump** — semver
2. **`CHANGELOG.md`** — Keep a Changelog format, newest entry at top
3. **`README.md`** — update if the change is user-visible
4. **`AGENTS.md` / `docs/` / `skills/`** — update when MCP tools, fields, workflows, or Copilot routing change

### CI / Validation

- PR validation: Ubuntu (`lint` + `typecheck` + `test`) + Windows (`build:electron` + `build:renderer`)
- MCP contract changes → run `npm run test:evals` first
- No packaging in PR — only on tag release

> Complete versioning rules, CI workflow, and guide locations: [`PROJECT_RULES.md`](PROJECT_RULES.md)
