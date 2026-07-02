# PLAN-2 / PLAN-3 execution progress

Updated: 2026-07-03 05:55 Asia/Seoul

## Goal

- Add deterministic MCP workflow replay evaluation, then split the two MCP monolith entrypoints without changing public behavior.

## Scope

- In scope: PLAN-2 canonical replay and measured metrics; PLAN-3 module extraction; versions 1.12.0 and 1.12.1; docs and CI synchronization.
- Out of scope: MCP contract changes, new product features, pushes, pull requests, tags, publishing, and packaging.

## Current state

- Done: PLAN-2 release, PLAN-3 contract baseline, tool-description catalog, facade runtime, HTTP proxy, standalone bootstrap, facade script/style, asset, file, and item slices.
- Partial: remaining `toki-mcp-server.ts` facade engine split.
- Not started: facade registration and `mcp-api-server.ts` route slices.
- Blocked: none.

## Decisions

- PLAN-2 precedes PLAN-3 so replay becomes a refactor safety net.
- PLAN-2 ships canonical five scenarios and classifies all 39 declared tasks.
- PLAN-3 keeps both entrypoints and every new production module below 5,000 lines.
- New production modules stay flat under `src/lib` so current MODULE_MAP drift checks cover them.
- `SKILLS_IMPROVEMENT_PLAN.md` is user-owned untracked work and must not be staged.

## Files and areas

- Read: project workflow rules, both plans, eval matrix, MCP client harness, CI, TypeScript build config, monolith route boundaries.
- Changed: PLAN-2 release files, PLAN-3 baseline, committed runtime/proxy/bootstrap/script-style/asset/file modules, plus validated `mcp-facade-items.ts` wiring.
- Likely next: commit the item engine, then extract content/validation/edit engines.

## Validation

- Run: lint, typecheck, static agent eval, MCP test, and packaged replay pass; replay completed in 11.8 seconds with all measured ratios at 1.0 and zero wrong-target incidents.
- Regression proof: redirecting active lorebook reads to a nonexistent route reduced route accuracy and first-pass success to 0.6 and failed the measured gate; restoring the route returned all metrics to 1.0 with no source diff.
- Contract baseline: four `tools/list` profiles and 18 normalized HTTP list/read/write/error responses pass byte-count, SHA-256, and top-level key-order checks.
- Tool descriptions: lint, Node TypeScript no-emit, 18 doc-drift tests, and the full contract baseline pass; `toki-mcp-server.ts` is 16,890 lines and the new catalog is 368 lines.
- Facade runtime: the same checks plus canonical replay pass with all measured ratios at 1.0; `toki-mcp-server.ts` is 16,723 lines and the new runtime module is 204 lines.
- HTTP proxy: injected port/token accessors and diagnostic hooks preserve the same contracts and replay metrics; `toki-mcp-server.ts` is 16,609 lines and the new proxy module is 137 lines.
- Standalone bootstrap: lint, Node TypeScript no-emit, contract baseline, canonical replay, and doc drift pass; `toki-mcp-server.ts` is 16,520 lines and the new bootstrap module is 98 lines.
- Facade script/style engine: lint, Node TypeScript no-emit, contract baseline, canonical replay, full MCP tests, and doc drift pass; `toki-mcp-server.ts` is 14,267 lines, the new script/style module is 2,267 lines, and the shared runtime module is 350 lines.
- Facade asset engine: lint, Node TypeScript build, contract baseline, canonical replay, full MCP tests, and doc drift pass; `toki-mcp-server.ts` is 12,805 lines and the new asset module is 1,511 lines.
- Facade file engine: lint, Node TypeScript no-emit/build, contract baseline, canonical replay, full MCP tests, and doc drift pass; `toki-mcp-server.ts` is 12,031 lines and the new file module is 858 lines.
- Facade item engine: lint, Node TypeScript no-emit/build, contract baseline, canonical replay, full MCP tests, and doc drift pass; `toki-mcp-server.ts` is 9,843 lines, the new item module is 2,270 lines, and the script/style module is 2,269 lines.
- Known external failure: the full unit suite has two failures in skill catalog expectations caused by concurrent user-owned skill metadata changes; 105 files and 2,013 tests passed.

## Next steps

1. Commit the facade item engine slice.
2. Extract the remaining facade engine families while preserving contract fingerprints after every slice.
