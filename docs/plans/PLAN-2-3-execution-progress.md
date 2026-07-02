# PLAN-2 / PLAN-3 execution progress

Updated: 2026-07-02 Asia/Seoul

## Goal

- Add deterministic MCP workflow replay evaluation, then split the two MCP monolith entrypoints without changing public behavior.

## Scope

- In scope: PLAN-2 canonical replay and measured metrics; PLAN-3 module extraction; versions 1.12.0 and 1.12.1; docs and CI synchronization.
- Out of scope: MCP contract changes, new product features, pushes, pull requests, tags, publishing, and packaging.

## Current state

- Done: corrected both plans; extracted the reusable MCP client; separated/classified the 39-task catalog; added synthetic fixtures; implemented the canonical five replay scenarios and measured gates.
- Partial: PLAN-2 CI/docs/version wiring.
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
- Changed: plan/progress docs, MCP client harness, workflow catalog/static eval, and synthetic fixtures.
- Likely next: prove regression sensitivity, then wire scripts/CI/docs and close 1.12.0.

## Validation

- Run: client and catalog slices are green; canonical replay passed all five scenarios in 11.6 seconds with all measured ratios at 1.0 and zero wrong-target incidents.
- Not run: replay and PLAN-3 validation.
- Known existing failures: none.

## Next steps

1. Commit the canonical replay runner.
2. Prove a temporary facade regression fails replay, restore it, then wire PLAN-2 release metadata.
