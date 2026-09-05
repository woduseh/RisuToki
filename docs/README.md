# RisuToki Knowledge Base

This `docs/` directory is the repo-local system of record for agent-readable architecture, MCP boundaries, and recovery contracts.

## Start here

| If you are...                                            | Read first                                                                    | Then read                                                |
| -------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------- |
| working on authoring materials under `risu/`             | nearest `risu/{common,bot,prompts,modules,plugins}/AGENTS.md` or `README.md`  | matching `risu/.../skills/` + `risu/.../docs/` surfaces  |
| editing `.charx` / `.risum` / `.risup` through MCP       | `read_skill("using-mcp-tools")` for task playbooks and validation rules       | `docs/MCP_TOOL_SURFACE.md`, `docs/MCP_ERROR_CONTRACT.md` |
| recovering from an MCP tool failure or no-op             | `docs/MCP_ERROR_CONTRACT.md`                                                  | `docs/MCP_TOOL_SURFACE.md`                               |
| checking declared and measured workflow eval coverage    | `src/lib/mcp-agent-workflow-eval.test.ts`, `test/run-workflow-eval-replay.ts` | `docs/MCP_TOOL_SURFACE.md`                               |
| changing application code                                | `CONTRIBUTING.md`                                                             | `docs/analysis/ARCHITECTURE.md`, `docs/MODULE_MAP.md`    |
| checking project rules (versioning, CI, guide locations) | `read_skill("project-workflow")`                                              | `docs/PROJECT_RULES.md`                                  |
| tracing a past feature or design decision                | `docs/analysis/ARCHITECTURE.md`                                               | `CHANGELOG.md`                                           |

## Core documents

- **`docs/MCP_WORKFLOW.md`** — runtime modes and startup profile behavior
- **`docs/MCP_TOOL_SURFACE.md`** — profile, facade coverage, MCP family, tool-boundary, and metadata contracts
- **`docs/MCP_ERROR_CONTRACT.md`** — success / error / no-op response contracts and the recovery playbook
- **`src/lib/mcp-agent-workflow-eval.test.ts`** — declarative workflow matrix, coverage invariants, optional local-corpus checks, and documentation guards
- **`test/run-workflow-eval-replay.ts`** — deterministic synthetic MCP stdio replay covering all 35 replayable tasks across 12 scenarios, with measured route, recovery, validation, bounded-read, and final-artifact gates
- **`docs/PROJECT_RULES.md`** — versioning, CI/release workflow, and guide locations
- **`docs/MODULE_MAP.md`** — source navigation map for the active TypeScript codebase
- **`docs/analysis/ARCHITECTURE.md`** — **canonical** TypeScript runtime architecture, process boundaries, ownership rules, and large-module hotspots
- **`docs/analysis/DATA_INTEGRITY_AUDIT.md`** — synthetic round-trip/concurrency regressions, permitted normalization, conflict handling, and save recovery

## Boundary notes

- Root `AGENTS.md` is a compact **product-first** routing TOC. The nearest `risu/{scope}/AGENTS.md` handles authoring routing under `risu/`.
- Guidance ownership is explicit: `AGENTS.md` owns startup/routing, `using-mcp-tools` owns tool choice/playbooks, `MCP_TOOL_SURFACE.md` owns profiles/coverage/contracts, and `MCP_WORKFLOW.md` owns runtime modes/startup.
- Root `skills/` now holds product/editor skills only. Shared and artifact-specific authoring skills live under `risu/common/skills/` and `risu/{bot,prompts,modules,plugins}/skills/`.
- Built-in authoring docs live under `risu/common/docs/` and `risu/{bot,prompts,modules,plugins}/docs/`.
- Success envelopes expose `artifacts.byte_size`; use it as a context-budget cue before asking for adjacent content.
- `npm run test:evals` runs the deterministic static harness scenarios and declarative workflow matrix.
- `npm run test:evals:replay` builds the MCP server and runs the measured 35-task canonical workflow replay against synthetic artifacts.
- `test/behavior-evals/` holds the live skill-routing cases and recorded runs; it measures which skill a real model engages and is run manually, not by `npm test`. See its README for the runner, cost, and quota policy.
- `npm run test:mcp:contracts` verifies tools/list and HTTP fingerprints; use `npm run test:mcp:contracts:update` only for an intentional contract change and review its change summary.
- `guides/` is the default writable guide location for imported/user-created guide files and may be empty in the repo.
- When both `.ts` and `.js` siblings exist under `src/lib/`, prefer the `.ts` source. The `.js` file is generated output.
- When a `.test.ts` sits next to a module, treat it as the nearest executable behavior spec.
