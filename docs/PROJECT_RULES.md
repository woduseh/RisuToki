# Project Rules

## Versioning and delivery

Tracked product or tooling changes include a semver update in `package.json` and `package-lock.json`, plus a new top `CHANGELOG.md` entry. Use MAJOR for breaking changes, MINOR for additions, and PATCH for compatible fixes. Refresh affected user-facing documentation and skill/tool discovery references.

Pure artifact authoring, documentation-only corrections that do not change behavior or contracts, and local guide organization do not require a version bump.

## Validation and releases

Choose local checks by the changed behavior:

| Change                                | Relevant checks                                                                                |
| ------------------------------------- | ---------------------------------------------------------------------------------------------- |
| TypeScript or Vue                     | Focused tests, `npm run lint`, `npm run typecheck`                                             |
| Skill sources or routing              | `npm run sync:skills`, skill discovery/reference and documentation tests, `npm run test:evals` |
| MCP behavior or public tool contracts | Relevant tests, `npm run test:evals:replay`, `npm run test:mcp:contracts`                      |
| Renderer or Electron integration      | Relevant renderer/Electron build                                                               |

Static skill checks verify discovery and delivery, not model quality. Live model comparisons are optional experiments described in `test/behavior-evals/README.md`, not a requirement for every wording edit.

PR/push CI runs Ubuntu lint, typecheck, tests, workflow replay, MCP contracts, and renderer build, followed by Windows Electron and renderer builds. These are CI coverage, not an instruction to repeat successful local checks.

Use `npm run test:mcp:contracts:update` only for an intentional public contract change; review its profile/case summary and describe the change in the changelog.

Packaging and publishing run only for an explicitly authorized tag release. The tag workflow checks that `latest.yml` refers to existing installer files without whitespace; NSIS artifacts use `${productName}-Setup-${version}.${ext}` to avoid GitHub asset-name rewriting.

## Source locations

- `docs/README.md`: architecture, MCP, and recovery references.
- `skills/` and `risu/*/skills/`: tracked skill sources.
- `risu/*/docs/`: bundled authoring references.
- `guides/`: imported or user-created guides.
- Local artifact work products under `risu/` remain ignored.

`npm run sync:skills` rebuilds the generated `.skill-catalog/` from tracked skill roots and refreshes `.agents/skills` and `.claude/skills`. Windows uses symlinks when available and junctions otherwise; managed directory copies can also be refreshed. Edit canonical sources rather than generated discovery paths.
