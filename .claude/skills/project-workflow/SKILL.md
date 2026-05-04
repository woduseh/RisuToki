---
name: project-workflow
description: 'Project-level MCP workflow rules and contribution conventions for RisuToki agents. Use when onboarding into a session, choosing MCP tools, or following versioning/CI rules.'
tags: ['workflow', 'project', 'onboarding', 'mcp', 'rules']
related_tools: ['list_skills', 'read_skill', 'list_fields', 'read_field_batch', 'write_field_batch']
---

# Project Workflow

## Agent Operating Contract

- **Use when:** starting a RisuToki session, checking project rules, choosing whether to load MCP workflow details, or preparing repo/documentation changes.
- **Do not use when:** the task only needs an artifact-specific authoring skill after project rules are already known.
- **Read first:** this `SKILL.md` at session start; it is the lightweight orientation layer.
- **Load deeper only if:** MCP routing details are needed (`MCP_WORKFLOW.md`) or versioning/CI/release rules affect the change (`PROJECT_RULES.md`).
- **Output/validation contract:** route to the smallest relevant skill set, keep docs/versioning rules in sync, and treat `using-mcp-tools` as the detailed MCP tool-choice source of truth.

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

## MCP Tool Routing — Startup Pointer

This skill only orients you. Before concrete MCP reads or writes, load `using-mcp-tools` and treat it as the detailed source of truth for structured surfaces, batch workflows, stale-index guards, and large-field edits.

Startup principles:

1. Prefer dedicated structured tools over broad field dumps for Lua, CSS, greetings, lorebooks, regex, triggers, and risup prompt structures.
2. Batch related reads/writes instead of looping single-item tools.
3. Probe unopened files before switching the active UI document.
4. Search/range-read before replacing large fields.
5. Snapshot or use dry-run/hash guards before risky edits.

### Runtime Modes

- App-backed MCP is started by the Electron app and works against the active editor document.
- Standalone MCP is started with `node toki-mcp-server.js --standalone` and works against files supplied by `--file`, `open_file`, and repeated `--ref`; pass `--allow-writes` when mutation tools should be permitted.

> Complete tool routing map, workflow patterns, and caveats: [`MCP_WORKFLOW.md`](MCP_WORKFLOW.md)
>
> For **detailed MCP tool-selection guidance** (batch-first patterns, large-field editing, context-budget sizing), load `read_skill("using-mcp-tools")` when the task reaches an MCP read/write decision.

---

## Project Rules — Quick Reference

### Versioning & Documentation (mandatory when the repo itself changes)

These apply when a task modifies tracked RisuToki source, product docs, or tooling — **not** for pure authoring work (`.charx`/`.risum`/`.risup` content) or documentation-only edits.

1. **`package.json` version bump** — semver
2. **`CHANGELOG.md`** — Keep a Changelog format, newest entry at top
3. **`README.md`** — update if the change is user-visible
4. **`AGENTS.md` / `docs/` / `skills/`** — update when MCP tools, fields, workflows, or Copilot routing change

### CI / Validation

- PR validation: Ubuntu (`lint` + `typecheck` + `test`) + Windows (`build:electron` + `build:renderer`)
- MCP contract changes → run `npm run test:evals` first
- No packaging in PR — only on tag release

> Complete versioning rules, CI workflow, and guide locations: [`PROJECT_RULES.md`](PROJECT_RULES.md)

## Smoke Tests

| Prompt                                                                     | Expected routing                                                                           | Expected output                             | Forbidden behavior                                                |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------- | ----------------------------------------------------------------- |
| "I changed a MCP tool handler; what version bump and CI checks do I need?" | Primary: `project-workflow`; load `PROJECT_RULES.md` for full detail.                      | Versioning/docs/CI guidance.                | Guessing release rules without loading project rules when needed. |
| "Walk me through onboarding for a RisuToki session."                       | Primary: `project-workflow`; load `using-mcp-tools` only before concrete MCP reads/writes. | Minimal startup order and routing guidance. | Preloading every authoring skill.                                 |
