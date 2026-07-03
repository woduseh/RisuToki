# PLAN-2 / PLAN-3 execution progress

Updated: 2026-07-03 22:35 Asia/Seoul

## Goal

- Add deterministic MCP workflow replay evaluation, then split the two MCP monolith entrypoints without changing public behavior.

## Scope

- In scope: PLAN-2 canonical replay and measured metrics; PLAN-3 module extraction; versions 1.12.0 and 1.12.1; docs and CI synchronization.
- Out of scope: MCP contract changes, new product features, pushes, pull requests, tags, publishing, and packaging.

## Current state

- Done: PLAN-2 release, every PLAN-3 module extraction slice, 1.12.1 metadata, and the final validation matrix.
- Partial: none.
- Not started: none.
- Blocked: none.

## Decisions

- PLAN-2 precedes PLAN-3 so replay becomes a refactor safety net.
- PLAN-2 ships canonical five scenarios and classifies all 39 declared tasks.
- PLAN-3 keeps both entrypoints and every new production module below 5,000 lines.
- New production modules stay flat under `src/lib` so current MODULE_MAP drift checks cover them.
- `SKILLS_IMPROVEMENT_PLAN.md` is user-owned untracked work and must not be staged.

## Files and areas

- Read: project workflow rules, both plans, eval matrix, MCP client harness, CI, TypeScript build config, monolith route boundaries.
- Changed: PLAN-2/PLAN-3 modules, 1.12.1 package metadata/changelog, ESM-compatible imports for extracted facade modules, and taxonomy guards that scan split registration modules.
- Likely next: none; the 1.12.1 closeout is ready to commit.

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
- Facade content engine: lint, Node TypeScript no-emit/build, contract baseline, canonical replay, full MCP tests, and doc drift pass; `toki-mcp-server.ts` is 8,293 lines and the new content module is 1,700 lines.
- Facade edit engine: lint, Node TypeScript no-emit/build, contract baseline, canonical replay, full MCP tests, and doc drift pass; `toki-mcp-server.ts` is 5,379 lines and the new edit module is 3,000 lines.
- Facade registration: lint, Node TypeScript no-emit/build, contract baseline, static agent evals, canonical replay, full MCP tests, and doc drift pass; `toki-mcp-server.ts` is 4,023 lines and `mcp-tool-register-facade.ts` is 1,438 lines.
- API helpers: lint, Node TypeScript no-emit/build, contract baseline, canonical replay, full MCP tests, and doc drift pass; `mcp-api-server.ts` is 13,282 lines and `mcp-api-helpers.ts` is 2,077 lines. The full API test file passed 319 of 320 tests; its sole failure is the known concurrent user-owned skill-catalog expectation mismatch.
- Lorebook routes: lint, Node TypeScript no-emit/build, 84 focused API tests, contract baseline, canonical replay, full MCP tests, and doc drift pass; `mcp-api-server.ts` is 11,193 lines and `mcp-lorebook-routes.ts` is 2,139 lines.
- RISUP prompt routes: lint, Node TypeScript no-emit/build, 98 focused API tests, contract baseline, canonical replay, full MCP tests, and doc drift pass; `mcp-api-server.ts` is 8,442 lines and `mcp-risup-prompt-routes.ts` is 2,803 lines.
- Structured-item routes: lint, Node TypeScript no-emit, 38 focused API tests, contract baseline, canonical replay, full MCP tests, and 18 doc-drift tests pass; `mcp-api-server.ts` is 6,477 lines and `mcp-structured-item-routes.ts` is 2,010 lines.
- Section routes: lint, Node TypeScript no-emit/build, 51 focused API tests, contract baseline, canonical replay, full MCP tests, and 18 doc-drift tests pass; `mcp-api-server.ts` is 5,424 lines and `mcp-section-routes.ts` is 1,123 lines.
- Reference routes: lint, Node TypeScript no-emit/build, 26 focused API tests excluding the known user-owned skill-catalog mismatch, contract baseline, canonical replay, full MCP tests, and 18 doc-drift tests pass; `mcp-api-server.ts` is 3,779 lines and `mcp-reference-routes.ts` is 1,708 lines.
- External routes: lint, Node TypeScript no-emit/build, 30 focused API tests, contract baseline, canonical replay, full MCP tests, and 18 doc-drift tests pass; `mcp-api-server.ts` is 2,578 lines and `mcp-external-routes.ts` is 1,341 lines.
- Field routes: lint, Node TypeScript no-emit/build, 129 focused API tests, contract baseline, canonical replay, full MCP tests, and 18 doc-drift tests pass; `mcp-api-server.ts` is 1,048 lines and `mcp-field-routes.ts` is 1,628 lines.
- Release closeout: version metadata is 1.12.1; final lint, full typecheck, MCP contract baseline, full MCP smoke/real-corpus checks, 18 doc-drift tests, 43 static agent evals, Electron build, and renderer build pass. The canonical replay passes all five scenarios in 11.7 seconds with route accuracy, first-pass success, validation coverage, and bounded-read coverage at 1.0 and zero wrong-target incidents.
- Full test result: rpack, charx, reference-store, popout, terminal, and main-state tests pass; Vitest reports 2,014 passed, 2 skipped, and one known skill-catalog expectation mismatch caused by concurrent user-owned Skill metadata changes. The MCP suite that `npm test` could not reach after that external failure was run separately and passed.
- Final entrypoint sizes: `toki-mcp-server.ts` is 4,023 lines and `mcp-api-server.ts` is 1,042 lines; every extracted production module remains below 5,000 lines.
- Known external failure: the API skill discovery expectation still reflects the pre-existing Skill metadata while the user-owned generated Skill files are concurrently modified.

## Next steps

1. Commit the 1.12.1 closeout without staging user-owned Skill, authoring, or later-plan changes.
