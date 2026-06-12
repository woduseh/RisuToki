# RisuToki — Agent Startup Guide

> Routing guide that every AI coding assistant should read at the start of a session.
> RisuToki is a dedicated MCP editor for RisuAI `.charx` / `.risum` / `.risup` files.
> This file is the startup and routing source of truth; detailed tool policy belongs to the linked canonical docs and skills.

---

## What to read at session start / on demand

Only `project-workflow` is mandatory at session start. Load the other references when the current task actually needs that layer.

| Order | Topic                                              | How to load                                                                                                                                          |
| ----- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | **Onboarding, project rules, MCP workflow**        | `read_skill("project-workflow")`; if MCP is unavailable, read `skills/project-workflow/SKILL.md` directly. Follow supporting links only when needed. |
| 2     | **MCP tool selection, task playbooks, validation** | `read_skill("using-mcp-tools")` before concrete MCP reads/writes                                                                                     |
| 3     | **Product/editor code work**                       | `docs/analysis/ARCHITECTURE.md`, `docs/MODULE_MAP.md`, `CONTRIBUTING.md`                                                                             |
| 4     | **Authoring work under `risu/`**                   | Read the nearest `risu/{common,bot,prompts,modules,plugins}/AGENTS.md` or `README.md`; use it as the active authoring router for the current subtree |

### Additional repo-local references (may not be available outside the repo)

| Document                                                                             | Contents                                                                                       |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| [`docs/analysis/ARCHITECTURE.md`](docs/analysis/ARCHITECTURE.md)                     | Runtime architecture, process boundaries, hotspots (canonical)                                 |
| [`docs/MCP_WORKFLOW.md`](docs/MCP_WORKFLOW.md)                                       | Runtime modes and common execution sequence                                                    |
| [`docs/MCP_TOOL_SURFACE.md`](docs/MCP_TOOL_SURFACE.md)                               | Profiles, facade coverage, tool families, and tool contracts                                   |
| [`docs/MCP_ERROR_CONTRACT.md`](docs/MCP_ERROR_CONTRACT.md)                           | Error / no-op / success response contracts                                                     |
| [`src/lib/mcp-agent-workflow-eval.test.ts`](src/lib/mcp-agent-workflow-eval.test.ts) | Real-artifact workflow eval matrix for `.charx`, `.risup`, `.risum`, and Plugin API v3 routing |
| `toki-mcp-server.js --standalone`                                                    | File-backed MCP runtime for Codex/CLI use without Electron                                     |
| [`docs/PROJECT_RULES.md`](docs/PROJECT_RULES.md)                                     | Versioning and CI rules                                                                        |
| [`docs/MODULE_MAP.md`](docs/MODULE_MAP.md)                                           | TypeScript source navigation map                                                               |
| [`docs/README.md`](docs/README.md)                                                   | Full knowledge-base index                                                                      |

---

## Mandatory rules

1. **At the start of every session**, read `read_skill("project-workflow")` first. If MCP is not connected, read `skills/project-workflow/SKILL.md` directly. Load `MCP_WORKFLOW.md` and `PROJECT_RULES.md` only when you need full detail.
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

## MCP quick rules

Tool-selection detail lives in `read_skill("using-mcp-tools")`; the canonical facade coverage matrix is the "First-wave facade replacement matrix" in `docs/MCP_TOOL_SURFACE.md`. This section is a summary, not the contract — do not rely on it alone for edge cases.

- **Facade-first.** The default MCP process registers 11 preferred Facade v1 tools (`list_tool_profiles`, `inspect_document`, `read_content`, `search_document`, `analyze_content`, `preview_edit` -> `apply_edit`, `validate_content`, `manage_items`, `manage_assets`, `manage_file`) plus bootstrap `list_skills` / `read_skill` (13 total). `load_guidance` remains a legacy compatibility facade outside the default profile. Use `analyze_content` for transformation/statistics/simulation and `validate_content` for pass/fail diagnostics. If the facade rejects a selector or operation, restart with the smallest covering profile and record the fallback reason in the final summary.
- **Surface patches.** Supported JSON Patch arrays follow RFC 6902 semantics: array `add` inserts at `0..length`, `-` appends, and `replace` / `remove` require an existing index.
- **Bounded reads.** `inspect_document`, `read_content`, `search_document`, `analyze_content`, and `validate_content` default to a byte-accurate 24KB UTF-8 cap. Root surface reads return overviews unless `include_raw` plus an explicit `max_bytes` are both justified.
- **Hidden/protected fields.** RisuToki hides and save-strips deprecated `.charx` compatibility fields (`personality`, `scenario`, `systemPrompt`, and others), `.risup` legacy prompt fields, and reserved `.risum` `cjs`. Treat `hiddenFieldWarnings` as a value-safe existence summary only; never route around the hidden policy to expose content. Full field list and rationale: `read_skill("using-mcp-tools")`.
- **Project folders.** When a `.charx` / `.risum` / `.risup` project folder is active, the folder is the save backend for the normal structured editor; raw `.md`/`.json`/`assets` files are an advanced fallback for external tools or precise filesystem edits. For reads/edits too large for MCP surfaces, use `manage_file` project-folder extract/reassemble and stay on structured surfaces when possible.
- **Unopened and reference files.** Prefer facade `inspect_document` / `read_content` / `search_document` targets first. Use `inspect_external_file` + `probe_*` for probe-specific summaries, `external_*` for direct absolute-path edits without switching the active UI document, and `session_status` / `list_references` only for full legacy inventories or runtime diagnostics. In standalone mode, `session_status` exposes `allowWrites` / `userDataPath`, and process diagnostics are appended to `%USERPROFILE%\.risutoki\mcp-standalone\mcp-server.log`.
