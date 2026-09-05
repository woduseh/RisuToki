---
name: writing-regex-scripts
description: 'Use for RisuAI regex entries, captures, flags, processing stages, and special OUT actions.'
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
- `edittrans`: translation-output stage. Current RisuAI applies preset, then module, then character regex entries; it is separate from the ordinary send/display pipeline.

Capture substitutions support `$0`/`$&`, numbered, and named groups. CBS in the IN pattern requires the dedicated IN-CBS parsing option. CBS in OUT follows the regex pipeline and does not automatically receive `runVar` mutation permission. HTML/CBS injected by `editdisplay` must be one continuous line; persistent CSS belongs in `backgroundEmbedding`.

Special OUT actions such as emotion display, inject, move-top, move-bottom, repeat-back, and execution `order` live in the `flag` metadata and have runtime-specific semantics; verify them in the existing entry or detailed syntax guide before use. In particular, inject is not arbitrary payload insertion. Translation regex supports custom flags, CBS preprocessing, ordering, move-top/move-bottom, and capture substitutions, but receives translation text rather than a saved chat message.

## References

Continue the task using `writing-cbs-syntax` for CBS expression repair, `writing-html-css` for output markup, and `writing-trigger-scripts` or `writing-lua-scripts` for event/state orchestration. Load `risu/common/docs/문법가이드_정규식.md` only for extended flags/examples. For mixed pipeline ordering, load `RUNTIME_INTEROP.md` from `writing-trigger-scripts` through the Skill reader.
