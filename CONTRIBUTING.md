# Contributing

## Setup

```bash
npm ci
npm run doctor -- --desktop
npm run dev:isolated
```

Use Node matching `package.json#engines` (`.node-version` records the recommended baseline). Install each checkout's own dependencies with the lockfile; do not share `node_modules`, `.build` or `dist` between worktrees. A first installation needs registry/Electron/native-package downloads or a complete local cache. No `.env`, external model credentials, GPU or paid service is required for the synthetic checks.

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

Every profile first runs `doctor`: Node/lockfile/direct dependencies, an actual piped child process, localhost HTTP and temporary write/cleanup. A failed preflight blocks the remaining profile, records them as skipped and exits nonzero. `npm run --silent doctor -- --json` emits a machine-readable report; `.build/doctor/report.json` retains the last diagnostic. It reports environment variable names, not values. A preflight pass is not a test/build/UI pass. When process permissions block a profile, `npm run lint` and `npm run typecheck` can still provide explicitly partial feedback.

## Local application check

```bash
npm run test:desktop
npm run dev:isolated
```

`test:desktop` builds Electron, preload, MCP and renderer once, then launches the real Electron application. Its optional smoke checks create a synthetic card through the menu, type a description, save/reopen it, reject a corrupt file without changing the saved bytes, and check local API authentication. It also performs a real sharp PNG/WebP round trip and a PTY shell input/output/resize/exit check inside Electron. Native file pickers return fixture paths; the renderer, preload, IPC, archive parser and save code are real. It is separate from `validate:full` and CI because it requires a working desktop/Chromium environment.

`dev:isolated` builds Electron before starting Vite on an OS-selected localhost port and connects Electron to that exact instance. Vite 7 treats `port: 0` as its default port, so the launcher selects a free candidate first and uses `strictPort`; a competing bind fails startup instead of connecting to another server. Readiness requires a reply from the renderer controller over IPC. The launcher holds the validation lock for its lifetime (up to one hour). Close the app for normal cleanup; Ctrl+C interrupts through the validator and may leave data for inspection. Each session uses its own home, app profile, working directory and temp directory, so generated MCP configuration and recovery state do not touch the normal user profile. Files explicitly opened/saved by a developer are still real files. Main/preload changes require restarting; renderer changes use Vite. Use separate worktrees for parallel runs. The original `dev`, `dev:electron` and `start` commands retain their regular-profile behavior.

After building Electron, `node build/desktop.js --dev-smoke` runs the same smoke against its own Vite instance and closes both processes on completion. It uses the existing Electron output and the current renderer source. Windows disposable sessions set `RISUTOKI_USE_BUNDLED_CONPTY=1` only in the child environment to select node-pty's bundled ConPTY backend. That upstream option is marked experimental; it passed the local native/shutdown checks, while packaged application validation remains separate. Normal launches keep the existing backend unless that environment variable is explicitly set.

Inspect `.build/validation/latest.json` first. Application reports, process logs and screenshots are in `.build/desktop/<run>/`; confirmed process cleanup removes `<run>/data` while retaining evidence. Unconfirmed cleanup preserves data and returns reserved exit code 70, which keeps the validation lock and blocks subsequent commands. An abnormal OS kill can leave a running report or data behind: inspect the recorded PIDs and descendants before removing that run's directory or lock. Cleanup targets the spawned process tree, not unrelated Electron instances.

After a successful desktop build, `node build/desktop.js --inject-renderer-error` is an intentional negative check: it must exit nonzero and retain the renderer failure, screenshot and cleanup result. Direct `build/desktop.js` invocations use existing build output; only the enclosing `test:desktop` profile proves a rebuild. A zero child exit without a complete application report also fails.

Local Windows verification uses the installed Node 24.14, npm 11.14 and Electron 40.10.6. Approved host execution supports child pipes, full validation, and the production/development desktop checks; no additional compiler toolchain was needed for the installed native binaries. The managed sandbox still denies ordinary child-process pipes (`spawn EPERM`), so run these commands in a normal Windows terminal or through approved local command execution. This does not change the sandbox/approval policy or disable Chromium sandboxing. New checkouts still need `npm ci` and registry/native-package downloads or a complete cache; a clean offline installation has not been established by these checks.

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
