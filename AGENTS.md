# RisuToki — Agent Router

RisuToki is an MCP editor for RisuAI `.charx`, `.risum`, and `.risup` artifacts. Load only the guidance required by the current task.

Within this repository, prefer these repository-specific routes over semantically overlapping generic global Skills.

## Choose one primary route

- **Repository code, harness, tests, CI, release, or contribution policy:** `project-workflow`. Read `docs/MCP_WORKFLOW.md` or `docs/PROJECT_RULES.md` only when that detail affects the task.
- **Selecting or sequencing MCP artifact tools:** `using-mcp-tools`.
- **Bot composition:** use the nearest router at `risu/bot/AGENTS.md`.
- **Shared CBS, lorebook, regex, Lua, HTML/CSS, trigger, asset, or file syntax:** `risu/common/AGENTS.md`.
- **Preset, module, or plugin authoring:** use the corresponding router under `risu/prompts`, `risu/modules`, or `risu/plugins`.

Do not preload `project-workflow`, the full Skill catalog, or unrelated authoring Skills. Add a support Skill only when the primary route exposes a concrete cross-domain need.

## Delivery

- Artifact mutations run preview, then apply. The editor's confirmation dialog or the standalone write gate is the approval boundary, so apply a preview that matches the request without asking in chat.
- Deliver only the surfaces the request names. Offer other useful surfaces in one line instead of producing them.

## Scope boundaries

- `project-workflow` owns implementation discipline, repository versioning, documentation synchronization, validation, and release policy.
- `using-mcp-tools` owns exact MCP artifact routes and validation sequences; prefer its bounded facade operations.
- Under `risu/`, the nearest subtree router owns authoring decisions. Local artifact work products remain ignored unless the task explicitly changes tracked guidance or fixtures.
