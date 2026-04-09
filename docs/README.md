# RisuToki Knowledge Base

This `docs/` directory is the repo-local system of record for agent-readable architecture, MCP boundaries, and recovery contracts.

## Start here

| If you are... | Read first | Then read |
| --- | --- | --- |
| editing `.charx` / `.risum` / `.risup` through MCP | `AGENTS.md` (TOC) | `docs/MCP_WORKFLOW.md`, `docs/MCP_TOOL_SURFACE.md` |
| learning MCP tool selection, read rules, workflow | `docs/MCP_WORKFLOW.md` | `docs/MCP_TOOL_SURFACE.md`, `docs/MCP_ERROR_CONTRACT.md` |
| recovering from an MCP tool failure or no-op | `docs/MCP_ERROR_CONTRACT.md` | `docs/MCP_TOOL_SURFACE.md` |
| changing application code | `CONTRIBUTING.md` | `docs/MODULE_MAP.md`, `docs/analysis/ARCHITECTURE.md` |
| checking project rules (versioning, CI, persona) | `docs/PROJECT_RULES.md` | `CONTRIBUTING.md` |
| tracing a past feature or design decision | `docs/superpowers/` | `docs/analysis/ARCHITECTURE.md` |

## Core documents

- **`docs/MCP_WORKFLOW.md`** — MCP tool routing map, read rules, effective workflow patterns, operational caveats
- **`docs/MCP_TOOL_SURFACE.md`** — MCP family map, tool boundaries, behavior hints, and deterministic `next_actions`
- **`docs/MCP_ERROR_CONTRACT.md`** — success / error / no-op response contracts and the recovery playbook
- **`docs/PROJECT_RULES.md`** — versioning, CI/release workflow, guide locations, Copilot persona workflow
- **`docs/MODULE_MAP.md`** — source navigation map for the active TypeScript codebase
- `docs/analysis/ARCHITECTURE.md` — runtime structure and major data flows
- `docs/superpowers/` — historical plans and specs; useful context, but not the primary live contract

## Boundary notes

- Root `AGENTS.md` is a compact routing TOC. Deep MCP workflow details live in `docs/MCP_WORKFLOW.md`.
- `skills/` contains on-demand LLM guides; load them selectively instead of dumping everything at once.
- Success envelopes expose `artifacts.byte_size`; use it as a context-budget cue before asking for adjacent content.
- `npm run test:evals` runs the deterministic harness scenarios that pin recovery metadata, taxonomy invariants, Lua section workflows, and context-budget sizing.
- `guides/` contains the original Korean human-facing guide material.
- When both `.ts` and `.js` siblings exist under `src/lib/`, prefer the `.ts` source. The `.js` file is generated output.
- When a `.test.ts` sits next to a module, treat it as the nearest executable behavior spec.
