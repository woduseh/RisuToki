# PLAN-2 / PLAN-3 execution progress

Updated: 2026-07-02 Asia/Seoul

## Goal

- Add deterministic MCP workflow replay evaluation, then split the two MCP monolith entrypoints without changing public behavior.

## Scope

- In scope: PLAN-2 canonical replay and measured metrics; PLAN-3 module extraction; versions 1.12.0 and 1.12.1; docs and CI synchronization.
- Out of scope: MCP contract changes, new product features, pushes, pull requests, tags, publishing, and packaging.

## Current state

- Done: reviewed and corrected both plans; committed the pre-existing 1.11.1 work; created `refactor/mcp-replay-and-split`.
- Partial: execution notes.
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
- Changed: both plan documents and this progress note.
- Likely next: extract the reusable MCP test client.

## Validation

- Run: baseline `npm run lint`, `npm run typecheck`, targeted tests, and `npm test` passed at `f6cedfd6`.
- Not run: new PLAN-2/PLAN-3 validation.
- Known existing failures: none.

## Next steps

1. Commit the finalized plan corrections and progress note.
2. Implement PLAN-2 client extraction, catalog, fixtures, replay runner, CI, docs, and 1.12.0.
