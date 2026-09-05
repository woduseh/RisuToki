# Contributing

## Setup

```bash
npm install
npm run dev:build
```

## Validation

Use the quick loop while editing, optionally focusing unit tests:

```bash
npm run validate
npm run validate -- --test src/lib/mcp-search.test.ts
npm run --silent validate -- --plan --json
```

Choose the checks appropriate to the changed behavior in `docs/PROJECT_RULES.md`. `npm run validate -- --profile mcp` runs MCP integration, measured replay, and contract checks with shared builds. `npm run validate:full` runs the complete validation sequence, including tooling tests, Electron and renderer builds. `npm test` runs the test profile and `npm run build` runs the full profile.

`npm test` includes the complete Vitest suite and deterministic agent-eval cases. `npm run test:evals` remains a focused static subset; `npm run test:evals:replay` and `npm run test:mcp:contracts` remain available independently. `--test` selection applies only to the quick profile; repeat it to select several unit-test files.

Validation prints compact progress and failure details. Full step logs and a JSON report are saved in `.build/validation/<runId>/`, with `.build/validation/latest.json` containing the latest run status. Failed prerequisites skip their dependent checks while independent checks continue. The workspace lock prevents overlapping validation runs from replacing shared build output. Default validation uses synthetic artifacts; use `npm run test:corpus` only when access to local ignored user artifacts is within scope.

Use `npm run test:mcp:contracts:update` only for an intentional public MCP contract change. Review the printed profile and HTTP-case summary, update the contract fixture, and record the change in `CHANGELOG.md`.

## Project map

- `main.ts`: Electron main process and IPC (compiles to `.build/electron/main.js`)
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

GitHub Actions runs `npm run validate:ci` on Ubuntu and the Windows build profile on Windows for pushes and pull requests. Reports and step logs are uploaded even when validation fails. The focused `test:evals` command remains a local fast-feedback subset because `npm test` covers those cases in CI.
