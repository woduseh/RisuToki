# RisuToki — Agent Startup Guide

> Routing guide that every AI coding assistant should read at the start of a session.
> RisuToki is a dedicated MCP editor for RisuAI `.charx` / `.risum` / `.risup` files.

---

## What to read at session start / on demand

Only `project-workflow` is mandatory at session start. Load the other references when the current task actually needs that layer.

| Order | Topic                                       | How to load                                                                                                                                                                    |
| ----- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1     | **Onboarding, project rules, MCP workflow** | `read_skill("project-workflow")` — for full detail, follow up with `read_skill("project-workflow", "MCP_WORKFLOW.md")` or `read_skill("project-workflow", "PROJECT_RULES.md")` |
| 2     | **MCP tool selection, large fields, batch** | `read_skill("using-mcp-tools")` before concrete MCP reads/writes                                                                                                               |
| 3     | **Product/editor code work**                | `docs/analysis/ARCHITECTURE.md`, `docs/MODULE_MAP.md`, `CONTRIBUTING.md`                                                                                                       |
| 4     | **Authoring work under `risu/`**            | Read the nearest `risu/{common,bot,prompts,modules,plugins}/AGENTS.md` or `README.md`; use it as the active authoring router for the current subtree                           |

### Additional repo-local references (may not be available outside the repo)

| Document                                                         | Contents                                                       |
| ---------------------------------------------------------------- | -------------------------------------------------------------- |
| [`docs/analysis/ARCHITECTURE.md`](docs/analysis/ARCHITECTURE.md) | Runtime architecture, process boundaries, hotspots (canonical) |
| [`docs/MCP_WORKFLOW.md`](docs/MCP_WORKFLOW.md)                   | MCP tool routing and read-rule source of truth                 |
| [`docs/MCP_TOOL_SURFACE.md`](docs/MCP_TOOL_SURFACE.md)           | Tool families, boundaries, behavior hints                      |
| [`docs/MCP_ERROR_CONTRACT.md`](docs/MCP_ERROR_CONTRACT.md)       | Error / no-op / success response contracts                     |
| `toki-mcp-server.js --standalone`                                | File-backed MCP runtime for Codex/CLI use without Electron     |
| [`docs/PROJECT_RULES.md`](docs/PROJECT_RULES.md)                 | Versioning and CI rules                                        |
| [`docs/MODULE_MAP.md`](docs/MODULE_MAP.md)                       | TypeScript source navigation map                               |
| [`docs/README.md`](docs/README.md)                               | Full knowledge-base index                                      |

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
| `using-mcp-tools`  | Tool selection, large-field editing, batch-first principles                                     |

Use `list_skills` to see the repo-global catalog, then load only the skills that match the current subtree and task. Codex discovers that repo-local catalog through the generated `.agents/skills` discovery path refreshed by `npm run sync:skills` (or `npm install` via `prepare`); Copilot CLI, Claude Code, and Gemini CLI use `.github/skills`, `.claude/skills`, and `.gemini/skills`.

## Authoring routing note

- Shared authoring syntax/reference lives under `risu/common/skills/`, `risu/common/docs/`, and `risu/common/AGENTS.md`.
- Artifact-local authoring routers live in `risu/{bot,prompts,modules,plugins}/AGENTS.md`.
- The nearest `risu/{scope}/AGENTS.md` decides which authoring workflow should be treated as primary in the current subtree.

Facade v1 first-wave MCP tools (`inspect_document`, `read_content`, `search_document`, `preview_edit`, `apply_edit`) are preferred for bounded inspect/read/search/preview/apply workflows when their selectors cover the task. Treat granular tools as advanced/legacy escape hatches for unsupported structured families, direct external mutations, broad batch/deletes/imports/exports/assets, exact legacy response shapes, or precision/debug work.

If no main file is open but reference files are loaded, start with facade `inspect_document` / `read_content` / `search_document` when covered; use `session_status` or `list_references` only for full legacy inventories or runtime diagnostics, then narrow large reference text with `search_in_reference_field` / `read_reference_field_range` before drilling into `list_reference_*` / `read_reference_*`.

For unopened `.charx` / `.risum` / `.risup` files, use facade `inspect_document` / `read_content` first when covered. Use `inspect_external_file` + `probe_*` for probe-specific read-only inspection and `external_*` when you need direct absolute-path edits without switching the active UI document. If facade and dedicated families cannot reach the needed content, use `list_surfaces` / `read_surface` / `patch_surface` for the active document or `external_read_surface` / `external_patch_surface` for unopened files.
