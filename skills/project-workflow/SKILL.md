---
name: project-workflow
description: 'Repository-specific release policy, validation commands, and source locations for RisuToki code or tooling changes. Artifact editing uses using-mcp-tools; bot and preset content uses the risu/ routes.'
tags: ['workflow', 'project', 'contribution', 'release']
---

# RisuToki Repository

- `docs/PROJECT_RULES.md`: versioning, CI, and release policy. Product and tooling changes need a semver bump and changelog entry; content authoring and documentation-only corrections do not.
- `docs/MODULE_MAP.md`: source navigation. Edit TypeScript/Vue sources; `.build/`, `dist/`, and the root MCP bundle are generated outputs.
- `docs/MCP_WORKFLOW.md`: runtime modes and MCP startup.

Skill sources live in `skills/` and `risu/*/skills/`. `npm run sync:skills` rebuilds `.skill-catalog/` and the `.agents/skills` and `.claude/skills` discovery paths; edit the source files, not those generated paths.

Use the checks appropriate to the changed surface in `docs/PROJECT_RULES.md`. Packaging and publishing belong to explicitly authorized tag releases.

Default tests use synthetic artifacts. `npm run test:corpus` opts into reading local ignored user artifacts; run it only when the task includes that access.
