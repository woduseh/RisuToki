# Project Rules

Rules and workflows that apply across the entire project.

---

## 1. Documentation and versioning (mandatory)

Every feature improvement or bug fix **must** include the following updates.

1. **`package.json` version bump** — follow [Semantic Versioning](https://semver.org/)
   - `MAJOR` (x.0.0): breaking changes
   - `MINOR` (0.x.0): new features (backward-compatible)
   - `PATCH` (0.0.x): bug fixes (backward-compatible)
2. **`CHANGELOG.md` update** — use [Keep a Changelog](https://keepachangelog.com/) format
   - Add the new version entry at the **top** of the file
   - Use headings: `### Added` / `### Changed` / `### Fixed` / `### Removed`
3. **`README.md` update** — refresh the relevant section when a change is user-visible
4. **`AGENTS.md` and related skill docs update**
   - When MCP tools, fields, or workflows change, update `AGENTS.md`, `docs/`, `skills/README.md`, and the affected `skills/*` files together

These rules apply **automatically to every task**, even without an explicit reminder.

---

## 2. Validation and release workflow

- PR / push validation uses a **two-stage** process: Ubuntu validate + Windows build.
  - Ubuntu: `npm run lint`, `npm run typecheck`, `npm test`
  - Windows: `npm run build:electron`, `npm run build:renderer`
- When changing MCP contracts, taxonomy, or section-parsing behavior, run `npm run test:evals` (deterministic harness scenarios) before the full validation suite.
- PRs do **not** run packaging (`electron-builder`); packaging runs only in the tag-release workflow.
- Dependency updates are monitored weekly via `Dependabot` for npm and GitHub Actions.

---

## 3. Guide file locations

| Path                                                 | Description                                                                |
| ---------------------------------------------------- | -------------------------------------------------------------------------- |
| `docs/README.md`                                     | Knowledge-base index for code work                                         |
| `docs/MODULE_MAP.md`                                 | Module map for TypeScript source navigation                                |
| `docs/MCP_WORKFLOW.md`                               | MCP tool selection, read rules, workflow patterns                          |
| `docs/MCP_TOOL_SURFACE.md`                           | MCP tool families, boundaries, behavior hints, deterministic `next_actions` map |
| `docs/MCP_ERROR_CONTRACT.md`                         | MCP success / error / no-op response contracts and recovery playbook       |
| `skills/`                                            | Bundled project skill docs; local skill docs can also be added here        |
| `guides/`                                            | Korean-language original guides (accessible through the in-app guide viewer) |
| `.claude/skills`, `.gemini/skills`, `.github/skills` | Local CLI search paths that point to the root `skills/` directory          |

> `npm run sync:skills` prefers real symlinks on Windows and falls back to junctions when symlinks are not available. It silently skips if the root `skills/` directory does not exist.

---
