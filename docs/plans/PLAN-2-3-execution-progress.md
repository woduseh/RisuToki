# PLAN-2 / PLAN-3 execution progress

Updated: 2026-07-02 22:02 Asia/Seoul

## Goal

- Add deterministic MCP workflow replay evaluation, then split the two MCP monolith entrypoints without changing public behavior.

## Scope

- In scope: PLAN-2 canonical replay and measured metrics; PLAN-3 module extraction; versions 1.12.0 and 1.12.1; docs and CI synchronization.
- Out of scope: MCP contract changes, new product features, pushes, pull requests, tags, publishing, and packaging.

## Current state

- Done: PLAN-2 release, PLAN-3 contract baseline, tool-description catalog, facade runtime, and HTTP proxy slices.
- Partial: `toki-mcp-server.ts` production module split.
- Not started: facade runtime/proxy/bootstrap/engine/registration slices and `mcp-api-server.ts` route slices.
- Blocked: none.

## Decisions

- PLAN-2 precedes PLAN-3 so replay becomes a refactor safety net.
- PLAN-2 ships canonical five scenarios and classifies all 39 declared tasks.
- PLAN-3 keeps both entrypoints and every new production module below 5,000 lines.
- New production modules stay flat under `src/lib` so current MODULE_MAP drift checks cover them.
- `SKILLS_IMPROVEMENT_PLAN.md` is user-owned untracked work and must not be staged.

## Files and areas

- Read: project workflow rules, both plans, eval matrix, MCP client harness, CI, TypeScript build config, monolith route boundaries.
- Changed: PLAN-2 release files, PLAN-3 baseline, `mcp-tool-descriptions.ts`, `mcp-facade-runtime.ts`, and `mcp-proxy-client.ts`.
- Likely next: commit the proxy client, then extract standalone argument parsing and headless bootstrap.

## Validation

- Run: lint, typecheck, static agent eval, MCP test, and packaged replay pass; replay completed in 11.8 seconds with all measured ratios at 1.0 and zero wrong-target incidents.
- Regression proof: redirecting active lorebook reads to a nonexistent route reduced route accuracy and first-pass success to 0.6 and failed the measured gate; restoring the route returned all metrics to 1.0 with no source diff.
- Contract baseline: four `tools/list` profiles and 18 normalized HTTP list/read/write/error responses pass byte-count, SHA-256, and top-level key-order checks.
- Tool descriptions: lint, Node TypeScript no-emit, 18 doc-drift tests, and the full contract baseline pass; `toki-mcp-server.ts` is 16,890 lines and the new catalog is 368 lines.
- Facade runtime: the same checks plus canonical replay pass with all measured ratios at 1.0; `toki-mcp-server.ts` is 16,723 lines and the new runtime module is 204 lines.
- HTTP proxy: injected port/token accessors and diagnostic hooks preserve the same contracts and replay metrics; `toki-mcp-server.ts` is 16,609 lines and the new proxy module is 137 lines.
- Known external failure: the full unit suite has two failures in skill catalog expectations caused by concurrent user-owned skill metadata changes; 105 files and 2,013 tests passed.

## Next steps

1. Commit the HTTP proxy slice.
2. Extract standalone bootstrap while keeping process diagnostics and runtime metadata stable.
