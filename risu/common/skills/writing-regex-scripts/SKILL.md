---
name: writing-regex-scripts
description: 'Use when creating or diagnosing RisuAI regex entries, capture substitutions, flags, processing stages, or special OUT actions. Primary skill for regex behavior; hand HTML/CBS details to their syntax skills. Do not use when the task is a structured trigger, Lua code, or text editing without regex.'
tags: ['regex', 'scripting', 'transformation']
related_tools: ['read_content', 'analyze_content', 'preview_edit', 'apply_edit', 'manage_items', 'read_regex_batch']
---

# Writing Regex Scripts

## Entry contract

Canonical persisted fields are `in` and `out`; RisuToki also exposes `find` and `replace` aliases. `comment` names the entry, `type` selects the stage, `flag` contains regex/special flags, and `ableFlag=true` enables custom flags. `ableFlag=false` means default flags, not disabled; disabled entries use `type: disabled`.

Stages:

- `editinput`: transform user input before sending.
- `editoutput`: transform assistant output before saving.
- `editdisplay`: render-only transformation; the model and stored chat do not see it.
- `editprocess`: canonical upstream/persisted request-stage value; change assembled model input without changing saved chat.
- `editrequest`: RisuToki convenience alias accepted on input and normalized to `editprocess` on export.

## Minimal workflow

1. Choose the stage from the intended visibility and persistence.
2. Bound the pattern and test representative matches, non-matches, multiline/Unicode input, and repeated global matches.
3. Use `$0`/`$&`, numbered, or named capture substitutions deliberately. Enable only required JavaScript flags.
4. CBS in the IN pattern requires the dedicated IN-CBS parsing option. CBS in OUT is evaluated according to the regex pipeline; do not assume it receives `runVar` mutation permission.
5. Minify HTML/CBS injected by `editdisplay` to one continuous line; put persistent CSS in `backgroundEmbedding`.
6. Preview/apply with current identity or index guards and validate the final stage behavior.

Special OUT actions such as emotion display, inject, move-top, move-bottom, repeat-back, and execution `order` live in the `flag` metadata and have runtime-specific semantics; verify them in the existing entry or detailed syntax guide before use. In particular, inject is not arbitrary payload insertion.

## Boundaries and validation

Hand CBS expression repair to `writing-cbs-syntax`, output markup to `writing-html-css`, and event/state orchestration to `writing-trigger-scripts` or `writing-lua-scripts`. Load `risu/common/docs/문법가이드_정규식.md` only for extended flags/examples. For mixed pipeline ordering, load `RUNTIME_INTEROP.md` from `writing-trigger-scripts` through the Skill reader.

Check catastrophic backtracking risk, stage correctness, capture behavior, ordering, canonical `in`/`out` export, single-line display markup, and whether a render-only edit was incorrectly used for a model instruction.
