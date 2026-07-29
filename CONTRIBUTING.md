# Contributing

## Setup

```bash
npm install
npm run dev
```

## Validation

Run the full validation sequence before opening a PR:

```bash
npm run lint
npm run typecheck
npm test
npm run test:evals:replay
npm run test:mcp:contracts
npm run build:electron
npm run build:renderer
```

`npm test` already runs the complete Vitest suite, including the deterministic agent-eval cases. Use `npm run test:evals` for faster focused feedback while changing MCP contracts, taxonomy, section parsing, or workflow routing. Those changes must also pass the measured replay and contract baseline before the full validation sequence.

Use `npm run test:mcp:contracts:update` only for an intentional public MCP contract change. Review the printed profile and HTTP-case summary, update the contract fixture, and record the change in `CHANGELOG.md`.

## Project map

- `main.ts`: Electron main process and IPC (compiles to `main.js`)
- `src/app/controller.ts`: main renderer integration layer
- `src/lib/*`: reusable renderer logic

If a change touches the renderer and feels reusable, prefer adding or extending a shared module in `src/lib/` rather than expanding a controller further.

## Knowledge base

- `docs/README.md`: repo-local knowledge-base index
- `docs/MCP_WORKFLOW.md`: MCP runtime modes, startup profiles, and common execution sequence
- `docs/MCP_TOOL_SURFACE.md`: MCP tool families, boundaries, and deterministic follow-up actions
- `docs/MCP_ERROR_CONTRACT.md`: success / error / no-op envelopes and recovery rules
- `docs/PROJECT_RULES.md`: versioning, CI/release workflow, guide locations
- `docs/MODULE_MAP.md`: source navigation map for the active TypeScript codebase
- `docs/analysis/ARCHITECTURE.md`: runtime structure and data flow
- `AGENTS.md` plus local `risu/*/AGENTS.md`: product-first root routing and subtree-specific authoring behavior
- `skills/using-mcp-tools`: MCP artifact tool selection and task-intent playbooks
- `npm run test:evals`: targeted deterministic agent/harness scenarios for recovery, context-budgeting, taxonomy, and section workflows

When both `.ts` and `.js` siblings exist under `src/lib/`, edit the `.ts` source. Treat nearby `.test.ts` files as the nearest behavior spec.

## Working with settings

Do not read or write `localStorage` keys ad hoc from new code.

Use `src/lib/app-settings.ts` for:

- dark mode
- RP mode
- BGM settings
- autosave settings
- layout persistence
- avatar image persistence

## Working with terminal chat

Terminal-chat state is shared through `src/lib/chat-session.ts`.

- `src/app/terminal-sessions-controller.ts` owns renderer terminal-session selection and lifecycle.
- `src/lib/terminal-manager.ts` owns the privileged PTY lifecycle in the main process.

TUI cleanup and numbered choice parsing live in `src/lib/terminal-chat.ts`.

## Working with preview

Preview behavior is split across:

- `src/lib/preview-session.ts`
- `src/lib/preview-format.ts`
- `src/lib/preview-debug.ts`

Prefer extending those modules over duplicating preview logic in controllers.

## CI

GitHub Actions runs the same full validation sequence on pushes and pull requests. The focused `test:evals` command remains a local fast-feedback subset because `npm test` covers those cases in CI.
