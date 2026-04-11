# RisuToki Knowledge Base

This `docs/` directory is the repo-local system of record for agent-readable architecture, MCP boundaries, and recovery contracts.

## Start here

| If you are...                                            | Read first                                                                   | Then read                                                |
| -------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------- |
| starting a new session or onboarding                     | `read_skill("project-workflow")`                                             | `read_skill("using-mcp-tools")`                          |
| working on authoring materials under `risu/`             | nearest `risu/{common,bot,prompts,modules,plugins}/AGENTS.md` or `README.md` | matching `risu/.../skills/` + `risu/.../docs/` surfaces  |
| editing `.charx` / `.risum` / `.risup` through MCP       | `read_skill("using-mcp-tools")`                                              | `docs/MCP_TOOL_SURFACE.md`, `docs/MCP_ERROR_CONTRACT.md` |
| recovering from an MCP tool failure or no-op             | `docs/MCP_ERROR_CONTRACT.md`                                                 | `docs/MCP_TOOL_SURFACE.md`                               |
| changing application code                                | `CONTRIBUTING.md`                                                            | `docs/analysis/ARCHITECTURE.md`, `docs/MODULE_MAP.md`    |
| checking project rules (versioning, CI, guide locations) | `read_skill("project-workflow")`                                             | `docs/PROJECT_RULES.md`                                  |
| tracing a past feature or design decision                | `docs/analysis/ARCHITECTURE.md`                                              | `CHANGELOG.md`                                           |

## Core documents

- **`docs/MCP_WORKFLOW.md`** — MCP tool routing map, read rules, effective workflow patterns, operational caveats
- **`docs/MCP_TOOL_SURFACE.md`** — MCP family map, tool boundaries, behavior hints, and deterministic `next_actions`
- **`docs/MCP_ERROR_CONTRACT.md`** — success / error / no-op response contracts and the recovery playbook
- **`docs/PROJECT_RULES.md`** — versioning, CI/release workflow, and guide locations
- **`docs/MODULE_MAP.md`** — source navigation map for the active TypeScript codebase
- **`docs/analysis/ARCHITECTURE.md`** — **canonical** TypeScript runtime architecture, process boundaries, ownership rules, and large-module hotspots

## Boundary notes

- Root `AGENTS.md` is a compact **product-first** routing TOC. The nearest `risu/{scope}/AGENTS.md` handles authoring routing under `risu/`.
- Root `skills/` now holds product/editor skills only. Shared and artifact-specific authoring skills live under `risu/common/skills/` and `risu/{bot,prompts,modules,plugins}/skills/`.
- Built-in authoring docs live under `risu/common/docs/` and `risu/{bot,prompts,modules,plugins}/docs/`.
- Success envelopes expose `artifacts.byte_size`; use it as a context-budget cue before asking for adjacent content.
- `npm run test:evals` runs the deterministic harness scenarios that pin recovery metadata, taxonomy invariants, Lua section workflows, and context-budget sizing.
- `guides/` is the default writable guide location for imported/user-created guide files and may be empty in the repo.
- When both `.ts` and `.js` siblings exist under `src/lib/`, prefer the `.ts` source. The `.js` file is generated output.
- When a `.test.ts` sits next to a module, treat it as the nearest executable behavior spec.
