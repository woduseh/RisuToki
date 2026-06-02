# RisuToki — Agent Startup Guide

> Routing guide that every AI coding assistant should read at the start of a session.
> RisuToki is a dedicated MCP editor for RisuAI `.charx` / `.risum` / `.risup` files.

---

## What to read at session start / on demand

Only `project-workflow` is mandatory at session start. Load the other references when the current task actually needs that layer.

| Order | Topic                                              | How to load                                                                                                                                                                    |
| ----- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1     | **Onboarding, project rules, MCP workflow**        | `read_skill("project-workflow")` — for full detail, follow up with `read_skill("project-workflow", "MCP_WORKFLOW.md")` or `read_skill("project-workflow", "PROJECT_RULES.md")` |
| 2     | **MCP tool selection, task playbooks, validation** | `read_skill("using-mcp-tools")` before concrete MCP reads/writes                                                                                                               |
| 3     | **Product/editor code work**                       | `docs/analysis/ARCHITECTURE.md`, `docs/MODULE_MAP.md`, `CONTRIBUTING.md`                                                                                                       |
| 4     | **Authoring work under `risu/`**                   | Read the nearest `risu/{common,bot,prompts,modules,plugins}/AGENTS.md` or `README.md`; use it as the active authoring router for the current subtree                           |

### Additional repo-local references (may not be available outside the repo)

| Document                                                                             | Contents                                                                                       |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| [`docs/analysis/ARCHITECTURE.md`](docs/analysis/ARCHITECTURE.md)                     | Runtime architecture, process boundaries, hotspots (canonical)                                 |
| [`docs/MCP_WORKFLOW.md`](docs/MCP_WORKFLOW.md)                                       | MCP tool routing, read-rule, and task-intent playbook source of truth                          |
| [`docs/MCP_TOOL_SURFACE.md`](docs/MCP_TOOL_SURFACE.md)                               | Tool families, boundaries, behavior hints                                                      |
| [`docs/MCP_ERROR_CONTRACT.md`](docs/MCP_ERROR_CONTRACT.md)                           | Error / no-op / success response contracts                                                     |
| [`src/lib/mcp-agent-workflow-eval.test.ts`](src/lib/mcp-agent-workflow-eval.test.ts) | Real-artifact workflow eval matrix for `.charx`, `.risup`, `.risum`, and Plugin API v3 routing |
| `toki-mcp-server.js --standalone`                                                    | File-backed MCP runtime for Codex/CLI use without Electron                                     |
| [`docs/PROJECT_RULES.md`](docs/PROJECT_RULES.md)                                     | Versioning and CI rules                                                                        |
| [`docs/MODULE_MAP.md`](docs/MODULE_MAP.md)                                           | TypeScript source navigation map                                                               |
| [`docs/README.md`](docs/README.md)                                                   | Full knowledge-base index                                                                      |

---

## Mandatory rules

1. **At the start of every session**, read `read_skill("project-workflow")` first. It contains a summary of MCP rules and project rules. Load `MCP_WORKFLOW.md` and `PROJECT_RULES.md` from that skill when you need full detail.
2. **Keep docs in sync.** When MCP tools, routing, or workflows change, update `AGENTS.md`, `docs/`, and `skills/` together.
3. **Bump version + changelog when RisuToki itself changes.** Update `package.json` version and add a `CHANGELOG.md` entry for changes to tracked source code, product docs, or workflow/tooling files. **Do not** bump versions for pure authoring work (creating or editing `.charx`/`.risum`/`.risup` content under `risu/`) or for documentation-only edits that do not affect product behavior.
4. **When syntax is unclear, read the skill docs first.** For detailed MCP tool-selection guidance, see `read_skill("using-mcp-tools")`.
5. **Treat root instructions as product-first.** When working under `risu/`, let the nearest `risu/{scope}/AGENTS.md` choose the authoring workflow. Do not preload unrelated artifact guidance from the repo root.

---

## Product skills quick reference

| Skill              | Purpose                                                                                         |
| ------------------ | ----------------------------------------------------------------------------------------------- |
| `project-workflow` | Project rules, MCP workflow, onboarding guide (includes `MCP_WORKFLOW.md` + `PROJECT_RULES.md`) |
| `using-mcp-tools`  | Tool selection, task-intent playbooks, validation, batch-first principles                       |

Use `list_skills` to see the repo-global catalog, then load only the skills that match the current subtree and task. Codex discovers that repo-local catalog through the generated `.agents/skills` discovery path refreshed by `npm run sync:skills` (or `npm install` via `prepare`); Copilot CLI, Claude Code, and Gemini CLI use `.github/skills`, `.claude/skills`, and `.gemini/skills`.

## Authoring routing note

- Shared authoring syntax/reference lives under `risu/common/skills/`, `risu/common/docs/`, and `risu/common/AGENTS.md`.
- Artifact-local authoring routers live in `risu/{bot,prompts,modules,plugins}/AGENTS.md`.
- The nearest `risu/{scope}/AGENTS.md` decides which authoring workflow should be treated as primary in the current subtree.

Facade v1 MCP tools (`list_tool_profiles`, `inspect_document`, `read_content`, `search_document`, `preview_edit`, `apply_edit`, `validate_content`, `load_guidance`, `manage_items`, `manage_assets`) are preferred for compact profile discovery plus bounded inspect/read/search/preview/apply/validate/item-management/asset-management workflows when their selectors cover the task. Default `tools/list` compatibility stays unfiltered, but standalone/app-backed MCP can opt into strict registration with `--tool-profile` or `RISUTOKI_MCP_TOOL_PROFILE`; `list_tool_profiles` reports current profile, strict filtering, runtime health, and registered/hidden counts. `read_content` defaults to a 24KB cap and returns root surface overviews unless raw root reads are explicitly requested with `include_raw` and `max_bytes`. Current facade mutations cover active/external field write/replace, active/external surface patch, active/external lorebook text/id writes/deletes/replacements, active/external regex/greeting identity or index writes/deletes, active/external trigger writes/deletes, active/external Lua/CSS section writes/replacements/inserts, external Lua/CSS section deletes, active/external `.risup` prompt item id/index writes/deletes, older indexed regex/greeting/risup prompt item writes/deletes, active/external `.risup` prompt batch writes/deletes, active regex/greeting prompt batch writes, active greeting batch deletes, active/external `.risup` prompt add/reorder/import/copy/snippet workflows, active/external lorebook, regex, alternate greeting, trigger, Lua, and CSS add/reorder through `manage_items`, and active/external `.charx`/`.risum` asset list/read/add/delete plus `.charx` asset rename through `manage_assets`. For new structured-item workflows, prefer `{ family: "risup-prompt", id }`, `{ family: "lorebook", id }`, regex/greeting `identity` selectors, and trigger/Lua/CSS `index` or unique identity selectors before raw field/surface fallbacks; use `manage_items` for `.risup` prompt item management beyond write/delete and for covered lorebook/regex/alternate greeting/trigger/Lua/CSS add/reorder; use `manage_assets` for covered asset workflows before granular asset routes. `validate_content` covers lorebook, regex, `.charx` export compatibility via `family: "asset"` or `field: "exportCompatibility"`, CBS, Danbooru, active/external `.risup`, `.risum`, and external Plugin v3 source-scan selectors where enough context is provided. Treat granular tools as advanced/legacy escape hatches for unsupported structured families, non-patch surface mutation, broad unsupported batch/add/reorder workflows, oversized exact import/export text, asset compression or unsupported asset workflows, exact legacy response shapes, or precision/debug work.

RisuToki treats `.charx` `personality`, `scenario`, `systemPrompt`, `nickname`, `source`, `groupOnlyGreetings`, `extensions.risuai.additionalText`, `extensions.risuai.license`, and unsafe `extensions.risuai.virtualscript` as practical protected/deprecated fields even when RisuAI still accepts some of them. They are hidden or blocked from normal editing and removed from the saved file. Use `hiddenFieldWarnings` only as a value-safe existence summary; do not route around the hidden policy to expose content. `.risup` legacy prompt fields and reserved `.risum` `cjs` follow the same hidden + save-stripped policy. `.risum` `lowLevelAccess` remains visible/editable.

When a `.charx`, `.risum`, or `.risup` project folder is active, treat the folder as the save backend for the normal structured editor. AI terminal cwd and generated `AGENTS.md` project-root context resolve to the project folder, while MCP field visibility and hidden/deprecated-field policy remain the same as the underlying document type.

When MCP reads are too large for comfortable field/surface editing, use project-folder extraction for `.charx`, `.risum`, or `.risup` files and continue through the structured editor/MCP surfaces when possible. Raw `.md`/`.json`/`assets` files are an advanced fallback for external tools or precise filesystem edits; reassemble only when the user wants an exported file.

If no main file is open but reference files are loaded, start with facade `inspect_document` / `read_content` / `search_document` when covered; use `session_status` or `list_references` only for full legacy inventories or runtime diagnostics, then narrow large reference text with `search_in_reference_field` / `read_reference_field_range` before drilling into `list_reference_*` / `read_reference_*`. In standalone mode, `session_status` exposes `allowWrites` and `userDataPath`; process, stdio, mutating tool, sanitized API request/response, and MCP logging diagnostics are appended to `%USERPROFILE%\.risutoki\mcp-standalone\mcp-server.log`.

For unopened `.charx` / `.risum` / `.risup` files, use facade `inspect_document` / `read_content` first when covered, and use `preview_edit` / `apply_edit` for covered external field, surface patch, lorebook, regex, alternate greeting, trigger, Lua/CSS section, or `.risup` prompt item mutations. Use `inspect_external_file` + `probe_*` for probe-specific read-only inspection and `external_*` when you need direct absolute-path edits without switching the active UI document. If facade and dedicated families cannot reach the needed content, use `list_surfaces` / `read_surface` / `patch_surface` for the active document or `external_read_surface` / `external_patch_surface` for unopened files.
