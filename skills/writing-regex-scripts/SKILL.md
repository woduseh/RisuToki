---
name: writing-regex-scripts
description: "Guides writing regex scripts for RisuAI charx and risum files. Covers four modification types (editInput, editOutput, editDisplay, editRequest), capture group substitution, special OUT prefixes (@@emo, @@inject, @@move_top/bottom), flag options, and CBS/HTML integration in OUT fields. Use when creating or editing regex entries."
---

# Writing Regex Scripts

Regex scripts intercept and transform text at different stages of the chat pipeline using JavaScript regular expressions. They enable everything from simple find-replace to complex UI rendering and prompt manipulation.

## Script Fields

| Field | Description |
|---|---|
| `comment` | Script name for identification |
| `type` | When the script runs (see Modification Types below) |
| `find` | JavaScript regex pattern (the IN field) |
| `replace` | Replacement text (the OUT field). Supports HTML and CBS. |
| `flag` | Regex flags + special flags |
| `ableFlag` | `true` = use custom flags; `false` = default (`g`, order 0) |

## Modification Types

| Type | When | Use Cases |
|---|---|---|
| `editinput` | User input → before sending to server | Command shortcuts, input preprocessing, typo correction |
| `editoutput` | AI response → before saving to chat | Response post-processing, variable parsing, word filtering |
| `editdisplay` | During screen rendering | UI elements, status bars, visual effects (doesn't modify data) |
| `editrequest` | After prompt assembly → before API call | Prompt injection, token optimization (doesn't modify chat log) |

**Pipeline order:** CBS parse → Trigger scripts → CBS re-parse → Regex scripts (with internal CBS)

## Regex Flags

| Flag | Description |
|---|---|
| `g` | Global — match all occurrences |
| `i` | Case insensitive |
| `m` | Multiline — `^`/`$` match line boundaries |
| `s` | DotAll — `.` matches newlines |
| `u` | Unicode mode |

## Special Flags

- **IN CBS Parsing** — Enable CBS `{{}}` syntax in the find field
- **Move Top / Move Bottom** — Move matched content to top/bottom
- **Repeat Back** — Append match after original
- **Order Flag** — Execution priority (higher number = runs first)

## OUT Field Substitution Tokens

| Token | Description |
|---|---|
| `$0` / `$&` | Entire match |
| `$1` – `$9` | Capture groups |
| `$<name>` | Named capture group |
| `$n` | Newline insertion |

## Special OUT Prefixes

| Prefix | Description |
|---|---|
| `@@emo emotionName` | Trigger emotion image display |
| `@@inject` | Inject directly into chat log |
| `@@move_top` | Move matched text to top of message |
| `@@move_bottom` | Move matched text to bottom of message |

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
