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
npm run build
```

## Project map

- `main.js`: Electron main process and IPC
- `src/app/controller.js`: main renderer integration layer
- `src/popout/controller.js`: popout integration layer
- `src/lib/*`: reusable renderer logic

If a change touches the renderer and feels reusable, prefer adding or extending a shared module in `src/lib/` rather than expanding a controller further.

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
