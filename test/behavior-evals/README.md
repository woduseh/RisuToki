# Behavior evals — live skill routing

The Vitest suite (`npm run test:evals`) pins skill wording, word budgets, link reachability, and router completeness. It cannot tell whether a model that reads those files actually picks the intended skill. This directory holds the live measurement for that question.

`routing-cases.json` is a list of `{ "prompt", "use", "exclude" }` cases. A case passes when the headless session engages every `use` skill and none of the `exclude` skills. "Engaged" means a `Skill` invocation, a `Read` of the skill's `SKILL.md` or a file under its `references/`, or a command run inside the skill directory; listing a directory does not count. Cases with two or more `use` skills are composite and get a larger turn budget.

## Running

The runner is `tooling/run_behavior_evals.py` in the maintainer's `agent-dotfiles` repository (standard library only; any runner that scores the same transcript signals is equivalent). Run it from the repository root so the `@AGENTS.md` import and the `.claude/skills` catalog are in effect:

```bash
python3 <agent-dotfiles>/tooling/run_behavior_evals.py \
  --cases test/behavior-evals/routing-cases.json \
  --workdir "$PWD" \
  --out test/behavior-evals/results/<date>-<model> \
  --setting-sources user,project \
  --allowed-tools Read Glob Grep Skill "Bash(git status*)" "Bash(git diff*)" "Bash(git log*)" \
  --label "<what changed>"
```

`--permission-mode dontAsk` (the runner default) denies every tool outside that read-only allowlist, so no artifact or network surface is touched. `--skip-done` resumes after a usage-limit stop; `--rescore` recomputes scores from stored transcripts without spending quota; `--indices` runs only the listed cases.

## Quota policy

A full pass costs roughly 0.3 to 0.4 USD of reported usage per single-skill case at `fable` `xhigh`, more for composite cases. Do not run it on every edit. Run the affected cases with `--indices` when a skill description, a router trigger, or a shared rule changes, and the full matrix only for a model change or a router rewrite, once. Single runs vary; change wording only after a failure reproduces twice.

## Recorded runs

Each run keeps `summary.json` under `results/<date>-<model>/`. The per-case `results.jsonl` transcripts stay local (ignored) because they carry absolute paths and assistant text.

The first recorded run is `results/2026-09-02-fable-5-1/` (Claude Fable 5.1, `xhigh`, 2 turns per single-skill case, 6 per composite case). The initial pass scored 20/26 with one timeout. Fourteen sessions first searched for the `read_skill` MCP tool that the root `CLAUDE.md` named, which is absent outside the RisuToki MCP server; four failing prompts also pointed at artifacts that did not exist in the scratch checkout ("이 세계관", "이 .risup"), and the composite desire prompt asked for a full deliverable and exceeded a 900-second timeout. After rewording `CLAUDE.md` to name the Skill tool, making those prompts self-contained, and bounding the composite prompt to a design-policy request, the six re-measured cases all passed for 26/26. Because the prompts changed between passes, that figure is a repaired baseline, not a clean before/after comparison.
