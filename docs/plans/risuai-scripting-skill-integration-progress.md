# RisuAI scripting Skill integration progress

Updated: 2026-07-11 15:20 KST

## Goal

- Integrate verified knowledge from `risuai skill.zip` into the existing 28-Skill taxonomy without adding an overlapping umbrella Skill.

## Scope

- In scope: CBS, Lua, structured triggers, regex stages, plugin API v3, scripting-related schema/module notes, routing evals, version metadata.
- Out of scope: RisuAI runtime changes, MCP contract changes, the ZIP itself, upstream `custom-theme/`, automatic upstream synchronization.

## Current state

- Done: source audit, owned Skill/reference updates, interoperability reference, routing guards, version/changelog, catalog sync, and validation.
- Partial: none.
- Not started: none.
- Blocked: none.

## Decisions

- Keep 28 Skills and absorb only verified material into existing owners.
- Treat `C:/Users/wodus/ai-workspace/Risuai` commit `9d8791ea842404ef3c7e6410c2359a2db7ca4bcd` (version `2026.6.214`) as the canonical 2026-07-11 baseline.
- Put cross-layer runtime sequencing in `writing-trigger-scripts/RUNTIME_INTEROP.md` and reference it only for genuinely mixed tasks.
- Preserve RisuToki `editrequest` input alias while documenting upstream persisted `editprocess`.

## Files and areas

- Read: affected Skills/references, routing evals, RisuAI parser/process/plugin/module sources.
- Changed: scripting Skill owners and references, subtree routers, source audit, routing eval, package/changelog metadata.
- Added: `docs/RISUAI_SCRIPTING_SKILL_AUDIT.md` and `writing-trigger-scripts/RUNTIME_INTEROP.md`.

## Validation

- Passed: focused creative routing eval (10), `npm run sync:skills` with 28 catalog entries, `npm run test:evals` (41), replay, doc-drift (18), lint, typecheck, and `git diff --check`.
- Initial sandbox runs of Vitest/replay hit Windows `spawn EPERM`; approved unsandboxed reruns passed.
- Known existing failures: none.

## Next steps

1. Review and commit when authorized.
