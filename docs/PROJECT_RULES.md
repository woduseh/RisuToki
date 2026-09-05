# Project Rules

## Versioning and delivery

Tracked product or tooling changes include a semver update in `package.json` and `package-lock.json`, plus a new top `CHANGELOG.md` entry. Use MAJOR for breaking changes, MINOR for additions, and PATCH for compatible fixes. Refresh affected user-facing documentation and skill/tool discovery references.

Pure artifact authoring, documentation-only corrections that do not change behavior or contracts, and local guide organization do not require a version bump.

## Validation and releases

Choose local checks by the changed behavior:

`npm run validate` runs lint, typechecks, unit tests, and tooling tests. Use `npm run validate -- --test src/lib/mcp-search.test.ts` for a focused unit-test loop (repeat `--test` for multiple files). `--plan` lists the selected checks without running them; `--plan --json` provides the same plan for tools. For JSON-only stdout, use `npm run --silent validate -- --plan --json`. Test selection is available in the quick profile only. Each command has a five-minute timeout; `--timeout-ms` can override it (up to one hour).

| Validation profile | Command                                 | Coverage                                                       |
| ------------------ | --------------------------------------- | -------------------------------------------------------------- |
| Quick              | `npm run validate`                      | Lint, typechecks, unit and tooling tests                       |
| MCP                | `npm run validate -- --profile mcp`     | Shared build, MCP integration, workflow replay, contracts      |
| CI                 | `npm run validate:ci`                   | All tests, lint, typechecks, replay, contracts, renderer build |
| Full               | `npm run validate:full`                 | CI checks plus Electron build                                  |
| Windows build      | `npm run validate -- --profile windows` | Tooling tests, Electron and renderer builds                    |

`npm test` uses the test profile; `npm run build` uses the full profile. Each profile builds shared prerequisites once. The runner continues independent checks after a failure and skips checks whose prerequisites failed. Exit status determines success. Step logs and `report.json` are stored in `.build/validation/<runId>/`; `.build/validation/latest.json` identifies the latest report. Only one validation run may use a workspace at a time; the runner reports an existing lock instead of deleting it automatically.

| Change                                | Relevant checks                                                                                |
| ------------------------------------- | ---------------------------------------------------------------------------------------------- |
| TypeScript or Vue                     | Focused tests, `npm run lint`, `npm run typecheck`                                             |
| Skill sources or routing              | `npm run sync:skills`, skill discovery/reference and documentation tests, `npm run test:evals` |
| MCP behavior or public tool contracts | Relevant tests, `npm run test:evals:replay`, `npm run test:mcp:contracts`                      |
| Renderer or Electron integration      | Relevant renderer/Electron build                                                               |

Static skill checks verify discovery and delivery, not model quality. Live model comparisons are optional experiments described in `test/behavior-evals/README.md`, not a requirement for every wording edit.

Default tests and replay use synthetic artifacts; local ignored user artifacts are excluded. `npm run test:corpus` explicitly enables read-only local corpus evaluation (`RISUTOKI_TEST_LOCAL_CORPUS=1`); run it only when that data access is within the task scope. Deterministic replay must pass every scenario; aggregate coverage metrics do not excuse a failed regression.

PR/push CI uses the CI profile on Ubuntu, followed by the Windows build profile. Both jobs retain validation reports and step logs, including failed runs. These are CI coverage, not an instruction to repeat successful local checks.

Use `npm run test:mcp:contracts:update` only for an intentional public contract change; review its profile/case summary and describe the change in the changelog.

Packaging and publishing run only for an explicitly authorized tag release. The tag workflow checks that `latest.yml` refers to existing installer files without whitespace; NSIS artifacts use `${productName}-Setup-${version}.${ext}` to avoid GitHub asset-name rewriting.

## Source locations

- `docs/README.md`: architecture, MCP, and recovery references.
- `skills/` and `risu/*/skills/`: tracked skill sources.
- `risu/*/docs/`: bundled authoring references.
- `guides/`: imported or user-created guides.
- Local artifact work products under `risu/` remain ignored.

`npm run sync:skills` rebuilds the generated `.skill-catalog/` from tracked skill roots and refreshes `.agents/skills` and `.claude/skills`. Windows uses symlinks when available and junctions otherwise; managed directory copies can also be refreshed. Edit canonical sources rather than generated discovery paths.
