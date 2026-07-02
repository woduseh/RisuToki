# PLAN-2 / PLAN-3 execution progress

Updated: 2026-07-02 Asia/Seoul

## Goal

- Add deterministic MCP workflow replay evaluation, then split the two MCP monolith entrypoints without changing public behavior.

## Scope

- In scope: PLAN-2 canonical replay and measured metrics; PLAN-3 module extraction; versions 1.12.0 and 1.12.1; docs and CI synchronization.
- Out of scope: MCP contract changes, new product features, pushes, pull requests, tags, publishing, and packaging.

## Current state

- Done: reviewed and corrected both plans; created the work branch; extracted the reusable MCP test client without changing `test:mcp` behavior.
- Partial: PLAN-2 catalog and replay implementation.
- Not started: PLAN-2 code; PLAN-3 contract baseline and module slices.
- Blocked: none.

## Decisions

- PLAN-2 precedes PLAN-3 so replay becomes a refactor safety net.
- PLAN-2 ships canonical five scenarios and classifies all 39 declared tasks.
- PLAN-3 keeps both entrypoints and every new production module below 5,000 lines.
- New production modules stay flat under `src/lib` so current MODULE_MAP drift checks cover them.
- `SKILLS_IMPROVEMENT_PLAN.md` is user-owned untracked work and must not be staged.

## Files and areas

- Read: project workflow rules, both plans, eval matrix, MCP client harness, CI, TypeScript build config, monolith route boundaries.
- Changed: both plan documents, this progress note, `test/mcp-test-client.ts`, and the existing MCP smoke runner.
- Likely next: separate the workflow eval catalog and build synthetic fixtures.

## Validation

- Run: client slice passed `npm run lint`, `npm run typecheck`, and `npm run test:mcp`.
- Not run: replay and PLAN-3 validation.
- Known existing failures: none.

## Next steps

1. Commit the reusable MCP client slice.
2. Separate the workflow eval catalog and add synthetic fixtures.
