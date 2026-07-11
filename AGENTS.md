# RisuToki — Agent Router

RisuToki is an MCP editor for RisuAI `.charx`, `.risum`, and `.risup` artifacts. Load only the guidance required by the current task.

## Choose one primary route

- **Repository code, harness, tests, CI, release, or contribution policy:** `project-workflow`. Read `MCP_WORKFLOW.md` or `PROJECT_RULES.md` only when that detail affects the task.
- **Selecting or sequencing MCP artifact tools:** `using-mcp-tools`.
- **Bot composition:** use the nearest router at `risu/bot/AGENTS.md`.
- **Shared CBS, lorebook, regex, Lua, HTML/CSS, trigger, asset, or file syntax:** `risu/common/AGENTS.md`.
- **Preset, module, or plugin authoring:** use the corresponding router under `risu/prompts`, `risu/modules`, or `risu/plugins`.

Do not preload `project-workflow`, the full Skill catalog, or unrelated authoring Skills. Add a support Skill only when the primary route exposes a concrete cross-domain need.

## Project rules

- Prefer bounded facade MCP tools. For concrete artifact reads or edits, let `using-mcp-tools` choose the route and validation sequence.
- Keep product documentation and Skill guidance synchronized with MCP surface, field, or workflow changes.
- When tracked source, product behavior, or workflow/tooling changes, update the semver version and `CHANGELOG.md`. Also update user-facing documentation when behavior changes.
- Pure `.charx`/`.risum`/`.risup` authoring does not require a version bump. Documentation-only edits that do not affect product behavior also do not require one.
- Before completing repository changes, run the checks selected by `project-workflow`; MCP contract or routing changes require the eval checks documented there. Packaging happens only for a tag release.
- Under `risu/`, the nearest subtree router owns authoring decisions. Local artifact work products remain ignored unless the task explicitly changes tracked guidance or fixtures.

## Reference index

- Architecture: `docs/analysis/ARCHITECTURE.md`
- Source navigation: `docs/MODULE_MAP.md`
- MCP profiles and contracts: `docs/MCP_TOOL_SURFACE.md`, `docs/MCP_ERROR_CONTRACT.md`
- Contribution policy: `CONTRIBUTING.md`
