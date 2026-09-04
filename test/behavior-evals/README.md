# Behavior evals — live skill routing

The Vitest suite (`npm run test:evals`) checks discovery, reference reachability, router completeness, and runtime contracts. It does not pin a catalog size, writing method, or exact instructional wording. This directory holds an optional live routing diagnostic.

`routing-cases.json` is a list of `{ "prompt", "use", "exclude" }` cases. A case passes when the headless session engages every `use` skill and none of the `exclude` skills. "Engaged" means a `Skill` invocation, a `Read` of the skill's `SKILL.md` or a file under its `references/`, or a command run inside the skill directory; listing a directory does not count. Cases with two or more `use` skills are composite and get a larger turn budget. Engagement is a routing signal, not a measure of output quality: a session can invoke every expected skill and still fail the user, or complete a task without an unnecessary skill read. Do not use this score to claim that Astra needs these instructions or that consolidation improved its performance.

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

## Comparing task quality

`quality-cases.json` is an opt-in, human-reviewed set of self-contained prompts and outcome criteria. It is separate from the routing runner schema. Run the same cases on the same model with the previous and consolidated guidance, retain the actual outputs, and judge request completion, domain correctness, unnecessary questions or deliverables, tool calls, and elapsed time. Skill invocation is not a quality criterion. Repeated runs help distinguish variation from an instruction effect; record settings and costs with each comparison.

Live evaluation consumes model quota. Run it only when explicitly requested or approved; local Vitest checks do not require a paid live run. Historical results below used another model and the old routing matrix, so they are not an Astra baseline and are not directly comparable to the current cases.

## Recorded runs

Each run keeps `summary.json` under `results/<date>-<model>/`. The per-case `results.jsonl` transcripts stay local (ignored) because they carry absolute paths and assistant text.

The first recorded run is `results/2026-09-02-fable-5-1/` (Claude Fable 5.1, `xhigh`, 2 turns per single-skill case, 6 per composite case). The initial pass scored 20/26 with one timeout. Fourteen sessions first searched for the `read_skill` MCP tool that the root `CLAUDE.md` named, which is absent outside the RisuToki MCP server; four failing prompts also pointed at artifacts that did not exist in the scratch checkout ("이 세계관", "이 .risup"), and the composite desire prompt asked for a full deliverable and exceeded a 900-second timeout. After rewording `CLAUDE.md` to name the Skill tool, making those prompts self-contained, and bounding the composite prompt to a design-policy request, the six re-measured cases all passed for 26/26. Because the prompts changed between passes, that figure is a repaired baseline, not a clean before/after comparison.
