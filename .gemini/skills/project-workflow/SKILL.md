---
name: project-workflow
description: 'Use when changing RisuToki code, harnesses, tests, CI, documentation tied to behavior, versions, or releases. Primary skill for repository contribution work; hand MCP artifact operations to using-mcp-tools. Do not use when only authoring or inspecting a .charx, .risum, or .risup artifact.'
tags: ['workflow', 'project', 'contribution', 'release']
related_tools: ['list_skills', 'read_skill']
---

# Project Workflow

## Outcome

Deliver an in-scope repository change with the relevant documentation, version metadata, and validation evidence synchronized. This is not a session-start preload.

## Minimal workflow

1. Inspect the nearest `AGENTS.md`, affected implementation, and current working-tree state.
2. Define the smallest source, documentation, and test surfaces that must move together.
3. Load only the supporting reference that affects the task:
   - [`MCP_WORKFLOW.md`](MCP_WORKFLOW.md) for runtime modes or MCP execution sequences.
   - [`PROJECT_RULES.md`](PROJECT_RULES.md) for semver, changelog, CI, and release details.
4. Implement without overwriting unrelated user changes.
5. Run proportionate checks and report what ran, what passed, and any remaining limit.

For concrete artifact tool selection, hand off to `using-mcp-tools`. Authoring syntax and composition belong to the nearest `risu/*/AGENTS.md` route.

## Repository rules

- Changes to tracked source, product behavior, or workflow/tooling require a semver version update and a new top `CHANGELOG.md` entry. Update user-facing documentation when behavior changes.
- Pure `.charx`/`.risum`/`.risup` authoring does not require a version bump. Documentation-only corrections that do not change product behavior also do not require one.
- Keep `AGENTS.md`, docs, Skills, tests, and tool metadata synchronized when an MCP surface or routing contract changes.
- PR validation covers lint, typecheck, tests, and platform builds as documented in `PROJECT_RULES.md`. MCP contract or routing changes also require `npm run test:evals` and `npm run test:evals:replay`.
- Packaging and publishing occur only for an explicitly authorized tag release.

## Validation

Choose checks by risk. At minimum, run focused tests for changed behavior and the repository's lint/type checks when applicable. For generated Skill discovery surfaces, run the canonical sync command and verify mirrors rather than editing generated copies directly.
