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
npm run test:evals
npm test
npm run build
```

Use `npm run test:evals` when changing MCP contracts, taxonomy, or section-parsing behavior and you want the targeted deterministic harness scenarios without running the full suite.

## Project map

- `main.ts`: Electron main process and IPC (compiles to `main.js`)
- `src/app/controller.ts`: main renderer integration layer
- `src/popout/controller.ts`: popout integration layer
- `src/lib/*`: reusable renderer logic

If a change touches the renderer and feels reusable, prefer adding or extending a shared module in `src/lib/` rather than expanding a controller further.

## Knowledge base

- `docs/README.md`: repo-local knowledge-base index
- `docs/MCP_WORKFLOW.md`: MCP tool routing, read rules, workflow patterns, operational caveats
- `docs/MCP_TOOL_SURFACE.md`: MCP tool families, boundaries, and deterministic follow-up actions
- `docs/MCP_ERROR_CONTRACT.md`: success / error / no-op envelopes and recovery rules
- `docs/PROJECT_RULES.md`: versioning, CI/release workflow, guide locations
- `docs/MODULE_MAP.md`: source navigation map for the active TypeScript codebase
- `docs/analysis/ARCHITECTURE.md`: runtime structure and data flow
- `AGENTS.md` plus local `risu/*/AGENTS.md`: product-first root routing and subtree-specific authoring behavior
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

- Main renderer uses the buffered session for mid-stream recovery.
- Popout terminal uses the direct session for isolated terminal output.

TUI cleanup and numbered choice parsing live in `src/lib/terminal-chat.ts`.

## Working with preview

Preview behavior is split across:

- `src/lib/preview-session.ts`
- `src/lib/preview-format.ts`
- `src/lib/preview-debug.ts`

Prefer extending those modules over duplicating preview logic in controllers.

## CI

GitHub Actions runs the same validation sequence on pushes and pull requests. Keep local validation aligned with CI to avoid drift.
