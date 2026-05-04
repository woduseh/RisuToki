---
name: writing-regex-scripts
description: 'Guides writing regex scripts for RisuAI charx and risum files. Covers four modification types (editInput, editOutput, editDisplay, editRequest), capture group substitution, special OUT prefixes (@@emo, @@inject, @@move_top/bottom), flag options, and CBS/HTML integration in OUT fields. Use when creating or editing regex entries.'
tags: ['regex', 'scripting', 'display']
related_tools: ['list_regex', 'read_regex', 'write_regex', 'replace_in_regex']
---

# Writing Regex Scripts

## Agent Operating Contract

- **Use when:** creating, editing, or diagnosing RisuAI regex scripts, modification types, flags, capture substitutions, or special OUT prefixes.
- **Do not use when:** the task is Lua callbacks, CBS-only logic, lorebook activation, or normal JavaScript regex outside RisuAI.
- **Read first:** this `SKILL.md`; it contains the script fields, modification types, and gotchas.
- **Load deeper only if:** OUT contains HTML/CSS (`writing-html-css`) or CBS (`writing-cbs-syntax`).
- **Output/validation contract:** preserve find/replace fields exactly, carry indexed write guards, verify modification type and flags, and use `list_regex`/`read_regex_batch` for multi-entry work.

Regex scripts intercept and transform text at different stages of the chat pipeline using JavaScript regular expressions. They enable everything from simple find-replace to complex UI rendering and prompt manipulation.

Source-grounded areas: edit-mode ordering, CBS parsing, special actions, and flag handling are checked against `Risuai/src/ts/process/scripts.ts`.

## Script Fields

| Field      | Description                                                 |
| ---------- | ----------------------------------------------------------- |
| `comment`  | Script name for identification                              |
| `type`     | When the script runs (see Modification Types below)         |
| `find`     | JavaScript regex pattern (the IN field)                     |
| `replace`  | Replacement text (the OUT field). Supports HTML and CBS.    |
| `flag`     | Regex flags + special flags                                 |
| `ableFlag` | `true` = use custom flags; `false` = default (`g`, order 0) |

## Modification Types

| Type          | When                                    | Use Cases                                                      |
| ------------- | --------------------------------------- | -------------------------------------------------------------- |
| `editinput`   | User input → before sending to server   | Command shortcuts, input preprocessing, typo correction        |
| `editoutput`  | AI response → before saving to chat     | Response post-processing, variable parsing, word filtering     |
| `editdisplay` | During screen rendering                 | UI elements, status bars, visual effects (doesn't modify data) |
| `editrequest` | After prompt assembly → before API call | Prompt injection, token optimization (doesn't modify chat log) |

**Per-regex pipeline:** Lua edit listeners for the same mode run first, then RisuAI parses CBS in the current data, applies regex scripts, and parses CBS again after replacement. Do not generalize this local edit pipeline to every trigger event.

## Regex Flags

| Flag | Description                               |
| ---- | ----------------------------------------- |
| `g`  | Global — match all occurrences            |
| `i`  | Case insensitive                          |
| `m`  | Multiline — `^`/`$` match line boundaries |
| `s`  | DotAll — `.` matches newlines             |
| `u`  | Unicode mode                              |

## Special Flags

- **IN CBS Parsing** — Enable CBS `{{}}` syntax in the find field
- **Move Top / Move Bottom** — Move matched content to top/bottom
- **Repeat Back** — Append match after original
- **Order Flag** — Execution priority (higher number = runs first)

## OUT Field Substitution Tokens

| Token       | Description         |
| ----------- | ------------------- |
| `$0` / `$&` | Entire match        |
| `$1` – `$9` | Capture groups      |
| `$<name>`   | Named capture group |
| `$n`        | Newline insertion   |

## Formatting HTML in the OUT Field (`editDisplay`)

When using regex scripts to inject custom UI (like a status panel or buttons) via the `editDisplay` type, **you must minify your HTML and CBS tags**.

If you leave newlines (`\n`) between HTML tags or `{{#when...}}` CBS blocks, the RisuAI markdown parser will aggressively wrap them in `<p>` tags, create text nodes (phantom margins), or incorrectly apply markdown styles (like blockquotes for indented lines, or italics for `_` characters).

**Rule of Thumb:** Compress all injected UI blocks into a single continuous line without any line breaks.

```text
<!-- BAD: Markdown will break flexbox/grid alignments -->
{{#when::uiLang::vis::en}}
<button>English</button>
{{/when}}

<!-- GOOD: Minified -->
{{#when::uiLang::vis::en}}<button>English</button>{{/when}}
```

## Special OUT Prefixes

| Prefix              | Description                                                                                                                   |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `@@emo emotionName` | Trigger emotion image display                                                                                                 |
| `@@inject`          | On a matched saved chat message, persist the current message data and remove the matched text from the displayed return value |
| `@@move_top`        | Move matched text to top of message                                                                                           |
| `@@move_bottom`     | Move matched text to bottom of message                                                                                        |

## Examples

### Simple word replacement (editoutput)

```
find:    damn|hell
replace: darn|heck
flag:    gi
```

### Status bar UI (editdisplay)

```
find:    $
replace: <div class="status-bar">HP: {{getvar::hp}}/{{getvar::max_hp}}</div>
flag:    (last message only — use with appropriate flag)
```

### Emotion detection (editdisplay)

```
find:    \*.*?smile.*?\*
replace: $0 @@emo happy
flag:    gi
```

### Prompt injection (editrequest)

```
find:    ^
replace: [System: Always maintain character consistency]\n
flag:    (applied to system message)
```

### CBS + HTML in OUT field

```html
<div class="status-box">
  <h3>{{getvar::char_name}}</h3>
  <p>HP: {{getvar::hp}} / {{getvar::max_hp}}</p>
  <p>Dice: {{roll::1d20}}</p>
</div>
```

## Best Practices

1. **Put CSS in backgroundEmbedding**, not in regex OUT — regex runs per-match, causing duplicate style injection.
2. **Use editdisplay for UI** — it doesn't modify actual chat data, only what's rendered.
3. **Use editrequest for prompt tweaks** — modifies what the AI sees without changing chat history.
4. **Order Flag matters** — when multiple scripts target the same type, higher order runs first.
5. **Test regex patterns carefully** — overly broad patterns can cause unintended replacements.
6. **CBS is processed before regex** in the main pipeline, but CBS inside regex OUT fields is processed when the regex runs.

## Critical Gotchas

| Issue                                         | Detail                                                                                                                                                                                                                        |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OUT field HTML must be single-line**        | The RisuAI markdown parser wraps newlines between HTML/CBS tags in `<p>` tags, breaking flex/grid layouts. Always minify injected HTML into one continuous line.                                                              |
| **CBS not parsed in `find` field by default** | CBS `{{}}` syntax in the IN (find) field requires the "IN CBS Parsing" special flag to be enabled. Without it, `{{getvar::x}}` is treated as literal text.                                                                    |
| **`editDisplay` doesn't reach the model**     | Display-type scripts only affect rendering — the AI never sees the transformed output. Don't use `editDisplay` to inject instructions the model needs.                                                                        |
| **`editRequest` doesn't modify chat log**     | Request-type scripts change what the API receives but don't alter saved messages. Users won't see request-level changes in the chat UI.                                                                                       |
| **Capture groups reset per match**            | With the `g` flag, `$1` refers to the capture group of each individual match, not a persistent value across all matches.                                                                                                      |
| **`@@inject` saves current data**             | The `@@inject` OUT prefix is a special saved-message action: on match, it persists the current message data and removes the matched text from the returned display data. It is not a generic arbitrary OUT-payload insertion. |

## Related Skills

| Skill                     | Relationship                                                                |
| ------------------------- | --------------------------------------------------------------------------- |
| `writing-cbs-syntax`      | CBS `{{}}` tags are used heavily in regex OUT fields for dynamic content    |
| `writing-html-css`        | HTML in `editDisplay` OUT fields must follow RisuAI's rendering constraints |
| `writing-trigger-scripts` | Triggers execute before regex in the pipeline; understand execution order   |

## Smoke Tests

| Prompt                                                              | Expected routing                                                                            | Expected output                              | Forbidden behavior                                            |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------- |
| "I have a regex with CBS in the find field but it is not matching." | Primary: `writing-regex-scripts`; load `writing-cbs-syntax` only for CBS expression repair. | Diagnosis covering IN CBS parsing and flags. | Treating `{{...}}` in the find field as automatically parsed. |
| "Add an `editDisplay` status panel with capture groups."            | Primary: `writing-regex-scripts`; pair with `writing-html-css` for OUT HTML.                | Regex fields plus single-line OUT HTML.      | Using `editDisplay` to inject model-visible instructions.     |
